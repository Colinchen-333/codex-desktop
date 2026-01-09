//! Session management commands

use tauri::State;

use crate::database::{SessionMetadata, SessionStatus};
use crate::state::AppState;
use crate::Result;

/// List sessions for a project
#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<SessionMetadata>> {
    state.database.get_sessions_for_project(&project_id)
}

/// Get session metadata
#[tauri::command]
pub async fn get_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<SessionMetadata>> {
    // We need to iterate through all projects to find the session
    // This is not efficient, but works for now
    let projects = state.database.get_all_projects()?;

    for project in projects {
        let sessions = state.database.get_sessions_for_project(&project.id)?;
        if let Some(session) = sessions.into_iter().find(|s| s.session_id == session_id) {
            return Ok(Some(session));
        }
    }

    Ok(None)
}

/// Update session metadata
#[tauri::command]
pub async fn update_session_metadata(
    state: State<'_, AppState>,
    session_id: String,
    project_id: Option<String>,
    title: Option<String>,
    tags: Option<Vec<String>>,
    is_favorite: Option<bool>,
    is_archived: Option<bool>,
    status: Option<String>,
    first_message: Option<String>,
    tasks_json: Option<String>,
) -> Result<SessionMetadata> {
    // Get existing metadata or create new
    let existing = get_session(state.clone(), session_id.clone()).await?;

    let mut metadata = match existing {
        Some(m) => m,
        None => {
            // If no existing metadata, we need a project_id
            // Try to get from parameter, or try to infer from thread information
            let pid = match project_id.clone() {
                Some(id) if !id.is_empty() => id,
                _ => {
                    // Try to infer project_id from the session by checking all projects
                    // and finding one that might be associated with this thread
                    // If we can't find one, return an error
                    return Err(crate::Error::Other(format!(
                        "Cannot create session metadata for {} without project_id",
                        session_id
                    )));
                }
            };
            SessionMetadata::new(&session_id, &pid)
        }
    };

    // Allow updating project_id if provided and different (for migration/fix purposes)
    if let Some(ref pid) = project_id {
        if !pid.is_empty() && metadata.project_id.is_empty() {
            metadata.project_id = pid.clone();
        }
    }

    if let Some(t) = title {
        metadata.title = Some(t);
    }
    if let Some(t) = tags {
        metadata.set_tags(t);
    }
    if let Some(f) = is_favorite {
        metadata.is_favorite = f;
    }
    if let Some(a) = is_archived {
        metadata.is_archived = a;
    }
    if let Some(s) = status {
        metadata.status = SessionStatus::from_str(&s);
    }
    if let Some(fm) = first_message {
        // Only set first message if not already set
        if metadata.first_message.is_none() {
            metadata.first_message = Some(fm);
        }
    }
    if let Some(tj) = tasks_json {
        metadata.tasks_json = Some(tj);
    }
    metadata.last_accessed_at = Some(chrono::Utc::now().timestamp());

    state.database.upsert_session_metadata(&metadata)?;

    Ok(metadata)
}

/// Delete session metadata
#[tauri::command]
pub async fn delete_session(state: State<'_, AppState>, session_id: String) -> Result<()> {
    state.database.delete_session_metadata(&session_id)?;
    Ok(())
}

/// Update session status only (lightweight update)
#[tauri::command]
pub async fn update_session_status(
    state: State<'_, AppState>,
    session_id: String,
    status: String,
) -> Result<()> {
    let status_enum = SessionStatus::from_str(&status);
    state.database.update_session_status(&session_id, &status_enum)?;
    Ok(())
}

/// Set session first message (only if not already set)
#[tauri::command]
pub async fn set_session_first_message(
    state: State<'_, AppState>,
    session_id: String,
    first_message: String,
) -> Result<()> {
    state.database.update_session_first_message(&session_id, &first_message)?;
    Ok(())
}

/// Update session tasks
#[tauri::command]
pub async fn update_session_tasks(
    state: State<'_, AppState>,
    session_id: String,
    tasks_json: String,
) -> Result<()> {
    state.database.update_session_tasks(&session_id, &tasks_json)?;
    Ok(())
}

/// Calculate relevance score for a session based on query match
/// Scoring:
/// - Exact title match: 100 points
/// - Title prefix match: 80 points
/// - Title contains match: 60 points
/// - firstMessage match: 40 points
/// - Tag match: 30 points
/// - sessionId match: 10 points
fn calculate_relevance_score(session: &SessionMetadata, query_lower: &str) -> i32 {
    let mut score = 0i32;

    // Title matching (highest priority)
    if let Some(title) = &session.title {
        let title_lower = title.to_lowercase();
        if title_lower == query_lower {
            // Exact match
            score += 100;
        } else if title_lower.starts_with(query_lower) {
            // Prefix match
            score += 80;
        } else if title_lower.contains(query_lower) {
            // Contains match
            score += 60;
        }
    }

    // First message matching
    if let Some(first_msg) = &session.first_message {
        let first_msg_lower = first_msg.to_lowercase();
        if first_msg_lower == query_lower {
            score += 50; // Exact match bonus
        } else if first_msg_lower.starts_with(query_lower) {
            score += 45; // Prefix match
        } else if first_msg_lower.contains(query_lower) {
            score += 40;
        }
    }

    // Tag matching
    let session_tags = session.get_tags();
    for tag in &session_tags {
        let tag_lower = tag.to_lowercase();
        if tag_lower == query_lower {
            score += 35; // Exact tag match
        } else if tag_lower.contains(query_lower) {
            score += 30;
        }
    }

    // Session ID matching (lowest priority)
    if session.session_id.to_lowercase().contains(query_lower) {
        score += 10;
    }

    // Bonus for favorites
    if session.is_favorite {
        score += 5;
    }

    score
}

/// Search sessions across all projects with relevance scoring
#[tauri::command]
pub async fn search_sessions(
    state: State<'_, AppState>,
    query: String,
    tags_filter: Option<Vec<String>>,
    favorites_only: Option<bool>,
) -> Result<Vec<SessionMetadata>> {
    let projects = state.database.get_all_projects()?;
    let mut all_sessions = Vec::new();

    for project in projects {
        let sessions = state.database.get_sessions_for_project(&project.id)?;
        all_sessions.extend(sessions);
    }

    let query_lower = query.to_lowercase();

    // Filter and score sessions
    let mut scored_sessions: Vec<(SessionMetadata, i32)> = all_sessions
        .into_iter()
        .filter(|s| {
            // Filter by tags first
            if let Some(ref filter_tags) = tags_filter {
                let session_tags = s.get_tags();
                if !filter_tags.iter().all(|ft| session_tags.contains(ft)) {
                    return false;
                }
            }

            // Filter by favorites
            if let Some(true) = favorites_only {
                if !s.is_favorite {
                    return false;
                }
            }

            // Check if any field matches
            let score = calculate_relevance_score(s, &query_lower);
            score > 0
        })
        .map(|s| {
            let score = calculate_relevance_score(&s, &query_lower);
            (s, score)
        })
        .collect();

    // Sort by relevance score (descending), then by last_accessed_at (descending)
    scored_sessions.sort_by(|a, b| {
        // First compare by score (higher is better)
        let score_cmp = b.1.cmp(&a.1);
        if score_cmp != std::cmp::Ordering::Equal {
            return score_cmp;
        }
        // Then by last_accessed_at (more recent is better)
        let a_time = a.0.last_accessed_at.unwrap_or(0);
        let b_time = b.0.last_accessed_at.unwrap_or(0);
        b_time.cmp(&a_time)
    });

    // Extract just the sessions (without scores)
    let result: Vec<SessionMetadata> = scored_sessions.into_iter().map(|(s, _)| s).collect();

    Ok(result)
}
