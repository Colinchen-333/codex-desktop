// ==================== Thread Item Content Types ====================
// Proper types for thread item content instead of using `unknown`

/**
 * Base interface for all thread item content
 */
export interface BaseThreadItemContent {
  [key: string]: unknown
}

/**
 * User message content
 */
export interface UserMessageContent {
  text: string
  images?: string[]
}

/**
 * Agent message content
 */
export interface AgentMessageContent {
  text: string
  isStreaming: boolean
}

/**
 * Command execution content
 */
export interface CommandExecutionContent {
  callId: string
  command: string | string[]
  cwd: string
  commandActions?: string[]
  output?: string
  stdout?: string
  stderr?: string
  exitCode?: number
  durationMs?: number
  needsApproval?: boolean
  approved?: boolean
  isRunning?: boolean
  reason?: string
  proposedExecpolicyAmendment?: { command: string[] } | null
}

/**
 * File change content
 */
export interface FileChangeContent {
  changes: Array<{
    path: string
    kind: 'add' | 'modify' | 'delete' | 'rename'
    diff: string
    oldPath?: string
  }>
  needsApproval: boolean
  approved?: boolean
  applied?: boolean
  snapshotId?: string
  output?: string
  reason?: string
}

/**
 * Reasoning content
 */
export interface ReasoningContent {
  summary: string[]
  fullContent?: string[]
  isStreaming: boolean
}

/**
 * MCP tool content
 */
export interface McpToolContent {
  callId: string
  server: string
  tool: string
  arguments: unknown
  result?: unknown
  error?: string
  durationMs?: number
  isRunning: boolean
  progress?: string[]
}

/**
 * Web search content
 */
export interface WebSearchContent {
  query: string
  results?: Array<{
    title: string
    url: string
    snippet: string
  }>
  isSearching: boolean
}

/**
 * Review content
 */
export interface ReviewContent {
  phase: 'started' | 'completed'
  text: string
}

/**
 * Info content
 */
export interface InfoContent {
  title: string
  details?: string
}

/**
 * Error content
 */
export interface ErrorContent {
  message: string
  errorType?: string
  httpStatusCode?: number
  willRetry?: boolean
}

/**
 * Plan content
 */
export interface PlanContent {
  explanation?: string
  steps: Array<{
    step: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  }>
  isActive: boolean
}

/**
 * Union type for all thread item content
 */
export type ThreadItemContent =
  | UserMessageContent
  | AgentMessageContent
  | CommandExecutionContent
  | FileChangeContent
  | ReasoningContent
  | McpToolContent
  | WebSearchContent
  | ReviewContent
  | InfoContent
  | ErrorContent
  | PlanContent

/**
 * Map of thread item types to their content types
 */
export interface ThreadItemContentMap {
  userMessage: UserMessageContent
  agentMessage: AgentMessageContent
  commandExecution: CommandExecutionContent
  fileChange: FileChangeContent
  reasoning: ReasoningContent
  mcpTool: McpToolContent
  webSearch: WebSearchContent
  review: ReviewContent
  info: InfoContent
  error: ErrorContent
  plan: PlanContent
}

/**
 * Generic content record for dynamic access
 */
export type ContentRecord = Record<string, unknown>

// ==================== Thread Item Types ====================

/**
 * Base interface for all thread items
 */
export interface BaseThreadItem {
  id: string
  type: string
  status?: string
  content?: ThreadItemContent
  createdAt?: number
}

/**
 * User message item
 */
export interface UserMessageItem extends BaseThreadItem {
  type: 'userMessage'
  content: UserMessageContent
}

/**
 * Agent message item
 */
export interface AgentMessageItem extends BaseThreadItem {
  type: 'agentMessage'
  content: AgentMessageContent
}

/**
 * Command execution item
 */
export interface CommandExecutionItem extends BaseThreadItem {
  type: 'commandExecution'
  content: CommandExecutionContent
}

/**
 * File change item
 */
export interface FileChangeItem extends BaseThreadItem {
  type: 'fileChange'
  content: FileChangeContent
}

/**
 * Reasoning item
 */
export interface ReasoningItem extends BaseThreadItem {
  type: 'reasoning'
  content: ReasoningContent
}

/**
 * MCP tool item
 */
export interface McpToolItem extends BaseThreadItem {
  type: 'mcpTool'
  content: McpToolContent
}

/**
 * Web search item
 */
export interface WebSearchItem extends BaseThreadItem {
  type: 'webSearch'
  content: WebSearchContent
}

/**
 * Review item
 */
export interface ReviewItem extends BaseThreadItem {
  type: 'review'
  content: ReviewContent
}

/**
 * Info item
 */
export interface InfoItem extends BaseThreadItem {
  type: 'info'
  content: InfoContent
}

/**
 * Error item
 */
export interface ErrorItem extends BaseThreadItem {
  type: 'error'
  content: ErrorContent
}

/**
 * Plan item
 */
export interface PlanItem extends BaseThreadItem {
  type: 'plan'
  content: PlanContent
}

/**
 * Union type for all thread items
 */
export type AnyThreadItem =
  | UserMessageItem
  | AgentMessageItem
  | CommandExecutionItem
  | FileChangeItem
  | ReasoningItem
  | McpToolItem
  | WebSearchItem
  | ReviewItem
  | InfoItem
  | ErrorItem
  | PlanItem

// ==================== Session Types ====================

/**
 * Session status for agent state tracking
 */
export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'interrupted'

/**
 * Metadata for a session (thread)
 * Corresponds to backend SessionMetadata structure
 */
export interface SessionMetadata {
  sessionId: string
  projectId: string
  title: string | null
  tags: string | null
  isFavorite: boolean
  isArchived: boolean
  /**
   * Last accessed timestamp in Unix seconds (from SQLite).
   * Use normalizeTimestampToMs() for JavaScript Date operations.
   */
  lastAccessedAt: number | null
  /**
   * Creation timestamp in Unix seconds (from SQLite).
   * Use normalizeTimestampToMs() for JavaScript Date operations.
   */
  createdAt: number
  // New fields for multi-agent management
  status: SessionStatus
  firstMessage: string | null
  tasksJson: string | null
}
