//! Database module for local storage
//!
//! Uses SQLite to store project metadata, session extensions (tags, favorites),
//! snapshots, and command allowlists.

mod models;

pub use models::*;

use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

use crate::Result;

/// Database wrapper with thread-safe connection
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Create a new database connection and initialize schema
    pub fn new(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Enable foreign keys
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        // Initialize schema
        Self::init_schema(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Initialize the database schema
    fn init_schema(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            -- Projects table
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                display_name TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                last_opened_at INTEGER,
                settings_json TEXT
            );

            -- Session metadata extensions
            CREATE TABLE IF NOT EXISTS session_metadata (
                session_id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                title TEXT,
                tags TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                last_accessed_at INTEGER,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );

            -- Snapshots for revert functionality
            CREATE TABLE IF NOT EXISTS snapshots (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                snapshot_type TEXT NOT NULL,
                metadata_json TEXT
            );

            -- Command allowlist per project
            CREATE TABLE IF NOT EXISTS command_allowlist (
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                command_pattern TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                PRIMARY KEY (project_id, command_pattern)
            );

            -- Indexes for common queries
            CREATE INDEX IF NOT EXISTS idx_session_metadata_project
                ON session_metadata(project_id);
            CREATE INDEX IF NOT EXISTS idx_session_metadata_last_accessed
                ON session_metadata(last_accessed_at DESC);
            CREATE INDEX IF NOT EXISTS idx_snapshots_session
                ON snapshots(session_id);
            "#,
        )?;

        Ok(())
    }

    // ==================== Project Operations ====================

    /// Insert a new project
    pub fn insert_project(&self, project: &Project) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO projects (id, path, display_name, created_at, last_opened_at, settings_json)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
            params![
                project.id,
                project.path,
                project.display_name,
                project.created_at,
                project.last_opened_at,
                project.settings_json,
            ],
        )?;
        Ok(())
    }

    /// Get all projects
    pub fn get_all_projects(&self) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT id, path, display_name, created_at, last_opened_at, settings_json
               FROM projects ORDER BY last_opened_at DESC NULLS LAST"#,
        )?;

        let projects = stmt
            .query_map([], |row| {
                Ok(Project {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    display_name: row.get(2)?,
                    created_at: row.get(3)?,
                    last_opened_at: row.get(4)?,
                    settings_json: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(projects)
    }

    /// Get a project by ID
    pub fn get_project(&self, id: &str) -> Result<Option<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT id, path, display_name, created_at, last_opened_at, settings_json
               FROM projects WHERE id = ?1"#,
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Project {
                id: row.get(0)?,
                path: row.get(1)?,
                display_name: row.get(2)?,
                created_at: row.get(3)?,
                last_opened_at: row.get(4)?,
                settings_json: row.get(5)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Update project's last opened time
    pub fn update_project_last_opened(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"UPDATE projects SET last_opened_at = strftime('%s', 'now') WHERE id = ?1"#,
            params![id],
        )?;
        Ok(())
    }

    /// Delete a project
    pub fn delete_project(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ==================== Session Metadata Operations ====================

    /// Upsert session metadata
    pub fn upsert_session_metadata(&self, metadata: &SessionMetadata) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO session_metadata
               (session_id, project_id, title, tags, is_favorite, is_archived, last_accessed_at, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
               ON CONFLICT(session_id) DO UPDATE SET
                   title = excluded.title,
                   tags = excluded.tags,
                   is_favorite = excluded.is_favorite,
                   is_archived = excluded.is_archived,
                   last_accessed_at = excluded.last_accessed_at"#,
            params![
                metadata.session_id,
                metadata.project_id,
                metadata.title,
                metadata.tags,
                metadata.is_favorite,
                metadata.is_archived,
                metadata.last_accessed_at,
                metadata.created_at,
            ],
        )?;
        Ok(())
    }

    /// Get sessions for a project
    pub fn get_sessions_for_project(&self, project_id: &str) -> Result<Vec<SessionMetadata>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT session_id, project_id, title, tags, is_favorite, is_archived,
                      last_accessed_at, created_at
               FROM session_metadata
               WHERE project_id = ?1 AND is_archived = 0
               ORDER BY last_accessed_at DESC NULLS LAST"#,
        )?;

        let sessions = stmt
            .query_map(params![project_id], |row| {
                Ok(SessionMetadata {
                    session_id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    tags: row.get(3)?,
                    is_favorite: row.get(4)?,
                    is_archived: row.get(5)?,
                    last_accessed_at: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(sessions)
    }

    /// Delete session metadata
    pub fn delete_session_metadata(&self, session_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM session_metadata WHERE session_id = ?1",
            params![session_id],
        )?;
        Ok(())
    }

    // ==================== Snapshot Operations ====================

    /// Insert a snapshot
    pub fn insert_snapshot(&self, snapshot: &Snapshot) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO snapshots (id, session_id, created_at, snapshot_type, metadata_json)
               VALUES (?1, ?2, ?3, ?4, ?5)"#,
            params![
                snapshot.id,
                snapshot.session_id,
                snapshot.created_at,
                snapshot.snapshot_type,
                snapshot.metadata_json,
            ],
        )?;
        Ok(())
    }

    /// Get snapshots for a session
    pub fn get_snapshots_for_session(&self, session_id: &str) -> Result<Vec<Snapshot>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT id, session_id, created_at, snapshot_type, metadata_json
               FROM snapshots WHERE session_id = ?1 ORDER BY created_at DESC"#,
        )?;

        let snapshots = stmt
            .query_map(params![session_id], |row| {
                Ok(Snapshot {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    created_at: row.get(2)?,
                    snapshot_type: row.get(3)?,
                    metadata_json: row.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(snapshots)
    }

    /// Get a snapshot by ID
    pub fn get_snapshot(&self, id: &str) -> Result<Option<Snapshot>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"SELECT id, session_id, created_at, snapshot_type, metadata_json
               FROM snapshots WHERE id = ?1"#,
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Snapshot {
                id: row.get(0)?,
                session_id: row.get(1)?,
                created_at: row.get(2)?,
                snapshot_type: row.get(3)?,
                metadata_json: row.get(4)?,
            }))
        } else {
            Ok(None)
        }
    }

    // ==================== Command Allowlist Operations ====================

    /// Add command to allowlist
    pub fn add_to_allowlist(&self, project_id: &str, command_pattern: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT OR IGNORE INTO command_allowlist (project_id, command_pattern)
               VALUES (?1, ?2)"#,
            params![project_id, command_pattern],
        )?;
        Ok(())
    }

    /// Get allowlist for a project
    pub fn get_allowlist(&self, project_id: &str) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT command_pattern FROM command_allowlist WHERE project_id = ?1",
        )?;

        let patterns = stmt
            .query_map(params![project_id], |row| row.get(0))?
            .collect::<std::result::Result<Vec<String>, _>>()?;

        Ok(patterns)
    }

    /// Remove command from allowlist
    pub fn remove_from_allowlist(&self, project_id: &str, command_pattern: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM command_allowlist WHERE project_id = ?1 AND command_pattern = ?2",
            params![project_id, command_pattern],
        )?;
        Ok(())
    }
}
