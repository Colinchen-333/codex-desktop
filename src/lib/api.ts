import { invoke } from '@tauri-apps/api/core'

// ==================== Types ====================

export interface Project {
  id: string
  path: string
  displayName: string | null
  createdAt: number
  lastOpenedAt: number | null
  settingsJson: string | null
}

export interface SessionMetadata {
  sessionId: string
  projectId: string
  title: string | null
  tags: string | null
  isFavorite: boolean
  isArchived: boolean
  lastAccessedAt: number | null
  createdAt: number
}

export interface GitInfo {
  isGitRepo: boolean
  branch: string | null
  isDirty: boolean | null
  lastCommit: string | null
}

export interface ThreadInfo {
  id: string
  cwd: string
  model: string | null
}

export interface ThreadStartResponse {
  thread: ThreadInfo
}

export interface ThreadResumeResponse {
  thread: ThreadInfo
  items: unknown[]
}

export interface TurnStartResponse {
  turnId: string
}

export interface ServerStatus {
  isRunning: boolean
  version: string | null
}

export interface AccountInfo {
  loggedIn: boolean
  email: string | null
  planType: string | null
}

export interface Snapshot {
  id: string
  sessionId: string
  createdAt: number
  snapshotType: string
  metadataJson: string | null
}

// ==================== Project API ====================

export const projectApi = {
  list: () => invoke<Project[]>('list_projects'),

  add: (path: string) => invoke<Project>('add_project', { path }),

  remove: (id: string) => invoke<void>('remove_project', { id }),

  update: (id: string, displayName?: string, settings?: unknown) =>
    invoke<Project>('update_project', { id, displayName, settings }),

  getGitInfo: (path: string) => invoke<GitInfo>('get_project_git_info', { path }),
}

// ==================== Session API ====================

export const sessionApi = {
  list: (projectId: string) =>
    invoke<SessionMetadata[]>('list_sessions', { projectId }),

  get: (sessionId: string) =>
    invoke<SessionMetadata | null>('get_session', { sessionId }),

  update: (
    sessionId: string,
    title?: string,
    tags?: string[],
    isFavorite?: boolean,
    isArchived?: boolean
  ) =>
    invoke<SessionMetadata>('update_session_metadata', {
      sessionId,
      title,
      tags,
      isFavorite,
      isArchived,
    }),

  delete: (sessionId: string) =>
    invoke<void>('delete_session', { sessionId }),
}

// ==================== Thread API ====================

export const threadApi = {
  start: (
    projectId: string,
    cwd: string,
    model?: string,
    sandboxMode?: string,
    askForApproval?: string
  ) =>
    invoke<ThreadStartResponse>('start_thread', {
      projectId,
      cwd,
      model,
      sandboxMode,
      askForApproval,
    }),

  resume: (threadId: string) =>
    invoke<ThreadResumeResponse>('resume_thread', { threadId }),

  sendMessage: (threadId: string, text: string, images?: string[]) =>
    invoke<TurnStartResponse>('send_message', { threadId, text, images }),

  interrupt: (threadId: string) =>
    invoke<void>('interrupt_turn', { threadId }),

  respondToApproval: (
    threadId: string,
    itemId: string,
    decision: 'accept' | 'acceptForSession' | 'decline'
  ) =>
    invoke<void>('respond_to_approval', { threadId, itemId, decision }),
}

// ==================== Snapshot API ====================

export const snapshotApi = {
  create: (sessionId: string, projectPath: string) =>
    invoke<Snapshot>('create_snapshot', { sessionId, projectPath }),

  revert: (snapshotId: string, projectPath: string) =>
    invoke<void>('revert_to_snapshot', { snapshotId, projectPath }),

  list: (sessionId: string) =>
    invoke<Snapshot[]>('list_snapshots', { sessionId }),
}

// ==================== App Server API ====================

export const serverApi = {
  getStatus: () => invoke<ServerStatus>('get_server_status'),

  restart: () => invoke<void>('restart_server'),

  getAccountInfo: () => invoke<AccountInfo>('get_account_info'),
}
