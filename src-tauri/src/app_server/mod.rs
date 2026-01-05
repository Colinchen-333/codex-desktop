//! App server process management
//!
//! This module handles spawning, monitoring, and communicating with the
//! Codex app-server subprocess via JSON-RPC 2.0 over stdio.

pub mod ipc_bridge;
mod process;

pub use ipc_bridge::IpcBridge;
pub use process::AppServerProcess;
