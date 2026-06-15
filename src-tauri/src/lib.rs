//! Open Terminus backend — a terminal-native cockpit for AI coding CLIs.
//!
//! Phase 0 hosts the `claude` CLI inside an embedded PTY (see [`terminal`]).
//! The per-CLI registry (`CliSpec`) and provider-switching modules land in
//! later phases; the PTY engine here is already generic enough to drive them.

pub mod directory;
pub mod git;
pub mod persona;
pub mod providers;
pub mod screenshot;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,open_terminus_lib=debug".into()),
        )
        .init();

    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            set_macos_dock_icon();
            tauri::async_runtime::spawn(persona::seed_default_personas());
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
            providers::provider_list,
            providers::provider_save,
            providers::provider_delete,
            providers::claude_default_model,
            screenshot::screenshot_open,
            screenshot::screenshot_cancel,
            screenshot::screenshot_grab,
            screenshot::screenshot_windows,
            git::git_status,
            git::git_log,
        ])
        .on_window_event(|window, event| {
            // The frameless main window's custom close button calls
            // `window.close()`. Keep the process — and every live terminal —
            // running so reopening restores the live session. On macOS, hide
            // and reopen via the dock icon (Cmd+Q still quits). Elsewhere there
            // is no dock to reopen from, so exit as before.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    #[cfg(target_os = "macos")]
                    {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    #[cfg(not(target_os = "macos"))]
                    {
                        let _ = api;
                        std::process::exit(0);
                    }
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
