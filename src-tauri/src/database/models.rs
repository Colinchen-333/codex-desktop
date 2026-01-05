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

    /// Create a new file backup snapshot
    pub fn new_file_backup(session_id: &str, backup_path: &str) -> Self {
        let metadata = serde_json::json!({
            "backup_path": backup_path,
        });

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            created_at: chrono::Utc::now().timestamp(),
            snapshot_type: "file_backup".to_string(),
            metadata_json: Some(metadata.to_string()),
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
