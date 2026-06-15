//! Read-only Git inspection for the floating Git window.
//!
//! Shells out to the system `git` (no native libgit dependency) on a blocking
//! thread, always scoped to the caller-supplied working directory. This module
//! never mutates the repo — staging, commits, and pushes stay the embedded
//! CLI's job, matching Open Terminus's "drive the real CLI" philosophy.

use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;

/// Structured failure the frontend can branch on. `GitNotFound` lets the panel
/// render an "install git" hint instead of a raw error.
#[derive(Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum GitError {
    GitNotFound(String),
    Failed(String),
}

/// One changed path plus its single porcelain status code (`M`, `A`, `D`,
/// `R`, `?`, …) for the side it appears on (index or worktree).
#[derive(Serialize)]
struct FileEntry {
    path: String,
    status: String,
}

/// Working-tree snapshot for the active directory. `is_repo` false means the
/// cwd isn't inside a git work tree — the panel shows an empty state, not an
/// error.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    is_repo: bool,
    branch: String,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    staged: Vec<FileEntry>,
    unstaged: Vec<FileEntry>,
    untracked: Vec<FileEntry>,
}

/// One commit row for the history list. `parents` (parent hashes) lets the
/// frontend draw graph lanes; `refs` carries branch/tag decorations.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    hash: String,
    short: String,
    parents: Vec<String>,
    author: String,
    timestamp: i64,
    subject: String,
    refs: Vec<String>,
}

/// Locate the `git` binary. GUI apps on macOS launch with a minimal PATH, so
/// fall back to the common install dirs (matching the CLI finder in
/// [`crate::terminal`]).
fn git_bin() -> Result<PathBuf, GitError> {
    // `mut` is used only on Windows, where the Git-for-Windows dirs are pushed.
    #[allow(unused_mut)]
    let mut extras = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
    ];
    #[cfg(windows)]
    {
        extras.push(PathBuf::from("C:\\Program Files\\Git\\cmd"));
        extras.push(PathBuf::from("C:\\Program Files\\Git\\bin"));
    }

    #[cfg(windows)]
    let name = "git.exe";
    #[cfg(not(windows))]
    let name = "git";

    crate::terminal::find_in_path(name, &extras)
        .ok_or_else(|| GitError::GitNotFound("`git` was not found on PATH.".into()))
}

/// Run a git subcommand in `cwd` and return its stdout. A non-zero exit yields
/// `GitError::Failed` carrying stderr.
fn run_git(cwd: &str, args: &[&str]) -> Result<String, GitError> {
    let git = git_bin()?;
    let out = Command::new(&git)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| GitError::Failed(e.to_string()))?;
    if !out.status.success() {
        return Err(GitError::Failed(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Parse the `## ` branch header of `git status --porcelain=v1 --branch`.
/// Forms: `## main`, `## main...origin/main`,
/// `## main...origin/main [ahead 1, behind 2]`, `## HEAD (no branch)`.
fn parse_branch_header(line: &str, status: &mut GitStatus) {
    let body = line.trim_start_matches("## ").trim();
    let (head_part, tail) = match body.split_once("...") {
        Some((h, rest)) => (h, Some(rest)),
        None => (body, None),
    };
    status.branch = head_part.to_string();

    if let Some(rest) = tail {
        // rest = "origin/main [ahead 1, behind 2]" or just "origin/main".
        let (upstream, counts) = match rest.split_once(" [") {
            Some((u, c)) => (u, Some(c.trim_end_matches(']'))),
            None => (rest, None),
        };
        status.upstream = Some(upstream.to_string());
        if let Some(counts) = counts {
            for part in counts.split(',') {
                let part = part.trim();
                if let Some(n) = part.strip_prefix("ahead ") {
                    status.ahead = n.trim().parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix("behind ") {
                    status.behind = n.trim().parse().unwrap_or(0);
                }
            }
        }
    }
}

/// Working-tree status for `cwd`. Returns `is_repo: false` (not an error) when
/// the directory isn't inside a git work tree.
#[tauri::command]
pub async fn git_status(cwd: String) -> Result<GitStatus, GitError> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut status = GitStatus {
            is_repo: false,
            branch: String::new(),
            upstream: None,
            ahead: 0,
            behind: 0,
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
        };

        // Cheap repo probe first so a non-repo cwd is a clean empty state.
        match run_git(&cwd, &["rev-parse", "--is-inside-work-tree"]) {
            Ok(out) if out.trim() == "true" => {}
            Ok(_) => return Ok(status),
            // rev-parse fails outside a repo — surface git-not-found, treat the
            // rest as "not a repo".
            Err(GitError::GitNotFound(m)) => return Err(GitError::GitNotFound(m)),
            Err(_) => return Ok(status),
        }
        status.is_repo = true;

        let raw = run_git(
            &cwd,
            &["status", "--porcelain=v1", "--branch", "-z"],
        )?;

        // `-z` makes records NUL-separated; rename/copy entries append the
        // original path as a second NUL field that we must consume.
        let records: Vec<&str> = raw.split('\0').collect();
        let mut i = 0;
        while i < records.len() {
            let rec = records[i];
            if rec.is_empty() {
                i += 1;
                continue;
            }
            if let Some(stripped) = rec.strip_prefix("## ") {
                parse_branch_header(&format!("## {stripped}"), &mut status);
                i += 1;
                continue;
            }
            if rec.len() < 3 {
                i += 1;
                continue;
            }
            let xy: Vec<char> = rec[0..2].chars().collect();
            let (x, y) = (xy[0], xy[1]);
            let path = rec[3..].to_string();

            // Rename/copy consumes the following NUL field (the original path).
            if x == 'R' || x == 'C' {
                i += 1;
            }

            if x == '?' && y == '?' {
                status.untracked.push(FileEntry { path, status: "?".into() });
            } else {
                if x != ' ' {
                    status.staged.push(FileEntry { path: path.clone(), status: x.to_string() });
                }
                if y != ' ' {
                    status.unstaged.push(FileEntry { path, status: y.to_string() });
                }
            }
            i += 1;
        }

        Ok(status)
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

/// Recent commit history for `cwd`, newest first, capped at `limit` (default
/// 60). An empty repo (or any log failure) yields an empty list rather than an
/// error, so the panel just shows "no commits".
#[tauri::command]
pub async fn git_log(cwd: String, limit: Option<u32>) -> Result<Vec<Commit>, GitError> {
    let limit = limit.unwrap_or(60).clamp(1, 500);
    tauri::async_runtime::spawn_blocking(move || {
        // Unit separator (\x1f) between fields, newline between records.
        let fmt = "--pretty=format:%H%x1f%h%x1f%P%x1f%an%x1f%at%x1f%s%x1f%D";
        let max = format!("--max-count={limit}");
        let raw = match run_git(&cwd, &["log", &max, fmt]) {
            Ok(r) => r,
            // No commits yet / not a repo → empty history, not a hard error.
            Err(GitError::GitNotFound(m)) => return Err(GitError::GitNotFound(m)),
            Err(_) => return Ok(Vec::new()),
        };

        let mut commits = Vec::new();
        for line in raw.split('\n').filter(|l| !l.is_empty()) {
            let f: Vec<&str> = line.split('\u{1f}').collect();
            if f.len() < 7 {
                continue;
            }
            let parents = f[2]
                .split_whitespace()
                .map(str::to_string)
                .collect::<Vec<_>>();
            let refs = f[6]
                .split(", ")
                .map(|r| r.trim().trim_start_matches("HEAD -> ").to_string())
                .filter(|r| !r.is_empty())
                .collect::<Vec<_>>();
            commits.push(Commit {
                hash: f[0].to_string(),
                short: f[1].to_string(),
                parents,
                author: f[3].to_string(),
                timestamp: f[4].parse().unwrap_or(0),
                subject: f[5].to_string(),
                refs,
            });
        }
        Ok(commits)
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}
