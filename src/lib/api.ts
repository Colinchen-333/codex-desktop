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

export interface ThreadSummary {
  id: string
  preview: string
  modelProvider: string
  createdAt: number
  cwd: string
  cliVersion: string
  source: string
  gitInfo?: ThreadGitInfo
}

export interface ThreadListResponse {
  data: ThreadSummary[]
  nextCursor: string | null
}

export interface ThreadInfo {
  id: string
  cwd: string
  model?: string
  modelProvider?: string
  preview?: string
  createdAt?: number
  cliVersion?: string
  approvalPolicy?: string
  sandboxPolicy?: SandboxPolicy
  reasoningEffort?: string
  reasoningSummary?: string
  gitInfo?: ThreadGitInfo
}

// Sandbox policy (tagged union from API response)
export type SandboxPolicy =
  | { type: 'readOnly' }
  | {
      type: 'workspaceWrite'
      writableRoots?: string[]
      networkAccess?: boolean
      excludeTmpdirEnvVar?: boolean
      excludeSlashTmp?: boolean
    }
  | { type: 'dangerFullAccess' }
  | { type: 'externalSandbox'; networkAccess?: string }

export interface ThreadStartResponse {
  thread: ThreadInfo
  model: string
  modelProvider: string
  cwd: string
  approvalPolicy: string
  sandbox: SandboxPolicy
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

export interface RateLimitWindow {
  usedPercent: number
  windowDurationMins?: number | null
  resetsAt?: number | null
}

export interface CreditsSnapshot {
  hasCredits: boolean
  unlimited: boolean
  balance?: string | null
}

export interface RateLimitSnapshot {
  primary?: RateLimitWindow | null
  secondary?: RateLimitWindow | null
  credits?: CreditsSnapshot | null
  planType?: string | null
}

export interface AccountRateLimitsResponse {
  rateLimits: RateLimitSnapshot
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

export interface SkillMetadata {
  name: string
  description: string
  shortDescription?: string | null
  path: string
  scope: string
}

// Skill input for sending with messages
export interface SkillInput {
  name: string
  path: string
}

export interface SkillsListEntry {
  cwd: string
  skills: SkillMetadata[]
  errors: Array<{ path: string; message: string }>
}

export interface SkillsListResponse {
  data: SkillsListEntry[]
}

export interface McpServerStatus {
  name: string
  tools: Record<string, unknown>
  resources: unknown[]
  resourceTemplates: unknown[]
  authStatus: unknown
}

export interface McpServerStatusResponse {
  data: McpServerStatus[]
  nextCursor: string | null
}

// Review target types matching CLI presets
export type ReviewTarget =
  | { type: 'uncommittedChanges' }
  | { type: 'baseBranch'; branch: string }
  | { type: 'commit'; sha: string; title?: string }
  | { type: 'custom'; instructions: string }

export interface ReviewStartResponse {
  turn: TurnInfo
  reviewThreadId: string
}

export interface GitDiffResponse {
  isGitRepo: boolean
  diff: string
}

export interface FileEntry {
  path: string
  name: string
  isDir: boolean
}

export interface GitBranch {
  name: string
  isCurrent: boolean
}

export interface GitCommit {
  sha: string
  shortSha: string
  title: string
  author: string
  date: string
}

// ==================== Config Types ====================

export interface ConfigLayer {
  name: string
  path?: string
  config: Record<string, unknown>
}

export interface ConfigOrigins {
  [key: string]: {
    layer: string
    path?: string
  }
}

export interface ConfigReadResponse {
  config: Record<string, unknown>
  origins: ConfigOrigins
  layers?: ConfigLayer[]
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
  getGitDiff: (path: string) => invoke<GitDiffResponse>('get_project_git_diff', { path }),
  listFiles: (path: string, query?: string, limit?: number) =>
    invoke<FileEntry[]>('list_project_files', { path, query, limit }),
  getGitBranches: (path: string) => invoke<GitBranch[]>('get_git_branches', { path }),
  getGitCommits: (path: string, limit?: number) =>
    invoke<GitCommit[]>('get_git_commits', { path, limit }),
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

  search: (query: string, tagsFilter?: string[], favoritesOnly?: boolean) =>
    invoke<SessionMetadata[]>('search_sessions', { query, tagsFilter, favoritesOnly }),
}

// ==================== Thread API ====================

export const threadApi = {
  list: (limit?: number, cursor?: string) =>
    invoke<ThreadListResponse>('list_threads', { limit, cursor }),

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
      // Only send non-empty values
      model: model || undefined,
      sandbox: sandbox || undefined,
      approvalPolicy: approvalPolicy || undefined,
    }),

  resume: (threadId: string) =>
    invoke<ThreadResumeResponse>('resume_thread', { threadId }),

  sendMessage: (
    threadId: string,
    text: string,
    images?: string[],
    skills?: SkillInput[],
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
      skills,
      ...options,
    }),

  interrupt: (threadId: string) =>
    invoke<void>('interrupt_turn', { threadId }),

  respondToApproval: (
    threadId: string,
    itemId: string,
    decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline' | 'cancel',
    requestId: number,
    execpolicyAmendment?: { command: string[] } | null
  ) =>
    invoke<void>('respond_to_approval', {
      threadId,
      itemId,
      decision,
      requestId,
      execpolicyAmendment,
    }),
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

  getAccountRateLimits: () => invoke<AccountRateLimitsResponse>('get_account_rate_limits'),

  startLogin: (loginType: 'chatgpt' | 'apiKey' = 'chatgpt', apiKey?: string) =>
    invoke<LoginResponse>('start_login', { loginType, apiKey }),

  logout: () => invoke<void>('logout'),

  getModels: () => invoke<ModelListResponse>('get_models'),

  listSkills: (cwds: string[], forceReload = false) =>
    invoke<SkillsListResponse>('list_skills', { cwds, forceReload }),

  listMcpServers: () => invoke<McpServerStatusResponse>('list_mcp_servers'),

  startReview: (threadId: string, target?: ReviewTarget) =>
    invoke<ReviewStartResponse>('start_review', { threadId, target }),

  // Run a local shell command (like CLI's ! prefix)
  runUserShellCommand: (threadId: string, command: string) =>
    invoke<TurnStartResponse>('run_user_shell_command', { threadId, command }),
}

// ==================== Config API ====================

export const configApi = {
  read: (includeLayers?: boolean) =>
    invoke<ConfigReadResponse>('read_config', { includeLayers }),

  write: (key: string, value: unknown) =>
    invoke<void>('write_config', { key, value }),
}

// ==================== Allowlist API ====================

export const allowlistApi = {
  get: (projectId: string) =>
    invoke<string[]>('get_allowlist', { projectId }),

  add: (projectId: string, commandPattern: string) =>
    invoke<void>('add_to_allowlist', { projectId, commandPattern }),

  remove: (projectId: string, commandPattern: string) =>
    invoke<void>('remove_from_allowlist', { projectId, commandPattern }),
}
