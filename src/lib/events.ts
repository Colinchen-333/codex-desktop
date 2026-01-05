import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// ==================== Event Types ====================

// Thread lifecycle events
export interface ThreadStartedEvent {
  threadId: string
}

export interface TurnStartedEvent {
  threadId: string
  turnId: string
}

// Item lifecycle events
export interface ItemStartedEvent {
  itemId: string
  type: string
  threadId: string
}

export interface ItemUpdatedEvent {
  itemId: string
  type: string
  threadId: string
  content: unknown
}

export interface ItemCompletedEvent {
  itemId: string
  type: string
  threadId: string
  content: unknown
}

// Agent message events
export interface AgentMessageDeltaEvent {
  itemId: string
  threadId: string
  delta: string
}

// Reasoning events (for models with reasoning capability)
export interface ReasoningDeltaEvent {
  itemId: string
  threadId: string
  delta: string
  summaryIndex?: number
}

export interface ReasoningCompletedEvent {
  itemId: string
  threadId: string
  summary: string[]
  content?: string[]
}

// Command execution events
export interface ExecCommandBeginEvent {
  callId: string
  threadId: string
  turnId: string
  command: string[]
  cwd: string
}

export interface ExecCommandOutputDeltaEvent {
  callId: string
  threadId: string
  delta: string
}

export interface ExecCommandEndEvent {
  callId: string
  threadId: string
  turnId: string
  command: string[]
  cwd: string
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

// MCP tool events
export interface McpToolCallBeginEvent {
  callId: string
  threadId: string
  server: string
  tool: string
  arguments: unknown
}

export interface McpToolCallEndEvent {
  callId: string
  threadId: string
  server: string
  tool: string
  result?: unknown
  error?: string
  durationMs: number
}

// Token usage event
export interface TokenUsageEvent {
  threadId: string
  turnId: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

// Error events
export interface StreamErrorEvent {
  threadId: string
  turnId: string
  message: string
  willRetry: boolean
  errorInfo?: CodexErrorInfo
}

export interface CodexErrorInfo {
  type:
    | 'context_window_exceeded'
    | 'usage_limit_exceeded'
    | 'http_connection_failed'
    | 'internal_server_error'
    | 'unauthorized'
    | 'bad_request'
    | 'sandbox_error'
    | 'other'
  httpStatusCode?: number
}

export interface CommandApprovalRequestedEvent {
  itemId: string
  threadId: string
  command: string
  cwd: string
  commandActions: string[]
  _requestId: number // JSON-RPC request ID for responding
}

export interface FileChangeApprovalRequestedEvent {
  itemId: string
  threadId: string
  changes: Array<{
    path: string
    kind: 'add' | 'modify' | 'delete'
    diff: string
  }>
  _requestId: number // JSON-RPC request ID for responding
}

export interface TurnCompletedEvent {
  threadId: string
  turnId: string
}

export interface TurnFailedEvent {
  threadId: string
  turnId: string
  error: string
  errorInfo?: CodexErrorInfo
  additionalDetails?: string
}

export interface ServerDisconnectedEvent {
  // Empty payload
}

// ==================== Event Handlers ====================

export type EventHandlers = {
  // Thread lifecycle
  onThreadStarted?: (event: ThreadStartedEvent) => void
  onTurnStarted?: (event: TurnStartedEvent) => void
  onTurnCompleted?: (event: TurnCompletedEvent) => void
  onTurnFailed?: (event: TurnFailedEvent) => void

  // Item lifecycle
  onItemStarted?: (event: ItemStartedEvent) => void
  onItemUpdated?: (event: ItemUpdatedEvent) => void
  onItemCompleted?: (event: ItemCompletedEvent) => void

  // Agent message
  onAgentMessageDelta?: (event: AgentMessageDeltaEvent) => void

  // Reasoning
  onReasoningDelta?: (event: ReasoningDeltaEvent) => void
  onReasoningCompleted?: (event: ReasoningCompletedEvent) => void

  // Command execution
  onExecCommandBegin?: (event: ExecCommandBeginEvent) => void
  onExecCommandOutputDelta?: (event: ExecCommandOutputDeltaEvent) => void
  onExecCommandEnd?: (event: ExecCommandEndEvent) => void

  // MCP tools
  onMcpToolCallBegin?: (event: McpToolCallBeginEvent) => void
  onMcpToolCallEnd?: (event: McpToolCallEndEvent) => void

  // Token usage
  onTokenUsage?: (event: TokenUsageEvent) => void

  // Approvals
  onCommandApprovalRequested?: (event: CommandApprovalRequestedEvent) => void
  onFileChangeApprovalRequested?: (event: FileChangeApprovalRequestedEvent) => void

  // Errors
  onStreamError?: (event: StreamErrorEvent) => void
  onServerDisconnected?: (event: ServerDisconnectedEvent) => void
}

// ==================== Setup Event Listeners ====================

// Helper to add listener if handler exists
async function addListener<T>(
  eventName: string,
  handler: ((event: T) => void) | undefined,
  unlisteners: UnlistenFn[]
) {
  if (handler) {
    const unlisten = await listen<T>(eventName, (event) => handler(event.payload))
    unlisteners.push(unlisten)
  }
}

export async function setupEventListeners(
  handlers: EventHandlers
): Promise<UnlistenFn[]> {
  const unlisteners: UnlistenFn[] = []

  // Thread lifecycle
  await addListener('thread-started', handlers.onThreadStarted, unlisteners)
  await addListener('turn-started', handlers.onTurnStarted, unlisteners)
  await addListener('turn-completed', handlers.onTurnCompleted, unlisteners)
  await addListener('turn-failed', handlers.onTurnFailed, unlisteners)

  // Item lifecycle
  await addListener('item-started', handlers.onItemStarted, unlisteners)
  await addListener('item-updated', handlers.onItemUpdated, unlisteners)
  await addListener('item-completed', handlers.onItemCompleted, unlisteners)

  // Agent message (event name: item/agentMessage/delta -> item-agentMessage-delta)
  await addListener('item-agentMessage-delta', handlers.onAgentMessageDelta, unlisteners)

  // Reasoning (event name: item/reasoning/summaryTextDelta -> item-reasoning-summaryTextDelta)
  await addListener('item-reasoning-summaryTextDelta', handlers.onReasoningDelta, unlisteners)
  await addListener('item-reasoning-completed', handlers.onReasoningCompleted, unlisteners)

  // Command execution
  await addListener('exec-command-begin', handlers.onExecCommandBegin, unlisteners)
  await addListener('exec-command-output-delta', handlers.onExecCommandOutputDelta, unlisteners)
  await addListener('exec-command-end', handlers.onExecCommandEnd, unlisteners)

  // MCP tools
  await addListener('mcp-tool-call-begin', handlers.onMcpToolCallBegin, unlisteners)
  await addListener('mcp-tool-call-end', handlers.onMcpToolCallEnd, unlisteners)

  // Token usage
  await addListener('token-usage', handlers.onTokenUsage, unlisteners)

  // Approvals
  await addListener('command-approval-requested', handlers.onCommandApprovalRequested, unlisteners)
  await addListener('file-change-approval-requested', handlers.onFileChangeApprovalRequested, unlisteners)

  // Errors
  await addListener('stream-error', handlers.onStreamError, unlisteners)
  await addListener('app-server-disconnected', handlers.onServerDisconnected, unlisteners)

  return unlisteners
}

// Cleanup all listeners
export function cleanupEventListeners(unlisteners: UnlistenFn[]) {
  unlisteners.forEach((unlisten) => unlisten())
}
