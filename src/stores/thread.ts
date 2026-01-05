import { create } from 'zustand'
import { threadApi, snapshotApi, type ThreadInfo, type Snapshot } from '../lib/api'
import { parseError } from '../lib/errorUtils'
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
  CommandExecutionOutputDeltaEvent,
  FileChangeOutputDeltaEvent,
  ReasoningSummaryTextDeltaEvent,
  ReasoningSummaryPartAddedEvent,
  ReasoningTextDeltaEvent,
  McpToolCallProgressEvent,
  TokenUsageEvent,
  StreamErrorEvent,
} from '../lib/events'

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
  | ThreadItem

// ==================== Turn Status ====================

export type TurnStatus = 'idle' | 'running' | 'completed' | 'failed' | 'interrupted'

// ==================== Pending Approval ====================

export interface PendingApproval {
  itemId: string
  type: 'command' | 'fileChange'
  data: CommandApprovalRequestedEvent | FileChangeApprovalRequestedEvent
  requestId: number // JSON-RPC request ID for responding
}

// ==================== Store State ====================

// Token usage statistics
export interface TokenUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
}

interface ThreadState {
  activeThread: ThreadInfo | null
  items: Map<string, AnyThreadItem>
  itemOrder: string[]
  turnStatus: TurnStatus
  currentTurnId: string | null
  pendingApprovals: PendingApproval[]
  snapshots: Snapshot[]
  tokenUsage: TokenUsage
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
  sendMessage: (text: string, images?: string[]) => Promise<void>
  interrupt: () => Promise<void>
  respondToApproval: (
    itemId: string,
    decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline' | 'cancel',
    options?: { snapshotId?: string; execpolicyAmendment?: { command: string[] } | null }
  ) => Promise<void>
  clearThread: () => void
  addInfoItem: (title: string, details?: string) => void

  // Event handlers
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
        type: mapItemType(item.type),
        content: item,
      }
  }
}

// Default token usage
const defaultTokenUsage: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  activeThread: null,
  items: new Map(),
  itemOrder: [],
  turnStatus: 'idle',
  currentTurnId: null,
  pendingApprovals: [],
  snapshots: [],
  tokenUsage: defaultTokenUsage,
  isLoading: false,
  error: null,

  startThread: async (projectId, cwd, model, sandboxMode, approvalPolicy) => {
    set({ isLoading: true, error: null })
    try {
      const response = await threadApi.start(
        projectId,
        cwd,
        model,
        sandboxMode,
        approvalPolicy
      )
      set({
        activeThread: response.thread,
        items: new Map(),
        itemOrder: [],
        turnStatus: 'idle',
        pendingApprovals: [],
        isLoading: false,
      })
    } catch (error) {
      set({ error: parseError(error), isLoading: false })
      throw error
    }
  },

  resumeThread: async (threadId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await threadApi.resume(threadId)

      // Convert items from response to our format
      const items = new Map<string, AnyThreadItem>()
      const itemOrder: string[] = []

      for (const rawItem of response.items) {
        if (!rawItem || typeof rawItem !== 'object') continue
        const item = rawItem as { id?: string; type?: string }
        if (!item.id || !item.type) continue
        const threadItem = toThreadItem(rawItem as { id: string; type: string } & Record<string, unknown>)
        items.set(threadItem.id, threadItem)
        itemOrder.push(threadItem.id)
      }

      set({
        activeThread: response.thread,
        items,
        itemOrder,
        turnStatus: 'idle',
        pendingApprovals: [],
        isLoading: false,
      })
    } catch (error) {
      set({ error: parseError(error), isLoading: false })
      throw error
    }
  },

  sendMessage: async (text, images) => {
    const { activeThread } = get()
    if (!activeThread) {
      throw new Error('No active thread')
    }

    // Add user message to items
    const userMessageId = `user-${Date.now()}`
    const userMessage: UserMessageItem = {
      id: userMessageId,
      type: 'userMessage',
      status: 'completed',
      content: { text, images },
      createdAt: Date.now(),
    }

    set((state) => ({
      items: new Map(state.items).set(userMessageId, userMessage),
      itemOrder: [...state.itemOrder, userMessageId],
      turnStatus: 'running',
    }))

    try {
      const response = await threadApi.sendMessage(activeThread.id, text, images)
      set({ currentTurnId: response.turn.id })
    } catch (error) {
      set({ turnStatus: 'failed', error: String(error) })
      throw error
    }
  },

  interrupt: async () => {
    const { activeThread } = get()
    if (!activeThread) return

    try {
      await threadApi.interrupt(activeThread.id)
      set({ turnStatus: 'interrupted' })
    } catch (error) {
      set({ error: parseError(error) })
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

    try {
      await threadApi.respondToApproval(
        activeThread.id,
        itemId,
        decision,
        pendingApproval.requestId,
        options?.execpolicyAmendment
      )

      // Update item status
      set((state) => {
        const items = new Map(state.items)
        const item = items.get(itemId)
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
          }
          items.set(itemId, updatedItem as AnyThreadItem)
        }

        return {
          items,
          pendingApprovals: state.pendingApprovals.filter((p) => p.itemId !== itemId),
        }
      })
    } catch (error) {
      set({ error: parseError(error) })
      throw error
    }
  },

  clearThread: () => {
    set({
      activeThread: null,
      items: new Map(),
      itemOrder: [],
      turnStatus: 'idle',
      currentTurnId: null,
      pendingApprovals: [],
      snapshots: [],
      error: null,
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
      items: new Map(state.items).set(infoItem.id, infoItem),
      itemOrder: [...state.itemOrder, infoItem.id],
    }))
  },

  // Event Handlers
  handleItemStarted: (event) => {
    const item = toThreadItem(event.item)
    const inProgressItem = {
      ...item,
      status: 'inProgress',
    } as AnyThreadItem

    set((state) => {
      let isDuplicateUserMessage = false
      if (inProgressItem.type === 'userMessage') {
        const lastUserId = [...state.itemOrder]
          .reverse()
          .find((id) => state.items.get(id)?.type === 'userMessage')
        const lastUser = lastUserId
          ? (state.items.get(lastUserId) as UserMessageItem)
          : null
        const nextUser = inProgressItem as UserMessageItem
        if (
          lastUser &&
          lastUser.content.text === nextUser.content.text &&
          JSON.stringify(lastUser.content.images || []) ===
            JSON.stringify(nextUser.content.images || [])
        ) {
          isDuplicateUserMessage = true
        }
      }

      return {
        items: isDuplicateUserMessage
          ? state.items
          : new Map(state.items).set(item.id, inProgressItem),
        itemOrder: isDuplicateUserMessage ? state.itemOrder : [...state.itemOrder, item.id],
      }
    })
  },

  handleItemCompleted: (event) => {
    set((state) => {
      const items = new Map(state.items)
      const nextItem = toThreadItem(event.item)
      const existing = items.get(nextItem.id)

      if (existing) {
        const existingContent = existing.content as Record<string, unknown>
        const nextContent = nextItem.content as Record<string, unknown>
        items.set(nextItem.id, {
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
        } as AnyThreadItem)
      } else {
        items.set(nextItem.id, nextItem)
        return {
          items,
          itemOrder: state.itemOrder.includes(nextItem.id)
            ? state.itemOrder
            : [...state.itemOrder, nextItem.id],
        }
      }
      return { items }
    })
  },

  handleAgentMessageDelta: (event) => {
    set((state) => {
      const items = new Map(state.items)
      const existing = items.get(event.itemId) as AgentMessageItem | undefined

      if (existing && existing.type === 'agentMessage') {
        items.set(event.itemId, {
          ...existing,
          content: {
            text: existing.content.text + event.delta,
            isStreaming: true,
          },
        })
      } else {
        // Create new agent message item
        const newItem: AgentMessageItem = {
          id: event.itemId,
          type: 'agentMessage',
          status: 'inProgress',
          content: {
            text: event.delta,
            isStreaming: true,
          },
          createdAt: Date.now(),
        }
        items.set(event.itemId, newItem)
        return {
          items,
          itemOrder: state.itemOrder.includes(event.itemId)
            ? state.itemOrder
            : [...state.itemOrder, event.itemId],
        }
      }

      return { items }
    })
  },

  handleCommandApprovalRequested: (event) => {
    set((state) => ({
      items: new Map(state.items).set(event.itemId, {
        ...(state.items.get(event.itemId) || {
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
          ...((state.items.get(event.itemId)?.content || {}) as Record<string, unknown>),
          needsApproval: true,
          reason: event.reason,
          proposedExecpolicyAmendment: event.proposedExecpolicyAmendment,
        },
      } as AnyThreadItem),
      itemOrder: state.itemOrder.includes(event.itemId)
        ? state.itemOrder
        : [...state.itemOrder, event.itemId],
      pendingApprovals: [
        ...state.pendingApprovals,
        { itemId: event.itemId, type: 'command', data: event, requestId: event._requestId },
      ],
    }))
  },

  handleFileChangeApprovalRequested: (event) => {
    set((state) => ({
      items: new Map(state.items).set(event.itemId, {
        ...(state.items.get(event.itemId) || {
          id: event.itemId,
          type: 'fileChange',
          status: 'inProgress',
          content: {
            changes: [],
          },
          createdAt: Date.now(),
        }),
        content: {
          ...((state.items.get(event.itemId)?.content || {}) as Record<string, unknown>),
          needsApproval: true,
          reason: event.reason,
        },
      } as AnyThreadItem),
      itemOrder: state.itemOrder.includes(event.itemId)
        ? state.itemOrder
        : [...state.itemOrder, event.itemId],
      pendingApprovals: [
        ...state.pendingApprovals,
        { itemId: event.itemId, type: 'fileChange', data: event, requestId: event._requestId },
      ],
    }))
  },

  handleTurnStarted: (event) => {
    set({
      turnStatus: 'running',
      currentTurnId: event.turn.id,
      error: null,
    })
  },

  handleTurnCompleted: (event) => {
    const status = event.turn.status
    const nextTurnStatus: TurnStatus =
      status === 'failed'
        ? 'failed'
        : status === 'interrupted'
        ? 'interrupted'
        : 'completed'

    set((state) => {
      // Mark all streaming items as complete
      const items = new Map(state.items)
      items.forEach((item, id) => {
        if (item.type === 'agentMessage' && (item as AgentMessageItem).content.isStreaming) {
          items.set(id, {
            ...item,
            status: 'completed',
            content: {
              ...(item as AgentMessageItem).content,
              isStreaming: false,
            },
          } as AgentMessageItem)
        }
      })

      return {
        items,
        turnStatus: nextTurnStatus,
        currentTurnId: null,
        error: event.turn.error?.message || null,
        pendingApprovals: [],
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
      items: new Map(state.items).set(infoItem.id, infoItem),
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
      items: new Map(state.items).set(planItem.id, planItem),
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
      items: new Map(state.items).set(infoItem.id, infoItem),
      itemOrder: state.itemOrder.includes(infoItem.id)
        ? state.itemOrder
        : [...state.itemOrder, infoItem.id],
    }))
  },

  handleCommandExecutionOutputDelta: (event) => {
    set((state) => {
      const items = new Map(state.items)
      const existing = items.get(event.itemId) as CommandExecutionItem | undefined

      if (existing && existing.type === 'commandExecution') {
        items.set(event.itemId, {
          ...existing,
          content: {
            ...existing.content,
            output: (existing.content.output || '') + event.delta,
            isRunning: true,
          },
        })
      }

      return { items }
    })
  },

  handleFileChangeOutputDelta: (event) => {
    set((state) => {
      const items = new Map(state.items)
      const existing = items.get(event.itemId) as FileChangeItem | undefined

      if (existing && existing.type === 'fileChange') {
        items.set(event.itemId, {
          ...existing,
          content: {
            ...existing.content,
            output: (existing.content.output || '') + event.delta,
          },
        })
      }

      return { items }
    })
  },

  handleReasoningSummaryTextDelta: (event) => {
    set((state) => {
      const items = new Map(state.items)
      const existing = items.get(event.itemId) as ReasoningItem | undefined
      const index = event.summaryIndex ?? 0

      if (existing && existing.type === 'reasoning') {
        const summary = [...existing.content.summary]
        summary[index] = (summary[index] || '') + event.delta

        items.set(event.itemId, {
          ...existing,
          content: {
            ...existing.content,
            summary,
            isStreaming: true,
          },
        })
      } else {
        const summary: string[] = []
        summary[index] = event.delta
        const newItem: ReasoningItem = {
          id: event.itemId,
          type: 'reasoning',
          status: 'inProgress',
          content: {
            summary,
            isStreaming: true,
          },
          createdAt: Date.now(),
        }
        items.set(event.itemId, newItem)
        return {
          items,
          itemOrder: state.itemOrder.includes(event.itemId)
            ? state.itemOrder
            : [...state.itemOrder, event.itemId],
        }
      }

      return { items }
    })
  },

  handleReasoningSummaryPartAdded: (event) => {
    set((state) => {
      const items = new Map(state.items)
      const existing = items.get(event.itemId) as ReasoningItem | undefined

      if (existing && existing.type === 'reasoning') {
        const summary = [...existing.content.summary]
        const index = event.summaryIndex ?? summary.length
        summary[index] = summary[index] || ''

        items.set(event.itemId, {
          ...existing,
          content: {
            ...existing.content,
            summary,
            isStreaming: true,
          },
        })
      }

      return { items }
    })
  },

  handleReasoningTextDelta: (event) => {
    set((state) => {
      const items = new Map(state.items)
      const existing = items.get(event.itemId) as ReasoningItem | undefined
      const index = event.contentIndex ?? 0

      if (existing && existing.type === 'reasoning') {
        const content = existing.content.fullContent ? [...existing.content.fullContent] : []
        content[index] = (content[index] || '') + event.delta

        items.set(event.itemId, {
          ...existing,
          content: {
            ...existing.content,
            fullContent: content,
            isStreaming: true,
          },
        })
      }

      return { items }
    })
  },

  handleMcpToolCallProgress: (event) => {
    set((state) => {
      const items = new Map(state.items)
      const existing = items.get(event.itemId) as McpToolItem | undefined

      if (existing && existing.type === 'mcpTool') {
        items.set(event.itemId, {
          ...existing,
          content: {
            ...existing.content,
            progress: [...(existing.content.progress || []), event.message],
            isRunning: true,
          },
        })
      }

      return { items }
    })
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

      return {
        tokenUsage: {
          inputTokens: newInput,
          cachedInputTokens: newCached,
          outputTokens: newOutput,
          totalTokens,
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
      items: new Map(state.items).set(errorItem.id, errorItem),
      itemOrder: [...state.itemOrder, errorItem.id],
      error: event.error.message,
      turnStatus: event.willRetry ? state.turnStatus : 'failed',
    }))
  },

  // Snapshot Actions
  createSnapshot: async (projectPath) => {
    const { activeThread } = get()
    if (!activeThread) {
      throw new Error('No active thread')
    }

    const snapshot = await snapshotApi.create(activeThread.id, projectPath)
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

    try {
      const snapshots = await snapshotApi.list(activeThread.id)
      set({ snapshots })
    } catch (error) {
      console.error('Failed to fetch snapshots:', error)
    }
  },
}))
