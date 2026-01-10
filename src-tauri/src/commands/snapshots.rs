//! Snapshot management commands

use std::path::Path;

use tauri::State;

use crate::database::Snapshot;
use crate::state::AppState;
use crate::Result;

/// Create a snapshot for a session
#[tauri::command]
pub async fn create_snapshot(
    state: State<'_, AppState>,
    session_id: String,
    project_path: String,
) -> Result<Snapshot> {
    let path = Path::new(&project_path);
    crate::snapshots::create_snapshot(&state.database, &session_id, path)
}

/// Revert to a snapshot
#[tauri::command]
pub async fn revert_to_snapshot(
    state: State<'_, AppState>,
    snapshot_id: String,
    project_path: String,
) -> Result<()> {
    let path = Path::new(&project_path);
    crate::snapshots::revert_to_snapshot(&state.database, &snapshot_id, path)
}

/// List snapshots for a session
#[tauri::command]
pub async fn list_snapshots(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Snapshot>> {
    state.database.get_snapshots_for_session(&session_id)
}

/// Clean up old snapshots by age
#[tauri::command]
pub async fn cleanup_old_snapshots_by_age(
    state: State<'_, AppState>,
    max_age_days: Option<i64>,
) -> Result<String> {
    let days = max_age_days.unwrap_or(30); // Default 30 days
    let count = state.database.cleanup_snapshots_older_than(days)?;

    Ok(format!("Deleted {} old snapshots (older than {} days)", count, days))
}

/// Clean up old snapshots for a specific session
#[tauri::command]
pub async fn cleanup_session_snapshots(
    state: State<'_, AppState>,
    session_id: String,
    keep_count: Option<usize>,
) -> Result<String> {
    let keep = keep_count.unwrap_or(10); // Default keep 10 most recent
    let count = state.database.cleanup_old_snapshots(&session_id, keep)?;

    Ok(format!("Deleted {} old snapshots for session {} (kept {} most recent)", count, session_id, keep))
}
