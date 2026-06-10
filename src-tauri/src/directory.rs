//! Native working-directory picker.
//!
//! Spawns the system folder-selection dialog on a blocking thread (rfd uses
//! Win32 IFileDialog / GTK / AppKit under the hood, all of which need to run
//! on a thread with the appropriate platform init).  Returns the chosen path
//! as a UTF-8 string, or null if the user cancelled.

/// Open a native folder-picker dialog. Called from the toolbar directory chip.
#[tauri::command]
pub async fn pick_directory() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .ok()
        .flatten()
        .map(|p| p.to_string_lossy().into_owned())
}
