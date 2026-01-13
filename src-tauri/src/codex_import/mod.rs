//! Codex CLI import module
//!
//! Provides functionality to read and import sessions from ~/.codex/ directory,
//! enabling session recovery, continuation, and management.

mod config;
mod session;

pub use config::{CodexConfig, CodexProject};
pub use session::{
    CodexSession, CodexSessionMeta, CodexSessionSummary, ResponseItem, SessionMessage,
};

use crate::Result;
use std::path::PathBuf;

/// Get the default Codex CLI configuration directory
pub fn get_codex_dir() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".codex"))
        .unwrap_or_else(|| PathBuf::from(".codex"))
}

/// Read Codex CLI configuration
pub fn read_config() -> Result<CodexConfig> {
    config::read_config()
}

/// List all available sessions from ~/.codex/sessions/
pub fn list_sessions() -> Result<Vec<CodexSessionSummary>> {
    session::list_sessions()
}

/// Get full session details by ID
pub fn get_session(session_id: &str) -> Result<CodexSession> {
    session::get_session(session_id)
}

/// Search sessions by keyword
pub fn search_sessions(query: &str, limit: usize) -> Result<Vec<CodexSessionSummary>> {
    session::search_sessions(query, limit)
}

/// Delete a session file
pub fn delete_session(session_id: &str) -> Result<()> {
    session::delete_session(session_id)
}
