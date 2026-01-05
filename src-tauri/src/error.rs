//! Error types for Codex Desktop

use thiserror::Error;

/// Application-wide error type
#[derive(Error, Debug)]
pub enum Error {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("App server error: {0}")]
    AppServer(String),

    #[error("Project not found: {0}")]
    ProjectNotFound(String),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Snapshot not found: {0}")]
    SnapshotNotFound(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Git error: {0}")]
    Git(String),

    #[error("Tauri error: {0}")]
    Tauri(String),

    #[error("{0}")]
    Other(String),
}

/// Result type alias for this crate
pub type Result<T> = std::result::Result<T, Error>;

// Implement conversion to Tauri's invoke error
impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
