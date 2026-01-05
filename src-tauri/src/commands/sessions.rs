//! Session management commands

use tauri::State;

use crate::database::SessionMetadata;
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
    title: Option<String>,
    tags: Option<Vec<String>>,
    is_favorite: Option<bool>,
    is_archived: Option<bool>,
) -> Result<SessionMetadata> {
    // Get existing metadata or create new
    let existing = get_session(state.clone(), session_id.clone()).await?;

    let mut metadata = existing.unwrap_or_else(|| {
        // If no existing metadata, we need a project_id
        // For now, just use an empty string - this should be handled better
        SessionMetadata::new(&session_id, "")
    });

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

/// Search sessions across all projects
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

    // Filter by query
    let query_lower = query.to_lowercase();
    let filtered: Vec<SessionMetadata> = all_sessions
        .into_iter()
        .filter(|s| {
            // Match title
            if let Some(title) = &s.title {
                if title.to_lowercase().contains(&query_lower) {
                    return true;
                }
            }

            // Match tags
            let session_tags = s.get_tags();
            if session_tags
                .iter()
                .any(|t| t.to_lowercase().contains(&query_lower))
            {
                return true;
            }

            // Match session_id
            if s.session_id.to_lowercase().contains(&query_lower) {
                return true;
            }

            false
        })
        .filter(|s| {
            // Filter by tags
            if let Some(ref filter_tags) = tags_filter {
                let session_tags = s.get_tags();
                return filter_tags
                    .iter()
                    .all(|ft| session_tags.contains(ft));
            }
            true
        })
        .filter(|s| {
            // Filter by favorites
            if let Some(true) = favorites_only {
                return s.is_favorite;
            }
            true
        })
        .collect();

    Ok(filtered)
}
