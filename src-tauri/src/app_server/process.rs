//! App server process management
//!
//! Spawns and manages the `codex app-server` subprocess, handling health checks,
//! restarts, and graceful shutdown.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value as JsonValue;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::{Error, Result};

/// JSON-RPC request structure (without jsonrpc header as per app-server protocol)
#[derive(Debug, Serialize)]
struct JsonRpcRequest<T> {
    id: u64,
    method: String,
    params: T,
}

/// JSON-RPC message structure (handles responses, notifications, and server requests)
#[derive(Debug, serde::Deserialize)]
struct JsonRpcMessage {
    id: Option<u64>,
    result: Option<JsonValue>,
    error: Option<JsonRpcError>,
    method: Option<String>,
    params: Option<JsonValue>,
}

/// JSON-RPC error structure
#[derive(Debug, serde::Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[allow(dead_code)]
    data: Option<JsonValue>,
}

/// Manages the codex app-server subprocess
pub struct AppServerProcess {
    /// The child process
    child: Child,

    /// Stdin writer for sending requests
    stdin: ChildStdin,

    /// Request ID counter
    request_counter: AtomicU64,

    /// Pending requests awaiting responses
    pending_requests: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<JsonValue>>>>>,

    /// Channel for shutdown signal
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl AppServerProcess {
    /// Spawn a new app-server process
    pub async fn spawn(app_handle: AppHandle) -> Result<Self> {
        // Find the codex binary
        let codex_path = Self::find_codex_binary()?;

        tracing::info!("Spawning app-server from: {:?}", codex_path);

        // Spawn the process
        let mut child = tokio::process::Command::new(&codex_path)
            .arg("app-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| Error::AppServer(format!("Failed to spawn app-server: {}", e)))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| Error::AppServer("Failed to capture stdin".to_string()))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| Error::AppServer("Failed to capture stdout".to_string()))?;

        let pending_requests: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<JsonValue>>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

        // Spawn stdout reader task
        let pending_clone = pending_requests.clone();
        let app_handle_clone = app_handle.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        tracing::debug!("Stdout reader received shutdown signal");
                        break;
                    }
                    line = lines.next_line() => {
                        match line {
                            Ok(Some(line)) => {
                                Self::handle_message(&line, &pending_clone, &app_handle_clone).await;
                            }
                            Ok(None) => {
                                tracing::info!("App server stdout closed (EOF)");
                                // Emit disconnected event
                                let _ = app_handle_clone.emit("app-server-disconnected", ());
                                break;
                            }
                            Err(e) => {
                                tracing::error!("Error reading from app-server stdout: {}", e);
                                break;
                            }
                        }
                    }
                }
            }
        });

        let mut process = Self {
            child,
            stdin,
            request_counter: AtomicU64::new(1),
            pending_requests,
            shutdown_tx: Some(shutdown_tx),
        };

        // Initialize the app-server (required before any other requests)
        process.initialize().await?;

        Ok(process)
    }

    /// Initialize the app-server with client info
    async fn initialize(&mut self) -> Result<()> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct ClientInfo {
            name: String,
            title: String,
            version: String,
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct InitializeParams {
            client_info: ClientInfo,
        }

        let params = InitializeParams {
            client_info: ClientInfo {
                name: "codex-desktop".to_string(),
                title: "Codex Desktop".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        };

        // Send initialize request
        let _response: JsonValue = self.send_request("initialize", params).await?;

        // Send initialized notification
        self.send_notification("initialized", serde_json::json!({})).await?;

        tracing::info!("App server initialized");
        Ok(())
    }

    /// Find the codex binary in PATH or common locations
    fn find_codex_binary() -> Result<std::path::PathBuf> {
        // Try to find in PATH
        if let Ok(path) = which::which("codex") {
            return Ok(path);
        }

        // Try common installation locations
        let home = dirs::home_dir().ok_or_else(|| Error::Other("Cannot find home directory".to_string()))?;

        let common_paths = [
            home.join(".cargo/bin/codex"),
            home.join(".local/bin/codex"),
            std::path::PathBuf::from("/usr/local/bin/codex"),
            std::path::PathBuf::from("/opt/homebrew/bin/codex"),
        ];

        for path in &common_paths {
            if path.exists() {
                return Ok(path.clone());
            }
        }

        Err(Error::AppServer(
            "Codex CLI not found. Please install it first.".to_string(),
        ))
    }

    /// Handle an incoming JSON-RPC message
    async fn handle_message(
        line: &str,
        pending_requests: &Arc<Mutex<HashMap<u64, oneshot::Sender<Result<JsonValue>>>>>,
        app_handle: &AppHandle,
    ) {
        let message: JsonRpcMessage = match serde_json::from_str(line) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Failed to parse JSON-RPC message: {} - {}", e, line);
                return;
            }
        };

        // Determine message type based on fields present
        match (message.id, message.method.as_ref(), message.result.as_ref(), message.error.as_ref()) {
            // Response to our request (has id, has result or error, no method)
            (Some(id), None, _, _) => {
                let mut pending = pending_requests.lock().await;
                if let Some(sender) = pending.remove(&id) {
                    let result = if let Some(error) = message.error {
                        Err(Error::AppServer(format!(
                            "JSON-RPC error {}: {}",
                            error.code, error.message
                        )))
                    } else {
                        Ok(message.result.unwrap_or(JsonValue::Null))
                    };
                    let _ = sender.send(result);
                }
            }
            // Server-initiated request (has id AND method) - e.g., approval requests
            (Some(id), Some(method), _, _) => {
                let event_name = method.replace('/', "-");
                // Include request ID in params so client can respond
                let mut params = message.params.unwrap_or(JsonValue::Object(serde_json::Map::new()));
                if let JsonValue::Object(ref mut map) = params {
                    map.insert("_requestId".to_string(), JsonValue::Number(id.into()));
                }

                tracing::debug!("Emitting server request: {} with params: {:?}", event_name, params);

                if let Err(e) = app_handle.emit(&event_name, params) {
                    tracing::warn!("Failed to emit server request {}: {}", event_name, e);
                }
            }
            // Notification (has method, no id)
            (None, Some(method), _, _) => {
                let event_name = method.replace('/', "-");
                let params = message.params.unwrap_or(JsonValue::Null);

                tracing::debug!("Emitting event: {} with params: {:?}", event_name, params);

                if let Err(e) = app_handle.emit(&event_name, params) {
                    tracing::warn!("Failed to emit event {}: {}", event_name, e);
                }
            }
            _ => {
                tracing::warn!("Unknown message type: {:?}", message);
            }
        }
    }

    /// Send a JSON-RPC request and wait for response
    pub async fn send_request<T, R>(&mut self, method: &str, params: T) -> Result<R>
    where
        T: Serialize,
        R: DeserializeOwned,
    {
        let id = self.request_counter.fetch_add(1, Ordering::SeqCst);

        let request = JsonRpcRequest {
            id,
            method: method.to_string(),
            params,
        };

        let mut json = serde_json::to_string(&request)?;
        json.push('\n');

        // Register pending request
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending_requests.lock().await;
            pending.insert(id, tx);
        }

        // Send request
        self.stdin
            .write_all(json.as_bytes())
            .await
            .map_err(|e| Error::AppServer(format!("Failed to write to stdin: {}", e)))?;

        self.stdin
            .flush()
            .await
            .map_err(|e| Error::AppServer(format!("Failed to flush stdin: {}", e)))?;

        // Wait for response with timeout
        let result = tokio::time::timeout(std::time::Duration::from_secs(30), rx)
            .await
            .map_err(|_| Error::AppServer("Request timeout".to_string()))?
            .map_err(|_| Error::AppServer("Response channel closed".to_string()))??;

        serde_json::from_value(result).map_err(|e| Error::Json(e))
    }

    /// Send a JSON-RPC response to a server-initiated request
    pub async fn send_response<T: Serialize>(&mut self, request_id: u64, result: T) -> Result<()> {
        #[derive(Serialize)]
        struct JsonRpcResponseMsg<T> {
            id: u64,
            result: T,
        }

        let response = JsonRpcResponseMsg {
            id: request_id,
            result,
        };

        let mut json = serde_json::to_string(&response)?;
        json.push('\n');

        self.stdin
            .write_all(json.as_bytes())
            .await
            .map_err(|e| Error::AppServer(format!("Failed to write to stdin: {}", e)))?;

        self.stdin
            .flush()
            .await
            .map_err(|e| Error::AppServer(format!("Failed to flush stdin: {}", e)))?;

        Ok(())
    }

    /// Send a JSON-RPC notification (no response expected)
    pub async fn send_notification<T: Serialize>(&mut self, method: &str, params: T) -> Result<()> {
        #[derive(Serialize)]
        struct JsonRpcNotification<T> {
            method: String,
            params: T,
        }

        let notification = JsonRpcNotification {
            method: method.to_string(),
            params,
        };

        let mut json = serde_json::to_string(&notification)?;
        json.push('\n');

        self.stdin
            .write_all(json.as_bytes())
            .await
            .map_err(|e| Error::AppServer(format!("Failed to write to stdin: {}", e)))?;

        self.stdin
            .flush()
            .await
            .map_err(|e| Error::AppServer(format!("Failed to flush stdin: {}", e)))?;

        Ok(())
    }

    /// Check if the process is still running
    pub fn is_running(&mut self) -> bool {
        match self.child.try_wait() {
            Ok(None) => true,  // Still running
            Ok(Some(_)) => false,  // Exited
            Err(_) => false,
        }
    }

    /// Gracefully shutdown the app-server
    pub async fn shutdown(&mut self) -> Result<()> {
        // Signal the reader task to stop
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }

        // Try graceful shutdown first
        // The app-server should exit when stdin is closed
        drop(self.stdin.shutdown().await);

        // Wait briefly for graceful exit
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_secs(2)) => {
                tracing::warn!("App server did not exit gracefully, killing...");
                self.child.kill().await.ok();
            }
            status = self.child.wait() => {
                tracing::info!("App server exited with status: {:?}", status);
            }
        }

        Ok(())
    }
}

impl Drop for AppServerProcess {
    fn drop(&mut self) {
        // Attempt to kill the process if it's still running
        // Note: This is synchronous, so we can't await here
        // The kill_on_drop(true) should handle this
    }
}
