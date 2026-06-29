//! CoCodes backend — a terminal-native cockpit for AI coding CLIs.
//!
//! Phase 0 hosts the `claude` CLI inside an embedded PTY (see [`terminal`]).
//! The per-CLI registry (`CliSpec`) and provider-switching modules land in
//! later phases; the PTY engine here is already generic enough to drive them.

pub mod codex_proxy;
pub mod directory;
pub mod fs;
pub mod git;
pub mod notify_hooks;
pub mod persona;
pub mod providers;
pub mod screenshot;
pub mod sessions;
pub mod terminal;

/// Set the dock icon from the embedded app icon. Needed because `tauri dev`
/// runs an unbundled binary (no `.icns` applied), so the dock would otherwise
/// show a default icon. Runs on the main thread during setup.
#[cfg(target_os = "macos")]
fn set_macos_dock_icon() {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    // Embedded at compile time so it works in dev and prod alike.
    let bytes: &[u8] = include_bytes!("../icons/icon.png");
    let data = NSData::with_bytes(bytes);
    let image = NSImage::initWithData(NSImage::alloc(), &data);
    if let Some(image) = image {
        let app = NSApplication::sharedApplication(mtm);
        unsafe { app.setApplicationIconImage(Some(&image)) };
    }
}

/// In `tauri dev` the app runs as the unbundled binary `cocodes`, so macOS shows
/// the lowercase executable name in the menu bar and on Dock-icon hover. Override
/// it to the product name early, before AppKit reads it. (Bundled builds already
/// use `productName` from tauri.conf.)
#[cfg(target_os = "macos")]
fn set_macos_app_name() {
    use objc2_foundation::{NSProcessInfo, NSString};
    NSProcessInfo::processInfo().setProcessName(&NSString::from_str("CoCodes"));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    set_macos_app_name();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                // Silence updater noise (endpoint 404 before first release is
                // expected and already handled silently in JS).
                .unwrap_or_else(|_| "info,cocodes_lib=debug,tauri_plugin_updater=off".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            set_macos_dock_icon();
            // Register the app handle so the Codex proxy / Claude launch can emit
            // `model-activity` events to the cockpit's live base-model indicator.
            codex_proxy::init(app.handle());
            // Start the loopback listener that turns CLI permission-prompt hooks
            // into `cocodes://needs-attention` events (tray notifications). Best
            // effort: a failure just means no attention notifications.
            if let Err(e) = notify_hooks::ensure_started(app.handle()) {
                tracing::warn!("notify-hooks: failed to start: {e}");
            }
            // Carry over data from the pre-rename home before anything reads it.
            persona::migrate_legacy_home();
            // Seed synchronously so persona_list sees all four defaults on the
            // very first frontend call (async spawn races the WebView load).
            persona::seed_default_personas();

            use tauri::Manager;
            // tauri-plugin-window-state persists the visible flag for all
            // windows. If the screenshot overlay was open when the user last
            // closed the app, the plugin would restore it as visible on next
            // launch. Force it hidden on every startup so it only appears when
            // explicitly triggered by the screenshot command.
            if let Some(overlay) = app.get_webview_window("screenshot-overlay") {
                let _ = overlay.hide();
            }

            // System-tray icon: left-click or "Show Window" → restore the main
            // window. "Quit CoCodes" → orderly shutdown (plugins flush first).
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let version = app.package_info().version.to_string();
                let ver_item  = MenuItem::with_id(app, "version", format!("CoCodes v{version}"), false, None::<&str>)?;
                let sep       = PredefinedMenuItem::separator(app)?;
                let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit CoCodes", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&ver_item, &sep, &show_item, &quit_item])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("CoCodes")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .manage(terminal::TerminalRegistry::default())
        .invoke_handler(tauri::generate_handler![
            directory::pick_directory,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            persona::load_persona_context,
            persona::persona_list,
            persona::persona_get,
            persona::persona_save,
            persona::persona_delete,
            sessions::sessions_load,
            sessions::sessions_save,
            sessions::sessions_delete,
            providers::provider_list,
            providers::provider_save,
            providers::provider_delete,
            providers::claude_default_model,
            providers::codex_default_model,
            providers::provider_models,
            screenshot::screenshot_open,
            screenshot::screenshot_cancel,
            screenshot::screenshot_grab,
            screenshot::screenshot_windows,
            git::git_status,
            git::git_log,
            git::git_commit_files,
            fs::fs_list,
            fs::fs_walk,
            fs::fs_drives,
        ])
        .on_window_event(|window, event| {
            // X closes the window to the system tray on all platforms — the
            // process (and every live terminal) keeps running. The user can
            // restore the window via the tray icon or, on macOS, the dock.
            // "Quit CoCodes" in the tray menu calls app.exit(0) for an orderly
            // shutdown that flushes plugin state to disk.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // Closing only hides the window; re-show it when the dock icon is
            // clicked (macOS Reopen) so the live session comes back.
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let tauri::RunEvent::Reopen { .. } = _event {
                    if let Some(w) = _app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        });
}
