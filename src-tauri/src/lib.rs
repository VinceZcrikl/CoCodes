//! Open Terminus backend — a terminal-native cockpit for AI coding CLIs.
//!
//! Phase 0 hosts the `claude` CLI inside an embedded PTY (see [`terminal`]).
//! The per-CLI registry (`CliSpec`) and provider-switching modules land in
//! later phases; the PTY engine here is already generic enough to drive them.

pub mod directory;
pub mod persona;
pub mod screenshot;
pub mod terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,open_terminus_lib=debug".into()),
        )
        .init();

    tauri::Builder::default()
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
            screenshot::screenshot_open,
            screenshot::screenshot_cancel,
            screenshot::screenshot_grab,
            screenshot::screenshot_windows,
        ])
        .on_window_event(|window, event| {
            // The frameless main window's custom close button calls
            // `window.close()`. Since the hidden screenshot-overlay window would
            // otherwise keep the process alive, exit explicitly when the main
            // window closes. The overlay's own close is ignored (it just hides).
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    std::process::exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
