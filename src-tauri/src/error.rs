//! Error types for Codex Desktop

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Codex error type classification (matches Codex CLI error types)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CodexErrorType {
    ContextWindowExceeded,
    UsageLimitExceeded,
    HttpConnectionFailed,
    InternalServerError,
    Unauthorized,
    BadRequest,
    SandboxError,
    Other,
}

impl std::fmt::Display for CodexErrorType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CodexErrorType::ContextWindowExceeded => write!(f, "context_window_exceeded"),
            CodexErrorType::UsageLimitExceeded => write!(f, "usage_limit_exceeded"),
            CodexErrorType::HttpConnectionFailed => write!(f, "http_connection_failed"),
            CodexErrorType::InternalServerError => write!(f, "internal_server_error"),
            CodexErrorType::Unauthorized => write!(f, "unauthorized"),
            CodexErrorType::BadRequest => write!(f, "bad_request"),
            CodexErrorType::SandboxError => write!(f, "sandbox_error"),
            CodexErrorType::Other => write!(f, "other"),
        }
    }
}

/// Structured error information from Codex engine
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexErrorInfo {
    #[serde(rename = "type")]
    pub error_type: CodexErrorType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status_code: Option<u16>,
}

impl CodexErrorInfo {
    pub fn new(error_type: CodexErrorType) -> Self {
        Self {
            error_type,
            http_status_code: None,
        }
    }

    pub fn with_status(error_type: CodexErrorType, status: u16) -> Self {
        Self {
            error_type,
            http_status_code: Some(status),
        }
    }

    /// Parse error type from string
    pub fn from_type_string(type_str: &str, http_status: Option<u16>) -> Self {
        let error_type = match type_str {
            "context_window_exceeded" => CodexErrorType::ContextWindowExceeded,
            "usage_limit_exceeded" => CodexErrorType::UsageLimitExceeded,
            "http_connection_failed" => CodexErrorType::HttpConnectionFailed,
            "internal_server_error" => CodexErrorType::InternalServerError,
            "unauthorized" => CodexErrorType::Unauthorized,
            "bad_request" => CodexErrorType::BadRequest,
            "sandbox_error" => CodexErrorType::SandboxError,
            _ => CodexErrorType::Other,
        };
        Self {
            error_type,
            http_status_code: http_status,
        }
    }
}

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

    #[error("Codex error: {message}")]
    Codex {
        message: String,
        info: Option<CodexErrorInfo>,
    },

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

impl Error {
    /// Create a Codex error with structured info
    pub fn codex(message: impl Into<String>, info: Option<CodexErrorInfo>) -> Self {
        Error::Codex {
            message: message.into(),
            info,
        }
    }

    /// Create a Codex error from type string
    pub fn codex_from_type(message: impl Into<String>, type_str: &str, http_status: Option<u16>) -> Self {
        Error::Codex {
            message: message.into(),
            info: Some(CodexErrorInfo::from_type_string(type_str, http_status)),
        }
    }
}

/// Result type alias for this crate
pub type Result<T> = std::result::Result<T, Error>;

/// Serializable error response for frontend
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_info: Option<CodexErrorInfo>,
}

// Implement conversion to Tauri's invoke error with structured info
impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Error::Codex { message, info } => {
                let response = ErrorResponse {
                    message: message.clone(),
                    error_info: info.clone(),
                };
                response.serialize(serializer)
            }
            _ => {
                let response = ErrorResponse {
                    message: self.to_string(),
                    error_info: None,
                };
                response.serialize(serializer)
            }
        }
    }
}
