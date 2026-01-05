//! Project management commands

use std::path::Path;

use tauri::State;

use crate::database::{Project, ProjectSettings};
use crate::state::AppState;
use crate::Result;

/// List all projects
#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>> {
    state.database.get_all_projects()
}

/// Add a new project
#[tauri::command]
pub async fn add_project(state: State<'_, AppState>, path: String) -> Result<Project> {
    // Validate path exists
    if !Path::new(&path).exists() {
        return Err(crate::Error::InvalidPath(format!(
            "Path does not exist: {}",
            path
        )));
    }

    // Check if already added
    let existing = state.database.get_all_projects()?;
    if existing.iter().any(|p| p.path == path) {
        return Err(crate::Error::Other("Project already exists".to_string()));
    }

    let project = Project::new(&path);
    state.database.insert_project(&project)?;

    tracing::info!("Added project: {} at {}", project.id, path);

    Ok(project)
}

/// Remove a project
#[tauri::command]
pub async fn remove_project(state: State<'_, AppState>, id: String) -> Result<()> {
    state.database.delete_project(&id)?;
    tracing::info!("Removed project: {}", id);
    Ok(())
}

/// Update project settings
#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    id: String,
    display_name: Option<String>,
    settings: Option<ProjectSettings>,
) -> Result<Project> {
    let project = state
        .database
        .get_project(&id)?
        .ok_or_else(|| crate::Error::ProjectNotFound(id.clone()))?;

    // For now, we'll need to delete and re-insert
    // A proper UPDATE query would be better
    let mut updated = project;
    if let Some(name) = display_name {
        updated.display_name = Some(name);
    }
    if let Some(s) = settings {
        updated.settings_json = Some(serde_json::to_string(&s).unwrap_or_default());
    }

    state.database.delete_project(&id)?;
    state.database.insert_project(&updated)?;

    Ok(updated)
}

/// Get git information for a project
#[tauri::command]
pub async fn get_project_git_info(path: String) -> Result<GitInfo> {
    let project_path = Path::new(&path);

    if !project_path.join(".git").exists() {
        return Ok(GitInfo {
            is_git_repo: false,
            branch: None,
            is_dirty: None,
            last_commit: None,
        });
    }

    // Get current branch
    let branch_output = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(project_path)
        .output()
        .ok();

    let branch = branch_output
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    // Check if dirty
    let status_output = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(project_path)
        .output()
        .ok();

    let is_dirty = status_output
        .filter(|o| o.status.success())
        .map(|o| !o.stdout.is_empty());

    // Get last commit message
    let log_output = std::process::Command::new("git")
        .args(["log", "-1", "--pretty=%s"])
        .current_dir(project_path)
        .output()
        .ok();

    let last_commit = log_output
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    Ok(GitInfo {
        is_git_repo: true,
        branch,
        is_dirty,
        last_commit,
    })
}

/// Git repository information
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub is_git_repo: bool,
    pub branch: Option<String>,
    pub is_dirty: Option<bool>,
    pub last_commit: Option<String>,
}
