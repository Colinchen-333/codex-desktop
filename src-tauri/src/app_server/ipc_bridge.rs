//! IPC Bridge for JSON-RPC communication
//!
//! Maps Tauri commands to app-server JSON-RPC methods and handles
//! event routing from app-server notifications to Tauri events.

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

/// Thread start parameters
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadStartParams {
    /// Working directory for the thread
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,

    /// Optional model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Sandbox policy: "readOnly" | "workspaceWrite" | "dangerFullAccess"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<String>,

    /// Approval policy: "never" | "onRequest" | "onFailure" | "unlessTrusted"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<String>,
}

/// Thread start response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadStartResponse {
    pub thread: ThreadInfo,
}

/// Thread information
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadInfo {
    pub id: String,
    pub cwd: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Thread resume parameters
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadResumeParams {
    pub thread_id: String,
}

/// Thread resume response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadResumeResponse {
    pub thread: ThreadInfo,
    pub items: Vec<JsonValue>,
}

/// Thread list parameters
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// Thread list response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadListResponse {
    /// List of threads (API returns 'data' field)
    pub data: Vec<ThreadSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

/// Thread summary for listing
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummary {
    pub id: String,
    pub cwd: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// Turn start parameters
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnStartParams {
    pub thread_id: String,
    pub input: Vec<UserInput>,
}

/// User input types
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UserInput {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "localImage")]
    LocalImage { path: String },
}

/// Turn info
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnInfo {
    pub id: String,
    pub status: String,
    #[serde(default)]
    pub items: Vec<JsonValue>,
    pub error: Option<JsonValue>,
}

/// Turn start response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnStartResponse {
    pub turn: TurnInfo,
}

/// Turn interrupt parameters
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnInterruptParams {
    pub thread_id: String,
}

/// Approval decision
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalDecision {
    Accept,
    AcceptForSession,
    Decline,
}

/// Approval response parameters (for notification fallback)
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalResponseParams {
    pub thread_id: String,
    pub item_id: String,
    pub decision: ApprovalDecision,
}

/// Approval response result (for JSON-RPC response to server request)
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalResponseResult {
    pub decision: ApprovalDecision,
}

/// Account details when logged in
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDetails {
    #[serde(rename = "type")]
    pub account_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_type: Option<String>,
}

/// Account info response from app-server
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    pub account: Option<AccountDetails>,
    pub requires_openai_auth: bool,
}

/// IPC Bridge provides high-level methods for communicating with app-server
pub struct IpcBridge;

impl IpcBridge {
    /// Map frontend method names to JSON-RPC methods
    pub fn map_method(method: &str) -> &str {
        match method {
            "startThread" => "thread/start",
            "resumeThread" => "thread/resume",
            "listThreads" => "thread/list",
            "startTurn" => "turn/start",
            "interruptTurn" => "turn/interrupt",
            "getAccount" => "account/read",
            "login" => "account/login/start",
            "logout" => "account/logout",
            _ => method,
        }
    }

    /// Map app-server event names to frontend event names
    pub fn map_event(event: &str) -> String {
        // Convert JSON-RPC method notation to kebab-case event names
        // e.g., "item/started" -> "item-started"
        event.replace('/', "-")
    }
}
