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

/// JSON-RPC request structure
#[derive(Debug, Serialize)]
struct JsonRpcRequest<T> {
    jsonrpc: &'static str,
    id: u64,
    method: String,
    params: T,
}

/// JSON-RPC response structure
#[derive(Debug, serde::Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
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

        Ok(Self {
            child,
            stdin,
            request_counter: AtomicU64::new(1),
            pending_requests,
            shutdown_tx: Some(shutdown_tx),
        })
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
        let response: JsonRpcResponse = match serde_json::from_str(line) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Failed to parse JSON-RPC message: {} - {}", e, line);
                return;
            }
        };

        // Check if this is a notification (no id) or a response
        if let Some(id) = response.id {
            // This is a response to a request
            let mut pending = pending_requests.lock().await;
            if let Some(sender) = pending.remove(&id) {
                let result = if let Some(error) = response.error {
                    Err(Error::AppServer(format!(
                        "JSON-RPC error {}: {}",
                        error.code, error.message
                    )))
                } else {
                    Ok(response.result.unwrap_or(JsonValue::Null))
                };
                let _ = sender.send(result);
            }
        } else if let Some(method) = response.method {
            // This is a notification - emit as Tauri event
            let event_name = method.replace('/', "-");
            let params = response.params.unwrap_or(JsonValue::Null);

            tracing::debug!("Emitting event: {} with params: {:?}", event_name, params);

            if let Err(e) = app_handle.emit(&event_name, params) {
                tracing::warn!("Failed to emit event {}: {}", event_name, e);
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
            jsonrpc: "2.0",
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

    /// Send a JSON-RPC notification (no response expected)
    pub async fn send_notification<T: Serialize>(&mut self, method: &str, params: T) -> Result<()> {
        #[derive(Serialize)]
        struct JsonRpcNotification<T> {
            jsonrpc: &'static str,
            method: String,
            params: T,
        }

        let notification = JsonRpcNotification {
            jsonrpc: "2.0",
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
