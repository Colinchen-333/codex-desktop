//! Codex Desktop - A beautiful desktop GUI for Codex CLI
//!
//! This application provides a visual interface for interacting with the Codex CLI,
//! offering features like project management, session handling, diff previews,
//! and command execution with safety controls.

pub mod app_server;
pub mod codex_import;
pub mod commands;
pub mod database;
pub mod snapshots;

mod error;
mod state;
mod utils;

pub use error::{CodexErrorInfo, CodexErrorType, Error, Result};
pub use state::AppState;

use tauri::Manager;

/// Clean up old temp image files from previous sessions
fn cleanup_temp_images() {
    let temp_dir = std::env::temp_dir();

    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        let current_pid = std::process::id();
        let mut cleaned = 0;

        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                // Match codex_image_<pid>_<timestamp>.<ext> pattern
                if name.starts_with("codex_image_") {
                    // Extract PID from filename
                    let parts: Vec<&str> = name.split('_').collect();
                    if parts.len() >= 3 {
                        if let Ok(pid) = parts[2].parse::<u32>() {
                            // Only clean files from other PIDs (not current session)
                            if pid != current_pid {
                                if let Ok(metadata) = std::fs::metadata(&path) {
                                    // Only delete files older than 1 hour
                                    if let Ok(modified) = metadata.modified() {
                                        if let Ok(age) = std::time::SystemTime::now().duration_since(modified) {
                                            if age.as_secs() > 3600 {
                                                if std::fs::remove_file(&path).is_ok() {
                                                    cleaned += 1;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if cleaned > 0 {
            tracing::info!("Cleaned up {} old temp image files", cleaned);
        }
    }
}

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("codex_desktop=debug".parse().unwrap()),
        )
        .init();

    tracing::info!("Starting Codex Desktop");

    // Clean up old temp images from previous sessions
    cleanup_temp_images();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize application state
            let state = AppState::new(&app_handle)?;
            app.manage(state);

            tracing::info!("Application state initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Project commands
            commands::projects::list_projects,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::projects::update_project,
            commands::projects::get_project_git_info,
            commands::projects::get_project_git_diff,
            commands::projects::list_project_files,
            commands::projects::get_git_branches,
            commands::projects::get_git_commits,
            // Session commands
            commands::sessions::list_sessions,
            commands::sessions::get_session,
            commands::sessions::update_session_metadata,
            commands::sessions::delete_session,
            commands::sessions::search_sessions,
            commands::sessions::update_session_status,
            commands::sessions::set_session_first_message,
            commands::sessions::update_session_tasks,
            // Thread commands (proxy to app-server)
            commands::thread::start_thread,
            commands::thread::resume_thread,
            commands::thread::send_message,
            commands::thread::interrupt_turn,
            commands::thread::respond_to_approval,
            commands::thread::list_threads,
            // Snapshot commands
            commands::snapshots::create_snapshot,
            commands::snapshots::revert_to_snapshot,
            commands::snapshots::list_snapshots,
            commands::snapshots::cleanup_old_snapshots_by_age,
            commands::snapshots::cleanup_session_snapshots,
            // App server commands
            commands::app_server::get_server_status,
            commands::app_server::restart_server,
            commands::app_server::get_account_info,
            commands::app_server::start_login,
            commands::app_server::logout,
            commands::app_server::get_models,
            commands::app_server::list_skills,
            commands::app_server::list_mcp_servers,
            commands::app_server::start_review,
            commands::app_server::run_user_shell_command,
            // Config commands
            commands::app_server::read_config,
            commands::app_server::write_config,
            // Account rate limits
            commands::app_server::get_account_rate_limits,
            // Allowlist commands
            commands::allowlist::get_allowlist,
            commands::allowlist::add_to_allowlist,
            commands::allowlist::remove_from_allowlist,
            // Codex CLI import commands
            commands::codex_import::get_codex_config,
            commands::codex_import::list_codex_sessions,
            commands::codex_import::get_codex_session,
            commands::codex_import::search_codex_sessions,
            commands::codex_import::delete_codex_session,
            commands::codex_import::get_codex_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
