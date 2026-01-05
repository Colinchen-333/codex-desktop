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
