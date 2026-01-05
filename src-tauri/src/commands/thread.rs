//! Thread commands - proxy to app-server

use serde_json::Value as JsonValue;
use tauri::State;

use crate::app_server::ipc_bridge::*;
use crate::database::SessionMetadata;
use crate::state::AppState;
use crate::Result;

/// Start a new thread
#[tauri::command]
pub async fn start_thread(
    state: State<'_, AppState>,
    project_id: String,
    cwd: String,
    model: Option<String>,
    sandbox_mode: Option<String>,
    ask_for_approval: Option<String>,
) -> Result<ThreadStartResponse> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let params = ThreadStartParams {
        cwd: cwd.clone(),
        model,
        sandbox_mode,
        ask_for_approval,
        additional_directories: None,
    };

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let response: ThreadStartResponse = server.send_request("thread/start", params).await?;

    // Create session metadata
    let metadata = SessionMetadata::new(&response.thread.id, &project_id);
    state.database.upsert_session_metadata(&metadata)?;

    // Update project last opened time
    state.database.update_project_last_opened(&project_id)?;

    tracing::info!("Started thread: {}", response.thread.id);

    Ok(response)
}

/// Resume an existing thread
#[tauri::command]
pub async fn resume_thread(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<ThreadResumeResponse> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let params = ThreadResumeParams { thread_id };

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let response: ThreadResumeResponse = server.send_request("thread/resume", params).await?;

    tracing::info!("Resumed thread: {}", response.thread.id);

    Ok(response)
}

/// Send a message to start a new turn
#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    thread_id: String,
    text: String,
    images: Option<Vec<String>>,
) -> Result<TurnStartResponse> {
    let mut input: Vec<UserInput> = vec![UserInput::Text { text }];

    // Add images if provided
    if let Some(image_paths) = images {
        for path in image_paths {
            input.push(UserInput::LocalImage { path });
        }
    }

    let params = TurnStartParams { thread_id, input };

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let response: TurnStartResponse = server.send_request("turn/start", params).await?;

    tracing::info!("Started turn: {}", response.turn_id);

    Ok(response)
}

/// Interrupt the current turn
#[tauri::command]
pub async fn interrupt_turn(state: State<'_, AppState>, thread_id: String) -> Result<()> {
    let params = TurnInterruptParams { thread_id };

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let _: JsonValue = server.send_request("turn/interrupt", params).await?;

    tracing::info!("Interrupted turn");

    Ok(())
}

/// Respond to an approval request
#[tauri::command]
pub async fn respond_to_approval(
    state: State<'_, AppState>,
    thread_id: String,
    item_id: String,
    decision: String,
) -> Result<()> {
    let decision = match decision.as_str() {
        "accept" => ApprovalDecision::Accept,
        "acceptForSession" => ApprovalDecision::AcceptForSession,
        "decline" => ApprovalDecision::Decline,
        _ => return Err(crate::Error::Other(format!("Invalid decision: {}", decision))),
    };

    let params = ApprovalResponseParams {
        thread_id,
        item_id,
        decision,
    };

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    // The approval response is typically sent as a JSON-RPC response, not a request
    // For now, we'll use a notification-style approach
    server.send_notification("approval/respond", params).await?;

    Ok(())
}

/// List threads from codex
#[tauri::command]
pub async fn list_threads(
    state: State<'_, AppState>,
    limit: Option<u32>,
    cursor: Option<String>,
) -> Result<ThreadListResponse> {
    // Ensure app-server is running
    state.start_app_server().await?;

    let params = ThreadListParams { limit, cursor };

    let mut server = state.app_server.write().await;
    let server = server
        .as_mut()
        .ok_or_else(|| crate::Error::AppServer("App server not running".to_string()))?;

    let response: ThreadListResponse = server.send_request("thread/list", params).await?;

    Ok(response)
}
