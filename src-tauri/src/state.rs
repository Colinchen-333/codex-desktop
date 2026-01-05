//! Application state management

use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;

use crate::app_server::AppServerProcess;
use crate::database::Database;
use crate::Result;

/// Global application state
pub struct AppState {
    /// Database connection for projects, sessions, and metadata
    pub database: Arc<Database>,

    /// App server process manager
    pub app_server: Arc<RwLock<Option<AppServerProcess>>>,

    /// Tauri app handle for emitting events
    pub app_handle: AppHandle,
}

impl AppState {
    /// Create a new application state
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        // Get the app data directory
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| crate::Error::Tauri(e.to_string()))?;

        // Ensure the directory exists
        std::fs::create_dir_all(&app_data_dir)?;

        // Initialize database
        let db_path = app_data_dir.join("codex-desktop.db");
        let database = Arc::new(Database::new(&db_path)?);

        tracing::info!("Database initialized at {:?}", db_path);

        Ok(Self {
            database,
            app_server: Arc::new(RwLock::new(None)),
            app_handle: app_handle.clone(),
        })
    }

    /// Start the app server process
    pub async fn start_app_server(&self) -> Result<()> {
        let mut server = self.app_server.write().await;
        if server.is_none() {
            let process = AppServerProcess::spawn(self.app_handle.clone()).await?;
            *server = Some(process);
            tracing::info!("App server started");
        }
        Ok(())
    }

    /// Stop the app server process
    pub async fn stop_app_server(&self) -> Result<()> {
        let mut server = self.app_server.write().await;
        if let Some(mut process) = server.take() {
            process.shutdown().await?;
            tracing::info!("App server stopped");
        }
        Ok(())
    }

    /// Restart the app server process
    pub async fn restart_app_server(&self) -> Result<()> {
        self.stop_app_server().await?;
        self.start_app_server().await
    }
}
