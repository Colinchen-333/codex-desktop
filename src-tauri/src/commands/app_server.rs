//! App server management commands

use serde::Serialize;
use tauri::State;

use crate::app_server::ipc_bridge::AccountInfo;
use crate::state::AppState;
use crate::Result;

/// Server status information
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub is_running: bool,
    pub version: Option<String>,
}

/// Get the app server status
#[tauri::command]
pub async fn get_server_status(state: State<'_, AppState>) -> Result<ServerStatus> {
    let mut server = state.app_server.write().await;

    let is_running = server.as_mut().map(|s| s.is_running()).unwrap_or(false);

    Ok(ServerStatus {
        is_running,
        version: None, // TODO: Get version from app-server
    })
}

/// Restart the app server
#[tauri::command]
pub async fn restart_server(state: State<'_, AppState>) -> Result<()> {
    state.restart_app_server().await?;
    Ok(())
}

/// Get account information
#[tauri::command]
pub async fn get_account_info(state: State<'_, AppState>) -> Result<AccountInfo> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    // Empty params for account/get
    let response: AccountInfo = server
        .send_request("account/get", serde_json::json!({}))
        .await?;

    Ok(response)
}

/// Start login flow
#[tauri::command]
pub async fn start_login(state: State<'_, AppState>, method: String) -> Result<()> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let params = serde_json::json!({
        "method": method,
    });

    let _: serde_json::Value = server.send_request("account/login", params).await?;

    Ok(())
}

/// Logout
#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<()> {
    let mut server = state.app_server.write().await;

    if let Some(server) = server.as_mut() {
        let _: serde_json::Value = server
            .send_request("account/logout", serde_json::json!({}))
            .await?;
    }

    Ok(())
}
