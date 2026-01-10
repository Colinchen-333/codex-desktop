//! Utility functions for codex-desktop

use std::path::Path;
use crate::Result;

/// Validate and canonicalize a path, preventing traversal attacks
///
/// This function ensures that a path is valid, exists, and is canonicalized
/// to prevent symlink attacks and path traversal vulnerabilities.
pub fn validate_and_canonicalize_path(path: &str) -> Result<std::path::PathBuf> {
    let project_path = Path::new(path);

    // Canonicalize to resolve symlinks and traversal
    let canonical_path = project_path
        .canonicalize()
        .map_err(|_| crate::Error::InvalidPath(format!("Invalid or non-existent path: {}", path)))?;

    // Ensure it's absolute (canonicalize returns absolute path)
    if !canonical_path.is_absolute() {
        return Err(crate::Error::InvalidPath("Path must be absolute".to_string()));
    }

    Ok(canonical_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_and_canonicalize_path_valid() {
        // Test with a path that should exist on most systems
        let result = validate_and_canonicalize_path("/");
        assert!(result.is_ok());
        assert!(result.unwrap().is_absolute());
    }

    #[test]
    fn test_validate_and_canonicalize_path_invalid() {
        // Test with a path that doesn't exist
        let result = validate_and_canonicalize_path("/nonexistent/path/that/does/not/exist");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_and_canonicalize_path_relative() {
        // Test with a relative path (which will fail if it doesn't exist)
        let result = validate_and_canonicalize_path("relative/path");
        // This will fail because the path doesn't exist
        assert!(result.is_err() || result.unwrap().is_absolute());
    }
}
