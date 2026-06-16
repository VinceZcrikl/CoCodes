//! Filesystem browsing + recursive listing for the toolbar file finder.
//!
//! `fs_list` powers directory browsing (one level, dirs first); `fs_walk`
//! returns a capped recursive file list (ignoring noisy build/VCS dirs) that
//! the frontend fuzzy-ranks. Read-only — selecting a file just pastes its path
//! into the embedded terminal.

use std::path::PathBuf;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    name: String,
    /// Absolute path, forward-slash normalized for cross-platform display/paste.
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsList {
    /// The resolved absolute directory actually listed.
    dir: String,
    /// Parent directory, or null at the filesystem root.
    parent: Option<String>,
    entries: Vec<FsEntry>,
}

/// Directories skipped by the recursive walk — large or uninteresting trees.
const SKIP_DIRS: &[&str] = &[
    ".git", "node_modules", "target", "dist", "build", "out", ".next", ".nuxt",
    ".cache", ".venv", "__pycache__", ".turbo", ".gradle", "vendor",
];

fn norm(p: &std::path::Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

/// Resolve the directory to list: the given path if it's a real directory,
/// otherwise the user's home.
fn resolve_dir(path: Option<String>) -> PathBuf {
    path.map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// One directory level: subdirectories first (both alpha, case-insensitive),
/// then files. `parent` lets the UI render a ".." row.
#[tauri::command]
pub async fn fs_list(path: Option<String>) -> Result<FsList, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = resolve_dir(path);
        let read = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

        let mut entries: Vec<FsEntry> = Vec::new();
        for ent in read.flatten() {
            let p = ent.path();
            let is_dir = ent.file_type().map(|t| t.is_dir()).unwrap_or(false);
            entries.push(FsEntry {
                name: ent.file_name().to_string_lossy().into_owned(),
                path: norm(&p),
                is_dir,
            });
        }
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(FsList {
            dir: norm(&dir),
            parent: dir.parent().map(norm),
            entries,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Returns the list of available drive-root paths on Windows (e.g. `["C:/", "D:/"]`),
/// sorted alphabetically. Returns an empty vec on macOS / Linux where the
/// filesystem is a single unified tree rooted at `/`.
#[tauri::command]
pub async fn fs_drives() -> Vec<String> {
    #[cfg(windows)]
    {
        (b'A'..=b'Z')
            .filter_map(|c| {
                let p = format!("{}:/", c as char);
                std::path::Path::new(&p).is_dir().then_some(p)
            })
            .collect()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// Recursive file list under `root`, relative + forward-slashed, capped at
/// `limit` (default 8000). Skips [`SKIP_DIRS`] and does not follow symlinks
/// (avoids loops). The frontend fuzzy-ranks these for search.
#[tauri::command]
pub async fn fs_walk(root: String, limit: Option<usize>) -> Result<Vec<String>, String> {
    let limit = limit.unwrap_or(8000).min(50_000);
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(&root);
        if !root.is_dir() {
            return Ok(Vec::new());
        }
        let mut out: Vec<String> = Vec::new();
        let mut stack: Vec<PathBuf> = vec![root.clone()];

        while let Some(dir) = stack.pop() {
            if out.len() >= limit {
                break;
            }
            let read = match std::fs::read_dir(&dir) {
                Ok(r) => r,
                Err(_) => continue,
            };
            for ent in read.flatten() {
                // file_type() does NOT follow symlinks, so symlinked dirs are
                // treated as neither dir nor file here and are skipped.
                let Ok(ft) = ent.file_type() else { continue };
                if ft.is_dir() {
                    let name = ent.file_name();
                    if SKIP_DIRS.contains(&name.to_string_lossy().as_ref()) {
                        continue;
                    }
                    stack.push(ent.path());
                } else if ft.is_file() {
                    if let Ok(rel) = ent.path().strip_prefix(&root) {
                        out.push(norm(rel));
                        if out.len() >= limit {
                            break;
                        }
                    }
                }
            }
        }
        out.sort();
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}
