//! Database model definitions

use serde::{Deserialize, Serialize};

/// Project stored in local database
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// Unique identifier
    pub id: String,

    /// Absolute path to the project directory
    pub path: String,

    /// Display name (defaults to folder name)
    pub display_name: Option<String>,

    /// Unix timestamp when project was added
    pub created_at: i64,

    /// Unix timestamp when project was last opened
    pub last_opened_at: Option<i64>,

    /// JSON-encoded project settings
    pub settings_json: Option<String>,
}

impl Project {
    /// Create a new project from a path
    pub fn new(path: &str) -> Self {
        let display_name = std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string());

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            path: path.to_string(),
            display_name,
            created_at: chrono::Utc::now().timestamp(),
            last_opened_at: None,
            settings_json: None,
        }
    }
}

/// Session status enum for agent state tracking
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    #[default]
    Idle,
    Running,
    Completed,
    Failed,
    Interrupted,
}

impl SessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SessionStatus::Idle => "idle",
            SessionStatus::Running => "running",
            SessionStatus::Completed => "completed",
            SessionStatus::Failed => "failed",
            SessionStatus::Interrupted => "interrupted",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "running" => SessionStatus::Running,
            "completed" => SessionStatus::Completed,
            "failed" => SessionStatus::Failed,
            "interrupted" => SessionStatus::Interrupted,
            _ => SessionStatus::Idle,
        }
    }
}

/// Session metadata extensions (tags, favorites, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetadata {
    /// Codex thread ID
    pub session_id: String,

    /// Associated project ID
    pub project_id: String,

    /// User-defined title
    pub title: Option<String>,

    /// JSON array of tags
    pub tags: Option<String>,

    /// Whether this session is favorited
    pub is_favorite: bool,

    /// Whether this session is archived
    pub is_archived: bool,

    /// Unix timestamp when last accessed
    pub last_accessed_at: Option<i64>,

    /// Unix timestamp when created
    pub created_at: i64,

    /// Current session status (idle, running, completed, failed, interrupted)
    #[serde(default)]
    pub status: SessionStatus,

    /// First user message (used as session name if no title set)
    pub first_message: Option<String>,

    /// JSON array of tasks for progress tracking
    pub tasks_json: Option<String>,
}

impl SessionMetadata {
    /// Create new session metadata
    pub fn new(session_id: &str, project_id: &str) -> Self {
        Self {
            session_id: session_id.to_string(),
            project_id: project_id.to_string(),
            title: None,
            tags: None,
            is_favorite: false,
            is_archived: false,
            last_accessed_at: Some(chrono::Utc::now().timestamp()),
            created_at: chrono::Utc::now().timestamp(),
            status: SessionStatus::Idle,
            first_message: None,
            tasks_json: None,
        }
    }

    /// Parse tags from JSON
    pub fn get_tags(&self) -> Vec<String> {
        self.tags
            .as_ref()
            .and_then(|t| serde_json::from_str(t).ok())
            .unwrap_or_default()
    }

    /// Set tags as JSON
    pub fn set_tags(&mut self, tags: Vec<String>) {
        self.tags = Some(serde_json::to_string(&tags).unwrap_or_default());
    }

    /// Get display name for session (title or truncated first message)
    pub fn get_display_name(&self) -> String {
        if let Some(ref title) = self.title {
            if !title.is_empty() {
                return title.clone();
            }
        }
        if let Some(ref first_msg) = self.first_message {
            // Truncate to 30 chars for display
            if first_msg.len() > 30 {
                return format!("{}...", &first_msg[..30]);
            }
            return first_msg.clone();
        }
        format!("Session {}", &self.session_id[..8.min(self.session_id.len())])
    }

    /// Parse tasks from JSON
    pub fn get_tasks(&self) -> Vec<TaskItem> {
        self.tasks_json
            .as_ref()
            .and_then(|t| serde_json::from_str(t).ok())
            .unwrap_or_default()
    }

    /// Set tasks as JSON
    pub fn set_tasks(&mut self, tasks: Vec<TaskItem>) {
        self.tasks_json = Some(serde_json::to_string(&tasks).unwrap_or_default());
    }
}

/// Task item for progress tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskItem {
    /// Task description
    pub content: String,
    /// Task status (pending, in_progress, completed)
    pub status: String,
}

/// Snapshot for revert functionality
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Unique identifier
    pub id: String,

    /// Associated session ID
    pub session_id: String,

    /// Unix timestamp when created
    pub created_at: i64,

    /// Type: "git_ghost" or "file_backup"
    pub snapshot_type: String,

    /// JSON-encoded snapshot metadata
    pub metadata_json: Option<String>,
}

impl Snapshot {
    /// Create a new git ghost commit snapshot
    pub fn new_git_ghost(session_id: &str, commit_sha: &str) -> Self {
        let metadata = serde_json::json!({
            "commit_sha": commit_sha,
        });

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            created_at: chrono::Utc::now().timestamp(),
            snapshot_type: "git_ghost".to_string(),
            metadata_json: Some(metadata.to_string()),
        }
    }

    /// Create a new file backup snapshot with full metadata
    pub fn new_file_backup(session_id: &str, metadata_json: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            created_at: chrono::Utc::now().timestamp(),
            snapshot_type: "file_backup".to_string(),
            metadata_json: Some(metadata_json.to_string()),
        }
    }
}

/// Project settings stored as JSON
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    /// Custom working directory (defaults to project path)
    pub cwd: Option<String>,

    /// Environment variables to set
    pub env_vars: Option<std::collections::HashMap<String, String>>,

    /// Default model to use
    pub model: Option<String>,

    /// Default sandbox mode
    pub sandbox_mode: Option<String>,

    /// Default approval policy
    pub ask_for_approval: Option<String>,
}
