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

export interface ThreadGitInfo {
  sha?: string
  branch?: string
  originUrl?: string
}

export interface ThreadInfo {
  id: string
  cwd: string
  model?: string
  modelProvider?: string
  preview?: string
  createdAt?: number
  cliVersion?: string
  gitInfo?: ThreadGitInfo
}

export interface ThreadStartResponse {
  thread: ThreadInfo
  model: string
  modelProvider: string
  cwd: string
  approvalPolicy: string
  sandbox: string
  reasoningEffort?: string
}

export interface ThreadResumeResponse {
  thread: ThreadInfo
  items: unknown[]
}

export interface TurnInfo {
  id: string
  status: string
  items: unknown[]
  error: unknown | null
}

export interface TurnStartResponse {
  turn: TurnInfo
}

export interface ServerStatus {
  isRunning: boolean
  version: string | null
}

export interface AccountDetails {
  type: string
  email: string | null
  planType: string | null
}

export interface AccountInfo {
  account: AccountDetails | null
  requiresOpenaiAuth: boolean
}

export interface LoginResponse {
  loginType: string
  loginId: string | null
  authUrl: string | null
}

export interface ReasoningEffortOption {
  reasoningEffort: string
  description: string
}

export interface Model {
  id: string
  model: string
  displayName: string
  description: string
  supportedReasoningEfforts: ReasoningEffortOption[]
  defaultReasoningEffort: string
  isDefault: boolean
}

export interface ModelListResponse {
  data: Model[]
  nextCursor: string | null
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
    sandbox?: string,
    approvalPolicy?: string
  ) =>
    invoke<ThreadStartResponse>('start_thread', {
      projectId,
      cwd,
      model,
      sandbox,
      approvalPolicy,
    }),

  resume: (threadId: string) =>
    invoke<ThreadResumeResponse>('resume_thread', { threadId }),

  sendMessage: (
    threadId: string,
    text: string,
    images?: string[],
    options?: {
      effort?: string
      summary?: string
      model?: string
      approvalPolicy?: string
      sandboxPolicy?: string
    }
  ) =>
    invoke<TurnStartResponse>('send_message', {
      threadId,
      text,
      images,
      ...options,
    }),

  interrupt: (threadId: string) =>
    invoke<void>('interrupt_turn', { threadId }),

  respondToApproval: (
    threadId: string,
    itemId: string,
    decision: 'accept' | 'acceptForSession' | 'decline',
    requestId: number
  ) =>
    invoke<void>('respond_to_approval', { threadId, itemId, decision, requestId }),
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

  startLogin: (loginType: 'chatgpt' | 'apiKey' = 'chatgpt') =>
    invoke<LoginResponse>('start_login', { loginType }),

  logout: () => invoke<void>('logout'),

  getModels: () => invoke<ModelListResponse>('get_models'),
}
