//! Codex CLI configuration parser
//!
//! Parses ~/.codex/config.toml and extracts project list and settings.

use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// Codex CLI configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CodexConfig {
    /// Current model
    #[serde(default)]
    pub model: Option<String>,

    /// Model reasoning effort
    #[serde(default)]
    pub model_reasoning_effort: Option<String>,

    /// Projects map (path -> project settings)
    #[serde(default)]
    pub projects: HashMap<String, CodexProject>,

    /// MCP servers configuration
    #[serde(default)]
    pub mcp_servers: HashMap<String, toml::Value>,
}

/// Codex project configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexProject {
    /// Trust level: "trusted", "sandbox", etc.
    #[serde(default)]
    pub trust_level: Option<String>,

    /// Project-specific model override
    #[serde(default)]
    pub model: Option<String>,

    /// Custom instructions for the project
    #[serde(default)]
    pub instructions: Option<String>,
}

/// Read Codex CLI configuration from ~/.codex/config.toml
pub fn read_config() -> Result<CodexConfig> {
    let codex_dir = super::get_codex_dir();
    let config_path = codex_dir.join("config.toml");

    if !config_path.exists() {
        tracing::warn!("Codex config not found at {:?}", config_path);
        return Ok(CodexConfig::default());
    }

    read_config_from_path(&config_path)
}

/// Read configuration from a specific path
pub fn read_config_from_path(path: &Path) -> Result<CodexConfig> {
    let content = std::fs::read_to_string(path).map_err(|e| {
        Error::Other(format!("Failed to read Codex config: {}", e))
    })?;

    let config: CodexConfig = toml::from_str(&content).map_err(|e| {
        Error::Other(format!("Failed to parse Codex config: {}", e))
    })?;

    tracing::debug!(
        "Loaded Codex config with {} projects",
        config.projects.len()
    );

    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_config() {
        let toml_content = r#"
model = "gpt-5.2-codex"
model_reasoning_effort = "medium"

[projects."/Users/test/project1"]
trust_level = "trusted"

[projects."/Users/test/project2"]
trust_level = "sandbox"
model = "gpt-4o"
"#;

        let config: CodexConfig = toml::from_str(toml_content).unwrap();
        assert_eq!(config.model, Some("gpt-5.2-codex".to_string()));
        assert_eq!(config.projects.len(), 2);
        assert_eq!(
            config.projects["/Users/test/project1"].trust_level,
            Some("trusted".to_string())
        );
    }
}
