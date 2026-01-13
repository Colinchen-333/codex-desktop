//! Codex CLI session parser
//!
//! Parses session files from ~/.codex/sessions/ directory.
//! Session files are in JSONL format with the naming convention:
//! rollout-{date}T{time}-{uuid}.jsonl

use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

/// Session summary for list views
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionSummary {
    /// Session UUID
    pub id: String,
    /// Session file path
    pub file_path: String,
    /// Session start timestamp
    pub timestamp: String,
    /// Working directory
    pub cwd: String,
    /// Project name (derived from cwd)
    pub project_name: String,
    /// CLI version used
    pub cli_version: String,
    /// Git branch (if available)
    pub git_branch: Option<String>,
    /// Git commit hash (if available)
    pub git_commit: Option<String>,
    /// First user message (preview)
    pub first_message: Option<String>,
    /// Total message count
    pub message_count: usize,
    /// File size in bytes
    pub file_size: u64,
}

/// Full session data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSession {
    /// Session summary
    #[serde(flatten)]
    pub summary: CodexSessionSummary,
    /// Session metadata
    pub meta: CodexSessionMeta,
    /// All messages in the session
    pub messages: Vec<SessionMessage>,
}

/// Session metadata from session_meta event
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionMeta {
    pub id: String,
    pub timestamp: String,
    pub cwd: String,
    #[serde(default)]
    pub originator: String,
    #[serde(default)]
    pub cli_version: String,
    #[serde(default)]
    pub instructions: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub model_provider: String,
    #[serde(default)]
    pub git: Option<GitInfo>,
}

/// Git information from session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitInfo {
    #[serde(default)]
    pub commit_hash: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
}

/// A message in the session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    /// Message timestamp
    pub timestamp: String,
    /// Message type: "user", "assistant", "function_call", etc.
    pub message_type: String,
    /// Message role (for message types)
    #[serde(default)]
    pub role: Option<String>,
    /// Message content
    pub content: serde_json::Value,
}

/// Raw response item from JSONL
#[derive(Debug, Deserialize)]
struct RawEvent {
    timestamp: String,
    #[serde(rename = "type")]
    event_type: String,
    payload: serde_json::Value,
}

/// Response item payload
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseItem {
    #[serde(rename = "type")]
    pub item_type: String,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub content: Option<serde_json::Value>,
}

/// List all sessions from ~/.codex/sessions/
pub fn list_sessions() -> Result<Vec<CodexSessionSummary>> {
    let sessions_dir = super::get_codex_dir().join("sessions");

    if !sessions_dir.exists() {
        tracing::info!("No Codex sessions directory found");
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();
    scan_sessions_recursive(&sessions_dir, &mut sessions)?;

    // Sort by timestamp descending (most recent first)
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    tracing::info!("Found {} Codex CLI sessions", sessions.len());
    Ok(sessions)
}

/// Recursively scan for session files
fn scan_sessions_recursive(dir: &Path, sessions: &mut Vec<CodexSessionSummary>) -> Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }

    let entries = fs::read_dir(dir).map_err(|e| {
        Error::Other(format!("Failed to read sessions directory: {}", e))
    })?;

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            scan_sessions_recursive(&path, sessions)?;
        } else if path.extension().is_some_and(|ext| ext == "jsonl") {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("rollout-") {
                    match parse_session_summary(&path) {
                        Ok(summary) => sessions.push(summary),
                        Err(e) => {
                            tracing::warn!("Failed to parse session {:?}: {}", path, e);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Parse session summary from file (only reads metadata and first message)
fn parse_session_summary(path: &Path) -> Result<CodexSessionSummary> {
    let file = fs::File::open(path).map_err(|e| {
        Error::Other(format!("Failed to open session file: {}", e))
    })?;

    let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let reader = BufReader::new(file);

    let mut meta: Option<CodexSessionMeta> = None;
    let mut first_user_message: Option<String> = None;
    let mut message_count = 0;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.trim().is_empty() {
            continue;
        }

        let event: RawEvent = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };

        match event.event_type.as_str() {
            "session_meta" => {
                if let Ok(m) = serde_json::from_value(event.payload) {
                    meta = Some(m);
                }
            }
            "response_item" => {
                message_count += 1;

                // Extract first user message
                if first_user_message.is_none() {
                    if let Ok(item) = serde_json::from_value::<ResponseItem>(event.payload.clone()) {
                        if item.role.as_deref() == Some("user") {
                            if let Some(content) = &item.content {
                                first_user_message = extract_user_text(content);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    let meta = meta.ok_or_else(|| Error::Other("Session has no metadata".to_string()))?;

    // Extract project name from cwd
    let project_name = Path::new(&meta.cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    Ok(CodexSessionSummary {
        id: meta.id.clone(),
        file_path: path.to_string_lossy().to_string(),
        timestamp: meta.timestamp.clone(),
        cwd: meta.cwd.clone(),
        project_name,
        cli_version: meta.cli_version.clone(),
        git_branch: meta.git.as_ref().and_then(|g| g.branch.clone()),
        git_commit: meta.git.as_ref().and_then(|g| g.commit_hash.clone()),
        first_message: first_user_message,
        message_count,
        file_size,
    })
}

/// Extract text from user message content
fn extract_user_text(content: &serde_json::Value) -> Option<String> {
    // Content is usually an array of content items
    if let Some(arr) = content.as_array() {
        for item in arr {
            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                // Skip system instructions
                if !text.starts_with("<user_instructions>")
                    && !text.starts_with("<environment_context>")
                {
                    // Truncate long messages
                    let preview = if text.len() > 200 {
                        format!("{}...", &text[..200])
                    } else {
                        text.to_string()
                    };
                    return Some(preview);
                }
            }
        }
    }
    None
}

/// Get full session details by ID
pub fn get_session(session_id: &str) -> Result<CodexSession> {
    let sessions_dir = super::get_codex_dir().join("sessions");

    // Find the session file by ID
    let file_path = find_session_file(&sessions_dir, session_id)?;
    parse_full_session(&file_path)
}

/// Find session file by ID
fn find_session_file(dir: &Path, session_id: &str) -> Result<PathBuf> {
    if !dir.is_dir() {
        return Err(Error::SessionNotFound("Sessions directory not found".to_string()));
    }

    for entry in walkdir::WalkDir::new(dir)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() && path.extension().is_some_and(|ext| ext == "jsonl") {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.contains(session_id) {
                    return Ok(path.to_path_buf());
                }
            }
        }
    }

    Err(Error::SessionNotFound(format!("Codex CLI session not found: {}", session_id)))
}

/// Parse full session from file
fn parse_full_session(path: &Path) -> Result<CodexSession> {
    let file = fs::File::open(path).map_err(|e| {
        Error::Other(format!("Failed to open session file: {}", e))
    })?;

    let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let reader = BufReader::new(file);

    let mut meta: Option<CodexSessionMeta> = None;
    let mut messages: Vec<SessionMessage> = Vec::new();
    let mut first_user_message: Option<String> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.trim().is_empty() {
            continue;
        }

        let event: RawEvent = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };

        match event.event_type.as_str() {
            "session_meta" => {
                if let Ok(m) = serde_json::from_value(event.payload) {
                    meta = Some(m);
                }
            }
            "response_item" => {
                if let Ok(item) = serde_json::from_value::<ResponseItem>(event.payload.clone()) {
                    // Extract first user message
                    if first_user_message.is_none() && item.role.as_deref() == Some("user") {
                        if let Some(content) = &item.content {
                            first_user_message = extract_user_text(content);
                        }
                    }

                    messages.push(SessionMessage {
                        timestamp: event.timestamp,
                        message_type: item.item_type,
                        role: item.role,
                        content: item.content.unwrap_or(serde_json::Value::Null),
                    });
                }
            }
            _ => {}
        }
    }

    let meta = meta.ok_or_else(|| Error::Other("Session has no metadata".to_string()))?;

    let project_name = Path::new(&meta.cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let summary = CodexSessionSummary {
        id: meta.id.clone(),
        file_path: path.to_string_lossy().to_string(),
        timestamp: meta.timestamp.clone(),
        cwd: meta.cwd.clone(),
        project_name,
        cli_version: meta.cli_version.clone(),
        git_branch: meta.git.as_ref().and_then(|g| g.branch.clone()),
        git_commit: meta.git.as_ref().and_then(|g| g.commit_hash.clone()),
        first_message: first_user_message,
        message_count: messages.len(),
        file_size,
    };

    Ok(CodexSession {
        summary,
        meta,
        messages,
    })
}

/// Search sessions by keyword
pub fn search_sessions(query: &str, limit: usize) -> Result<Vec<CodexSessionSummary>> {
    let all_sessions = list_sessions()?;
    let query_lower = query.to_lowercase();

    let filtered: Vec<_> = all_sessions
        .into_iter()
        .filter(|s| {
            s.project_name.to_lowercase().contains(&query_lower)
                || s.cwd.to_lowercase().contains(&query_lower)
                || s.first_message
                    .as_ref()
                    .is_some_and(|m| m.to_lowercase().contains(&query_lower))
                || s.git_branch
                    .as_ref()
                    .is_some_and(|b| b.to_lowercase().contains(&query_lower))
        })
        .take(limit)
        .collect();

    Ok(filtered)
}

/// Delete a session file
pub fn delete_session(session_id: &str) -> Result<()> {
    let sessions_dir = super::get_codex_dir().join("sessions");
    let file_path = find_session_file(&sessions_dir, session_id)?;

    fs::remove_file(&file_path).map_err(|e| {
        Error::Other(format!("Failed to delete session: {}", e))
    })?;

    tracing::info!("Deleted Codex CLI session: {}", session_id);
    Ok(())
}
