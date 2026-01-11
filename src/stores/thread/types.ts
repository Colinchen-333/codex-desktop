/**
 * Thread Store Type Definitions
 *
 * This module contains all type definitions for the thread store,
 * including thread items, states, and event types.
 */

import type {
  ThreadInfo,
  Snapshot,
  SkillInput,
} from '../../lib/api'
import type {
  CommandApprovalRequestedEvent,
  FileChangeApprovalRequestedEvent,
  ItemStartedEvent,
  ItemCompletedEvent,
  AgentMessageDeltaEvent,
  TurnCompletedEvent,
  TurnStartedEvent,
  TurnDiffUpdatedEvent,
  TurnPlanUpdatedEvent,
  ThreadCompactedEvent,
  ThreadStartedEvent,
  CommandExecutionOutputDeltaEvent,
  FileChangeOutputDeltaEvent,
  ReasoningSummaryTextDeltaEvent,
  ReasoningSummaryPartAddedEvent,
  ReasoningTextDeltaEvent,
  McpToolCallProgressEvent,
  TokenUsageEvent,
  StreamErrorEvent,
  RateLimitExceededEvent,
} from '../../lib/events'

// Re-export types that are used externally
export type { ThreadInfo, Snapshot, SkillInput }

// ==================== Message Queue Constants ====================

export const MAX_MESSAGE_RETRY_ATTEMPTS = 3 // Maximum retry attempts for queued messages

// ==================== Thread Item Types ====================

export type ThreadItemType =
  | 'userMessage'
  | 'agentMessage'
  | 'commandExecution'
  | 'fileChange'
  | 'reasoning'
  | 'mcpTool'
  | 'webSearch'
  | 'review'
  | 'info'
  | 'error'
  | 'plan'

// ==================== Editable Message Types ====================

/**
 * Edit state for user messages
 * Tracks whether a message is being edited and its edit history
 */
export interface EditableMessage {
  /** Whether the message is currently in edit mode */
  isEditing?: boolean
  /** The text being edited (draft state) */
  editedText?: string
  /** Original text before editing (for cancel/revert) */
  originalText?: string
  /** Timestamp when the message was last edited */
  editedAt?: number
}

export interface ThreadItem {
  id: string
  type: ThreadItemType
  status: 'pending' | 'inProgress' | 'completed' | 'failed'
  content: unknown
  createdAt: number
}

export interface UserMessageItem extends ThreadItem {
  type: 'userMessage'
  content: {
    text: string
    images?: string[]
  }
  /** Edit state for the message */
  editState?: EditableMessage
}

export interface AgentMessageItem extends ThreadItem {
  type: 'agentMessage'
  content: {
    text: string
    isStreaming: boolean
  }
}

export interface CommandExecutionItem extends ThreadItem {
  type: 'commandExecution'
  content: {
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
}

export interface FileChangeItem extends ThreadItem {
  type: 'fileChange'
  content: {
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
}

export interface ReasoningItem extends ThreadItem {
  type: 'reasoning'
  content: {
    summary: string[]
    fullContent?: string[]
    isStreaming: boolean
  }
}

export interface McpToolItem extends ThreadItem {
  type: 'mcpTool'
  content: {
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
}

export interface WebSearchItem extends ThreadItem {
  type: 'webSearch'
  content: {
    query: string
    results?: Array<{
      title: string
      url: string
      snippet: string
    }>
    isSearching: boolean
  }
}

export interface ReviewItem extends ThreadItem {
  type: 'review'
  content: {
    phase: 'started' | 'completed'
    text: string
  }
}

export interface InfoItem extends ThreadItem {
  type: 'info'
  content: {
    title: string
    details?: string
  }
}

export interface ErrorItem extends ThreadItem {
  type: 'error'
  content: {
    message: string
    errorType?: string
    httpStatusCode?: number
    willRetry?: boolean
  }
}

export interface PlanStep {
  step: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
}

export interface PlanItem extends ThreadItem {
  type: 'plan'
  content: {
    explanation?: string
    steps: PlanStep[]
    isActive: boolean
  }
}

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

// ==================== Turn Status ====================

export type TurnStatus = 'idle' | 'running' | 'completed' | 'failed' | 'interrupted'

// ==================== Pending Approval ====================

export interface PendingApproval {
  itemId: string
  threadId: string
  type: 'command' | 'fileChange'
  data: CommandApprovalRequestedEvent | FileChangeApprovalRequestedEvent
  requestId: number
  createdAt: number
}

// ==================== Token Usage & Turn Timing ====================

export interface TokenUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  modelContextWindow: number | null
}

export interface TurnTiming {
  startedAt: number | null
  completedAt: number | null
}

// ==================== Session Overrides & Queued Messages ====================

export interface SessionOverrides {
  model?: string
  approvalPolicy?: string
  sandboxPolicy?: string
}

export interface QueuedMessage {
  id: string
  text: string
  images?: string[]
  skills?: SkillInput[]
  queuedAt: number
  retryCount?: number // Number of retry attempts made
  lastError?: string // Last error message from failed attempt
}

// ==================== Single Thread State ====================

export interface SingleThreadState {
  thread: ThreadInfo
  items: Record<string, AnyThreadItem>
  itemOrder: string[]
  turnStatus: TurnStatus
  currentTurnId: string | null
  pendingApprovals: PendingApproval[]
  tokenUsage: TokenUsage
  turnTiming: TurnTiming
  sessionOverrides: SessionOverrides
  queuedMessages: QueuedMessage[]
  error: string | null
}

// ==================== Multi Thread Store State ====================

export interface ThreadState {
  // Multi-thread state
  threads: Record<string, SingleThreadState>
  focusedThreadId: string | null
  maxSessions: number

  // Global state
  snapshots: Snapshot[]
  isLoading: boolean
  globalError: string | null

  // Backward-compatible getters (computed from focusedThreadId)
  activeThread: ThreadInfo | null
  items: Record<string, AnyThreadItem>
  itemOrder: string[]
  turnStatus: TurnStatus
  currentTurnId: string | null
  pendingApprovals: PendingApproval[]
  tokenUsage: TokenUsage
  turnTiming: TurnTiming
  sessionOverrides: SessionOverrides
  queuedMessages: QueuedMessage[]
  error: string | null

  // Actions
  startThread: (
    projectId: string,
    cwd: string,
    model?: string,
    sandboxMode?: string,
    approvalPolicy?: string
  ) => Promise<void>
  resumeThread: (threadId: string) => Promise<void>
  sendMessage: (
    text: string,
    images?: string[],
    skills?: SkillInput[],
    threadId?: string
  ) => Promise<void>
  interrupt: () => Promise<void>
  respondToApproval: (
    itemId: string,
    decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline' | 'cancel',
    options?: { snapshotId?: string; execpolicyAmendment?: { command: string[] } | null }
  ) => Promise<void>
  clearThread: () => void
  addInfoItem: (title: string, details?: string) => void
  flushDeltaBuffer: (threadId?: string) => void
  setSessionOverride: (key: keyof SessionOverrides, value: string | undefined) => void
  clearSessionOverrides: () => void

  // Message edit/delete actions
  startEditMessage: (itemId: string, threadId?: string) => void
  updateEditText: (itemId: string, text: string, threadId?: string) => void
  saveEditMessage: (itemId: string, threadId?: string) => void
  cancelEditMessage: (itemId: string, threadId?: string) => void
  deleteMessage: (itemId: string, threadId?: string) => void

  // Undo helper actions
  addItemBack: (itemId: string, itemData: AnyThreadItem, threadId: string) => void
  restoreMessageContent: (itemId: string, previousItemData: AnyThreadItem, threadId: string) => void
  restoreThreadState: (threadStateData: { items: Record<string, unknown>; itemOrder: string[] }, threadId: string) => void
  restoreItemOrder: (itemOrder: string[], threadId: string) => void

  // Multi-session actions
  switchThread: (threadId: string) => void
  closeThread: (threadId: string) => void
  closeAllThreads: () => void
  getActiveThreadIds: () => string[]
  canAddSession: () => boolean

  // Event handlers
  handleThreadStarted: (event: ThreadStartedEvent) => void
  handleItemStarted: (event: ItemStartedEvent) => void
  handleItemCompleted: (event: ItemCompletedEvent) => void
  handleAgentMessageDelta: (event: AgentMessageDeltaEvent) => void
  handleCommandApprovalRequested: (event: CommandApprovalRequestedEvent) => void
  handleFileChangeApprovalRequested: (event: FileChangeApprovalRequestedEvent) => void
  handleTurnStarted: (event: TurnStartedEvent) => void
  handleTurnCompleted: (event: TurnCompletedEvent) => void
  handleTurnDiffUpdated: (event: TurnDiffUpdatedEvent) => void
  handleTurnPlanUpdated: (event: TurnPlanUpdatedEvent) => void
  handleThreadCompacted: (event: ThreadCompactedEvent) => void
  handleCommandExecutionOutputDelta: (event: CommandExecutionOutputDeltaEvent) => void
  handleFileChangeOutputDelta: (event: FileChangeOutputDeltaEvent) => void
  handleReasoningSummaryTextDelta: (event: ReasoningSummaryTextDeltaEvent) => void
  handleReasoningSummaryPartAdded: (event: ReasoningSummaryPartAddedEvent) => void
  handleReasoningTextDelta: (event: ReasoningTextDeltaEvent) => void
  handleMcpToolCallProgress: (event: McpToolCallProgressEvent) => void
  handleTokenUsage: (event: TokenUsageEvent) => void
  handleStreamError: (event: StreamErrorEvent) => void
  handleRateLimitExceeded: (event: RateLimitExceededEvent) => void
  handleServerDisconnected: () => void

  // Snapshot actions
  createSnapshot: (projectPath: string) => Promise<Snapshot>
  revertToSnapshot: (snapshotId: string, projectPath: string) => Promise<void>
  fetchSnapshots: () => Promise<void>
}

// ==================== Delta Buffer Types ====================

export interface DeltaBuffer {
  turnId: string | null
  operationSeq: number
  agentMessages: Map<string, string> // itemId -> accumulated text
  commandOutputs: Map<string, string> // itemId -> accumulated output
  fileChangeOutputs: Map<string, string> // itemId -> accumulated output
  reasoningSummaries: Map<string, { index: number; text: string }[]> // itemId -> summaries
  reasoningContents: Map<string, { index: number; text: string }[]> // itemId -> content
  mcpProgress: Map<string, string[]> // itemId -> accumulated progress messages
  _cachedSize: number // Cached byte size for performance optimization
}

// ==================== LRU Cache Types ====================

export interface LRUCacheNode<V> {
  value: V
  prev: string | null
  next: string | null
  lastAccess: number
}
