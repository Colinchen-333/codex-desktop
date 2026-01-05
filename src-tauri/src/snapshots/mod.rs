//! Snapshot management for change revert functionality
//!
//! Supports two snapshot types:
//! - Git ghost commits for git repositories
//! - File backups for non-git directories

use std::path::Path;
use std::process::Command;

use crate::database::{Database, Snapshot};
use crate::{Error, Result};

/// Check if a path is a git repository
pub fn is_git_repo(path: &Path) -> bool {
    path.join(".git").exists()
}

/// Create a snapshot before applying changes
pub fn create_snapshot(db: &Database, session_id: &str, project_path: &Path) -> Result<Snapshot> {
    if is_git_repo(project_path) {
        create_git_snapshot(db, session_id, project_path)
    } else {
        // For now, just create a placeholder for non-git repos
        // Full file backup implementation can be added later
        let snapshot = Snapshot::new_file_backup(session_id, "not_implemented");
        db.insert_snapshot(&snapshot)?;
        Ok(snapshot)
    }
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
    let snapshot = db
        .get_snapshot(snapshot_id)?
        .ok_or_else(|| Error::SnapshotNotFound(snapshot_id.to_string()))?;

    match snapshot.snapshot_type.as_str() {
        "git_ghost" => revert_git_snapshot(&snapshot, project_path),
        "file_backup" => {
            // Not implemented yet
            Err(Error::Other("File backup revert not implemented".to_string()))
        }
        _ => Err(Error::Other(format!(
            "Unknown snapshot type: {}",
            snapshot.snapshot_type
        ))),
    }
}

/// Revert to a git snapshot
fn revert_git_snapshot(snapshot: &Snapshot, project_path: &Path) -> Result<()> {
    let metadata: serde_json::Value = snapshot
        .metadata_json
        .as_ref()
        .and_then(|m| serde_json::from_str(m).ok())
        .ok_or_else(|| Error::Other("Invalid snapshot metadata".to_string()))?;

    let commit_sha = metadata["commit_sha"]
        .as_str()
        .ok_or_else(|| Error::Other("Missing commit_sha in snapshot".to_string()))?;

    if commit_sha.starts_with("stash@") {
        // Pop the stash
        let output = Command::new("git")
            .args(["stash", "pop"])
            .current_dir(project_path)
            .output()
            .map_err(|e| Error::Git(format!("Failed to pop stash: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::Git(format!("Failed to pop stash: {}", stderr)));
        }
    } else {
        // Reset to the commit
        let output = Command::new("git")
            .args(["reset", "--hard", commit_sha])
            .current_dir(project_path)
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
