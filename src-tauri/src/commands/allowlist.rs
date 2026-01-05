//! Command allowlist management commands

use tauri::State;

use crate::state::AppState;
use crate::Result;

/// Get command allowlist for a project
#[tauri::command]
pub async fn get_allowlist(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<String>> {
    state.database.get_allowlist(&project_id)
}

/// Add a command pattern to the allowlist
#[tauri::command]
pub async fn add_to_allowlist(
    state: State<'_, AppState>,
    project_id: String,
    command_pattern: String,
) -> Result<()> {
    state.database.add_to_allowlist(&project_id, &command_pattern)
}

/// Remove a command pattern from the allowlist
#[tauri::command]
pub async fn remove_from_allowlist(
    state: State<'_, AppState>,
    project_id: String,
    command_pattern: String,
) -> Result<()> {
    state.database.remove_from_allowlist(&project_id, &command_pattern)
}
