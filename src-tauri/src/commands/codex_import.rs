//! Codex CLI import commands
//!
//! Tauri commands for importing and managing Codex CLI sessions.

use crate::codex_import::{
    CodexConfig, CodexSession, CodexSessionSummary,
};
use crate::Result;

/// Read Codex CLI configuration from ~/.codex/config.toml
#[tauri::command]
pub async fn get_codex_config() -> Result<CodexConfig> {
    tokio::task::spawn_blocking(crate::codex_import::read_config)
        .await
        .map_err(|e| crate::Error::Other(format!("Task join error: {}", e)))?
}

/// List all Codex CLI sessions
#[tauri::command]
pub async fn list_codex_sessions() -> Result<Vec<CodexSessionSummary>> {
    tokio::task::spawn_blocking(crate::codex_import::list_sessions)
        .await
        .map_err(|e| crate::Error::Other(format!("Task join error: {}", e)))?
}

/// Get full details of a Codex CLI session
#[tauri::command]
pub async fn get_codex_session(session_id: String) -> Result<CodexSession> {
    tokio::task::spawn_blocking(move || crate::codex_import::get_session(&session_id))
        .await
        .map_err(|e| crate::Error::Other(format!("Task join error: {}", e)))?
}

/// Search Codex CLI sessions by keyword
#[tauri::command]
pub async fn search_codex_sessions(
    query: String,
    limit: Option<usize>,
) -> Result<Vec<CodexSessionSummary>> {
    let limit = limit.unwrap_or(50);
    tokio::task::spawn_blocking(move || crate::codex_import::search_sessions(&query, limit))
        .await
        .map_err(|e| crate::Error::Other(format!("Task join error: {}", e)))?
}

/// Delete a Codex CLI session
#[tauri::command]
pub async fn delete_codex_session(session_id: String) -> Result<()> {
    tokio::task::spawn_blocking(move || crate::codex_import::delete_session(&session_id))
        .await
        .map_err(|e| crate::Error::Other(format!("Task join error: {}", e)))?
}

/// Get Codex CLI directory path
#[tauri::command]
pub fn get_codex_dir() -> String {
    crate::codex_import::get_codex_dir()
        .to_string_lossy()
        .to_string()
}
