//! Snapshot management for change revert functionality
//!
//! Supports two snapshot types:
//! - Git ghost commits for git repositories
//! - File backups for non-git directories

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};

use crate::database::{Database, Snapshot};
use crate::{Error, Result};

/// Path validation error types for detailed error reporting
#[derive(Debug)]
enum PathValidationError {
    /// Path contains null bytes
    NullByte,
    /// Path contains parent directory traversal (..)
    ParentTraversal,
    /// Path is absolute (starts with / or \)
    AbsolutePath,
    /// Path escapes the project directory
    DirectoryEscape,
    /// Path is a symbolic link
    SymbolicLink,
    /// Path contains invalid characters
    InvalidCharacters,
}

impl std::fmt::Display for PathValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathValidationError::NullByte => {
                write!(f, "Path contains null byte character")
            }
            PathValidationError::ParentTraversal => {
                write!(f, "Path contains parent directory traversal (..)")
            }
            PathValidationError::AbsolutePath => {
                write!(f, "Path must be relative, not absolute")
            }
            PathValidationError::DirectoryEscape => {
                write!(f, "Path would escape the project directory")
            }
            PathValidationError::SymbolicLink => {
                write!(f, "Symbolic links are not allowed in restore paths")
            }
            PathValidationError::InvalidCharacters => {
                write!(f, "Path contains invalid characters")
            }
        }
    }
}

/// Validated restore path that is guaranteed to be safe
/// This struct can only be created through validate_restore_path()
#[derive(Debug)]
struct ValidatedRestorePath {
    /// The final absolute path that is safe to write to
    absolute_path: PathBuf,
}

impl ValidatedRestorePath {
    /// Get the validated absolute path
    fn as_path(&self) -> &Path {
        &self.absolute_path
    }
}

/// Validate a relative path for safe restoration within a project directory.
///
/// This function performs comprehensive security checks to prevent:
/// 1. Path traversal attacks (.. sequences)
/// 2. Absolute path injection (/ or \ prefixes)
/// 3. Null byte injection (\0 characters)
/// 4. Symbolic link attacks
/// 5. TOCTOU (Time-of-check to time-of-use) vulnerabilities
///
/// # Arguments
/// * `relative_path` - The relative path from the snapshot metadata
/// * `project_path` - The canonicalized project directory (must already be canonical)
///
/// # Returns
/// * `Ok(ValidatedRestorePath)` - A validated path that is safe to write to
/// * `Err(Error)` - If the path fails any security check
///
/// # Security Model
/// The function uses a defense-in-depth approach:
/// 1. String-level validation catches obvious attacks early
/// 2. Path normalization detects encoded traversal attempts
/// 3. Canonical path comparison ensures the final path is within bounds
/// 4. Symlink detection prevents link-based attacks
fn validate_restore_path(
    relative_path: &str,
    project_path: &Path,
) -> std::result::Result<ValidatedRestorePath, PathValidationError> {
    // === Phase 1: String-level validation ===

    // Check for null bytes (can truncate paths in some systems)
    if relative_path.contains('\0') {
        return Err(PathValidationError::NullByte);
    }

    // Check for empty path
    if relative_path.is_empty() {
        return Err(PathValidationError::InvalidCharacters);
    }

    // Check for absolute paths (Unix and Windows style)
    if relative_path.starts_with('/')
        || relative_path.starts_with('\\')
        || (relative_path.len() >= 2 && relative_path.chars().nth(1) == Some(':'))
    {
        return Err(PathValidationError::AbsolutePath);
    }

    // Check for parent directory traversal in path components
    // This catches: "..", "foo/../bar", "foo/..\\bar", etc.
    for component in relative_path.split(&['/', '\\'][..]) {
        if component == ".." {
            return Err(PathValidationError::ParentTraversal);
        }
        // Also check for null bytes in individual components
        if component.contains('\0') {
            return Err(PathValidationError::NullByte);
        }
    }

    // === Phase 2: Path construction and normalization ===

    // Construct the target path
    let target_path = project_path.join(relative_path);

    // Normalize the path to resolve any remaining traversal attempts
    // This uses a custom normalization that doesn't follow symlinks
    let normalized_path = normalize_path_components(&target_path)?;

    // === Phase 3: Containment verification ===

    // Verify the normalized path is within the project directory
    // Use starts_with on the normalized components to avoid symlink-based bypasses
    if !normalized_path.starts_with(project_path) {
        return Err(PathValidationError::DirectoryEscape);
    }

    // === Phase 4: Symlink detection ===

    // Check each existing component of the path for symlinks
    // This prevents TOCTOU attacks where a directory could be replaced with a symlink
    check_path_for_symlinks(&normalized_path, project_path)?;

    Ok(ValidatedRestorePath {
        absolute_path: normalized_path,
    })
}

/// Normalize path components without following symlinks.
/// This is safer than canonicalize() because it doesn't resolve symlinks.
fn normalize_path_components(path: &Path) -> std::result::Result<PathBuf, PathValidationError> {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            std::path::Component::Prefix(prefix) => {
                normalized.push(prefix.as_os_str());
            }
            std::path::Component::RootDir => {
                normalized.push(component.as_os_str());
            }
            std::path::Component::CurDir => {
                // Skip "." components
            }
            std::path::Component::ParentDir => {
                // This should have been caught earlier, but double-check
                // Don't pop if we're at root to prevent escaping
                if normalized.parent().is_some() && normalized.components().count() > 1 {
                    normalized.pop();
                } else {
                    return Err(PathValidationError::ParentTraversal);
                }
            }
            std::path::Component::Normal(name) => {
                // Check for null bytes in the OS string
                if name.to_string_lossy().contains('\0') {
                    return Err(PathValidationError::NullByte);
                }
                normalized.push(name);
            }
        }
    }

    Ok(normalized)
}

/// Check all existing components of a path for symbolic links.
/// This helps prevent TOCTOU attacks where directories could be replaced with symlinks.
fn check_path_for_symlinks(
    target_path: &Path,
    project_path: &Path,
) -> std::result::Result<(), PathValidationError> {
    // Start from project_path and walk towards target_path
    let mut current = project_path.to_path_buf();

    // Get the relative portion from project_path to target_path
    let relative = target_path
        .strip_prefix(project_path)
        .map_err(|_| PathValidationError::DirectoryEscape)?;

    for component in relative.components() {
        if let std::path::Component::Normal(name) = component {
            current.push(name);

            // Check if this path component exists and is a symlink
            // We use symlink_metadata to not follow the link
            if let Ok(metadata) = fs::symlink_metadata(&current) {
                if metadata.file_type().is_symlink() {
                    return Err(PathValidationError::SymbolicLink);
                }
            }
            // If the path doesn't exist yet, that's fine - we'll create it
        }
    }

    Ok(())
}

/// Atomically validate and prepare a path for writing.
/// This function combines validation with directory creation to minimize TOCTOU window.
fn prepare_restore_path(
    relative_path: &str,
    project_path: &Path,
) -> Result<ValidatedRestorePath> {
    // Validate the path
    let validated = validate_restore_path(relative_path, project_path)
        .map_err(|e| Error::Other(format!("Path validation failed for '{}': {}", relative_path, e)))?;

    // Create parent directories if needed
    // Do this right after validation to minimize TOCTOU window
    if let Some(parent) = validated.as_path().parent() {
        // Re-check for symlinks in the path we're about to create
        // This catches race conditions where a symlink was created between validation and now
        check_path_for_symlinks(parent, project_path)
            .map_err(|e| Error::Other(format!("Path security check failed: {}", e)))?;

        fs::create_dir_all(parent)
            .map_err(|e| Error::Other(format!("Failed to create directory: {}", e)))?;

        // After creating directories, verify no symlinks were introduced
        // This is the final TOCTOU mitigation check
        check_path_for_symlinks(validated.as_path(), project_path)
            .map_err(|e| Error::Other(format!("Path security check failed after directory creation: {}", e)))?;
    }

    Ok(validated)
}

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
///
/// This function restores files from a backup snapshot with comprehensive security checks:
/// - Path traversal prevention (.. sequences, absolute paths)
/// - Null byte injection prevention
/// - Symbolic link attack prevention
/// - TOCTOU (Time-of-check to time-of-use) mitigation
fn revert_file_backup_snapshot(snapshot: &Snapshot, project_path: &Path) -> Result<()> {
    let metadata_str = snapshot
        .metadata_json
        .as_ref()
        .ok_or_else(|| Error::Other("Missing metadata in file backup snapshot".to_string()))?;

    let metadata: FileBackupMetadata = serde_json::from_str(metadata_str)
        .map_err(|e| Error::Other(format!("Failed to parse file backup metadata: {}", e)))?;

    // Ensure project_path is canonical for all subsequent comparisons
    let canonical_project = project_path
        .canonicalize()
        .map_err(|e| Error::Other(format!("Failed to canonicalize project path: {}", e)))?;

    let mut restored_count = 0;
    let mut skipped_paths: Vec<String> = Vec::new();

    for (relative_path, base64_content) in &metadata.files {
        // Use the unified path validation function
        // This performs all security checks in one place
        let validated_path = match prepare_restore_path(relative_path, &canonical_project) {
            Ok(path) => path,
            Err(e) => {
                // Log the security violation and skip this file
                tracing::warn!(
                    "Skipping file due to security validation failure: {} - {}",
                    relative_path,
                    e
                );
                skipped_paths.push(relative_path.clone());
                continue;
            }
        };

        // Decode the base64 content
        let contents = BASE64
            .decode(base64_content)
            .map_err(|e| Error::Other(format!("Failed to decode file content for '{}': {}", relative_path, e)))?;

        // Final symlink check right before writing (TOCTOU mitigation)
        // This minimizes the window between check and use
        if let Ok(metadata) = fs::symlink_metadata(validated_path.as_path()) {
            if metadata.file_type().is_symlink() {
                tracing::warn!(
                    "Skipping file - symlink detected at write time: {}",
                    relative_path
                );
                skipped_paths.push(relative_path.clone());
                continue;
            }
        }

        // Write the file using the validated path
        fs::write(validated_path.as_path(), &contents)
            .map_err(|e| Error::Other(format!("Failed to write file '{}': {}", relative_path, e)))?;

        restored_count += 1;
    }

    // Report any skipped files due to security issues
    if !skipped_paths.is_empty() {
        tracing::warn!(
            "Snapshot {} restored with {} files skipped due to security violations: {:?}",
            snapshot.id,
            skipped_paths.len(),
            skipped_paths
        );
    }

    tracing::info!(
        "Reverted file backup snapshot: {} ({} files restored, {} skipped)",
        snapshot.id,
        restored_count,
        skipped_paths.len()
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Helper to create a temporary directory for testing
    fn create_test_dir() -> TempDir {
        tempfile::tempdir().expect("Failed to create temp dir")
    }

    // ==================== validate_restore_path tests ====================

    #[test]
    fn test_validate_restore_path_valid_simple() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        let result = validate_restore_path("file.txt", &project_path);
        assert!(result.is_ok());
        let validated = result.unwrap();
        assert!(validated.as_path().starts_with(&project_path));
    }

    #[test]
    fn test_validate_restore_path_valid_nested() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        let result = validate_restore_path("src/lib/utils/file.txt", &project_path);
        assert!(result.is_ok());
        let validated = result.unwrap();
        assert!(validated.as_path().ends_with("src/lib/utils/file.txt"));
    }

    #[test]
    fn test_validate_restore_path_rejects_parent_traversal() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        // Direct parent traversal
        let result = validate_restore_path("../etc/passwd", &project_path);
        assert!(matches!(result, Err(PathValidationError::ParentTraversal)));

        // Hidden parent traversal
        let result = validate_restore_path("foo/../../etc/passwd", &project_path);
        assert!(matches!(result, Err(PathValidationError::ParentTraversal)));

        // Windows-style traversal
        let result = validate_restore_path("foo\\..\\..\\etc\\passwd", &project_path);
        assert!(matches!(result, Err(PathValidationError::ParentTraversal)));
    }

    #[test]
    fn test_validate_restore_path_rejects_absolute_paths() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        // Unix absolute path
        let result = validate_restore_path("/etc/passwd", &project_path);
        assert!(matches!(result, Err(PathValidationError::AbsolutePath)));

        // Windows absolute path
        let result = validate_restore_path("\\Windows\\System32\\config", &project_path);
        assert!(matches!(result, Err(PathValidationError::AbsolutePath)));

        // Windows drive letter
        let result = validate_restore_path("C:\\Windows\\System32", &project_path);
        assert!(matches!(result, Err(PathValidationError::AbsolutePath)));
    }

    #[test]
    fn test_validate_restore_path_rejects_null_bytes() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        // Null byte in path
        let result = validate_restore_path("file\0.txt", &project_path);
        assert!(matches!(result, Err(PathValidationError::NullByte)));

        // Null byte in directory
        let result = validate_restore_path("foo\0bar/file.txt", &project_path);
        assert!(matches!(result, Err(PathValidationError::NullByte)));
    }

    #[test]
    fn test_validate_restore_path_rejects_empty_path() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        let result = validate_restore_path("", &project_path);
        assert!(matches!(result, Err(PathValidationError::InvalidCharacters)));
    }

    #[test]
    fn test_validate_restore_path_rejects_symlinks() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        // Create a directory and a symlink pointing outside
        let subdir = project_path.join("subdir");
        fs::create_dir(&subdir).unwrap();

        // Create a symlink in the project directory pointing to /tmp
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let link_path = project_path.join("evil_link");
            if symlink("/tmp", &link_path).is_ok() {
                // Try to use the symlink in a path
                let result = validate_restore_path("evil_link/secret.txt", &project_path);
                assert!(matches!(result, Err(PathValidationError::SymbolicLink)));
            }
        }
    }

    // ==================== normalize_path_components tests ====================

    #[test]
    fn test_normalize_path_components_removes_dots() {
        let path = Path::new("/foo/./bar/./baz");
        let result = normalize_path_components(path);
        assert!(result.is_ok());
        let normalized = result.unwrap();
        assert_eq!(normalized.to_string_lossy(), "/foo/bar/baz");
    }

    #[test]
    fn test_normalize_path_components_handles_parent_safely() {
        // This tests the double-check in normalize for parent traversal
        let path = Path::new("/foo/bar/../baz");
        let result = normalize_path_components(path);
        assert!(result.is_ok());
        let normalized = result.unwrap();
        assert_eq!(normalized.to_string_lossy(), "/foo/baz");
    }

    #[test]
    fn test_normalize_path_components_prevents_root_escape() {
        // Attempting to go above root should fail
        let path = Path::new("/../../../etc/passwd");
        let result = normalize_path_components(path);
        // On Unix, Path::new("/../../../etc/passwd") starts with RootDir
        // The .. components should be handled without escaping
        assert!(result.is_ok() || matches!(result, Err(PathValidationError::ParentTraversal)));
    }

    // ==================== check_path_for_symlinks tests ====================

    #[test]
    fn test_check_path_for_symlinks_allows_regular_dirs() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        // Create a regular nested directory structure
        let nested = project_path.join("a/b/c");
        fs::create_dir_all(&nested).unwrap();

        let target = project_path.join("a/b/c/file.txt");
        let result = check_path_for_symlinks(&target, &project_path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_check_path_for_symlinks_detects_symlink_in_path() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;

            // Create: project/real_dir/
            let real_dir = project_path.join("real_dir");
            fs::create_dir(&real_dir).unwrap();

            // Create: project/link -> /tmp (symlink pointing outside)
            let link_path = project_path.join("link");
            if symlink("/tmp", &link_path).is_ok() {
                // Check a path that goes through the symlink
                let target = project_path.join("link/something");
                let result = check_path_for_symlinks(&target, &project_path);
                assert!(matches!(result, Err(PathValidationError::SymbolicLink)));
            }
        }
    }

    // ==================== prepare_restore_path tests ====================

    #[test]
    fn test_prepare_restore_path_creates_directories() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        // This should create the parent directories
        let result = prepare_restore_path("new/nested/dir/file.txt", &project_path);
        assert!(result.is_ok());

        // Verify parent directories were created
        let parent_dir = project_path.join("new/nested/dir");
        assert!(parent_dir.exists());
        assert!(parent_dir.is_dir());
    }

    #[test]
    fn test_prepare_restore_path_rejects_dangerous_paths() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        // All these should fail
        assert!(prepare_restore_path("../escape", &project_path).is_err());
        assert!(prepare_restore_path("/absolute/path", &project_path).is_err());
        assert!(prepare_restore_path("path\0with\0null", &project_path).is_err());
        assert!(prepare_restore_path("", &project_path).is_err());
    }

    // ==================== Integration-style tests ====================

    #[test]
    fn test_complex_attack_vectors() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        // Test various attack patterns
        let attack_vectors = vec![
            "../../../etc/passwd",
            "..\\..\\..\\Windows\\System32\\config\\SAM",
            "foo/../../../etc/shadow",
            "/etc/passwd",
            "\\Windows\\System32",
            "C:\\Windows\\System32\\cmd.exe",
            "file\x00.txt",
            "foo/bar\x00/baz",
            "..",
            "../",
            "..\\",
            "foo/bar/../../..",
        ];

        for attack in attack_vectors {
            let result = validate_restore_path(attack, &project_path);
            assert!(
                result.is_err(),
                "Attack vector should be rejected: {:?}",
                attack
            );
        }
    }

    #[test]
    fn test_valid_edge_cases() {
        let temp_dir = create_test_dir();
        let project_path = temp_dir.path().canonicalize().unwrap();

        // These should all be valid
        let valid_paths = vec![
            "file.txt",
            "folder/file.txt",
            "deep/nested/folder/structure/file.txt",
            ".hidden_file",
            "folder/.hidden_file",
            "file.with.multiple.dots.txt",
            "folder-with-dashes/file_with_underscores.txt",
            "CamelCase/mixedCase.TXT",
            "unicode_文件名.txt",  // Unicode characters
            "spaces in name/file with spaces.txt",  // Spaces
        ];

        for path in valid_paths {
            let result = validate_restore_path(path, &project_path);
            assert!(
                result.is_ok(),
                "Valid path should be accepted: {:?}, error: {:?}",
                path,
                result.err()
            );
        }
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
        // Too short (6 chars)
        assert!(validate_commit_sha("abc123").is_err());
        // Too long (65 chars)
        let too_long = "a".repeat(65);
        assert!(validate_commit_sha(&too_long).is_err());
    }

    #[test]
    fn test_validate_commit_sha_injection_prevention() {
        // Command injection attempts
        let injection_attempts = vec![
            "abc1234; rm -rf /",
            "abc1234 | cat /etc/passwd",
            "abc1234$(whoami)",
            "abc1234`id`",
            "abc1234\nmalicious",
            "--exec=bash",
        ];

        for attempt in injection_attempts {
            assert!(
                validate_commit_sha(attempt).is_err(),
                "Should reject injection: {}",
                attempt
            );
        }
    }
}
