//! Snapshot management for change revert functionality
//!
//! Supports two snapshot types:
//! - Git ghost commits for git repositories
//! - File backups for non-git directories

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};

use crate::database::{Database, Snapshot};
use crate::{Error, Result};

/// Validate that a commit SHA is safe (hexadecimal string only)
fn validate_commit_sha(sha: &str) -> Result<()> {
    // Only allow hexadecimal characters (0-9, a-f, A-F)
    if !sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(Error::Other(format!(
            "Invalid commit SHA: contains non-hexadecimal characters"
        )));
    }

    // Reasonable length check (git SHAs are typically 40 chars, short SHAs are 7+)
    if sha.len() < 7 || sha.len() > 64 {
        return Err(Error::Other(format!(
            "Invalid commit SHA: length must be between 7 and 64 characters"
        )));
    }

    Ok(())
}

/// Metadata for file backup snapshots
#[derive(Debug, Serialize, Deserialize)]
struct FileBackupMetadata {
    /// Map of relative path -> base64-encoded file contents
    files: HashMap<String, String>,
    /// Description of what was backed up
    description: String,
}

/// Check if a path is a git repository
pub fn is_git_repo(path: &Path) -> bool {
    path.join(".git").exists()
}

/// Create a snapshot before applying changes
pub fn create_snapshot(db: &Database, session_id: &str, project_path: &Path) -> Result<Snapshot> {
    // Security: Canonicalize path to prevent symlink attacks and traversal
    let canonical_path = project_path
        .canonicalize()
        .map_err(|_| Error::Other(format!("Invalid or non-existent path")))?;

    if is_git_repo(&canonical_path) {
        create_git_snapshot(db, session_id, &canonical_path)
    } else {
        create_file_backup_snapshot(db, session_id, &canonical_path)
    }
}

/// Collect all files in a directory (excluding hidden files and common ignore patterns)
fn collect_project_files(project_path: &Path) -> Result<Vec<std::path::PathBuf>> {
    let mut files = Vec::new();

    fn visit_dir(dir: &Path, files: &mut Vec<std::path::PathBuf>) -> Result<()> {
        if !dir.is_dir() {
            return Ok(());
        }

        let entries = fs::read_dir(dir).map_err(|e| Error::Other(format!("Failed to read dir: {}", e)))?;

        for entry in entries {
            let entry = entry.map_err(|e| Error::Other(format!("Failed to read entry: {}", e)))?;
            let path = entry.path();
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy();

            // Skip hidden files, node_modules, target, etc.
            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == "dist"
                || name == "build"
                || name == "__pycache__"
                || name == ".git"
            {
                continue;
            }

            if path.is_dir() {
                visit_dir(&path, files)?;
            } else if path.is_file() {
                files.push(path);
            }
        }
        Ok(())
    }

    visit_dir(project_path, &mut files)?;
    Ok(files)
}

/// Create a file backup snapshot for non-git directories
fn create_file_backup_snapshot(db: &Database, session_id: &str, project_path: &Path) -> Result<Snapshot> {
    let files = collect_project_files(project_path)?;

    let mut backup_files: HashMap<String, String> = HashMap::new();

    for file_path in &files {
        // Only backup small files (< 1MB)
        if let Ok(metadata) = fs::metadata(file_path) {
            if metadata.len() > 1_000_000 {
                continue;
            }
        }

        if let Ok(contents) = fs::read(file_path) {
            let relative_path = file_path
                .strip_prefix(project_path)
                .map_err(|e| Error::Other(format!("Failed to get relative path: {}", e)))?;

            backup_files.insert(
                relative_path.to_string_lossy().to_string(),
                BASE64.encode(&contents),
            );
        }
    }

    let metadata = FileBackupMetadata {
        files: backup_files.clone(),
        description: format!("Backup of {} files", backup_files.len()),
    };

    let metadata_json = serde_json::to_string(&metadata)
        .map_err(|e| Error::Other(format!("Failed to serialize metadata: {}", e)))?;

    let snapshot = Snapshot::new_file_backup(session_id, &metadata_json);
    db.insert_snapshot(&snapshot)?;

    // Cleanup: Keep only 10 most recent snapshots per session
    match db.cleanup_old_snapshots(session_id, 10) {
        Ok(count) => {
            if count > 0 {
                tracing::info!("Cleaned up {} old snapshots for session {}", count, session_id);
            }
        }
        Err(e) => {
            tracing::warn!("Failed to cleanup old snapshots: {}", e);
        }
    }

    tracing::info!(
        "Created file backup snapshot: {} ({} files)",
        snapshot.id,
        backup_files.len()
    );

    Ok(snapshot)
}

/// Create a git ghost commit snapshot
fn create_git_snapshot(db: &Database, session_id: &str, project_path: &Path) -> Result<Snapshot> {
    // Stash any uncommitted changes
    let stash_output = Command::new("git")
        .args(["stash", "push", "-u", "-m", "codex-desktop-snapshot"])
        .current_dir(project_path)
        .output()
        .map_err(|e| Error::Git(format!("Failed to run git stash: {}", e)))?;

    let stash_created = String::from_utf8_lossy(&stash_output.stdout)
        .contains("Saved working directory");

    // Get the current HEAD or stash ref
    let ref_name = if stash_created {
        // Get the stash reference
        let stash_list = Command::new("git")
            .args(["stash", "list", "-1"])
            .current_dir(project_path)
            .output()
            .map_err(|e| Error::Git(format!("Failed to get stash list: {}", e)))?;

        let stash_info = String::from_utf8_lossy(&stash_list.stdout);
        if stash_info.contains("codex-desktop-snapshot") {
            "stash@{0}".to_string()
        } else {
            get_current_head(project_path)?
        }
    } else {
        get_current_head(project_path)?
    };

    let snapshot = Snapshot::new_git_ghost(session_id, &ref_name);
    db.insert_snapshot(&snapshot)?;

    // Cleanup: Keep only 10 most recent snapshots per session
    match db.cleanup_old_snapshots(session_id, 10) {
        Ok(count) => {
            if count > 0 {
                tracing::info!("Cleaned up {} old snapshots for session {}", count, session_id);
            }
        }
        Err(e) => {
            tracing::warn!("Failed to cleanup old snapshots: {}", e);
        }
    }

    tracing::info!("Created git snapshot: {} -> {}", snapshot.id, ref_name);

    Ok(snapshot)
}

/// Get the current HEAD commit SHA
fn get_current_head(project_path: &Path) -> Result<String> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(project_path)
        .output()
        .map_err(|e| Error::Git(format!("Failed to get HEAD: {}", e)))?;

    if !output.status.success() {
        return Err(Error::Git("Failed to get HEAD commit".to_string()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Revert to a snapshot
pub fn revert_to_snapshot(db: &Database, snapshot_id: &str, project_path: &Path) -> Result<()> {
    // Security: Canonicalize path to prevent symlink attacks and traversal
    let canonical_path = project_path
        .canonicalize()
        .map_err(|_| Error::Other(format!("Invalid or non-existent path")))?;

    let snapshot = db
        .get_snapshot(snapshot_id)?
        .ok_or_else(|| Error::SnapshotNotFound(snapshot_id.to_string()))?;

    match snapshot.snapshot_type.as_str() {
        "git_ghost" => revert_git_snapshot(&snapshot, &canonical_path),
        "file_backup" => revert_file_backup_snapshot(&snapshot, &canonical_path),
        _ => Err(Error::Other(format!(
            "Unknown snapshot type: {}",
            snapshot.snapshot_type
        ))),
    }
}

/// Revert to a file backup snapshot
fn revert_file_backup_snapshot(snapshot: &Snapshot, project_path: &Path) -> Result<()> {
    let metadata_str = snapshot
        .metadata_json
        .as_ref()
        .ok_or_else(|| Error::Other("Missing metadata in file backup snapshot".to_string()))?;

    let metadata: FileBackupMetadata = serde_json::from_str(metadata_str)
        .map_err(|e| Error::Other(format!("Failed to parse file backup metadata: {}", e)))?;

    let mut restored_count = 0;

    for (relative_path, base64_content) in &metadata.files {
        // Security: Validate path to prevent traversal attacks
        if relative_path.contains("..") || relative_path.starts_with('/') || relative_path.starts_with('\\') {
            return Err(Error::Other(format!(
                "Invalid relative path in snapshot: {}",
                relative_path
            )));
        }

        let file_path = project_path.join(relative_path);

        // Security: Ensure the resulting path is within project_path
        let canonical_path = match file_path.canonicalize() {
            Ok(p) => p,
            Err(_) => {
                // Path doesn't exist yet, validate by checking if parent is within project
                if let Some(parent) = file_path.parent() {
                    if !parent.starts_with(project_path) {
                        return Err(Error::Other(format!(
                            "Path traversal attempt detected: {}",
                            relative_path
                        )));
                    }
                }
                file_path.clone()
            }
        };

        let canonical_project = project_path.canonicalize().unwrap_or(project_path.to_path_buf());
        if canonical_path.exists() && !canonical_path.starts_with(&canonical_project) {
            return Err(Error::Other(format!(
                "Attempted path traversal in snapshot: {}",
                relative_path
            )));
        }

        // Decode the base64 content
        let contents = BASE64
            .decode(base64_content)
            .map_err(|e| Error::Other(format!("Failed to decode file content: {}", e)))?;

        // Ensure parent directory exists
        if let Some(parent) = canonical_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| Error::Other(format!("Failed to create directory: {}", e)))?;
        }

        // Write the file
        fs::write(&canonical_path, &contents)
            .map_err(|e| Error::Other(format!("Failed to write file {}: {}", relative_path, e)))?;

        restored_count += 1;
    }

    tracing::info!(
        "Reverted file backup snapshot: {} ({} files restored)",
        snapshot.id,
        restored_count
    );

    Ok(())
}

/// Revert to a git snapshot
fn revert_git_snapshot(snapshot: &Snapshot, project_path: &Path) -> Result<()> {
    // Security: Canonicalize path to prevent symlink attacks and traversal
    let canonical_path = project_path
        .canonicalize()
        .map_err(|_| Error::Other(format!("Invalid or non-existent path")))?;

    let metadata: serde_json::Value = snapshot
        .metadata_json
        .as_ref()
        .and_then(|m| serde_json::from_str(m).ok())
        .ok_or_else(|| Error::Other("Invalid snapshot metadata".to_string()))?;

    let commit_sha = metadata["commit_sha"]
        .as_str()
        .ok_or_else(|| Error::Other("Missing commit_sha in snapshot".to_string()))?;

    if commit_sha.starts_with("stash@") {
        // Pop the stash - validate stash ref format
        if !commit_sha.starts_with("stash@{") || !commit_sha.ends_with('}') {
            return Err(Error::Other("Invalid stash reference format".to_string()));
        }

        let output = Command::new("git")
            .args(["stash", "pop"])
            .current_dir(&canonical_path)
            .output()
            .map_err(|e| Error::Git(format!("Failed to pop stash: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::Git(format!("Failed to pop stash: {}", stderr)));
        }
    } else {
        // Security: Validate commit SHA to prevent command injection
        validate_commit_sha(commit_sha)?;

        // Reset to the commit
        let output = Command::new("git")
            .args(["reset", "--hard", commit_sha])
            .current_dir(&canonical_path)
            .output()
            .map_err(|e| Error::Git(format!("Failed to reset: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::Git(format!("Failed to reset to {}: {}", commit_sha, stderr)));
        }
    }

    tracing::info!("Reverted to snapshot: {}", snapshot.id);

    Ok(())
}
