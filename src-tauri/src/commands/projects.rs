//! Project management commands

use std::path::Path;
use std::collections::HashSet;

use tauri::State;

use crate::database::{Project, ProjectSettings};
use crate::state::AppState;
use crate::Result;

/// Validate ID parameter (project_id, session_id, thread_id, etc.)
/// Prevents injection and ensures reasonable length
pub fn validate_id(id: &str, field_name: &str) -> Result<()> {
    const MAX_ID_LENGTH: usize = 256;

    if id.len() > MAX_ID_LENGTH {
        return Err(crate::Error::Other(format!(
            "{} exceeds maximum length of {} characters",
            field_name, MAX_ID_LENGTH
        )));
    }

    if id.len() == 0 {
        return Err(crate::Error::Other(format!(
            "{} cannot be empty",
            field_name
        )));
    }

    // Allow alphanumeric, hyphens, underscores
    if !id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(crate::Error::Other(format!(
            "{} contains invalid characters (only alphanumeric, -, _ allowed)",
            field_name
        )));
    }

    Ok(())
}

/// Validate that a string is safe to use as a command argument
/// Prevents command injection by checking for dangerous characters
fn validate_arg_safe(arg: &str) -> Result<()> {
    // Check for shell metacharacters and dangerous sequences
    let dangerous_chars = ['\n', '\r', '\0', '|', '&', ';', '$', '`', '(', ')', '<', '>', '\\'];

    for dangerous in dangerous_chars {
        if arg.contains(dangerous) {
            return Err(crate::Error::Other(format!(
                "Invalid argument: contains unsafe character '{}'",
                dangerous
            )));
        }
    }

    // Prevent argument injection with --
    if arg.starts_with("--") && arg != "--" {
        return Err(crate::Error::Other(
            "Invalid argument: potentially unsafe flag".to_string(),
        ));
    }

    Ok(())
}

/// Validate git branch name
/// Only allows safe characters: alphanumeric, underscore, hyphen, dot, and forward slash
/// This prevents command injection through malicious branch names
#[allow(dead_code)]
fn validate_branch_name(branch: &str) -> Result<()> {
    if branch.is_empty() {
        return Err(crate::Error::Other(
            "Branch name cannot be empty".to_string(),
        ));
    }

    // Maximum reasonable branch name length
    const MAX_BRANCH_LENGTH: usize = 256;
    if branch.len() > MAX_BRANCH_LENGTH {
        return Err(crate::Error::Other(format!(
            "Branch name exceeds maximum length of {} characters",
            MAX_BRANCH_LENGTH
        )));
    }

    // Only allow safe characters: alphanumeric, underscore, hyphen, dot, forward slash
    // This is a strict allowlist approach for security
    if !branch.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '/')) {
        return Err(crate::Error::Other(
            "Branch name contains invalid characters (only alphanumeric, _, -, ., / allowed)".to_string(),
        ));
    }

    // Prevent dangerous patterns
    if branch.starts_with('-') || branch.starts_with('.') {
        return Err(crate::Error::Other(
            "Branch name cannot start with '-' or '.'".to_string(),
        ));
    }

    // Prevent path traversal attempts
    if branch.contains("..") {
        return Err(crate::Error::Other(
            "Branch name cannot contain '..'".to_string(),
        ));
    }

    // Prevent ending with .lock (git restriction)
    if branch.ends_with(".lock") {
        return Err(crate::Error::Other(
            "Branch name cannot end with '.lock'".to_string(),
        ));
    }

    Ok(())
}

/// Validate git commit SHA (hexadecimal string only)
#[allow(dead_code)]
fn validate_commit_sha(sha: &str) -> Result<()> {
    // Only allow hexadecimal characters (0-9, a-f, A-F)
    if !sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(crate::Error::Other(
            "Invalid commit SHA: contains non-hexadecimal characters".to_string(),
        ));
    }

    // Reasonable length check (git SHAs are typically 40 chars, short SHAs are 7+)
    if sha.len() < 7 || sha.len() > 64 {
        return Err(crate::Error::Other(
            "Invalid commit SHA: length must be between 7 and 64 characters".to_string(),
        ));
    }

    Ok(())
}

/// Validate git file path argument
/// Ensures the path is safe to use in git commands
fn validate_git_file_path(path: &str) -> Result<()> {
    if path.is_empty() {
        return Err(crate::Error::Other(
            "File path cannot be empty".to_string(),
        ));
    }

    // Check for null bytes
    if path.contains('\0') {
        return Err(crate::Error::Other(
            "File path cannot contain null bytes".to_string(),
        ));
    }

    // Check for shell metacharacters
    validate_arg_safe(path)?;

    Ok(())
}

/// Validate and sanitize a numeric limit parameter
fn validate_limit(limit: u32) -> Result<u32> {
    const MAX_LIMIT: u32 = 1000;

    if limit == 0 {
        return Err(crate::Error::Other("Limit must be greater than 0".to_string()));
    }

    if limit > MAX_LIMIT {
        return Err(crate::Error::Other(format!(
            "Limit exceeds maximum of {}",
            MAX_LIMIT
        )));
    }

    Ok(limit)
}

/// List all projects
#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>> {
    state.database.get_all_projects()
}

/// Add a new project
#[tauri::command]
pub async fn add_project(state: State<'_, AppState>, path: String) -> Result<Project> {
    // Validate path exists
    if !Path::new(&path).exists() {
        return Err(crate::Error::InvalidPath(format!(
            "Path does not exist: {}",
            path
        )));
    }

    // Check if already added
    let existing = state.database.get_all_projects()?;
    if existing.iter().any(|p| p.path == path) {
        return Err(crate::Error::Other("Project already exists".to_string()));
    }

    let project = Project::new(&path);
    state.database.insert_project(&project)?;

    tracing::info!("Added project: {} at {}", project.id, path);

    Ok(project)
}

/// Remove a project
#[tauri::command]
pub async fn remove_project(state: State<'_, AppState>, id: String) -> Result<()> {
    validate_id(&id, "project_id")?;
    state.database.delete_project(&id)?;
    tracing::info!("Removed project: {}", id);
    Ok(())
}

/// Update project settings
#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    id: String,
    display_name: Option<String>,
    settings: Option<ProjectSettings>,
) -> Result<Project> {
    validate_id(&id, "project_id")?;
    let project = state
        .database
        .get_project(&id)?
        .ok_or_else(|| crate::Error::ProjectNotFound(id.clone()))?;

    // For now, we'll need to delete and re-insert
    // A proper UPDATE query would be better
    let mut updated = project;
    if let Some(name) = display_name {
        updated.display_name = Some(name);
    }
    if let Some(s) = settings {
        updated.settings_json = Some(serde_json::to_string(&s).unwrap_or_default());
    }

    state.database.delete_project(&id)?;
    state.database.insert_project(&updated)?;

    Ok(updated)
}

/// Get git information for a project
#[tauri::command]
pub async fn get_project_git_info(path: String) -> Result<GitInfo> {
    // Security: Canonicalize to prevent symlink attacks and traversal
    let canonical_path = crate::utils::validate_and_canonicalize_path(&path)?;

    if !canonical_path.join(".git").exists() {
        return Ok(GitInfo {
            is_git_repo: false,
            branch: None,
            is_dirty: None,
            last_commit: None,
        });
    }

    // Get current branch
    let branch_output = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&canonical_path)
        .output()
        .ok();

    let branch = branch_output
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    // Check if dirty
    let status_output = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&canonical_path)
        .output()
        .ok();

    let is_dirty = status_output
        .filter(|o| o.status.success())
        .map(|o| !o.stdout.is_empty());

    // Get last commit message
    let log_output = std::process::Command::new("git")
        .args(["log", "-1", "--pretty=%s"])
        .current_dir(&canonical_path)
        .output()
        .ok();

    let last_commit = log_output
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    Ok(GitInfo {
        is_git_repo: true,
        branch,
        is_dirty,
        last_commit,
    })
}

/// Get git diff for a project (tracked + untracked)
#[tauri::command]
pub async fn get_project_git_diff(path: String) -> Result<GitDiff> {
    // Security: Canonicalize to prevent symlink attacks and traversal
    let canonical_path = crate::utils::validate_and_canonicalize_path(&path)?;

    if !inside_git_repo(&canonical_path)? {
        return Ok(GitDiff {
            is_git_repo: false,
            diff: String::new(),
        });
    }

    let tracked_diff = run_git_capture_diff(&canonical_path, &["diff"])?;
    let untracked_output =
        run_git_capture_stdout(&canonical_path, &["ls-files", "--others", "--exclude-standard"])?;

    let mut untracked_diff = String::new();
    let null_path = if cfg!(windows) { "NUL" } else { "/dev/null" };

    for file in untracked_output.lines().map(str::trim).filter(|s| !s.is_empty()) {
        // Security: Validate file path argument to prevent command injection
        validate_git_file_path(file)?;

        // Use safe argument construction with "--" separator to prevent option injection
        let diff_result = run_git_diff_file(&canonical_path, null_path, file);
        if let Ok(diff) = diff_result {
            untracked_diff.push_str(&diff);
        }
    }

    Ok(GitDiff {
        is_git_repo: true,
        diff: format!("{tracked_diff}{untracked_diff}"),
    })
}

/// Git repository information
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub is_git_repo: bool,
    pub branch: Option<String>,
    pub is_dirty: Option<bool>,
    pub last_commit: Option<String>,
}

/// Git diff response
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub is_git_repo: bool,
    pub diff: String,
}

fn inside_git_repo(project_path: &Path) -> Result<bool> {
    let status = std::process::Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(project_path)
        .status();

    match status {
        Ok(s) if s.success() => Ok(true),
        Ok(_) => Ok(false),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(crate::Error::Other(format!(
            "Failed to check git repo: {}",
            err
        ))),
    }
}

fn run_git_capture_stdout(project_path: &Path, args: &[&str]) -> Result<String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(project_path)
        .output()
        .map_err(|err| crate::Error::Other(format!("Failed to run git: {}", err)))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(crate::Error::Other(format!(
            "git {:?} failed with status {}",
            args, output.status
        )))
    }
}

fn run_git_capture_diff(project_path: &Path, args: &[&str]) -> Result<String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(project_path)
        .output()
        .map_err(|err| crate::Error::Other(format!("Failed to run git: {}", err)))?;

    if output.status.success() || output.status.code() == Some(1) {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(crate::Error::Other(format!(
            "git {:?} failed with status {}",
            args, output.status
        )))
    }
}

/// Run git diff for a specific file against /dev/null (for untracked files)
/// Uses individual .arg() calls to prevent any injection through shell interpretation
fn run_git_diff_file(project_path: &Path, null_path: &str, file_path: &str) -> Result<String> {
    let output = std::process::Command::new("git")
        .arg("diff")
        .arg("--no-index")
        .arg("--")  // Explicit end of options marker
        .arg(null_path)
        .arg(file_path)
        .current_dir(project_path)
        .output()
        .map_err(|err| crate::Error::Other(format!("Failed to run git diff: {}", err)))?;

    // git diff --no-index returns 1 when there are differences, which is expected
    if output.status.success() || output.status.code() == Some(1) {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(crate::Error::Other(format!(
            "git diff failed for file '{}' with status {}",
            file_path, output.status
        )))
    }
}

/// File entry for @ mention autocomplete
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    /// Relative path from project root
    pub path: String,
    /// File name only
    pub name: String,
    /// Whether it's a directory
    pub is_dir: bool,
}

/// List project files for @ mention autocomplete
#[tauri::command]
pub async fn list_project_files(
    path: String,
    query: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<FileEntry>> {
    // Security: Canonicalize path to prevent traversal attacks
    let canonical_path = crate::utils::validate_and_canonicalize_path(&path)?;

    // Directories to ignore
    let ignore_dirs: HashSet<&str> = [
        "node_modules",
        ".git",
        ".svn",
        ".hg",
        "target",
        "dist",
        "build",
        ".next",
        ".nuxt",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        "venv",
        ".venv",
        "env",
        ".env",
        "vendor",
        ".idea",
        ".vscode",
        "coverage",
        ".cache",
        ".parcel-cache",
        ".turbo",
    ]
    .into_iter()
    .collect();

    let query_lower = query.as_ref().map(|q| q.to_lowercase());
    let max_files = limit.unwrap_or(100);
    let mut files: Vec<FileEntry> = Vec::new();

    // Collect files recursively
    collect_files_recursive(
        &canonical_path,
        &canonical_path,
        &ignore_dirs,
        &query_lower,
        &mut files,
        max_files,
        0,
        5, // max depth
    );

    // Sort: directories first, then by path
    files.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.path.cmp(&b.path),
        }
    });

    Ok(files)
}

fn collect_files_recursive(
    root: &Path,
    current: &Path,
    ignore_dirs: &HashSet<&str>,
    query: &Option<String>,
    files: &mut Vec<FileEntry>,
    max_files: usize,
    depth: usize,
    max_depth: usize,
) {
    if files.len() >= max_files || depth > max_depth {
        return;
    }

    let entries = match std::fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.filter_map(|e| e.ok()) {
        if files.len() >= max_files {
            break;
        }

        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        // Skip hidden files (except specific ones)
        if file_name.starts_with('.') && !matches!(file_name.as_str(), ".env" | ".gitignore" | ".eslintrc" | ".prettierrc") {
            continue;
        }

        let is_dir = path.is_dir();

        // Skip ignored directories
        if is_dir && ignore_dirs.contains(file_name.as_str()) {
            continue;
        }

        // Get relative path
        let relative_path = match path.strip_prefix(root) {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(_) => continue,
        };

        // Apply query filter (fuzzy match on path and name)
        let matches_query = match query {
            Some(q) => {
                let path_lower = relative_path.to_lowercase();
                let name_lower = file_name.to_lowercase();
                path_lower.contains(q) || name_lower.contains(q) || fuzzy_match(&name_lower, q)
            }
            None => true,
        };

        if matches_query {
            files.push(FileEntry {
                path: relative_path,
                name: file_name,
                is_dir,
            });
        }

        // Recurse into directories
        if is_dir {
            collect_files_recursive(
                root,
                &path,
                ignore_dirs,
                query,
                files,
                max_files,
                depth + 1,
                max_depth,
            );
        }
    }
}

/// Simple fuzzy match: check if all characters in query appear in order in target
fn fuzzy_match(target: &str, query: &str) -> bool {
    let mut target_chars = target.chars().peekable();
    for query_char in query.chars() {
        loop {
            match target_chars.next() {
                Some(c) if c == query_char => break,
                Some(_) => continue,
                None => return false,
            }
        }
    }
    true
}

/// Git branch entry
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

/// Git commit entry
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub sha: String,
    pub short_sha: String,
    pub title: String,
    pub author: String,
    pub date: String,
}

/// Get list of git branches for a project
#[tauri::command]
pub async fn get_git_branches(path: String) -> Result<Vec<GitBranch>> {
    // Security: Canonicalize to prevent symlink attacks and traversal
    let canonical_path = crate::utils::validate_and_canonicalize_path(&path)?;

    if !inside_git_repo(&canonical_path)? {
        return Ok(Vec::new());
    }

    // Get all branches with current marker
    let output = std::process::Command::new("git")
        .args(["branch", "-a", "--format=%(HEAD) %(refname:short)"])
        .current_dir(&canonical_path)
        .output()
        .map_err(|err| crate::Error::Other(format!("Failed to run git: {}", err)))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches: Vec<GitBranch> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let is_current = line.starts_with('*');
        let name = line.trim_start_matches('*').trim().to_string();

        // Skip HEAD references and duplicates
        if name.contains("HEAD") || name.is_empty() {
            continue;
        }

        // For remote branches, extract just the branch name
        let clean_name = if name.starts_with("origin/") {
            name.strip_prefix("origin/").unwrap_or(&name).to_string()
        } else {
            name.clone()
        };

        if !seen.contains(&clean_name) {
            seen.insert(clean_name.clone());
            branches.push(GitBranch {
                name: clean_name,
                is_current,
            });
        }
    }

    // Sort: current branch first, then alphabetically
    branches.sort_by(|a, b| {
        match (a.is_current, b.is_current) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(branches)
}

/// Get list of recent git commits for a project
#[tauri::command]
pub async fn get_git_commits(path: String, limit: Option<u32>) -> Result<Vec<GitCommit>> {
    // Security: Canonicalize to prevent symlink attacks and traversal
    let canonical_path = crate::utils::validate_and_canonicalize_path(&path)?;

    if !inside_git_repo(&canonical_path)? {
        return Ok(Vec::new());
    }

    // Security: Validate limit parameter to prevent excessive resource usage
    let limit = validate_limit(limit.unwrap_or(20))?;
    let format = "%H|%h|%s|%an|%ar";

    let output = std::process::Command::new("git")
        .args(["log", &format!("-{}", limit), &format!("--format={}", format)])
        .current_dir(&canonical_path)
        .output()
        .map_err(|err| crate::Error::Other(format!("Failed to run git: {}", err)))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits: Vec<GitCommit> = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(5, '|').collect();
        if parts.len() >= 5 {
            commits.push(GitCommit {
                sha: parts[0].to_string(),
                short_sha: parts[1].to_string(),
                title: parts[2].to_string(),
                author: parts[3].to_string(),
                date: parts[4].to_string(),
            });
        }
    }

    Ok(commits)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== validate_arg_safe tests ====================

    #[test]
    fn test_validate_arg_safe_valid_inputs() {
        assert!(validate_arg_safe("hello").is_ok());
        assert!(validate_arg_safe("file.txt").is_ok());
        assert!(validate_arg_safe("path/to/file").is_ok());
        assert!(validate_arg_safe("my-file_name.rs").is_ok());
        assert!(validate_arg_safe("123").is_ok());
        assert!(validate_arg_safe("").is_ok()); // Empty is allowed
    }

    #[test]
    fn test_validate_arg_safe_rejects_shell_metacharacters() {
        // Test each dangerous character
        assert!(validate_arg_safe("hello|world").is_err());
        assert!(validate_arg_safe("cmd;ls").is_err());
        assert!(validate_arg_safe("$(whoami)").is_err());
        assert!(validate_arg_safe("`id`").is_err());
        assert!(validate_arg_safe("a&b").is_err());
        assert!(validate_arg_safe("a<b").is_err());
        assert!(validate_arg_safe("a>b").is_err());
        assert!(validate_arg_safe("a(b)").is_err());
        assert!(validate_arg_safe("a\\b").is_err());
        assert!(validate_arg_safe("a\nb").is_err());
        assert!(validate_arg_safe("a\rb").is_err());
        assert!(validate_arg_safe("a\0b").is_err());
    }

    #[test]
    fn test_validate_arg_safe_rejects_flag_injection() {
        assert!(validate_arg_safe("--exec").is_err());
        assert!(validate_arg_safe("--config=/etc/passwd").is_err());
        // Single "--" is allowed (used as argument separator)
        assert!(validate_arg_safe("--").is_ok());
    }

    // ==================== validate_branch_name tests ====================

    #[test]
    fn test_validate_branch_name_valid() {
        assert!(validate_branch_name("main").is_ok());
        assert!(validate_branch_name("feature/new-thing").is_ok());
        assert!(validate_branch_name("release-1.0.0").is_ok());
        assert!(validate_branch_name("fix_bug_123").is_ok());
        assert!(validate_branch_name("user/john/experiment").is_ok());
        assert!(validate_branch_name("v2.0").is_ok());
    }

    #[test]
    fn test_validate_branch_name_rejects_empty() {
        assert!(validate_branch_name("").is_err());
    }

    #[test]
    fn test_validate_branch_name_rejects_dangerous_start() {
        assert!(validate_branch_name("-branch").is_err());
        assert!(validate_branch_name(".hidden").is_err());
    }

    #[test]
    fn test_validate_branch_name_rejects_path_traversal() {
        assert!(validate_branch_name("../etc/passwd").is_err());
        assert!(validate_branch_name("branch/../other").is_err());
    }

    #[test]
    fn test_validate_branch_name_rejects_lock_suffix() {
        assert!(validate_branch_name("branch.lock").is_err());
    }

    #[test]
    fn test_validate_branch_name_rejects_special_chars() {
        assert!(validate_branch_name("branch;ls").is_err());
        assert!(validate_branch_name("branch$(cmd)").is_err());
        assert!(validate_branch_name("branch`id`").is_err());
        assert!(validate_branch_name("branch|pipe").is_err());
        assert!(validate_branch_name("branch\nname").is_err());
        assert!(validate_branch_name("branch name").is_err()); // Space not allowed
    }

    #[test]
    fn test_validate_branch_name_length_limit() {
        let long_name = "a".repeat(257);
        assert!(validate_branch_name(&long_name).is_err());

        let max_length_name = "a".repeat(256);
        assert!(validate_branch_name(&max_length_name).is_ok());
    }

    // ==================== validate_commit_sha tests ====================

    #[test]
    fn test_validate_commit_sha_valid() {
        // Short SHA (7 chars)
        assert!(validate_commit_sha("abc1234").is_ok());
        // Full SHA (40 chars)
        assert!(validate_commit_sha("abc1234567890def1234567890abc1234567890a").is_ok());
        // Mixed case hex
        assert!(validate_commit_sha("AbCdEf1234567").is_ok());
    }

    #[test]
    fn test_validate_commit_sha_rejects_non_hex() {
        assert!(validate_commit_sha("abc123g").is_err()); // 'g' is not hex
        assert!(validate_commit_sha("abc123!").is_err());
        assert!(validate_commit_sha("abc 123").is_err());
        assert!(validate_commit_sha("abc;123").is_err());
    }

    #[test]
    fn test_validate_commit_sha_length_limits() {
        // Too short
        assert!(validate_commit_sha("abc123").is_err()); // 6 chars
        // Too long
        let too_long = "a".repeat(65);
        assert!(validate_commit_sha(&too_long).is_err());
    }

    // ==================== validate_git_file_path tests ====================

    #[test]
    fn test_validate_git_file_path_valid() {
        assert!(validate_git_file_path("file.txt").is_ok());
        assert!(validate_git_file_path("path/to/file.rs").is_ok());
        assert!(validate_git_file_path("my-file_name.txt").is_ok());
    }

    #[test]
    fn test_validate_git_file_path_rejects_empty() {
        assert!(validate_git_file_path("").is_err());
    }

    #[test]
    fn test_validate_git_file_path_rejects_null_bytes() {
        assert!(validate_git_file_path("file\0.txt").is_err());
    }

    #[test]
    fn test_validate_git_file_path_rejects_shell_chars() {
        assert!(validate_git_file_path("file;rm -rf /").is_err());
        assert!(validate_git_file_path("file$(whoami)").is_err());
        assert!(validate_git_file_path("file|cat /etc/passwd").is_err());
    }

    // ==================== validate_id tests ====================

    #[test]
    fn test_validate_id_valid() {
        assert!(validate_id("abc123", "test").is_ok());
        assert!(validate_id("my-project_id", "test").is_ok());
        assert!(validate_id("a", "test").is_ok());
    }

    #[test]
    fn test_validate_id_rejects_empty() {
        assert!(validate_id("", "test").is_err());
    }

    #[test]
    fn test_validate_id_rejects_special_chars() {
        assert!(validate_id("id;ls", "test").is_err());
        assert!(validate_id("id$(cmd)", "test").is_err());
        assert!(validate_id("id/path", "test").is_err());
        assert!(validate_id("id.name", "test").is_err());
    }

    #[test]
    fn test_validate_id_length_limit() {
        let long_id = "a".repeat(257);
        assert!(validate_id(&long_id, "test").is_err());

        let max_id = "a".repeat(256);
        assert!(validate_id(&max_id, "test").is_ok());
    }

    // ==================== validate_limit tests ====================

    #[test]
    fn test_validate_limit_valid() {
        assert_eq!(validate_limit(1).unwrap(), 1);
        assert_eq!(validate_limit(100).unwrap(), 100);
        assert_eq!(validate_limit(1000).unwrap(), 1000);
    }

    #[test]
    fn test_validate_limit_rejects_zero() {
        assert!(validate_limit(0).is_err());
    }

    #[test]
    fn test_validate_limit_rejects_too_large() {
        assert!(validate_limit(1001).is_err());
        assert!(validate_limit(u32::MAX).is_err());
    }

    // ==================== Integration security tests ====================

    #[test]
    fn test_command_injection_prevention() {
        // These should all be rejected
        let injection_attempts = [
            "; rm -rf /",
            "| cat /etc/passwd",
            "$(whoami)",
            "`id`",
            "&& curl evil.com",
            "\n whoami",
            "--exec=bash",
        ];

        for attempt in injection_attempts {
            assert!(
                validate_arg_safe(attempt).is_err(),
                "Should reject injection attempt: {}",
                attempt
            );
        }
    }

    #[test]
    fn test_branch_name_injection_prevention() {
        let injection_attempts = [
            "-c core.sshCommand=evil",
            "--upload-pack=evil",
            "$(curl evil.com)",
            "`curl evil.com`",
            "branch;ls",
            "../../../etc/passwd",
        ];

        for attempt in injection_attempts {
            assert!(
                validate_branch_name(attempt).is_err(),
                "Should reject branch injection: {}",
                attempt
            );
        }
    }
}
