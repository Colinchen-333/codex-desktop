import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// ==================== Event Types ====================

export interface ThreadInfoPayload {
  id: string
  cwd: string
  model?: string | null
  modelProvider?: string | null
  preview?: string | null
  createdAt?: number | null
  cliVersion?: string | null
  gitInfo?: {
    sha?: string | null
    branch?: string | null
    originUrl?: string | null
  } | null
}

export interface TurnErrorPayload {
  message: string
  codexErrorInfo?: unknown
  additionalDetails?: string | null
}

export interface TurnInfoPayload {
  id: string
  status: string
  items?: unknown[]
  error?: TurnErrorPayload | null
}

export interface ThreadStartedEvent {
  thread: ThreadInfoPayload
}

export interface TurnStartedEvent {
  threadId: string
  turn: TurnInfoPayload
}

export interface TurnCompletedEvent {
  threadId: string
  turn: TurnInfoPayload
}

export interface TurnDiffUpdatedEvent {
  threadId: string
  turnId: string
  diff: string
}

export interface TurnPlanUpdatedEvent {
  threadId: string
  turnId: string
  explanation?: string | null
  plan: Array<{
    step: string
    status: string
  }>
}

export interface ThreadCompactedEvent {
  threadId: string
  turnId: string
}

// Item lifecycle events
export interface ThreadItemPayload {
  id: string
  type: string
  [key: string]: unknown
}

export interface ItemStartedEvent {
  item: ThreadItemPayload
  threadId: string
  turnId: string
}

export interface ItemCompletedEvent {
  item: ThreadItemPayload
  threadId: string
  turnId: string
}

// Agent message events
export interface AgentMessageDeltaEvent {
  itemId: string
  threadId: string
  turnId: string
  delta: string
}

// Reasoning events
export interface ReasoningSummaryTextDeltaEvent {
  itemId: string
  threadId: string
  turnId: string
  delta: string
  summaryIndex?: number
}

export interface ReasoningSummaryPartAddedEvent {
  itemId: string
  threadId: string
  turnId: string
  summaryIndex: number
}

export interface ReasoningTextDeltaEvent {
  itemId: string
  threadId: string
  turnId: string
  delta: string
  contentIndex?: number
}

// Command execution events
export interface CommandExecutionOutputDeltaEvent {
  itemId: string
  threadId: string
  turnId: string
  delta: string
}

// File change events
export interface FileChangeOutputDeltaEvent {
  itemId: string
  threadId: string
  turnId: string
  delta: string
}

// MCP tool events
export interface McpToolCallProgressEvent {
  itemId: string
  threadId: string
  turnId: string
  message: string
}

// Token usage event
export interface TokenUsageEvent {
  threadId: string
  turnId: string
  tokenUsage: {
    total: {
      totalTokens: number
      inputTokens: number
      cachedInputTokens: number
      outputTokens: number
      reasoningOutputTokens?: number
    }
    last: {
      totalTokens: number
      inputTokens: number
      cachedInputTokens: number
      outputTokens: number
      reasoningOutputTokens?: number
    }
    modelContextWindow?: number | null
  }
}

// Error events
export interface StreamErrorEvent {
  threadId: string
  turnId: string
  error: TurnErrorPayload
  willRetry: boolean
}

// Rate limit event
export interface RateLimitExceededEvent {
  threadId: string
  turnId: string
  retryAfterMs?: number
}

export interface CommandApprovalRequestedEvent {
  itemId: string
  threadId: string
  turnId: string
  reason?: string | null
  proposedExecpolicyAmendment?: { command: string[] } | null
  _requestId: number // JSON-RPC request ID for responding
}

export interface FileChangeApprovalRequestedEvent {
  itemId: string
  threadId: string
  turnId: string
  reason?: string | null
  grantRoot?: string | null
  _requestId: number // JSON-RPC request ID for responding
}

export type ServerDisconnectedEvent = Record<string, never>

// ==================== Event Handlers ====================

export type EventHandlers = {
  // Thread lifecycle
  onThreadStarted?: (event: ThreadStartedEvent) => void
  onTurnStarted?: (event: TurnStartedEvent) => void
  onTurnCompleted?: (event: TurnCompletedEvent) => void
  onTurnDiffUpdated?: (event: TurnDiffUpdatedEvent) => void
  onTurnPlanUpdated?: (event: TurnPlanUpdatedEvent) => void
  onThreadCompacted?: (event: ThreadCompactedEvent) => void

  // Item lifecycle
  onItemStarted?: (event: ItemStartedEvent) => void
  onItemCompleted?: (event: ItemCompletedEvent) => void

  // Agent message
  onAgentMessageDelta?: (event: AgentMessageDeltaEvent) => void

  // Reasoning
  onReasoningSummaryTextDelta?: (event: ReasoningSummaryTextDeltaEvent) => void
  onReasoningSummaryPartAdded?: (event: ReasoningSummaryPartAddedEvent) => void
  onReasoningTextDelta?: (event: ReasoningTextDeltaEvent) => void

  // Command execution
  onCommandExecutionOutputDelta?: (event: CommandExecutionOutputDeltaEvent) => void
  onFileChangeOutputDelta?: (event: FileChangeOutputDeltaEvent) => void

  // MCP tools
  onMcpToolCallProgress?: (event: McpToolCallProgressEvent) => void

  // Token usage
  onTokenUsage?: (event: TokenUsageEvent) => void

  // Approvals
  onCommandApprovalRequested?: (event: CommandApprovalRequestedEvent) => void
  onFileChangeApprovalRequested?: (event: FileChangeApprovalRequestedEvent) => void

  // Errors
  onStreamError?: (event: StreamErrorEvent) => void
  onServerDisconnected?: (event: ServerDisconnectedEvent) => void

  // Rate limiting
  onRateLimitExceeded?: (event: RateLimitExceededEvent) => void
}

// ==================== Setup Event Listeners ====================

// Helper to add listener if handler exists
async function addListener<T>(
  eventName: string,
  handler: ((event: T) => void) | undefined,
  unlisteners: UnlistenFn[]
) {
  if (handler) {
    console.log(`[Events] Setting up listener for: ${eventName}`)
    const unlisten = await listen<T>(eventName, (event) => {
      console.log(`[Events] Received raw event: ${eventName}`, event.payload)
      handler(event.payload)
    })
    unlisteners.push(unlisten)
    console.log(`[Events] Listener registered for: ${eventName}`)
  }
}

export async function setupEventListeners(
  handlers: EventHandlers
): Promise<UnlistenFn[]> {
  console.log('[Events] setupEventListeners called')
  const unlisteners: UnlistenFn[] = []

  // Thread lifecycle
  await addListener('thread-started', handlers.onThreadStarted, unlisteners)
  await addListener('turn-started', handlers.onTurnStarted, unlisteners)
  await addListener('turn-completed', handlers.onTurnCompleted, unlisteners)
  await addListener('turn-diff-updated', handlers.onTurnDiffUpdated, unlisteners)
  await addListener('turn-plan-updated', handlers.onTurnPlanUpdated, unlisteners)
  await addListener('thread-compacted', handlers.onThreadCompacted, unlisteners)

  // Item lifecycle
  await addListener('item-started', handlers.onItemStarted, unlisteners)
  await addListener('item-completed', handlers.onItemCompleted, unlisteners)

  // Agent message (event name: item/agentMessage/delta -> item-agentMessage-delta)
  await addListener('item-agentMessage-delta', handlers.onAgentMessageDelta, unlisteners)

  // Reasoning (event name: item/reasoning/summaryTextDelta -> item-reasoning-summaryTextDelta)
  await addListener(
    'item-reasoning-summaryTextDelta',
    handlers.onReasoningSummaryTextDelta,
    unlisteners
  )
  await addListener(
    'item-reasoning-summaryPartAdded',
    handlers.onReasoningSummaryPartAdded,
    unlisteners
  )
  await addListener('item-reasoning-textDelta', handlers.onReasoningTextDelta, unlisteners)

  // Command execution + file change output
  await addListener(
    'item-commandExecution-outputDelta',
    handlers.onCommandExecutionOutputDelta,
    unlisteners
  )
  await addListener(
    'item-fileChange-outputDelta',
    handlers.onFileChangeOutputDelta,
    unlisteners
  )

  // MCP tools
  await addListener('item-mcpToolCall-progress', handlers.onMcpToolCallProgress, unlisteners)

  // Token usage
  await addListener('thread-tokenUsage-updated', handlers.onTokenUsage, unlisteners)

  // Approvals
  await addListener(
    'item-commandExecution-requestApproval',
    handlers.onCommandApprovalRequested,
    unlisteners
  )
  await addListener(
    'item-fileChange-requestApproval',
    handlers.onFileChangeApprovalRequested,
    unlisteners
  )

  // Errors
  await addListener('error', handlers.onStreamError, unlisteners)
  await addListener('app-server-disconnected', handlers.onServerDisconnected, unlisteners)

  // Rate limiting
  await addListener('turn-rateLimitExceeded', handlers.onRateLimitExceeded, unlisteners)

  console.log(`[Events] setupEventListeners completed - ${unlisteners.length} listeners registered`)
  return unlisteners
}

// Cleanup all listeners with error handling
export function cleanupEventListeners(unlisteners: UnlistenFn[]) {
  unlisteners.forEach((unlisten) => {
    try {
      unlisten()
    } catch (error) {
      console.error('Failed to cleanup event listener:', error)
    }
  })
}
