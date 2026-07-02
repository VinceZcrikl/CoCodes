//! Git inspection **and** the common write actions for the floating Git window.
//!
//! Shells out to the system `git` (no native libgit dependency) on a blocking
//! thread, always scoped to the caller-supplied working directory. Reads
//! (status/log/diff) are complemented by a small set of one-click write actions
//! — fetch/pull/push, init, branch switch/create, stage-all, and commit — so the
//! panel is a usable source-control surface without leaving CoCodes. Anything
//! richer (interactive rebase, conflict resolution) still belongs to the
//! embedded CLI, matching CoCodes's "drive the real CLI" philosophy.

use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use serde::Serialize;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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
pub struct FileEntry {
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

/// Resolve the directory a git command runs in. A blank `cwd` (the frontend's
/// `null → ""`) must mean the user's home dir — the same fallback the PTY uses
/// ([`crate::terminal`]) — never the app process's launch directory, which is
/// ambiguous (the repo in dev, `/` from a bundle) and would make the panel show
/// an unrelated repo's status.
fn resolve_cwd(cwd: &str) -> PathBuf {
    if cwd.trim().is_empty() {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(cwd)
    }
}

/// Run a git subcommand in `cwd` and return its stdout. A non-zero exit yields
/// `GitError::Failed` carrying stderr.
fn run_git(cwd: &str, args: &[&str]) -> Result<String, GitError> {
    let git = git_bin()?;
    let mut cmd = Command::new(&git);
    cmd.args(args).current_dir(resolve_cwd(cwd));
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd
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

/// Files changed by a single commit (read-only). `--root` makes the initial
/// commit list its files as additions. Used when a history row is expanded.
#[tauri::command]
pub async fn git_commit_files(cwd: String, hash: String) -> Result<Vec<FileEntry>, GitError> {
    // The hash comes from our own `git_log` output, but validate anyway: only
    // hex passes, so nothing odd reaches the arg array.
    if hash.is_empty() || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(GitError::Failed("invalid commit hash".into()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let raw = run_git(
            &cwd,
            &[
                "diff-tree", "--no-commit-id", "--name-status", "-r", "--root", "-z", &hash,
            ],
        )?;

        // `-z` name-status records: `STATUS\0path\0`, and rename/copy adds a
        // field — `R<score>\0src\0dst\0` — so we consume the extra and keep dst.
        let recs: Vec<&str> = raw.split('\0').collect();
        let mut files = Vec::new();
        let mut i = 0;
        while i < recs.len() {
            let status = recs[i];
            if status.is_empty() {
                i += 1;
                continue;
            }
            let code = status.chars().next().unwrap_or('?');
            if code == 'R' || code == 'C' {
                let dst = recs.get(i + 2).copied().unwrap_or("");
                files.push(FileEntry { path: dst.to_string(), status: code.to_string() });
                i += 3;
            } else {
                let path = recs.get(i + 1).copied().unwrap_or("");
                files.push(FileEntry { path: path.to_string(), status: code.to_string() });
                i += 2;
            }
        }
        Ok(files)
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

// ─────────────────────────── write actions ───────────────────────────
//
// Each command shells out on a blocking thread (like the readers) and returns
// git's own stderr on failure so the panel can show it inline (e.g. "would
// clobber", non-fast-forward, no upstream). Branch names are validated against a
// conservative whitelist so nothing odd reaches the arg array.

/// Reject anything that isn't a plausible branch name. git already forbids the
/// dangerous forms via `check-ref-format`, but we gate here too: our own args
/// are parameterized (never a shell), so this is belt-and-suspenders against a
/// leading `-` being read as a flag and against obviously bad refs.
fn valid_branch_name(name: &str) -> bool {
    let n = name.trim();
    !n.is_empty()
        && n.len() <= 255
        && !n.starts_with('-')
        && !n.starts_with('.')
        && !n.starts_with('/')
        && !n.ends_with('/')
        && !n.contains("..")
        && !n.contains("//")
        && !n.contains(' ')
        && n.chars().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '/' | '.')
        })
}

/// `git fetch --all --prune` — refresh remotes without touching the work tree.
#[tauri::command]
pub async fn git_fetch(cwd: String) -> Result<(), GitError> {
    tauri::async_runtime::spawn_blocking(move || {
        run_git(&cwd, &["fetch", "--all", "--prune"]).map(|_| ())
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

/// `git pull --ff-only` — advance the current branch, refusing to create a merge
/// commit. A diverged branch fails with git's message, surfaced inline so the
/// user hands conflict handling to the embedded CLI.
#[tauri::command]
pub async fn git_pull(cwd: String) -> Result<(), GitError> {
    tauri::async_runtime::spawn_blocking(move || {
        run_git(&cwd, &["pull", "--ff-only"]).map(|_| ())
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

/// Push the current branch. If it has no upstream yet, publish it with
/// `-u origin <branch>` so the first push "just works"; otherwise a plain
/// `git push`. Non-fast-forward / auth failures surface inline.
#[tauri::command]
pub async fn git_push(cwd: String) -> Result<(), GitError> {
    tauri::async_runtime::spawn_blocking(move || {
        // Does the current branch already track an upstream?
        let has_upstream = run_git(
            &cwd,
            &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        )
        .is_ok();
        if has_upstream {
            run_git(&cwd, &["push"]).map(|_| ())
        } else {
            let branch = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?
                .trim()
                .to_string();
            if branch.is_empty() || branch == "HEAD" {
                return Err(GitError::Failed("no branch to push (detached HEAD)".into()));
            }
            run_git(&cwd, &["push", "-u", "origin", &branch]).map(|_| ())
        }
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

/// `git init` a plain (non-bare) repository at `cwd`.
#[tauri::command]
pub async fn git_init(cwd: String) -> Result<(), GitError> {
    tauri::async_runtime::spawn_blocking(move || run_git(&cwd, &["init"]).map(|_| ()))
        .await
        .map_err(|e| GitError::Failed(e.to_string()))?
}

/// Local branch names plus the current one, for the branch switcher.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branches {
    current: String,
    locals: Vec<String>,
}

/// List local branches (`git branch`) and the checked-out one. Detached HEAD
/// yields an empty `current`.
#[tauri::command]
pub async fn git_branches(cwd: String) -> Result<Branches, GitError> {
    tauri::async_runtime::spawn_blocking(move || {
        let raw = run_git(
            &cwd,
            &["branch", "--format=%(refname:short)"],
        )?;
        let locals: Vec<String> = raw
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(str::to_string)
            .collect();
        let current = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        let current = if current == "HEAD" { String::new() } else { current };
        Ok(Branches { current, locals })
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

/// Switch to an existing local branch (`git checkout <name>`). Uncommitted
/// changes that would be clobbered make git refuse, surfaced inline.
#[tauri::command]
pub async fn git_checkout(cwd: String, name: String) -> Result<(), GitError> {
    if !valid_branch_name(&name) {
        return Err(GitError::Failed("invalid branch name".into()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        run_git(&cwd, &["checkout", &name]).map(|_| ())
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

/// Create and switch to a new branch (`git checkout -b <name>`) off the current
/// HEAD.
#[tauri::command]
pub async fn git_create_branch(cwd: String, name: String) -> Result<(), GitError> {
    if !valid_branch_name(&name) {
        return Err(GitError::Failed("invalid branch name".into()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        run_git(&cwd, &["checkout", "-b", &name]).map(|_| ())
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

/// `git add -A` — stage every change (modifications, additions, deletions,
/// untracked). The panel's Commit flow stages all before committing.
#[tauri::command]
pub async fn git_stage_all(cwd: String) -> Result<(), GitError> {
    tauri::async_runtime::spawn_blocking(move || run_git(&cwd, &["add", "-A"]).map(|_| ()))
        .await
        .map_err(|e| GitError::Failed(e.to_string()))?
}

/// The staged diff (`git diff --cached`), truncated to `MAX_DIFF_BYTES` so a huge
/// changeset can't blow the LLM context or the IPC payload. Used to feed the AI
/// commit-message generator.
#[tauri::command]
pub async fn git_diff_cached(cwd: String) -> Result<String, GitError> {
    /// ~48 KB is plenty of signal for a one-line summary while staying well
    /// under any provider's context budget.
    const MAX_DIFF_BYTES: usize = 48 * 1024;
    tauri::async_runtime::spawn_blocking(move || {
        let mut diff = run_git(&cwd, &["diff", "--cached"])?;
        if diff.len() > MAX_DIFF_BYTES {
            // Cut on a char boundary so the String stays valid UTF-8.
            let mut cut = MAX_DIFF_BYTES;
            while cut > 0 && !diff.is_char_boundary(cut) {
                cut -= 1;
            }
            diff.truncate(cut);
            diff.push_str("\n… [diff truncated]");
        }
        Ok(diff)
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

/// Commit the staged snapshot with `message` (`git commit -m`). Empty messages
/// are rejected before shelling out. Nothing-staged surfaces git's own message.
#[tauri::command]
pub async fn git_commit(cwd: String, message: String) -> Result<(), GitError> {
    let msg = message.trim().to_string();
    if msg.is_empty() {
        return Err(GitError::Failed("commit message is empty".into()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        // `-m` takes the message as a single arg (never a shell), so newlines
        // and quotes in an AI-generated message are safe.
        run_git(&cwd, &["commit", "-m", &msg]).map(|_| ())
    })
    .await
    .map_err(|e| GitError::Failed(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::valid_branch_name;

    #[test]
    fn branch_name_whitelist() {
        assert!(valid_branch_name("main"));
        assert!(valid_branch_name("feat/git-panel"));
        assert!(valid_branch_name("release-1.2.x"));
        // Rejections: flag-like, traversal, spaces, bad edges.
        assert!(!valid_branch_name("-rf"));
        assert!(!valid_branch_name(".hidden"));
        assert!(!valid_branch_name("a..b"));
        assert!(!valid_branch_name("has space"));
        assert!(!valid_branch_name("trailing/"));
        assert!(!valid_branch_name(""));
        assert!(!valid_branch_name("weird;name"));
    }
}
