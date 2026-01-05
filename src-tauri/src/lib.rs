//! Codex Desktop - A beautiful desktop GUI for Codex CLI
//!
//! This application provides a visual interface for interacting with the Codex CLI,
//! offering features like project management, session handling, diff previews,
//! and command execution with safety controls.

pub mod app_server;
pub mod commands;
pub mod database;
pub mod snapshots;

mod error;
mod state;

pub use error::{CodexErrorInfo, CodexErrorType, Error, Result};
pub use state::AppState;

use tauri::Manager;

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
            // Session commands
            commands::sessions::list_sessions,
            commands::sessions::get_session,
            commands::sessions::update_session_metadata,
            commands::sessions::delete_session,
            commands::sessions::search_sessions,
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
            // Config commands
            commands::app_server::read_config,
            commands::app_server::write_config,
            // Allowlist commands
            commands::allowlist::get_allowlist,
            commands::allowlist::add_to_allowlist,
            commands::allowlist::remove_from_allowlist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
