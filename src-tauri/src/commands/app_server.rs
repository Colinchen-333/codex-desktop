//! App server management commands

use serde::Serialize;
use tauri::State;

use crate::app_server::ipc_bridge::{AccountInfo, TurnStartResponse};
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

    // Empty params for account/read
    let response: AccountInfo = server
        .send_request("account/read", serde_json::json!({}))
        .await?;

    Ok(response)
}

/// Login response from app-server
#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    #[serde(rename = "type")]
    pub login_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub login_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_url: Option<String>,
}

/// Start login flow
#[tauri::command]
pub async fn start_login(
    state: State<'_, AppState>,
    login_type: String,
    api_key: Option<String>,
) -> Result<LoginResponse> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    // Build params based on login type
    let params = if login_type == "apiKey" {
        // API key login requires the key
        serde_json::json!({
            "type": "apiKey",
            "apiKey": api_key.unwrap_or_default(),
        })
    } else {
        // ChatGPT OAuth flow
        serde_json::json!({
            "type": login_type,
        })
    };

    let response: LoginResponse = server.send_request("account/login/start", params).await?;

    Ok(response)
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

/// Reasoning effort option
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningEffortOption {
    pub reasoning_effort: String,
    pub description: String,
}

/// Model information
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    pub id: String,
    pub model: String,
    pub display_name: String,
    pub description: String,
    pub supported_reasoning_efforts: Vec<ReasoningEffortOption>,
    pub default_reasoning_effort: String,
    pub is_default: bool,
}

/// Model list response
#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelListResponse {
    pub data: Vec<Model>,
    pub next_cursor: Option<String>,
}

/// Get available models
#[tauri::command]
pub async fn get_models(state: State<'_, AppState>) -> Result<ModelListResponse> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let params = serde_json::json!({
        "limit": 100,
    });

    let response: ModelListResponse = server.send_request("model/list", params).await?;

    Ok(response)
}

// ==================== Skills Commands ====================

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsListParams {
    pub cwds: Vec<String>,
    pub force_reload: bool,
}

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMetadata {
    pub name: String,
    pub description: String,
    pub short_description: Option<String>,
    pub path: String,
    pub scope: String,
}

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillErrorInfo {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsListEntry {
    pub cwd: String,
    pub skills: Vec<SkillMetadata>,
    pub errors: Vec<SkillErrorInfo>,
}

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsListResponse {
    pub data: Vec<SkillsListEntry>,
}

#[tauri::command]
pub async fn list_skills(
    state: State<'_, AppState>,
    cwds: Vec<String>,
    force_reload: bool,
) -> Result<SkillsListResponse> {
    state.start_app_server().await?;
    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let params = SkillsListParams { cwds, force_reload };
    let response: SkillsListResponse = server.send_request("skills/list", params).await?;
    Ok(response)
}

// ==================== MCP Commands ====================

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub name: String,
    pub tools: std::collections::HashMap<String, serde_json::Value>,
    pub resources: Vec<serde_json::Value>,
    pub resource_templates: Vec<serde_json::Value>,
    pub auth_status: serde_json::Value,
}

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatusResponse {
    pub data: Vec<McpServerStatus>,
    pub next_cursor: Option<String>,
}

#[tauri::command]
pub async fn list_mcp_servers(state: State<'_, AppState>) -> Result<McpServerStatusResponse> {
    state.start_app_server().await?;
    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let params = serde_json::json!({
        "limit": 100,
    });
    let response: McpServerStatusResponse = server
        .send_request("mcpServerStatus/list", params)
        .await?;
    Ok(response)
}

// ==================== Review Commands ====================

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewStartResponse {
    pub turn: serde_json::Value,
    pub review_thread_id: String,
}

#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ReviewTarget {
    /// Review the working tree: staged, unstaged, and untracked files
    UncommittedChanges,
    /// Review changes between the current branch and the given base branch
    #[serde(rename_all = "camelCase")]
    BaseBranch { branch: String },
    /// Review the changes introduced by a specific commit
    #[serde(rename_all = "camelCase")]
    Commit {
        sha: String,
        title: Option<String>,
    },
    /// Arbitrary instructions, equivalent to the old free-form prompt
    #[serde(rename_all = "camelCase")]
    Custom { instructions: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewStartParams {
    pub thread_id: String,
    pub target: ReviewTarget,
}

#[tauri::command]
pub async fn start_review(
    state: State<'_, AppState>,
    thread_id: String,
    target: Option<ReviewTarget>,
) -> Result<ReviewStartResponse> {
    state.start_app_server().await?;
    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let params = ReviewStartParams {
        thread_id,
        target: target.unwrap_or(ReviewTarget::UncommittedChanges),
    };
    let response: ReviewStartResponse = server.send_request("review/start", params).await?;
    Ok(response)
}

// ==================== User Shell Command ====================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserShellCommandParams {
    pub thread_id: String,
    pub command: String,
}

/// Run a local shell command (like CLI's ! prefix)
#[tauri::command]
pub async fn run_user_shell_command(
    state: State<'_, AppState>,
    thread_id: String,
    command: String,
) -> Result<TurnStartResponse> {
    state.start_app_server().await?;
    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let params = UserShellCommandParams { thread_id, command };
    let response: TurnStartResponse = server.send_request("userShellCommand/run", params).await?;
    Ok(response)
}

// ==================== Config Commands ====================

/// Config layer information
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigLayer {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub config: serde_json::Value,
}

/// Config origin information
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigOrigin {
    pub layer: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// Config read response
#[derive(Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigReadResponse {
    pub config: serde_json::Value,
    pub origins: std::collections::HashMap<String, ConfigOrigin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layers: Option<Vec<ConfigLayer>>,
}

/// Read configuration
#[tauri::command]
pub async fn read_config(
    state: State<'_, AppState>,
    include_layers: Option<bool>,
) -> Result<ConfigReadResponse> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let params = serde_json::json!({
        "includeLayers": include_layers.unwrap_or(false),
    });

    let response: ConfigReadResponse = server.send_request("config/read", params).await?;

    Ok(response)
}

/// Write configuration
#[tauri::command]
pub async fn write_config(
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<()> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let params = serde_json::json!({
        "key": key,
        "value": value,
    });

    let _: serde_json::Value = server.send_request("config/write", params).await?;

    Ok(())
}

// ==================== Account Rate Limits ====================

/// Get account rate limits
#[tauri::command]
pub async fn get_account_rate_limits(
    state: State<'_, AppState>,
) -> Result<serde_json::Value> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let response: serde_json::Value = server
        .send_request("account/rateLimits/read", serde_json::json!({}))
        .await?;

    Ok(response)
}
