import { create } from 'zustand'
import { threadApi, snapshotApi, type ThreadInfo, type Snapshot, type SkillInput } from '../lib/api'
import { parseError, handleAsyncError } from '../lib/errorUtils'
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

// ==================== Constants ====================

const MAX_PARALLEL_SESSIONS = 5
const FLUSH_INTERVAL_MS = 50 // 20 FPS
const MAX_BUFFER_SIZE = 500_000 // 500KB - force flush to prevent memory issues
const TURN_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes - generous timeout for long operations
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes - generous timeout for user decisions
const APPROVAL_CLEANUP_INTERVAL_MS = 60 * 1000 // Check every minute

// ==================== Operation Sequence Tracking ====================
// Prevents race conditions when switching threads during async operations

let operationSequence = 0
function getNextOperationSequence(): number {
  return ++operationSequence
}
function getCurrentOperationSequence(): number {
  return operationSequence
}

// ==================== Delta Batching for Smooth Streaming ====================
// Per-thread delta buffers to accumulate delta updates

interface DeltaBuffer {
  turnId: string | null
  operationSeq: number
  agentMessages: Map<string, string> // itemId -> accumulated text
  commandOutputs: Map<string, string> // itemId -> accumulated output
  fileChangeOutputs: Map<string, string> // itemId -> accumulated output
  reasoningSummaries: Map<string, { index: number; text: string }[]> // itemId -> summaries
  reasoningContents: Map<string, { index: number; text: string }[]> // itemId -> content
  mcpProgress: Map<string, string[]> // itemId -> accumulated progress messages
}

// Per-thread delta buffers
const deltaBuffers: Map<string, DeltaBuffer> = new Map()

// Per-thread flush timers
const flushTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

// Per-thread turn timeout timers
const turnTimeoutTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

// Set of threads currently being closed - prevents race conditions
// where delta events might recreate buffers during closeThread
const closingThreads: Set<string> = new Set()

// Global approval cleanup timer
let approvalCleanupTimer: ReturnType<typeof setInterval> | null = null

function createEmptyDeltaBuffer(): DeltaBuffer {
  return {
    turnId: null,
    operationSeq: getCurrentOperationSequence(),
    agentMessages: new Map(),
    commandOutputs: new Map(),
    fileChangeOutputs: new Map(),
    reasoningSummaries: new Map(),
    reasoningContents: new Map(),
    mcpProgress: new Map(),
  }
}

function getDeltaBuffer(threadId: string): DeltaBuffer | null {
  // Check if thread is being closed - don't create new buffers for closing threads
  if (closingThreads.has(threadId)) {
    return null
  }
  let buffer = deltaBuffers.get(threadId)
  if (!buffer) {
    buffer = createEmptyDeltaBuffer()
    deltaBuffers.set(threadId, buffer)
  }
  return buffer
}

function clearDeltaBuffer(threadId: string) {
  const buffer = deltaBuffers.get(threadId)
  if (buffer) {
    buffer.turnId = null
    buffer.operationSeq = getCurrentOperationSequence()
    buffer.agentMessages.clear()
    buffer.commandOutputs.clear()
    buffer.fileChangeOutputs.clear()
    buffer.reasoningSummaries.clear()
    buffer.reasoningContents.clear()
    buffer.mcpProgress.clear()
  }
  const timer = flushTimers.get(threadId)
  if (timer) {
    clearTimeout(timer)
    flushTimers.delete(threadId)
  }
}

function clearTurnTimeout(threadId: string) {
  const timer = turnTimeoutTimers.get(threadId)
  if (timer) {
    clearTimeout(timer)
    turnTimeoutTimers.delete(threadId)
  }
}

// Calculate buffer size for overflow detection
function getBufferSize(buffer: DeltaBuffer): number {
  let size = 0
  buffer.agentMessages.forEach((text) => { size += text.length })
  buffer.commandOutputs.forEach((text) => { size += text.length })
  buffer.fileChangeOutputs.forEach((text) => { size += text.length })
  buffer.reasoningSummaries.forEach((arr) => {
    arr.forEach((item) => { size += item.text.length })
  })
  buffer.reasoningContents.forEach((arr) => {
    arr.forEach((item) => { size += item.text.length })
  })
  buffer.mcpProgress.forEach((arr) => {
    arr.forEach((msg) => { size += msg.length })
  })
  return size
}

// Schedule a flush for a specific thread
function scheduleFlush(threadId: string, flushFn: () => void, immediate = false) {
  const buffer = getDeltaBuffer(threadId)
  // If buffer is null, thread is closing - don't schedule flush
  if (!buffer) return

  // Check for buffer overflow - force flush if too large
  if (getBufferSize(buffer) > MAX_BUFFER_SIZE) {
    const timer = flushTimers.get(threadId)
    if (timer) {
      clearTimeout(timer)
      flushTimers.delete(threadId)
    }
    flushFn()
    return
  }

  const existingTimer = flushTimers.get(threadId)
  if (immediate && !existingTimer) {
    // First delta: flush immediately for instant first-character display
    flushFn()
    return
  }
  if (!existingTimer) {
    const timer = setTimeout(() => {
      flushTimers.delete(threadId)
      flushFn()
    }, FLUSH_INTERVAL_MS)
    flushTimers.set(threadId, timer)
  }
}

// Full turn cleanup for a specific thread
function performFullTurnCleanup(threadId: string) {
  clearDeltaBuffer(threadId)
  clearTurnTimeout(threadId)
}

// ==================== Approval Cleanup ====================

// Clean up stale pending approvals that have exceeded the timeout
async function cleanupStaleApprovals() {
  const now = Date.now()
  const state = useThreadStore.getState()
  const { threads } = state

  // Process each thread's approvals
  Object.entries(threads).forEach(([threadId, threadState]) => {
    const staleApprovals = threadState.pendingApprovals.filter(
      (approval) => now - approval.createdAt > APPROVAL_TIMEOUT_MS
    )

    // Send cancel responses to backend for stale approvals
    if (staleApprovals.length > 0) {
      console.warn(
        '[cleanupStaleApprovals] Cancelling',
        staleApprovals.length,
        'timed-out approvals for thread:',
        threadId,
        staleApprovals.map((a) => a.itemId)
      )

      staleApprovals.forEach((approval) => {
        threadApi
          .respondToApproval(threadId, approval.itemId, 'cancel', approval.requestId)
          .catch((err) => {
            console.warn('[cleanupStaleApprovals] Failed to cancel approval:', approval.itemId, err)
          })
      })
    }
  })

  // Update state to remove stale approvals
  useThreadStore.setState((state) => {
    const updatedThreads = { ...state.threads }
    let hasChanges = false

    Object.entries(updatedThreads).forEach(([threadId, threadState]) => {
      const validApprovals = threadState.pendingApprovals.filter(
        (approval) => now - approval.createdAt <= APPROVAL_TIMEOUT_MS
      )

      if (validApprovals.length !== threadState.pendingApprovals.length) {
        hasChanges = true
        const updatedItems = { ...threadState.items }

        // Update items for stale approvals
        threadState.pendingApprovals
          .filter((approval) => now - approval.createdAt > APPROVAL_TIMEOUT_MS)
          .forEach((approval) => {
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

        updatedThreads[threadId] = {
          ...threadState,
          items: updatedItems,
          pendingApprovals: validApprovals,
        }
      }
    })

    return hasChanges ? { threads: updatedThreads } : state
  })
}

function startApprovalCleanupTimer() {
  if (approvalCleanupTimer === null) {
    approvalCleanupTimer = setInterval(cleanupStaleApprovals, APPROVAL_CLEANUP_INTERVAL_MS)
  }
}

function stopApprovalCleanupTimer() {
  if (approvalCleanupTimer !== null) {
    clearInterval(approvalCleanupTimer)
    approvalCleanupTimer = null
  }
}

// Export cleanup function for App.tsx unmount cleanup
// This prevents memory leaks when the app is unmounted
export function cleanupThreadResources() {
  stopApprovalCleanupTimer()
  // Clear all delta buffers and timers
  deltaBuffers.forEach((_, threadId) => {
    clearDeltaBuffer(threadId)
    clearTurnTimeout(threadId)
  })
  deltaBuffers.clear()
  flushTimers.clear()
  turnTimeoutTimers.clear()
  closingThreads.clear()
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

interface ThreadState {
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

// ==================== Helper Functions ====================

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
  if (!status) return 'completed'
  const normalized = status.toLowerCase()
  switch (normalized) {
    case 'completed':
      return 'completed'
    case 'failed':
    case 'declined':
    case 'cancelled':
    case 'canceled':
    case 'aborted':
    case 'interrupted':
      return 'failed'
    case 'inprogress':
    case 'in_progress':
    case 'in-progress':
    case 'running':
    case 'open':
      return 'inProgress'
    case 'pending':
    case 'queued':
      return 'pending'
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

// ==================== Default Values ====================

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

function createEmptyThreadState(thread: ThreadInfo): SingleThreadState {
  return {
    thread,
    items: {},
    itemOrder: [],
    turnStatus: 'idle',
    currentTurnId: null,
    pendingApprovals: [],
    tokenUsage: defaultTokenUsage,
    turnTiming: defaultTurnTiming,
    sessionOverrides: {},
    queuedMessages: [],
    error: null,
  }
}

// Helper to get focused thread state
function getFocusedThreadState(state: ThreadState): SingleThreadState | undefined {
  if (!state.focusedThreadId) return undefined
  return state.threads[state.focusedThreadId]
}

// ==================== Store ====================

export const useThreadStore = create<ThreadState>((set, get) => {
  const enqueueQueuedMessage = (threadId: string, message: QueuedMessage) => {
    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            queuedMessages: [...threadState.queuedMessages, message],
          },
        },
      }
    })
  }

  const dequeueQueuedMessage = (threadId: string): QueuedMessage | null => {
    const threadState = get().threads[threadId]
    if (!threadState || threadState.queuedMessages.length === 0) return null
    const nextMessage = threadState.queuedMessages[0]

    set((state) => {
      const currentThread = state.threads[threadId]
      if (!currentThread) return state
      if (currentThread.queuedMessages[0]?.id !== nextMessage.id) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...currentThread,
            queuedMessages: currentThread.queuedMessages.slice(1),
          },
        },
      }
    })

    return nextMessage
  }

  const requeueMessageFront = (threadId: string, message: QueuedMessage) => {
    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            queuedMessages: [message, ...threadState.queuedMessages],
          },
        },
      }
    })
  }

  const dispatchNextQueuedMessage = async (threadId: string) => {
    const threadState = get().threads[threadId]
    if (!threadState || threadState.turnStatus === 'running') return

    const nextMessage = dequeueQueuedMessage(threadId)
    if (!nextMessage) return

    try {
      await get().sendMessage(nextMessage.text, nextMessage.images, nextMessage.skills, threadId)
    } catch (error) {
      requeueMessageFront(threadId, nextMessage)
      throw error
    }
  }

  return {
  // Multi-thread state
  threads: {},
  focusedThreadId: null,
  maxSessions: MAX_PARALLEL_SESSIONS,

  // Global state
  snapshots: [],
  isLoading: false,
  globalError: null,

  // Backward-compatible getters
  get activeThread() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.thread ?? null
  },

  get items() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.items ?? {}
  },

  get itemOrder() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.itemOrder ?? []
  },

  get turnStatus() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.turnStatus ?? 'idle'
  },

  get currentTurnId() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.currentTurnId ?? null
  },

  get pendingApprovals() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.pendingApprovals ?? []
  },

  get tokenUsage() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.tokenUsage ?? defaultTokenUsage
  },

  get turnTiming() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.turnTiming ?? defaultTurnTiming
  },

  get sessionOverrides() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.sessionOverrides ?? {}
  },

  get queuedMessages() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.queuedMessages ?? []
  },

  get error() {
    const state = get()
    const focusedState = getFocusedThreadState(state)
    return focusedState?.error ?? state.globalError
  },

  // ==================== Multi-Session Actions ====================

  switchThread: (threadId) => {
    const { threads } = get()
    if (!threads[threadId]) {
      console.warn('[switchThread] Thread not found:', threadId)
      return
    }
    set({ focusedThreadId: threadId })
  },

  closeThread: (threadId) => {
    const { threads, focusedThreadId } = get()
    if (!threads[threadId]) {
      console.warn('[closeThread] Thread not found:', threadId)
      return
    }

    // Mark thread as closing to prevent race conditions with delta events
    // This prevents getDeltaBuffer from recreating buffers during cleanup
    closingThreads.add(threadId)

    // Clean up thread-specific resources
    clearDeltaBuffer(threadId)
    clearTurnTimeout(threadId)
    deltaBuffers.delete(threadId)

    // Remove thread from state
    const updatedThreads = { ...threads }
    delete updatedThreads[threadId]

    // Update focused thread if the closed one was focused
    let newFocusedId = focusedThreadId
    if (focusedThreadId === threadId) {
      const remainingIds = Object.keys(updatedThreads)
      newFocusedId = remainingIds.length > 0 ? remainingIds[0] : null
    }

    set({
      threads: updatedThreads,
      focusedThreadId: newFocusedId,
    })

    // Stop approval cleanup if no threads left
    if (Object.keys(updatedThreads).length === 0) {
      stopApprovalCleanupTimer()
    }

    // Remove from closing set after a short delay to ensure all pending events are handled
    setTimeout(() => {
      closingThreads.delete(threadId)
    }, 100)
  },

  closeAllThreads: () => {
    const { threads } = get()

    // Clean up all thread-specific resources
    Object.keys(threads).forEach((threadId) => {
      clearDeltaBuffer(threadId)
      clearTurnTimeout(threadId)
      deltaBuffers.delete(threadId)
    })

    // Clear all threads
    set({
      threads: {},
      focusedThreadId: null,
    })

    // Stop approval cleanup timer
    stopApprovalCleanupTimer()
  },

  getActiveThreadIds: () => {
    return Object.keys(get().threads)
  },

  canAddSession: () => {
    const { threads, maxSessions } = get()
    return Object.keys(threads).length < maxSessions
  },

  // ==================== Thread Lifecycle ====================

  startThread: async (projectId, cwd, model, sandboxMode, approvalPolicy) => {
    const { threads, maxSessions } = get()

    // Check if we can add another session
    if (Object.keys(threads).length >= maxSessions) {
      throw new Error(`Maximum number of parallel sessions (${maxSessions}) reached. Please close a session first.`)
    }

    const opSeq = getNextOperationSequence()
    startApprovalCleanupTimer()

    set({ isLoading: true, globalError: null })
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

      if (getCurrentOperationSequence() !== opSeq) {
        console.warn('[startThread] Another operation started, discarding result')
        return
      }

      const threadId = response.thread.id
      const newThreadState = createEmptyThreadState(response.thread)

      set((state) => ({
        threads: {
          ...state.threads,
          [threadId]: newThreadState,
        },
        focusedThreadId: threadId,
        isLoading: false,
        globalError: null,
      }))
    } catch (error) {
      if (getCurrentOperationSequence() === opSeq) {
        set({ globalError: parseError(error), isLoading: false })
      }
      throw error
    }
  },

  resumeThread: async (threadId) => {
    console.log('[resumeThread] Starting resume with threadId:', threadId)

    const { threads, maxSessions } = get()

    // If thread already exists in our store, just switch to it
    if (threads[threadId]) {
      set({ focusedThreadId: threadId })
      return
    }

    // Check if we can add another session
    if (Object.keys(threads).length >= maxSessions) {
      throw new Error(`Maximum number of parallel sessions (${maxSessions}) reached. Please close a session first.`)
    }

    const opSeq = getNextOperationSequence()
    startApprovalCleanupTimer()

    set({ isLoading: true, globalError: null })
    try {
      const response = await threadApi.resume(threadId)

      if (getCurrentOperationSequence() !== opSeq) {
        console.warn('[resumeThread] Another operation started, discarding result for threadId:', threadId)
        return
      }

      console.log('[resumeThread] Resume response - thread.id:', response.thread.id, 'requested threadId:', threadId)

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

      const newThreadState: SingleThreadState = {
        thread: response.thread,
        items,
        itemOrder,
        turnStatus: 'idle',
        currentTurnId: null,
        pendingApprovals: [],
        tokenUsage: defaultTokenUsage,
        turnTiming: defaultTurnTiming,
        sessionOverrides: {},
        queuedMessages: [],
        error: null,
      }

      set((state) => ({
        threads: {
          ...state.threads,
          [response.thread.id]: newThreadState,
        },
        focusedThreadId: response.thread.id,
        isLoading: false,
        globalError: null,
      }))

      // Sync session status to 'idle' after successful resume
      // This ensures the UI reflects the correct state (not stale 'running' from previous session)
      import('../stores/sessions').then(({ useSessionsStore }) => {
        useSessionsStore.getState().updateSessionStatus(response.thread.id, 'idle')
      }).catch((err) => handleAsyncError(err, 'resumeThread session sync', 'thread'))

      console.log('[resumeThread] Resume completed, activeThread.id:', response.thread.id)
    } catch (error) {
      console.error('[resumeThread] Resume failed:', error)
      if (getCurrentOperationSequence() === opSeq) {
        set({
          globalError: parseError(error),
          isLoading: false,
        })
      }
      throw error
    }
  },

  sendMessage: async (text, images, skills, threadIdOverride) => {
    const { focusedThreadId, threads } = get()
    const threadId = threadIdOverride ?? focusedThreadId
    if (!threadId || !threads[threadId]) {
      throw new Error('No active thread')
    }

    const threadState = threads[threadId]

    // Queue messages if a turn is running or if backlog exists
    if (threadState.turnStatus === 'running' || threadState.queuedMessages.length > 0) {
      console.log('[sendMessage] Turn already running or backlog exists, queueing message')
      const queuedMsg: QueuedMessage = {
        id: `queued-${Date.now()}`,
        text,
        images,
        skills,
        queuedAt: Date.now(),
      }
      enqueueQueuedMessage(threadId, queuedMsg)
      if (threadState.turnStatus !== 'running') {
        queueMicrotask(() => {
          void dispatchNextQueuedMessage(threadId)
        })
      }
      return
    }

    console.log('[sendMessage] Sending message to thread:', threadId)

    // Add user message to items
    const userMessageId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const userMessage: UserMessageItem = {
      id: userMessageId,
      type: 'userMessage',
      status: 'completed',
      content: { text, images },
      createdAt: Date.now(),
    }

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [userMessageId]: userMessage },
            itemOrder: [...threadState.itemOrder, userMessageId],
            turnStatus: 'running',
          },
        },
      }
    })

    try {
      const { settings } = useSettingsStore.getState()
      const currentThreadState = get().threads[threadId]
      if (!currentThreadState) throw new Error('Thread not found')

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
      if (currentThreadState.sessionOverrides.model) options.model = currentThreadState.sessionOverrides.model
      if (currentThreadState.sessionOverrides.approvalPolicy)
        options.approvalPolicy = currentThreadState.sessionOverrides.approvalPolicy
      if (currentThreadState.sessionOverrides.sandboxPolicy)
        options.sandboxPolicy = currentThreadState.sessionOverrides.sandboxPolicy

      const response = await threadApi.sendMessage(
        threadId,
        text,
        images,
        skills,
        Object.keys(options).length ? options : undefined
      )

      // Verify thread still exists
      const { threads: currentThreads } = get()
      if (!currentThreads[threadId]) {
        console.warn('[sendMessage] Thread closed during send, discarding result')
        return
      }

      set((state) => {
        const threadState = state.threads[threadId]
        if (!threadState) return state
        return {
          threads: {
            ...state.threads,
            [threadId]: {
              ...threadState,
              currentTurnId: response.turn.id,
            },
          },
        }
      })
    } catch (error) {
      clearTurnTimeout(threadId)

      const { threads: currentThreads } = get()
      if (currentThreads[threadId]) {
        set((state) => {
          const threadState = state.threads[threadId]
          if (!threadState) return state
          const newItems = { ...threadState.items }
          delete newItems[userMessageId]
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...threadState,
                items: newItems,
                itemOrder: threadState.itemOrder.filter((id) => id !== userMessageId),
                turnStatus: 'failed',
                error: String(error),
              },
            },
          }
        })
      }
      throw error
    }
  },

  interrupt: async () => {
    const { focusedThreadId, threads } = get()
    if (!focusedThreadId || !threads[focusedThreadId]) {
      console.warn('[interrupt] No active thread')
      return
    }

    const threadState = threads[focusedThreadId]
    if (threadState.turnStatus !== 'running') {
      console.warn('[interrupt] Turn is not running, status:', threadState.turnStatus)
      return
    }

    const threadId = focusedThreadId
    try {
      set((state) => {
        const threadState = state.threads[threadId]
        if (!threadState) return state
        return {
          threads: {
            ...state.threads,
            [threadId]: {
              ...threadState,
              turnStatus: 'interrupted',
            },
          },
        }
      })

      performFullTurnCleanup(threadId)

      set((state) => {
        const threadState = state.threads[threadId]
        if (!threadState) return state
        return {
          threads: {
            ...state.threads,
            [threadId]: {
              ...threadState,
              currentTurnId: null,
              pendingApprovals: [],
              turnTiming: {
                ...threadState.turnTiming,
                completedAt: Date.now(),
              },
            },
          },
        }
      })

      await threadApi.interrupt(threadId)
    } catch (error) {
      console.error('[interrupt] Failed to interrupt:', error)
      const { threads: currentThreads } = get()
      if (currentThreads[threadId]) {
        set((state) => {
          const threadState = state.threads[threadId]
          if (!threadState) return state
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...threadState,
                error: parseError(error),
              },
            },
          }
        })
      }
    }
  },

  respondToApproval: async (itemId, decision, options) => {
    const { focusedThreadId, threads } = get()
    if (!focusedThreadId || !threads[focusedThreadId]) return

    const threadState = threads[focusedThreadId]
    const threadId = focusedThreadId

    const pendingApproval = threadState.pendingApprovals.find((p) => p.itemId === itemId)
    if (!pendingApproval) {
      console.error('No pending approval found for itemId:', itemId)
      return
    }

    if (pendingApproval.threadId !== threadId) {
      console.error(
        '[respondToApproval] Thread mismatch - approval.threadId:',
        pendingApproval.threadId,
        'threadId:',
        threadId
      )
      set((state) => {
        const threadState = state.threads[threadId]
        if (!threadState) return state
        return {
          threads: {
            ...state.threads,
            [threadId]: {
              ...threadState,
              pendingApprovals: threadState.pendingApprovals.filter((p) => p.itemId !== itemId),
            },
          },
        }
      })
      return
    }

    try {
      await threadApi.respondToApproval(
        threadId,
        itemId,
        decision,
        pendingApproval.requestId,
        options?.execpolicyAmendment
      )

      const { threads: currentThreads } = get()
      if (!currentThreads[threadId]) {
        console.warn('[respondToApproval] Thread closed, discarding state update')
        return
      }

      set((state) => {
        const threadState = state.threads[threadId]
        if (!threadState) return state

        const item = threadState.items[itemId]
        if (item && (item.type === 'commandExecution' || item.type === 'fileChange')) {
          const content = item.content as Record<string, unknown>
          const isApproved =
            decision === 'accept' ||
            decision === 'acceptForSession' ||
            decision === 'acceptWithExecpolicyAmendment'

          const extraFields =
            item.type === 'fileChange' && isApproved
              ? {
                  applied: true,
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
            threads: {
              ...state.threads,
              [threadId]: {
                ...threadState,
                items: { ...threadState.items, [itemId]: updatedItem },
                pendingApprovals: threadState.pendingApprovals.filter((p) => p.itemId !== itemId),
              },
            },
          }
        }

        return {
          threads: {
            ...state.threads,
            [threadId]: {
              ...threadState,
              pendingApprovals: threadState.pendingApprovals.filter((p) => p.itemId !== itemId),
            },
          },
        }
      })
    } catch (error) {
      const { threads: currentThreads } = get()
      if (currentThreads[threadId]) {
        set((state) => {
          const threadState = state.threads[threadId]
          if (!threadState) return state
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...threadState,
                error: parseError(error),
              },
            },
          }
        })
      }
      throw error
    }
  },

  clearThread: () => {
    const { focusedThreadId } = get()
    if (focusedThreadId) {
      get().closeThread(focusedThreadId)
    }
  },

  flushDeltaBuffer: (threadId?: string) => {
    const targetThreadId = threadId ?? get().focusedThreadId
    if (!targetThreadId) return

    const { threads } = get()
    const threadState = threads[targetThreadId]
    if (!threadState) {
      clearDeltaBuffer(targetThreadId)
      return
    }

    const buffer = deltaBuffers.get(targetThreadId)
    if (!buffer) return

    const hasAgentMessages = buffer.agentMessages.size > 0
    const hasCommandOutputs = buffer.commandOutputs.size > 0
    const hasFileChangeOutputs = buffer.fileChangeOutputs.size > 0
    const hasReasoningSummaries = buffer.reasoningSummaries.size > 0
    const hasReasoningContents = buffer.reasoningContents.size > 0
    const hasMcpProgress = buffer.mcpProgress.size > 0

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
      const threadState = state.threads[targetThreadId]
      if (!threadState) return state

      const updatedItems = { ...threadState.items }
      let newItemOrder = threadState.itemOrder

      // Apply agent message deltas
      buffer.agentMessages.forEach((text, itemId) => {
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
      buffer.commandOutputs.forEach((output, itemId) => {
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
      buffer.fileChangeOutputs.forEach((output, itemId) => {
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
      buffer.reasoningSummaries.forEach((updates, itemId) => {
        const existing = updatedItems[itemId] as ReasoningItem | undefined
        if (existing && existing.type === 'reasoning') {
          const summary = [...existing.content.summary]
          updates.forEach(({ index, text }) => {
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
      buffer.reasoningContents.forEach((updates, itemId) => {
        const existing = updatedItems[itemId] as ReasoningItem | undefined
        if (existing && existing.type === 'reasoning') {
          const fullContent = existing.content.fullContent ? [...existing.content.fullContent] : []
          updates.forEach(({ index, text }) => {
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
      buffer.mcpProgress.forEach((messages, itemId) => {
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
      buffer.agentMessages.clear()
      buffer.commandOutputs.clear()
      buffer.fileChangeOutputs.clear()
      buffer.reasoningSummaries.clear()
      buffer.reasoningContents.clear()
      buffer.mcpProgress.clear()

      return {
        threads: {
          ...state.threads,
          [targetThreadId]: {
            ...threadState,
            items: updatedItems,
            itemOrder: newItemOrder,
          },
        },
      }
    })
  },

  addInfoItem: (title, details) => {
    const { focusedThreadId } = get()
    if (!focusedThreadId) return

    const infoItem: InfoItem = {
      id: `info-${Date.now()}`,
      type: 'info',
      status: 'completed',
      content: { title, details },
      createdAt: Date.now(),
    }

    set((state) => {
      const threadState = state.threads[focusedThreadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [focusedThreadId]: {
            ...threadState,
            items: { ...threadState.items, [infoItem.id]: infoItem },
            itemOrder: [...threadState.itemOrder, infoItem.id],
          },
        },
      }
    })
  },

  setSessionOverride: (key, value) => {
    const { focusedThreadId } = get()
    if (!focusedThreadId) return

    set((state) => {
      const threadState = state.threads[focusedThreadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [focusedThreadId]: {
            ...threadState,
            sessionOverrides: {
              ...threadState.sessionOverrides,
              [key]: value,
            },
          },
        },
      }
    })
  },

  clearSessionOverrides: () => {
    const { focusedThreadId } = get()
    if (!focusedThreadId) return

    set((state) => {
      const threadState = state.threads[focusedThreadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [focusedThreadId]: {
            ...threadState,
            sessionOverrides: {},
          },
        },
      }
    })
  },

  // ==================== Event Handlers ====================
  // All event handlers now route by threadId from the event

  handleThreadStarted: (event) => {
    const threadInfo = event.thread
    const threadId = threadInfo.id

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) {
        // Thread not in our store yet, will be added by startThread/resumeThread
        return state
      }

      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            thread: {
              ...threadState.thread,
              model: threadInfo.model ?? threadState.thread.model,
              modelProvider: threadInfo.modelProvider ?? threadState.thread.modelProvider,
              preview: threadInfo.preview ?? threadState.thread.preview,
              cliVersion: threadInfo.cliVersion ?? threadState.thread.cliVersion,
              gitInfo: threadInfo.gitInfo ?? threadState.thread.gitInfo,
            },
          },
        },
      }
    })
  },

  handleItemStarted: (event) => {
    const threadId = event.threadId
    const item = toThreadItem(event.item)
    const inProgressItem = {
      ...item,
      status: 'inProgress',
    } as AnyThreadItem

    // If this is a user message, try to set it as the session's first message
    // Note: setSessionFirstMessage internally checks if firstMessage is already set,
    // but we also check here to avoid unnecessary async imports and store lookups
    if (inProgressItem.type === 'userMessage') {
      const userMsg = inProgressItem as UserMessageItem
      if (userMsg.content.text) {
        import('../stores/sessions').then(({ useSessionsStore }) => {
          const sessionsStore = useSessionsStore.getState()
          const session = sessionsStore.sessions.find((s) => s.sessionId === threadId)
          // Only set firstMessage if the session exists and doesn't already have one
          // This prevents race conditions when multiple messages are sent quickly
          if (session && !session.firstMessage) {
            sessionsStore.setSessionFirstMessage(threadId, userMsg.content.text)
          }
        }).catch((err) => handleAsyncError(err, 'handleItemStarted session sync', 'thread'))
      }
    }

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const existing = threadState.items[item.id]
      if (existing) {
        return {
          threads: {
            ...state.threads,
            [threadId]: {
              ...threadState,
              itemOrder: threadState.itemOrder.includes(item.id)
                ? threadState.itemOrder
                : [...threadState.itemOrder, item.id],
            },
          },
        }
      }

      let isDuplicateUserMessage = false
      if (inProgressItem.type === 'userMessage') {
        const recentUserIds = [...threadState.itemOrder]
          .slice(-10)
          .filter((id) => threadState.items[id]?.type === 'userMessage')
        const nextUser = inProgressItem as UserMessageItem

        for (const userId of recentUserIds) {
          const existingUser = threadState.items[userId] as UserMessageItem
          if (existingUser && existingUser.content.text === nextUser.content.text) {
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
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: isDuplicateUserMessage
              ? threadState.items
              : { ...threadState.items, [item.id]: inProgressItem },
            itemOrder: isDuplicateUserMessage
              ? threadState.itemOrder
              : [...threadState.itemOrder, item.id],
          },
        },
      }
    })
  },

  handleItemCompleted: (event) => {
    const threadId = event.threadId

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const nextItem = toThreadItem(event.item)
      const existing = threadState.items[nextItem.id]

      if (nextItem.type === 'userMessage') {
        const nextUser = nextItem as UserMessageItem
        const recentUserIds = [...threadState.itemOrder]
          .slice(-10)
          .filter((id) => threadState.items[id]?.type === 'userMessage')

        for (const userId of recentUserIds) {
          const existingUser = threadState.items[userId] as UserMessageItem
          if (existingUser && existingUser.content.text === nextUser.content.text) {
            const existingImagesCount = existingUser.content.images?.length || 0
            const nextImagesCount = nextUser.content.images?.length || 0
            if (existingImagesCount === nextImagesCount) {
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
        return {
          threads: {
            ...state.threads,
            [threadId]: {
              ...threadState,
              items: { ...threadState.items, [nextItem.id]: updatedItem },
            },
          },
        }
      }

      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [nextItem.id]: nextItem },
            itemOrder: threadState.itemOrder.includes(nextItem.id)
              ? threadState.itemOrder
              : [...threadState.itemOrder, nextItem.id],
          },
        },
      }
    })
  },

  handleAgentMessageDelta: (event) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const current = buffer.agentMessages.get(event.itemId) || ''
    const isFirstDelta = current === ''

    if (isFirstDelta) {
      console.log('[handleAgentMessageDelta] First delta for item:', event.itemId, 'threadId:', threadId)
    }

    buffer.agentMessages.set(event.itemId, current + event.delta)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  },

  handleCommandApprovalRequested: (event) => {
    const threadId = event.threadId

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const existing = threadState.items[event.itemId]
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
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [event.itemId]: updatedItem },
            itemOrder: threadState.itemOrder.includes(event.itemId)
              ? threadState.itemOrder
              : [...threadState.itemOrder, event.itemId],
            pendingApprovals: [
              ...threadState.pendingApprovals,
              {
                itemId: event.itemId,
                threadId: event.threadId,
                type: 'command',
                data: event,
                requestId: event._requestId,
                createdAt: Date.now(),
              },
            ],
          },
        },
      }
    })
  },

  handleFileChangeApprovalRequested: (event) => {
    const threadId = event.threadId

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const existing = threadState.items[event.itemId]
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
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [event.itemId]: updatedItem },
            itemOrder: threadState.itemOrder.includes(event.itemId)
              ? threadState.itemOrder
              : [...threadState.itemOrder, event.itemId],
            pendingApprovals: [
              ...threadState.pendingApprovals,
              {
                itemId: event.itemId,
                threadId: event.threadId,
                type: 'fileChange',
                data: event,
                requestId: event._requestId,
                createdAt: Date.now(),
              },
            ],
          },
        },
      }
    })
  },

  handleTurnStarted: (event) => {
    const threadId = event.threadId
    console.log('[handleTurnStarted] Turn started - threadId:', threadId, 'turnId:', event.turn.id)

    clearTurnTimeout(threadId)

    // Sync session status to 'running'
    import('../stores/sessions').then(({ useSessionsStore }) => {
      useSessionsStore.getState().updateSessionStatus(threadId, 'running')
    }).catch((err) => handleAsyncError(err, 'handleTurnStarted session sync', 'thread'))

    // Set turn timeout for this specific thread
    const turnId = event.turn.id
    const timeoutTimer = setTimeout(() => {
      const state = useThreadStore.getState()
      const threadState = state.threads[threadId]
      if (threadState?.currentTurnId === turnId && threadState?.turnStatus === 'running') {
        console.error('[handleTurnStarted] Turn timeout - no completion received for turnId:', turnId)
        performFullTurnCleanup(threadId)
        // Sync session status to 'failed' on timeout
        import('../stores/sessions').then(({ useSessionsStore }) => {
          useSessionsStore.getState().updateSessionStatus(threadId, 'failed')
        }).catch((err) => handleAsyncError(err, 'handleTurnStarted timeout session sync', 'thread'))
        useThreadStore.setState((state) => {
          const threadState = state.threads[threadId]
          if (!threadState) return state
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...threadState,
                turnStatus: 'failed',
                error: 'Turn timed out - server may have disconnected',
                currentTurnId: null,
                pendingApprovals: [],
                turnTiming: {
                  ...threadState.turnTiming,
                  completedAt: Date.now(),
                },
              },
            },
          }
        })
      }
    }, TURN_TIMEOUT_MS)
    turnTimeoutTimers.set(threadId, timeoutTimer)

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            turnStatus: 'running',
            currentTurnId: event.turn.id,
            error: null,
            turnTiming: {
              startedAt: Date.now(),
              completedAt: null,
            },
          },
        },
      }
    })
  },

  handleTurnCompleted: (event) => {
    const threadId = event.threadId
    clearTurnTimeout(threadId)

    // Flush any pending deltas before completing the turn
    get().flushDeltaBuffer(threadId)
    const timer = flushTimers.get(threadId)
    if (timer) {
      clearTimeout(timer)
      flushTimers.delete(threadId)
    }

    const status = event.turn.status
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

    // Sync session status based on turn result
    import('../stores/sessions').then(({ useSessionsStore }) => {
      const sessionStatus = nextTurnStatus === 'failed' ? 'failed'
        : nextTurnStatus === 'interrupted' ? 'interrupted'
        : 'completed'
      useSessionsStore.getState().updateSessionStatus(threadId, sessionStatus)
    }).catch((err) => handleAsyncError(err, 'handleTurnCompleted session sync', 'thread'))

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const updatedItems = { ...threadState.items }
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
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: updatedItems,
            turnStatus: nextTurnStatus,
            currentTurnId: null,
            error: event.turn.error?.message || null,
            pendingApprovals: [],
            turnTiming: {
              ...threadState.turnTiming,
              completedAt: Date.now(),
            },
          },
        },
      }
    })

    if (nextTurnStatus === 'completed' || nextTurnStatus === 'interrupted') {
      queueMicrotask(() => {
        void dispatchNextQueuedMessage(threadId)
      })
    }
  },

  handleTurnDiffUpdated: (event) => {
    const threadId = event.threadId
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

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [infoItem.id]: infoItem },
            itemOrder: threadState.itemOrder.includes(infoItem.id)
              ? threadState.itemOrder
              : [...threadState.itemOrder, infoItem.id],
          },
        },
      }
    })
  },

  handleTurnPlanUpdated: (event) => {
    const threadId = event.threadId

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

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [planItem.id]: planItem },
            itemOrder: threadState.itemOrder.includes(planItem.id)
              ? threadState.itemOrder
              : [...threadState.itemOrder, planItem.id],
          },
        },
      }
    })
  },

  handleThreadCompacted: (event) => {
    const threadId = event.threadId
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

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [infoItem.id]: infoItem },
            itemOrder: threadState.itemOrder.includes(infoItem.id)
              ? threadState.itemOrder
              : [...threadState.itemOrder, infoItem.id],
          },
        },
      }
    })
  },

  handleCommandExecutionOutputDelta: (event) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const current = buffer.commandOutputs.get(event.itemId) || ''
    const isFirstDelta = current === ''
    buffer.commandOutputs.set(event.itemId, current + event.delta)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  },

  handleFileChangeOutputDelta: (event) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const current = buffer.fileChangeOutputs.get(event.itemId) || ''
    const isFirstDelta = current === ''
    buffer.fileChangeOutputs.set(event.itemId, current + event.delta)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  },

  handleReasoningSummaryTextDelta: (event) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const index = event.summaryIndex ?? 0
    const updates = buffer.reasoningSummaries.get(event.itemId) || []
    const isFirstDelta = updates.length === 0
    const existingIdx = updates.findIndex((u) => u.index === index)
    if (existingIdx >= 0) {
      updates[existingIdx].text += event.delta
    } else {
      updates.push({ index, text: event.delta })
    }
    buffer.reasoningSummaries.set(event.itemId, updates)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  },

  handleReasoningSummaryPartAdded: () => {
    // This just initializes a slot, the actual text comes from TextDelta
  },

  handleReasoningTextDelta: (event) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const index = event.contentIndex ?? 0
    const updates = buffer.reasoningContents.get(event.itemId) || []
    const isFirstDelta = updates.length === 0
    const existingIdx = updates.findIndex((u) => u.index === index)
    if (existingIdx >= 0) {
      updates[existingIdx].text += event.delta
    } else {
      updates.push({ index, text: event.delta })
    }
    buffer.reasoningContents.set(event.itemId, updates)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  },

  handleMcpToolCallProgress: (event) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const messages = buffer.mcpProgress.get(event.itemId) || []
    const isFirstMessage = messages.length === 0
    messages.push(event.message)
    buffer.mcpProgress.set(event.itemId, messages)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstMessage)
  },

  handleTokenUsage: (event) => {
    const threadId = event.threadId

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const totals = event.tokenUsage?.total
      const fallbackInput = threadState.tokenUsage.inputTokens
      const fallbackCached = threadState.tokenUsage.cachedInputTokens
      const fallbackOutput = threadState.tokenUsage.outputTokens

      const newInput = totals?.inputTokens ?? fallbackInput
      const newCached = totals?.cachedInputTokens ?? fallbackCached
      const newOutput = totals?.outputTokens ?? fallbackOutput
      const totalTokens = totals?.totalTokens ?? newInput + newOutput

      const modelContextWindow = event.tokenUsage?.modelContextWindow ?? threadState.tokenUsage.modelContextWindow

      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            tokenUsage: {
              inputTokens: newInput,
              cachedInputTokens: newCached,
              outputTokens: newOutput,
              totalTokens,
              modelContextWindow,
            },
          },
        },
      }
    })
  },

  handleStreamError: (event) => {
    const threadId = event.threadId

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

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [errorItem.id]: errorItem },
            itemOrder: [...threadState.itemOrder, errorItem.id],
            error: event.error.message,
            turnStatus: event.willRetry ? threadState.turnStatus : 'failed',
          },
        },
      }
    })
  },

  handleRateLimitExceeded: (event) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    console.warn('[handleRateLimitExceeded] Rate limit exceeded:', event)

    performFullTurnCleanup(threadId)

    const errorMessage = event.retryAfterMs
      ? `Rate limit exceeded. Retry after ${Math.ceil(event.retryAfterMs / 1000)} seconds.`
      : 'Rate limit exceeded. Please wait before sending more messages.'

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            turnStatus: 'failed',
            error: errorMessage,
            currentTurnId: null,
            pendingApprovals: [],
            turnTiming: {
              ...threadState.turnTiming,
              completedAt: Date.now(),
            },
          },
        },
      }
    })
  },

  handleServerDisconnected: () => {
    console.warn('[handleServerDisconnected] Server disconnected')

    // Clean up all threads
    const { threads } = get()
    Object.keys(threads).forEach((threadId) => {
      performFullTurnCleanup(threadId)
    })

    set((state) => {
      const updatedThreads = { ...state.threads }
      Object.keys(updatedThreads).forEach((threadId) => {
        const threadState = updatedThreads[threadId]
        if (threadState.turnStatus === 'running') {
          updatedThreads[threadId] = {
            ...threadState,
            turnStatus: 'failed',
            error: 'Server disconnected. Please try again.',
            currentTurnId: null,
            pendingApprovals: [],
            turnTiming: {
              ...threadState.turnTiming,
              completedAt: Date.now(),
            },
          }
        } else {
          updatedThreads[threadId] = {
            ...threadState,
            error: 'Server disconnected. Connection will be restored automatically.',
          }
        }
      })
      return {
        threads: updatedThreads,
        globalError: 'Server disconnected. Connection will be restored automatically.',
      }
    })
  },

  // ==================== Snapshot Actions ====================

  createSnapshot: async (projectPath) => {
    const { focusedThreadId, threads } = get()
    if (!focusedThreadId || !threads[focusedThreadId]) {
      throw new Error('No active thread')
    }

    const threadId = focusedThreadId
    const snapshot = await snapshotApi.create(threadId, projectPath)

    const { threads: currentThreads } = get()
    if (!currentThreads[threadId]) {
      console.warn('[createSnapshot] Thread closed, discarding snapshot update')
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
    const { focusedThreadId, threads } = get()
    if (!focusedThreadId || !threads[focusedThreadId]) return

    const threadId = focusedThreadId
    try {
      const snapshots = await snapshotApi.list(threadId)

      const { threads: currentThreads } = get()
      if (!currentThreads[threadId]) {
        console.warn('[fetchSnapshots] Thread closed, discarding snapshot list')
        return
      }

      set({ snapshots })
    } catch (error) {
      console.error('Failed to fetch snapshots:', error)
    }
  },
  }
})
