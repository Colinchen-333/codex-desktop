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

    /// Model provider (e.g., "openai", "anthropic")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_provider: Option<String>,

    /// Sandbox policy: "readOnly" | "workspaceWrite" | "dangerFullAccess"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<String>,

    /// Approval policy: "never" | "onRequest" | "onFailure" | "unlessTrusted"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<String>,

    /// Base instructions for the agent
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_instructions: Option<String>,

    /// Developer instructions (overrides base)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub developer_instructions: Option<String>,

    /// Additional configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<JsonValue>,
}

/// Sandbox policy response (tagged union)
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SandboxPolicy {
    ReadOnly,
    WorkspaceWrite {
        #[serde(default)]
        writable_roots: Vec<String>,
        #[serde(default)]
        network_access: bool,
        #[serde(default)]
        exclude_tmpdir_env_var: bool,
        #[serde(default)]
        exclude_slash_tmp: bool,
    },
    DangerFullAccess,
    ExternalSandbox {
        #[serde(default = "default_network_access")]
        network_access: String,
    },
}

fn default_network_access() -> String {
    "restricted".to_string()
}

/// Thread start response
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadStartResponse {
    pub thread: ThreadInfo,
    pub model: String,
    pub model_provider: String,
    pub cwd: String,
    pub approval_policy: String,
    pub sandbox: SandboxPolicy,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_summary: Option<String>,
}

/// Thread information
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadInfo {
    pub id: String,
    pub cwd: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cli_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox_policy: Option<SandboxPolicy>,
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
    /// Items in the thread (may be missing for new/empty threads)
    #[serde(default)]
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

    /// Filter by model providers (e.g., ["openai", "anthropic"])
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_providers: Option<Vec<String>>,
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

/// Git information
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_url: Option<String>,
}

/// Thread summary for listing
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummary {
    pub id: String,
    pub preview: String,
    pub model_provider: String,
    pub created_at: i64,  // Unix timestamp
    pub cwd: String,
    pub cli_version: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_info: Option<GitInfo>,
}

/// Turn start parameters
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnStartParams {
    pub thread_id: String,
    pub input: Vec<UserInput>,

    /// Optional reasoning effort: "none" | "minimal" | "low" | "medium" | "high" | "x_high"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,

    /// Optional reasoning summary config: "none" | "concise" | "detailed"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,

    /// Optional CWD override
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,

    /// Optional approval policy override
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<String>,

    /// Optional sandbox policy override
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox_policy: Option<String>,

    /// Optional model override
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// User input types
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UserInput {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "localImage")]
    LocalImage { path: String },
    /// Skill selected by the user (name + path to SKILL.md)
    #[serde(rename = "skill")]
    Skill { name: String, path: String },
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
    /// Optional turn_id to interrupt a specific turn (if not provided, interrupts current turn)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

/// Execpolicy amendment for persistent approvals
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecPolicyAmendment {
    pub command: Vec<String>,
}

/// Approval decision
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalDecision {
    /// Run this action once
    Accept,
    /// Allow this action for the current session
    AcceptForSession,
    /// Approve and persist execpolicy amendment
    AcceptWithExecpolicyAmendment { execpolicy_amendment: ExecPolicyAmendment },
    /// Decline/reject this action
    Decline,
    /// Cancel the request
    Cancel,
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
