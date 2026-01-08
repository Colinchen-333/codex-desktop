import { create } from 'zustand'
import { threadApi, snapshotApi, type ThreadInfo, type Snapshot, type SkillInput } from '../lib/api'
import { parseError } from '../lib/errorUtils'
import { useSettingsStore } from './settings'
import {
  normalizeApprovalPolicy,
  normalizeReasoningEffort,
  normalizeReasoningSummary,
  normalizeSandboxMode,
} from '../lib/normalize'
import type {
  ItemStartedEvent,
  ItemCompletedEvent,
  AgentMessageDeltaEvent,
  CommandApprovalRequestedEvent,
  FileChangeApprovalRequestedEvent,
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
} from '../lib/events'

// ==================== Delta Batching for Smooth Streaming ====================
// Accumulates delta updates and flushes at ~20 FPS to reduce re-renders

interface DeltaBuffer {
  // Track which thread ID and turn ID the current buffer is for
  threadId: string | null
  turnId: string | null
  agentMessages: Map<string, string> // itemId -> accumulated text
  commandOutputs: Map<string, string> // itemId -> accumulated output
  fileChangeOutputs: Map<string, string> // itemId -> accumulated output
  reasoningSummaries: Map<string, { index: number; text: string }[]> // itemId -> summaries
  reasoningContents: Map<string, { index: number; text: string }[]> // itemId -> content
  mcpProgress: Map<string, string[]> // itemId -> accumulated progress messages
}

const deltaBuffer: DeltaBuffer = {
  threadId: null,
  turnId: null,
  agentMessages: new Map(),
  commandOutputs: new Map(),
  fileChangeOutputs: new Map(),
  reasoningSummaries: new Map(),
  reasoningContents: new Map(),
  mcpProgress: new Map(),
}

// Helper to clear delta buffer and reset thread/turn tracking
function clearDeltaBuffer() {
  deltaBuffer.threadId = null
  deltaBuffer.turnId = null
  deltaBuffer.agentMessages.clear()
  deltaBuffer.commandOutputs.clear()
  deltaBuffer.fileChangeOutputs.clear()
  deltaBuffer.reasoningSummaries.clear()
  deltaBuffer.reasoningContents.clear()
  deltaBuffer.mcpProgress.clear()
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL_MS = 50 // 20 FPS
const MAX_BUFFER_SIZE = 500_000 // 500KB - force flush to prevent memory issues

// Turn timeout - reset turn if no completion received within timeout
let turnTimeoutTimer: ReturnType<typeof setTimeout> | null = null
const TURN_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes - generous timeout for long operations

// Approval timeout - clean up stale approvals that were never responded to
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes - generous timeout for user decisions
let approvalCleanupTimer: ReturnType<typeof setInterval> | null = null
const APPROVAL_CLEANUP_INTERVAL_MS = 60 * 1000 // Check every minute

function clearTurnTimeout() {
  if (turnTimeoutTimer) {
    clearTimeout(turnTimeoutTimer)
    turnTimeoutTimer = null
  }
}

// Clean up stale pending approvals that have exceeded the timeout
// Uses a single setState call to avoid race conditions
function cleanupStaleApprovals() {
  const now = Date.now()

  useThreadStore.setState((state) => {
    const { pendingApprovals, activeThread, items } = state

    if (pendingApprovals.length === 0) return state

    // Find stale approvals (exceeded timeout)
    const staleApprovals = pendingApprovals.filter(
      (approval) => now - approval.createdAt > APPROVAL_TIMEOUT_MS
    )

    // Update items for stale approvals
    const updatedItems = { ...items }
    if (staleApprovals.length > 0) {
      console.warn(
        '[cleanupStaleApprovals] Removing',
        staleApprovals.length,
        'stale approvals:',
        staleApprovals.map((a) => a.itemId)
      )

      staleApprovals.forEach((approval) => {
        const item = updatedItems[approval.itemId]
        if (item && (item.type === 'commandExecution' || item.type === 'fileChange')) {
          const content = item.content as Record<string, unknown>
          updatedItems[approval.itemId] = {
            ...item,
            status: 'failed',
            content: {
              ...content,
              needsApproval: false,
              approved: false,
              reason: 'Approval request timed out',
            },
          } as AnyThreadItem
        }
      })
    }

    // Filter out stale and orphaned approvals in one pass
    const validApprovals = pendingApprovals.filter((approval) => {
      // Remove if timed out
      if (now - approval.createdAt > APPROVAL_TIMEOUT_MS) {
        return false
      }
      // Remove if orphaned (belongs to different thread)
      if (activeThread && approval.threadId !== activeThread.id) {
        return false
      }
      return true
    })

    // Log orphaned approvals being removed
    const orphanedCount = pendingApprovals.filter(
      (approval) =>
        activeThread &&
        approval.threadId !== activeThread.id &&
        now - approval.createdAt <= APPROVAL_TIMEOUT_MS
    ).length
    if (orphanedCount > 0) {
      console.warn(
        '[cleanupStaleApprovals] Removing',
        orphanedCount,
        'orphaned approvals from different threads'
      )
    }

    // Only update if there were changes
    if (validApprovals.length === pendingApprovals.length && staleApprovals.length === 0) {
      return state
    }

    return {
      items: updatedItems,
      pendingApprovals: validApprovals,
    }
  })
}

// Start the approval cleanup timer
function startApprovalCleanupTimer() {
  if (approvalCleanupTimer === null) {
    approvalCleanupTimer = setInterval(cleanupStaleApprovals, APPROVAL_CLEANUP_INTERVAL_MS)
  }
}

// Stop the approval cleanup timer
function stopApprovalCleanupTimer() {
  if (approvalCleanupTimer !== null) {
    clearInterval(approvalCleanupTimer)
    approvalCleanupTimer = null
  }
}

// Full turn cleanup - called when turn ends abnormally (timeout, disconnect, etc.)
function performFullTurnCleanup() {
  clearDeltaBuffer()
  clearTurnTimeout()
}

// Calculate current buffer size for overflow detection
function getBufferSize(): number {
  let size = 0
  deltaBuffer.agentMessages.forEach((text) => { size += text.length })
  deltaBuffer.commandOutputs.forEach((text) => { size += text.length })
  deltaBuffer.fileChangeOutputs.forEach((text) => { size += text.length })
  deltaBuffer.reasoningSummaries.forEach((arr) => {
    arr.forEach((item) => { size += item.text.length })
  })
  deltaBuffer.reasoningContents.forEach((arr) => {
    arr.forEach((item) => { size += item.text.length })
  })
  deltaBuffer.mcpProgress.forEach((arr) => {
    arr.forEach((msg) => { size += msg.length })
  })
  return size
}

// Schedule a flush - immediate=true for first delta to reduce perceived latency
function scheduleFlush(flushFn: () => void, immediate = false) {
  // Capture current threadId to prevent race condition
  // If thread changes before flush executes, we skip the flush
  const capturedThreadId = deltaBuffer.threadId

  const wrappedFlush = () => {
    // Validate threadId hasn't changed before executing flush
    if (deltaBuffer.threadId !== capturedThreadId) {
      console.log('[scheduleFlush] Thread changed, skipping flush. Captured:', capturedThreadId, 'Current:', deltaBuffer.threadId)
      return
    }
    flushFn()
  }

  // Check for buffer overflow - force flush if too large
  if (getBufferSize() > MAX_BUFFER_SIZE) {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    wrappedFlush()
    return
  }

  if (immediate && flushTimer === null) {
    // First delta: flush immediately for instant first-character display
    wrappedFlush()
    return
  }
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      wrappedFlush()
    }, FLUSH_INTERVAL_MS)
  }
}

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
  threadId: string // Thread ID this approval belongs to
  type: 'command' | 'fileChange'
  data: CommandApprovalRequestedEvent | FileChangeApprovalRequestedEvent
  requestId: number // JSON-RPC request ID for responding
  createdAt: number // Timestamp when approval was requested (for timeout tracking)
}

// ==================== Store State ====================

// Token usage statistics
export interface TokenUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  modelContextWindow: number | null // Dynamic context window from server
}

// Turn timing for elapsed display
export interface TurnTiming {
  startedAt: number | null
  completedAt: number | null
}

// Session-level overrides (like CLI's /model, /approvals)
export interface SessionOverrides {
  model?: string
  approvalPolicy?: string
  sandboxPolicy?: string
}

// Queued message when turn is running
export interface QueuedMessage {
  id: string
  text: string
  images?: string[]
  queuedAt: number
}

interface ThreadState {
  activeThread: ThreadInfo | null
  // Using Record instead of Map for better serialization and Zustand devtools compatibility
  items: Record<string, AnyThreadItem>
  itemOrder: string[]
  turnStatus: TurnStatus
  currentTurnId: string | null
  pendingApprovals: PendingApproval[]
  snapshots: Snapshot[]
  tokenUsage: TokenUsage
  turnTiming: TurnTiming
  sessionOverrides: SessionOverrides
  queuedMessages: QueuedMessage[]
  isLoading: boolean
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
  sendMessage: (text: string, images?: string[], skills?: SkillInput[]) => Promise<void>
  interrupt: () => Promise<void>
  respondToApproval: (
    itemId: string,
    decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline' | 'cancel',
    options?: { snapshotId?: string; execpolicyAmendment?: { command: string[] } | null }
  ) => Promise<void>
  clearThread: () => void
  addInfoItem: (title: string, details?: string) => void
  flushDeltaBuffer: () => void
  setSessionOverride: (key: keyof SessionOverrides, value: string | undefined) => void
  clearSessionOverrides: () => void

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

// Helper to map item types from server to our types
function mapItemType(type: string): ThreadItemType {
  const typeMap: Record<string, ThreadItemType> = {
    userMessage: 'userMessage',
    agentMessage: 'agentMessage',
    reasoning: 'reasoning',
    commandExecution: 'commandExecution',
    fileChange: 'fileChange',
    mcpToolCall: 'mcpTool',
    webSearch: 'webSearch',
    imageView: 'info',
    enteredReviewMode: 'review',
    exitedReviewMode: 'review',
  }
  return typeMap[type] || 'agentMessage'
}

function normalizeStatus(status?: string | null): ThreadItem['status'] {
  switch (status) {
    case 'completed':
    case 'Completed':
      return 'completed'
    case 'failed':
    case 'Failed':
      return 'failed'
    case 'declined':
    case 'Declined':
      return 'failed'
    case 'inProgress':
    case 'InProgress':
      return 'inProgress'
    default:
      return 'completed'
  }
}

function stringifyCommandAction(action: unknown): string {
  if (!action || typeof action !== 'object') return 'unknown'
  const record = action as Record<string, unknown>
  const type = String(record.type || record.kind || record.action || 'action')
  const command = typeof record.command === 'string' ? record.command : ''
  const path = typeof record.path === 'string' ? record.path : ''
  const query = typeof record.query === 'string' ? record.query : ''
  const parts = [type, command, path, query].filter(Boolean)
  return parts.join(' ')
}

function toThreadItem(item: { id: string; type: string } & Record<string, unknown>): AnyThreadItem {
  const base = {
    id: item.id,
    type: mapItemType(item.type),
    status: normalizeStatus(item.status as string | undefined),
    createdAt: Date.now(),
  }

  switch (item.type) {
    case 'userMessage':
      return {
        ...base,
        type: 'userMessage',
        content: {
          text:
            Array.isArray(item.content) && item.content.length > 0
              ? item.content
                  .map((entry) => {
                    if (entry && typeof entry === 'object' && 'text' in (entry as object)) {
                      return String((entry as { text?: string }).text || '')
                    }
                    return ''
                  })
                  .join('\n')
              : '',
          images: Array.isArray(item.content)
            ? item.content
                .map((entry) => {
                  if (entry && typeof entry === 'object') {
                    const asObj = entry as { type?: string; url?: string; path?: string }
                    if (asObj.type === 'image' && asObj.url) return asObj.url
                    if (asObj.type === 'localImage' && asObj.path) return asObj.path
                  }
                  return null
                })
                .filter(Boolean) as string[]
            : undefined,
        },
      }
    case 'agentMessage':
      return {
        ...base,
        type: 'agentMessage',
        content: {
          text: typeof item.text === 'string' ? item.text : '',
          isStreaming: base.status === 'inProgress',
        },
      }
    case 'reasoning':
      return {
        ...base,
        type: 'reasoning',
        content: {
          summary: Array.isArray(item.summary) ? (item.summary as string[]) : [],
          fullContent: Array.isArray(item.content) ? (item.content as string[]) : undefined,
          isStreaming: base.status === 'inProgress',
        },
      }
    case 'commandExecution':
      return {
        ...base,
        type: 'commandExecution',
        content: {
          callId: item.id,
          command: typeof item.command === 'string' ? item.command : '',
          cwd: typeof item.cwd === 'string' ? item.cwd : '',
          commandActions: Array.isArray(item.commandActions)
            ? (item.commandActions as unknown[]).map(stringifyCommandAction)
            : undefined,
          output: typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : '',
          stdout: typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : undefined,
          exitCode: typeof item.exitCode === 'number' ? item.exitCode : undefined,
          durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
          needsApproval: false,
          approved: undefined,
          isRunning: base.status === 'inProgress',
        },
      }
    case 'fileChange':
      return {
        ...base,
        type: 'fileChange',
        content: {
          changes: Array.isArray(item.changes)
            ? (item.changes as Array<Record<string, unknown>>).map((change) => {
                const kind = change.kind as { type?: string; movePath?: string } | string
                if (typeof kind === 'string') {
                  const lower = kind.toLowerCase()
                  return {
                    path: String(change.path || ''),
                    kind: lower === 'add' ? 'add' : lower === 'delete' ? 'delete' : 'modify',
                    diff: String(change.diff || ''),
                  }
                }
                if (kind && typeof kind === 'object') {
                  if (kind.type === 'add') {
                    return { path: String(change.path || ''), kind: 'add', diff: String(change.diff || '') }
                  }
                  if (kind.type === 'delete') {
                    return { path: String(change.path || ''), kind: 'delete', diff: String(change.diff || '') }
                  }
                  const movePath =
                    typeof (kind as { movePath?: string }).movePath === 'string'
                      ? (kind as { movePath?: string }).movePath
                      : undefined
                  return {
                    path: String(change.path || ''),
                    kind: movePath ? 'rename' : 'modify',
                    diff: String(change.diff || ''),
                    oldPath: movePath,
                  }
                }
                return { path: String(change.path || ''), kind: 'modify', diff: String(change.diff || '') }
              })
            : [],
          needsApproval: false,
          approved: undefined,
          applied: base.status === 'completed',
        },
      }
    case 'mcpToolCall':
      return {
        ...base,
        type: 'mcpTool',
        content: {
          callId: item.id,
          server: typeof item.server === 'string' ? item.server : '',
          tool: typeof item.tool === 'string' ? item.tool : '',
          arguments: item.arguments ?? {},
          result: item.result,
          error: item.error ? String((item.error as { message?: string }).message || item.error) : undefined,
          durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
          isRunning: base.status === 'inProgress',
        },
      }
    case 'webSearch':
      return {
        ...base,
        type: 'webSearch',
        content: {
          query: typeof item.query === 'string' ? item.query : '',
          results: Array.isArray(item.results)
            ? (item.results as Array<Record<string, unknown>>).map((result) => ({
                title: typeof result.title === 'string' ? result.title : '',
                url: typeof result.url === 'string' ? result.url : '',
                snippet: typeof result.snippet === 'string' ? result.snippet : '',
              }))
            : undefined,
          isSearching: base.status === 'inProgress',
        },
      }
    case 'enteredReviewMode':
      return {
        ...base,
        type: 'review',
        content: {
          phase: 'started',
          text: typeof item.review === 'string' ? item.review : 'Review started',
        },
      }
    case 'exitedReviewMode':
      return {
        ...base,
        type: 'review',
        content: {
          phase: 'completed',
          text: typeof item.review === 'string' ? item.review : '',
        },
      }
    case 'imageView':
      return {
        ...base,
        type: 'info',
        content: {
          title: 'Image view',
          details: typeof item.path === 'string' ? item.path : '',
        },
      }
    default:
      // Handle unknown item types as info items
      return {
        ...base,
        type: 'info' as const,
        content: {
          title: `Unknown item type: ${String(item.type)}`,
          details: JSON.stringify(item, null, 2),
        },
      }
  }
}

// Default token usage
const defaultTokenUsage: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  modelContextWindow: null,
}

const defaultTurnTiming: TurnTiming = {
  startedAt: null,
  completedAt: null,
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  activeThread: null,
  items: {},
  itemOrder: [],
  turnStatus: 'idle',
  currentTurnId: null,
  pendingApprovals: [],
  snapshots: [],
  tokenUsage: defaultTokenUsage,
  turnTiming: defaultTurnTiming,
  sessionOverrides: {},
  queuedMessages: [],
  isLoading: false,
  error: null,

  startThread: async (projectId, cwd, model, sandboxMode, approvalPolicy) => {
    // Clear delta buffer before starting new thread
    clearDeltaBuffer()
    // Start approval cleanup timer
    startApprovalCleanupTimer()

    set({ isLoading: true, error: null })
    try {
      const safeModel = model?.trim() || undefined
      const safeSandboxMode = normalizeSandboxMode(sandboxMode)
      const safeApprovalPolicy = normalizeApprovalPolicy(approvalPolicy)

      const response = await threadApi.start(
        projectId,
        cwd,
        safeModel,
        safeSandboxMode,
        safeApprovalPolicy
      )
      // Reset all state for the new thread
      set({
        activeThread: response.thread,
        items: {},
        itemOrder: [],
        turnStatus: 'idle',
        currentTurnId: null,
        pendingApprovals: [],
        snapshots: [],
        tokenUsage: defaultTokenUsage,
        turnTiming: defaultTurnTiming,
        isLoading: false,
        error: null,
      })
    } catch (error) {
      set({ error: parseError(error), isLoading: false })
      throw error
    }
  },

  resumeThread: async (threadId) => {
    console.log('[resumeThread] Starting resume with threadId:', threadId)

    // Clear delta buffer before resuming thread
    clearDeltaBuffer()
    // Start approval cleanup timer
    startApprovalCleanupTimer()

    set({ isLoading: true, error: null })
    try {
      const response = await threadApi.resume(threadId)

      console.log('[resumeThread] Resume response - thread.id:', response.thread.id, 'requested threadId:', threadId)
      if (response.thread.id !== threadId) {
        console.warn('[resumeThread] Thread ID mismatch! Requested:', threadId, 'Got:', response.thread.id)
      }

      // Convert items from response to our format
      const items: Record<string, AnyThreadItem> = {}
      const itemOrder: string[] = []

      for (const rawItem of response.items) {
        if (!rawItem || typeof rawItem !== 'object') {
          console.warn('[resumeThread] Skipping invalid item (not an object):', rawItem)
          continue
        }
        const item = rawItem as { id?: string; type?: string }
        if (!item.id || !item.type) {
          console.warn('[resumeThread] Skipping item with missing id or type:', item)
          continue
        }
        const threadItem = toThreadItem(rawItem as { id: string; type: string } & Record<string, unknown>)
        items[threadItem.id] = threadItem
        itemOrder.push(threadItem.id)
      }

      set({
        activeThread: response.thread,
        items,
        itemOrder,
        turnStatus: 'idle',
        currentTurnId: null,
        pendingApprovals: [],
        snapshots: [],
        tokenUsage: defaultTokenUsage,
        turnTiming: defaultTurnTiming,
        isLoading: false,
        error: null,
      })

      console.log('[resumeThread] Resume completed, activeThread.id:', response.thread.id)
    } catch (error) {
      console.error('[resumeThread] Resume failed:', error)
      // Only update error state if no other thread became active
      const { activeThread: currentActive } = get()
      if (!currentActive || currentActive.id === threadId) {
        set({
          error: parseError(error),
          isLoading: false,
          pendingApprovals: [], // Clean up any stale approvals
          turnStatus: 'idle',
        })
      }
      throw error
    }
  },

  sendMessage: async (text, images, skills) => {
    const { activeThread, turnStatus } = get()
    if (!activeThread) {
      throw new Error('No active thread')
    }

    // Track queued message if turn is already running
    const isQueued = turnStatus === 'running'
    const queuedMsgId = isQueued ? `queued-${Date.now()}` : null
    if (isQueued && queuedMsgId) {
      console.log('[sendMessage] Turn already running, tracking queued message')
      const queuedMsg: QueuedMessage = {
        id: queuedMsgId,
        text,
        images,
        queuedAt: Date.now(),
      }
      set((state) => ({
        queuedMessages: [...state.queuedMessages, queuedMsg],
      }))
    }

    // Save thread ID to verify it doesn't change during send
    const currentThreadId = activeThread.id
    console.log('[sendMessage] Sending message to thread:', currentThreadId)

    // Add user message to items (use random suffix to avoid collision on rapid sends)
    const userMessageId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const userMessage: UserMessageItem = {
      id: userMessageId,
      type: 'userMessage',
      status: 'completed',
      content: { text, images },
      createdAt: Date.now(),
    }

    set((state) => ({
      items: { ...state.items, [userMessageId]: userMessage },
      itemOrder: [...state.itemOrder, userMessageId],
      turnStatus: 'running',
      // Remove from queue by ID once it's actually being sent
      queuedMessages: queuedMsgId
        ? state.queuedMessages.filter((m) => m.id !== queuedMsgId)
        : state.queuedMessages,
    }))

    try {
      const { settings } = useSettingsStore.getState()
      const { sessionOverrides } = get()
      const effort = normalizeReasoningEffort(settings.reasoningEffort)
      const summary = normalizeReasoningSummary(settings.reasoningSummary)
      const options: {
        effort?: string
        summary?: string
        model?: string
        approvalPolicy?: string
        sandboxPolicy?: string
      } = {}
      if (effort) options.effort = effort
      if (summary) options.summary = summary
      // Apply session overrides (from /model, /approvals commands)
      if (sessionOverrides.model) options.model = sessionOverrides.model
      if (sessionOverrides.approvalPolicy)
        options.approvalPolicy = sessionOverrides.approvalPolicy
      if (sessionOverrides.sandboxPolicy)
        options.sandboxPolicy = sessionOverrides.sandboxPolicy

      const response = await threadApi.sendMessage(
        activeThread.id,
        text,
        images,
        skills,
        Object.keys(options).length ? options : undefined
      )

      // Verify thread didn't change during the API call
      const { activeThread: currentActive } = get()
      if (!currentActive || currentActive.id !== currentThreadId) {
        console.warn('[sendMessage] Thread changed during send, removing orphaned user message')
        // Remove the orphaned user message since it was for a different thread
        set((state) => {
          const remainingItems = { ...state.items }
          delete remainingItems[userMessageId]
          return {
            items: remainingItems,
            itemOrder: state.itemOrder.filter((id) => id !== userMessageId),
            turnStatus: 'idle',
          }
        })
        return
      }

      set({ currentTurnId: response.turn.id })
    } catch (error) {
      // Only update error state if we're still on the same thread
      const { activeThread: currentActive } = get()
      if (currentActive?.id === currentThreadId) {
        // Complete rollback: remove user message and set failed status
        set((state) => {
          const newItems = { ...state.items }
          delete newItems[userMessageId]
          return {
            items: newItems,
            itemOrder: state.itemOrder.filter((id) => id !== userMessageId),
            turnStatus: 'failed',
            error: String(error),
          }
        })
      } else {
        // Remove orphaned user message if thread changed
        set((state) => {
          const newItems = { ...state.items }
          delete newItems[userMessageId]
          return {
            items: newItems,
            itemOrder: state.itemOrder.filter((id) => id !== userMessageId),
          }
        })
      }
      throw error
    }
  },

  interrupt: async () => {
    const { activeThread, turnStatus } = get()
    if (!activeThread) {
      console.warn('[interrupt] No active thread')
      return
    }
    if (turnStatus !== 'running') {
      console.warn('[interrupt] Turn is not running, status:', turnStatus)
      return
    }

    const threadId = activeThread.id
    try {
      // Immediately update UI to show interrupted state
      set({ turnStatus: 'interrupted' })

      // Full cleanup including delta buffer and turn timeout
      performFullTurnCleanup()

      // Update turn timing and clear pending state
      set((state) => ({
        currentTurnId: null,
        pendingApprovals: [],
        queuedMessages: [],
        turnTiming: {
          ...state.turnTiming,
          completedAt: Date.now(),
        },
      }))

      // Call the API to interrupt the backend
      await threadApi.interrupt(threadId)
    } catch (error) {
      console.error('[interrupt] Failed to interrupt:', error)
      // Only update error state if we're still on the same thread
      const { activeThread: currentActive } = get()
      if (currentActive?.id === threadId) {
        set({ error: parseError(error) })
      }
    }
  },

  respondToApproval: async (itemId, decision, options) => {
    const { activeThread, pendingApprovals } = get()
    if (!activeThread) return

    // Find the pending approval to get the requestId
    const pendingApproval = pendingApprovals.find((p) => p.itemId === itemId)
    if (!pendingApproval) {
      console.error('No pending approval found for itemId:', itemId)
      return
    }

    // CRITICAL: Validate that the approval belongs to the current active thread
    if (pendingApproval.threadId !== activeThread.id) {
      console.error(
        '[respondToApproval] Thread mismatch - approval.threadId:',
        pendingApproval.threadId,
        'activeThread.id:',
        activeThread.id
      )
      // Remove the stale approval
      set((state) => ({
        pendingApprovals: state.pendingApprovals.filter((p) => p.itemId !== itemId),
      }))
      return
    }

    const threadId = activeThread.id
    try {
      await threadApi.respondToApproval(
        threadId,
        itemId,
        decision,
        pendingApproval.requestId,
        options?.execpolicyAmendment
      )

      // Validate thread hasn't changed during API call
      const { activeThread: currentActive } = get()
      if (!currentActive || currentActive.id !== threadId) {
        console.warn('[respondToApproval] Thread changed, discarding state update')
        return
      }

      // Update item status
      set((state) => {
        const item = state.items[itemId]
        if (item && (item.type === 'commandExecution' || item.type === 'fileChange')) {
          const content = item.content as Record<string, unknown>
          const isApproved = decision !== 'decline'

          // For file changes, also set applied and snapshotId
          const extraFields =
            item.type === 'fileChange' && isApproved
              ? {
                  applied: true,
                  // Use the provided snapshotId (created before applying)
                  snapshotId: options?.snapshotId,
                }
              : {}

          const updatedItem = {
            ...item,
            content: {
              ...content,
              needsApproval: false,
              approved: isApproved,
              ...extraFields,
            },
          } as AnyThreadItem

          return {
            items: { ...state.items, [itemId]: updatedItem },
            pendingApprovals: state.pendingApprovals.filter((p) => p.itemId !== itemId),
          }
        }

        return {
          pendingApprovals: state.pendingApprovals.filter((p) => p.itemId !== itemId),
        }
      })
    } catch (error) {
      // Only update error state if we're still on the same thread
      const { activeThread: currentActive } = get()
      if (currentActive?.id === threadId) {
        set({ error: parseError(error) })
      }
      throw error
    }
  },

  clearThread: () => {
    // Clear the delta buffer, turn timeout, and approval cleanup timer
    clearDeltaBuffer()
    clearTurnTimeout()
    stopApprovalCleanupTimer()

    set({
      activeThread: null,
      items: {},
      itemOrder: [],
      turnStatus: 'idle',
      currentTurnId: null,
      pendingApprovals: [],
      snapshots: [],
      sessionOverrides: {},
      queuedMessages: [],
      error: null,
    })
  },

  flushDeltaBuffer: () => {
    // Guard: Don't flush if there's no active thread
    // This prevents applying buffered deltas to wrong thread after switch
    const { activeThread } = get()
    if (!activeThread) {
      // Clear buffers without applying them
      clearDeltaBuffer()
      return
    }

    // Guard: Don't flush if the buffer's thread ID doesn't match the active thread
    // This prevents applying deltas from a previous thread to the current thread
    if (deltaBuffer.threadId !== null && deltaBuffer.threadId !== activeThread.id) {
      console.warn('[flushDeltaBuffer] Thread ID mismatch, clearing buffer. Buffer:', deltaBuffer.threadId, 'Active:', activeThread.id)
      clearDeltaBuffer()
      return
    }

    const hasAgentMessages = deltaBuffer.agentMessages.size > 0
    const hasCommandOutputs = deltaBuffer.commandOutputs.size > 0
    const hasFileChangeOutputs = deltaBuffer.fileChangeOutputs.size > 0
    const hasReasoningSummaries = deltaBuffer.reasoningSummaries.size > 0
    const hasReasoningContents = deltaBuffer.reasoningContents.size > 0
    const hasMcpProgress = deltaBuffer.mcpProgress.size > 0

    if (
      !hasAgentMessages &&
      !hasCommandOutputs &&
      !hasFileChangeOutputs &&
      !hasReasoningSummaries &&
      !hasReasoningContents &&
      !hasMcpProgress
    ) {
      return
    }

    set((state) => {
      const updatedItems = { ...state.items }
      let newItemOrder = state.itemOrder

      // Apply agent message deltas
      deltaBuffer.agentMessages.forEach((text, itemId) => {
        const existing = updatedItems[itemId] as AgentMessageItem | undefined
        if (existing && existing.type === 'agentMessage') {
          updatedItems[itemId] = {
            ...existing,
            content: {
              text: existing.content.text + text,
              isStreaming: true,
            },
          }
        } else {
          const newItem: AgentMessageItem = {
            id: itemId,
            type: 'agentMessage',
            status: 'inProgress',
            content: { text, isStreaming: true },
            createdAt: Date.now(),
          }
          updatedItems[itemId] = newItem
          if (!newItemOrder.includes(itemId)) {
            newItemOrder = [...newItemOrder, itemId]
          }
        }
      })

      // Apply command output deltas
      deltaBuffer.commandOutputs.forEach((output, itemId) => {
        const existing = updatedItems[itemId] as CommandExecutionItem | undefined
        if (existing && existing.type === 'commandExecution') {
          updatedItems[itemId] = {
            ...existing,
            content: {
              ...existing.content,
              output: (existing.content.output || '') + output,
              isRunning: true,
            },
          }
        }
      })

      // Apply file change output deltas
      deltaBuffer.fileChangeOutputs.forEach((output, itemId) => {
        const existing = updatedItems[itemId] as FileChangeItem | undefined
        if (existing && existing.type === 'fileChange') {
          updatedItems[itemId] = {
            ...existing,
            content: {
              ...existing.content,
              output: (existing.content.output || '') + output,
            },
          }
        }
      })

      // Apply reasoning summary deltas
      deltaBuffer.reasoningSummaries.forEach((updates, itemId) => {
        const existing = updatedItems[itemId] as ReasoningItem | undefined
        if (existing && existing.type === 'reasoning') {
          const summary = [...existing.content.summary]
          updates.forEach(({ index, text }) => {
            // Ensure array has sufficient length to avoid sparse array
            while (summary.length <= index) {
              summary.push('')
            }
            summary[index] = summary[index] + text
          })
          updatedItems[itemId] = {
            ...existing,
            content: { ...existing.content, summary, isStreaming: true },
          }
        } else {
          const summary: string[] = []
          updates.forEach(({ index, text }) => {
            // Ensure array has sufficient length to avoid sparse array
            while (summary.length <= index) {
              summary.push('')
            }
            summary[index] = summary[index] + text
          })
          const newItem: ReasoningItem = {
            id: itemId,
            type: 'reasoning',
            status: 'inProgress',
            content: { summary, isStreaming: true },
            createdAt: Date.now(),
          }
          updatedItems[itemId] = newItem
          if (!newItemOrder.includes(itemId)) {
            newItemOrder = [...newItemOrder, itemId]
          }
        }
      })

      // Apply reasoning content deltas
      deltaBuffer.reasoningContents.forEach((updates, itemId) => {
        const existing = updatedItems[itemId] as ReasoningItem | undefined
        if (existing && existing.type === 'reasoning') {
          const fullContent = existing.content.fullContent ? [...existing.content.fullContent] : []
          updates.forEach(({ index, text }) => {
            // Ensure array has sufficient length to avoid sparse array
            while (fullContent.length <= index) {
              fullContent.push('')
            }
            fullContent[index] = fullContent[index] + text
          })
          updatedItems[itemId] = {
            ...existing,
            content: { ...existing.content, fullContent, isStreaming: true },
          }
        }
      })

      // Apply MCP progress
      deltaBuffer.mcpProgress.forEach((messages, itemId) => {
        const existing = updatedItems[itemId] as McpToolItem | undefined
        if (existing && existing.type === 'mcpTool') {
          updatedItems[itemId] = {
            ...existing,
            content: {
              ...existing.content,
              progress: [...(existing.content.progress || []), ...messages],
              isRunning: true,
            },
          }
        }
      })

      // Clear buffers after applying
      deltaBuffer.agentMessages.clear()
      deltaBuffer.commandOutputs.clear()
      deltaBuffer.fileChangeOutputs.clear()
      deltaBuffer.reasoningSummaries.clear()
      deltaBuffer.reasoningContents.clear()
      deltaBuffer.mcpProgress.clear()

      return { items: updatedItems, itemOrder: newItemOrder }
    })
  },

  addInfoItem: (title, details) => {
    const infoItem: InfoItem = {
      id: `info-${Date.now()}`,
      type: 'info',
      status: 'completed',
      content: { title, details },
      createdAt: Date.now(),
    }
    set((state) => ({
      items: { ...state.items, [infoItem.id]: infoItem },
      itemOrder: [...state.itemOrder, infoItem.id],
    }))
  },

  setSessionOverride: (key, value) => {
    set((state) => ({
      sessionOverrides: {
        ...state.sessionOverrides,
        [key]: value,
      },
    }))
  },

  clearSessionOverrides: () => {
    set({ sessionOverrides: {} })
  },

  // Event Handlers
  handleThreadStarted: (event) => {
    const { activeThread } = get()
    const threadInfo = event.thread

    // Only update if this is the active thread (or no thread is active yet)
    if (activeThread && activeThread.id !== threadInfo.id) {
      console.log('[handleThreadStarted] Ignoring event for different thread:', threadInfo.id)
      return
    }

    console.log('[handleThreadStarted] Thread started event received:', threadInfo.id)

    // Update thread info with any new data from server
    set((state) => ({
      activeThread: state.activeThread
        ? {
            ...state.activeThread,
            model: threadInfo.model ?? state.activeThread.model,
            modelProvider: threadInfo.modelProvider ?? state.activeThread.modelProvider,
            preview: threadInfo.preview ?? state.activeThread.preview,
            cliVersion: threadInfo.cliVersion ?? state.activeThread.cliVersion,
            gitInfo: threadInfo.gitInfo ?? state.activeThread.gitInfo,
          }
        : {
            id: threadInfo.id,
            cwd: threadInfo.cwd,
            model: threadInfo.model ?? undefined,
            modelProvider: threadInfo.modelProvider ?? undefined,
            preview: threadInfo.preview ?? undefined,
            createdAt: threadInfo.createdAt ?? undefined,
            cliVersion: threadInfo.cliVersion ?? undefined,
            gitInfo: threadInfo.gitInfo ?? undefined,
          },
    }))
  },

  handleItemStarted: (event) => {
    const item = toThreadItem(event.item)
    const inProgressItem = {
      ...item,
      status: 'inProgress',
    } as AnyThreadItem

    set((state) => {
      // Check if item already exists (e.g., ItemCompleted arrived first due to race)
      const existing = state.items[item.id]
      if (existing) {
        // Item already exists - don't overwrite with inProgress version
        // Just ensure it's in itemOrder
        return {
          items: state.items,
          itemOrder: state.itemOrder.includes(item.id)
            ? state.itemOrder
            : [...state.itemOrder, item.id],
        }
      }

      let isDuplicateUserMessage = false
      if (inProgressItem.type === 'userMessage') {
        // Check if we already have a user message with the same text
        // We compare only text because:
        // 1. Local message uses base64 images
        // 2. Server might return different image format (paths, URLs)
        // Also check recent messages (last 5) to handle timing issues
        const recentUserIds = [...state.itemOrder]
          .slice(-10)
          .filter((id) => state.items[id]?.type === 'userMessage')
        const nextUser = inProgressItem as UserMessageItem

        for (const userId of recentUserIds) {
          const existingUser = state.items[userId] as UserMessageItem
          if (existingUser && existingUser.content.text === nextUser.content.text) {
            // Same text - consider it duplicate
            // Also check if images count matches (regardless of format)
            const existingImagesCount = existingUser.content.images?.length || 0
            const nextImagesCount = nextUser.content.images?.length || 0
            if (existingImagesCount === nextImagesCount) {
              isDuplicateUserMessage = true
              break
            }
          }
        }
      }

      return {
        items: isDuplicateUserMessage
          ? state.items
          : { ...state.items, [item.id]: inProgressItem },
        itemOrder: isDuplicateUserMessage ? state.itemOrder : [...state.itemOrder, item.id],
      }
    })
  },

  handleItemCompleted: (event) => {
    set((state) => {
      const nextItem = toThreadItem(event.item)
      const existing = state.items[nextItem.id]

      // Check for duplicate user message by content (not just ID)
      // This handles the case where we already added a local user message
      // and the server sends back the same message with a different ID
      if (nextItem.type === 'userMessage') {
        const nextUser = nextItem as UserMessageItem
        const recentUserIds = [...state.itemOrder]
          .slice(-10)
          .filter((id) => state.items[id]?.type === 'userMessage')

        for (const userId of recentUserIds) {
          const existingUser = state.items[userId] as UserMessageItem
          if (existingUser && existingUser.content.text === nextUser.content.text) {
            const existingImagesCount = existingUser.content.images?.length || 0
            const nextImagesCount = nextUser.content.images?.length || 0
            if (existingImagesCount === nextImagesCount) {
              // This is a duplicate, don't add it
              return state
            }
          }
        }
      }

      if (existing) {
        const existingContent = existing.content as Record<string, unknown>
        const nextContent = nextItem.content as Record<string, unknown>
        const updatedItem = {
          ...nextItem,
          status: nextItem.status === 'inProgress' ? 'completed' : nextItem.status,
          content: {
            ...nextContent,
            needsApproval: existingContent.needsApproval ?? nextContent.needsApproval,
            approved: existingContent.approved ?? nextContent.approved,
            applied: existingContent.applied ?? nextContent.applied,
            snapshotId: existingContent.snapshotId ?? nextContent.snapshotId,
            output: existingContent.output ?? nextContent.output,
          },
        } as AnyThreadItem
        return { items: { ...state.items, [nextItem.id]: updatedItem } }
      } else {
        return {
          items: { ...state.items, [nextItem.id]: nextItem },
          itemOrder: state.itemOrder.includes(nextItem.id)
            ? state.itemOrder
            : [...state.itemOrder, nextItem.id],
        }
      }
    })
  },

  handleAgentMessageDelta: (event) => {
    // Log first delta to confirm events are arriving
    const current = deltaBuffer.agentMessages.get(event.itemId) || ''
    const isFirstDelta = current === '' // First character should show immediately
    if (isFirstDelta) {
      console.log('[handleAgentMessageDelta] First delta for item:', event.itemId, 'threadId:', event.threadId)
    }

    // Track the thread ID for this buffer - if it changes, we should clear
    if (deltaBuffer.threadId === null) {
      deltaBuffer.threadId = event.threadId
    } else if (deltaBuffer.threadId !== event.threadId) {
      console.warn('[handleAgentMessageDelta] Thread ID changed, clearing buffer. Old:', deltaBuffer.threadId, 'New:', event.threadId)
      clearDeltaBuffer()
      deltaBuffer.threadId = event.threadId
    }

    // Buffer the delta instead of updating state immediately
    deltaBuffer.agentMessages.set(event.itemId, current + event.delta)
    scheduleFlush(() => get().flushDeltaBuffer(), isFirstDelta)
  },

  handleCommandApprovalRequested: (event) => {
    set((state) => {
      const existing = state.items[event.itemId]
      const updatedItem = {
        ...(existing || {
          id: event.itemId,
          type: 'commandExecution',
          status: 'inProgress',
          content: {
            callId: event.itemId,
            command: '',
            cwd: '',
          },
          createdAt: Date.now(),
        }),
        content: {
          ...((existing?.content || {}) as Record<string, unknown>),
          needsApproval: true,
          reason: event.reason,
          proposedExecpolicyAmendment: event.proposedExecpolicyAmendment,
        },
      } as AnyThreadItem
      return {
        items: { ...state.items, [event.itemId]: updatedItem },
        itemOrder: state.itemOrder.includes(event.itemId)
          ? state.itemOrder
          : [...state.itemOrder, event.itemId],
        pendingApprovals: [
          ...state.pendingApprovals,
          {
            itemId: event.itemId,
            threadId: event.threadId, // Track which thread this approval belongs to
            type: 'command',
            data: event,
            requestId: event._requestId,
            createdAt: Date.now(), // Track when approval was requested for timeout
          },
        ],
      }
    })
  },

  handleFileChangeApprovalRequested: (event) => {
    set((state) => {
      const existing = state.items[event.itemId]
      const updatedItem = {
        ...(existing || {
          id: event.itemId,
          type: 'fileChange',
          status: 'inProgress',
          content: {
            changes: [],
          },
          createdAt: Date.now(),
        }),
        content: {
          ...((existing?.content || {}) as Record<string, unknown>),
          needsApproval: true,
          reason: event.reason,
        },
      } as AnyThreadItem
      return {
        items: { ...state.items, [event.itemId]: updatedItem },
        itemOrder: state.itemOrder.includes(event.itemId)
          ? state.itemOrder
          : [...state.itemOrder, event.itemId],
        pendingApprovals: [
          ...state.pendingApprovals,
          {
            itemId: event.itemId,
            threadId: event.threadId, // Track which thread this approval belongs to
            type: 'fileChange',
            data: event,
            requestId: event._requestId,
            createdAt: Date.now(), // Track when approval was requested for timeout
          },
        ],
      }
    })
  },

  handleTurnStarted: (event) => {
    console.log('[handleTurnStarted] Turn started - threadId:', event.threadId, 'turnId:', event.turn.id)

    // Clear any existing turn timeout
    clearTurnTimeout()

    // Set turn timeout to recover from server crashes
    const turnId = event.turn.id
    turnTimeoutTimer = setTimeout(() => {
      const { currentTurnId, turnStatus } = useThreadStore.getState()
      if (currentTurnId === turnId && turnStatus === 'running') {
        console.error('[handleTurnStarted] Turn timeout - no completion received for turnId:', turnId)
        // Full cleanup on timeout
        performFullTurnCleanup()
        useThreadStore.setState((state) => ({
          turnStatus: 'failed',
          error: 'Turn timed out - server may have disconnected',
          currentTurnId: null,
          pendingApprovals: [],
          queuedMessages: [],
          turnTiming: {
            ...state.turnTiming,
            completedAt: Date.now(),
          },
        }))
      }
    }, TURN_TIMEOUT_MS)

    set({
      turnStatus: 'running',
      currentTurnId: event.turn.id,
      error: null,
      turnTiming: {
        startedAt: Date.now(),
        completedAt: null,
      },
    })
  },

  handleTurnCompleted: (event) => {
    // Clear turn timeout since we received completion
    clearTurnTimeout()

    // Flush any pending deltas before completing the turn
    get().flushDeltaBuffer()
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    const status = event.turn.status

    // Validate turn status before mapping
    const validStatuses = ['completed', 'failed', 'interrupted']
    if (!validStatuses.includes(status)) {
      console.warn(`[handleTurnCompleted] Unexpected turn status: ${status}, treating as completed`)
    }

    const nextTurnStatus: TurnStatus =
      status === 'failed'
        ? 'failed'
        : status === 'interrupted'
        ? 'interrupted'
        : 'completed'

    set((state) => {
      // Mark all streaming items as complete
      const updatedItems = { ...state.items }
      Object.entries(updatedItems).forEach(([id, item]) => {
        if (item.type === 'agentMessage' && (item as AgentMessageItem).content.isStreaming) {
          updatedItems[id] = {
            ...item,
            status: 'completed',
            content: {
              ...(item as AgentMessageItem).content,
              isStreaming: false,
            },
          } as AgentMessageItem
        }
      })

      return {
        items: updatedItems,
        turnStatus: nextTurnStatus,
        currentTurnId: null,
        error: event.turn.error?.message || null,
        pendingApprovals: [],
        queuedMessages: [], // Clear queued messages when turn completes
        turnTiming: {
          ...state.turnTiming,
          completedAt: Date.now(),
        },
      }
    })
  },
  handleTurnDiffUpdated: (event) => {
    const infoItem: InfoItem = {
      id: `diff-${event.turnId}`,
      type: 'info',
      status: 'completed',
      content: {
        title: 'Turn diff updated',
        details: event.diff,
      },
      createdAt: Date.now(),
    }

    set((state) => ({
      items: { ...state.items, [infoItem.id]: infoItem },
      itemOrder: state.itemOrder.includes(infoItem.id)
        ? state.itemOrder
        : [...state.itemOrder, infoItem.id],
    }))
  },

  handleTurnPlanUpdated: (event) => {
    // Map step status from event to PlanStep status
    const mapStepStatus = (status: string): PlanStep['status'] => {
      switch (status.toLowerCase()) {
        case 'completed':
        case 'done':
          return 'completed'
        case 'in_progress':
        case 'inprogress':
        case 'running':
          return 'in_progress'
        case 'failed':
        case 'error':
          return 'failed'
        default:
          return 'pending'
      }
    }

    const steps: PlanStep[] = event.plan.map((step) => ({
      step: step.step,
      status: mapStepStatus(step.status),
    }))

    // Check if any step is in progress
    const isActive = steps.some((s) => s.status === 'in_progress' || s.status === 'pending')

    const planItem: PlanItem = {
      id: `plan-${event.turnId}`,
      type: 'plan',
      status: isActive ? 'inProgress' : 'completed',
      content: {
        explanation: event.explanation ?? undefined,
        steps,
        isActive,
      },
      createdAt: Date.now(),
    }

    set((state) => ({
      items: { ...state.items, [planItem.id]: planItem },
      itemOrder: state.itemOrder.includes(planItem.id)
        ? state.itemOrder
        : [...state.itemOrder, planItem.id],
    }))
  },

  handleThreadCompacted: (event) => {
    const infoItem: InfoItem = {
      id: `compact-${event.turnId}`,
      type: 'info',
      status: 'completed',
      content: {
        title: 'Context compacted',
        details: 'Conversation context was compacted to stay within limits.',
      },
      createdAt: Date.now(),
    }

    set((state) => ({
      items: { ...state.items, [infoItem.id]: infoItem },
      itemOrder: state.itemOrder.includes(infoItem.id)
        ? state.itemOrder
        : [...state.itemOrder, infoItem.id],
    }))
  },

  handleCommandExecutionOutputDelta: (event) => {
    // Track the thread ID for this buffer
    if (deltaBuffer.threadId === null) {
      deltaBuffer.threadId = event.threadId
    } else if (deltaBuffer.threadId !== event.threadId) {
      clearDeltaBuffer()
      deltaBuffer.threadId = event.threadId
    }

    // Buffer the delta instead of updating state immediately
    const current = deltaBuffer.commandOutputs.get(event.itemId) || ''
    const isFirstDelta = current === ''
    deltaBuffer.commandOutputs.set(event.itemId, current + event.delta)
    scheduleFlush(() => get().flushDeltaBuffer(), isFirstDelta)
  },

  handleFileChangeOutputDelta: (event) => {
    // Track the thread ID for this buffer
    if (deltaBuffer.threadId === null) {
      deltaBuffer.threadId = event.threadId
    } else if (deltaBuffer.threadId !== event.threadId) {
      clearDeltaBuffer()
      deltaBuffer.threadId = event.threadId
    }

    // Buffer the delta instead of updating state immediately
    const current = deltaBuffer.fileChangeOutputs.get(event.itemId) || ''
    const isFirstDelta = current === ''
    deltaBuffer.fileChangeOutputs.set(event.itemId, current + event.delta)
    scheduleFlush(() => get().flushDeltaBuffer(), isFirstDelta)
  },

  handleReasoningSummaryTextDelta: (event) => {
    // Track the thread ID for this buffer
    if (deltaBuffer.threadId === null) {
      deltaBuffer.threadId = event.threadId
    } else if (deltaBuffer.threadId !== event.threadId) {
      clearDeltaBuffer()
      deltaBuffer.threadId = event.threadId
    }

    // Buffer the delta instead of updating state immediately
    const index = event.summaryIndex ?? 0
    const updates = deltaBuffer.reasoningSummaries.get(event.itemId) || []
    const isFirstDelta = updates.length === 0
    const existingIdx = updates.findIndex((u) => u.index === index)
    if (existingIdx >= 0) {
      updates[existingIdx].text += event.delta
    } else {
      updates.push({ index, text: event.delta })
    }
    deltaBuffer.reasoningSummaries.set(event.itemId, updates)
    scheduleFlush(() => get().flushDeltaBuffer(), isFirstDelta)
  },

  handleReasoningSummaryPartAdded: () => {
    // This just initializes a slot, the actual text comes from TextDelta
    // No state update needed - the slot will be created when text arrives
  },

  handleReasoningTextDelta: (event) => {
    // Track the thread ID for this buffer
    if (deltaBuffer.threadId === null) {
      deltaBuffer.threadId = event.threadId
    } else if (deltaBuffer.threadId !== event.threadId) {
      clearDeltaBuffer()
      deltaBuffer.threadId = event.threadId
    }

    // Buffer the delta instead of updating state immediately
    const index = event.contentIndex ?? 0
    const updates = deltaBuffer.reasoningContents.get(event.itemId) || []
    const isFirstDelta = updates.length === 0
    const existingIdx = updates.findIndex((u) => u.index === index)
    if (existingIdx >= 0) {
      updates[existingIdx].text += event.delta
    } else {
      updates.push({ index, text: event.delta })
    }
    deltaBuffer.reasoningContents.set(event.itemId, updates)
    scheduleFlush(() => get().flushDeltaBuffer(), isFirstDelta)
  },

  handleMcpToolCallProgress: (event) => {
    // Track the thread ID for this buffer
    if (deltaBuffer.threadId === null) {
      deltaBuffer.threadId = event.threadId
    } else if (deltaBuffer.threadId !== event.threadId) {
      clearDeltaBuffer()
      deltaBuffer.threadId = event.threadId
    }

    // Buffer the progress message instead of updating state immediately
    const messages = deltaBuffer.mcpProgress.get(event.itemId) || []
    const isFirstMessage = messages.length === 0
    messages.push(event.message)
    deltaBuffer.mcpProgress.set(event.itemId, messages)
    scheduleFlush(() => get().flushDeltaBuffer(), isFirstMessage)
  },

  // Token Usage Handler
  handleTokenUsage: (event) => {
    set((state) => {
      const totals = event.tokenUsage?.total
      const fallbackInput = state.tokenUsage.inputTokens
      const fallbackCached = state.tokenUsage.cachedInputTokens
      const fallbackOutput = state.tokenUsage.outputTokens

      const newInput = totals?.inputTokens ?? fallbackInput
      const newCached = totals?.cachedInputTokens ?? fallbackCached
      const newOutput = totals?.outputTokens ?? fallbackOutput
      const totalTokens = totals?.totalTokens ?? newInput + newOutput

      // Get context window from event (dynamic based on model)
      const modelContextWindow = event.tokenUsage?.modelContextWindow ?? state.tokenUsage.modelContextWindow

      return {
        tokenUsage: {
          inputTokens: newInput,
          cachedInputTokens: newCached,
          outputTokens: newOutput,
          totalTokens,
          modelContextWindow,
        },
      }
    })
  },

  // Stream Error Handler
  handleStreamError: (event) => {
    const errorInfo =
      event.error.codexErrorInfo && typeof event.error.codexErrorInfo === 'object'
        ? JSON.stringify(event.error.codexErrorInfo)
        : event.error.codexErrorInfo
    const errorItem: ErrorItem = {
      id: `error-${Date.now()}`,
      type: 'error',
      status: 'completed',
      content: {
        message: event.error.message,
        errorType: errorInfo ? String(errorInfo) : undefined,
        willRetry: event.willRetry,
      },
      createdAt: Date.now(),
    }

    set((state) => ({
      items: { ...state.items, [errorItem.id]: errorItem },
      itemOrder: [...state.itemOrder, errorItem.id],
      error: event.error.message,
      turnStatus: event.willRetry ? state.turnStatus : 'failed',
    }))
  },

  // Rate Limit Exceeded Handler
  handleRateLimitExceeded: (event) => {
    const { activeThread } = get()
    if (!activeThread || activeThread.id !== event.threadId) return

    console.warn('[handleRateLimitExceeded] Rate limit exceeded:', event)

    // Perform full cleanup
    performFullTurnCleanup()

    // Set error state with retry information if available
    const errorMessage = event.retryAfterMs
      ? `Rate limit exceeded. Retry after ${Math.ceil(event.retryAfterMs / 1000)} seconds.`
      : 'Rate limit exceeded. Please wait before sending more messages.'

    // Complete state cleanup (consistent with handleTurnCompleted and handleServerDisconnected)
    set((state) => ({
      turnStatus: 'failed',
      error: errorMessage,
      currentTurnId: null,
      pendingApprovals: [],
      queuedMessages: [],
      turnTiming: {
        ...state.turnTiming,
        completedAt: Date.now(),
      },
    }))
  },

  // Server Disconnected Handler
  handleServerDisconnected: () => {
    const { turnStatus } = get()
    console.warn('[handleServerDisconnected] Server disconnected, turnStatus:', turnStatus)

    // Perform full cleanup
    performFullTurnCleanup()

    // If a turn was running, mark it as failed
    if (turnStatus === 'running') {
      set((state) => ({
        turnStatus: 'failed',
        error: 'Server disconnected. Please try again.',
        currentTurnId: null,
        pendingApprovals: [],
        queuedMessages: [],
        turnTiming: {
          ...state.turnTiming,
          completedAt: Date.now(),
        },
      }))
    } else {
      // Even if not running, set an error to inform the user
      set({
        error: 'Server disconnected. Connection will be restored automatically.',
      })
    }
  },

  // Snapshot Actions
  createSnapshot: async (projectPath) => {
    const { activeThread } = get()
    if (!activeThread) {
      throw new Error('No active thread')
    }

    const threadId = activeThread.id
    const snapshot = await snapshotApi.create(threadId, projectPath)

    // Validate thread hasn't changed during API call
    const { activeThread: currentActive } = get()
    if (!currentActive || currentActive.id !== threadId) {
      console.warn('[createSnapshot] Thread changed, discarding snapshot update')
      return snapshot
    }

    set((state) => ({
      snapshots: [snapshot, ...state.snapshots],
    }))
    return snapshot
  },

  revertToSnapshot: async (snapshotId, projectPath) => {
    await snapshotApi.revert(snapshotId, projectPath)
  },

  fetchSnapshots: async () => {
    const { activeThread } = get()
    if (!activeThread) return

    const threadId = activeThread.id
    try {
      const snapshots = await snapshotApi.list(threadId)

      // Validate thread hasn't changed during API call
      const { activeThread: currentActive } = get()
      if (!currentActive || currentActive.id !== threadId) {
        console.warn('[fetchSnapshots] Thread changed, discarding snapshot list')
        return
      }

      set({ snapshots })
    } catch (error) {
      console.error('Failed to fetch snapshots:', error)
    }
  },
}))
