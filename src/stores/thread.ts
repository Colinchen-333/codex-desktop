import { create } from 'zustand'
import { threadApi, snapshotApi, type ThreadInfo, type Snapshot } from '../lib/api'
import type {
  ItemStartedEvent,
  ItemCompletedEvent,
  AgentMessageDeltaEvent,
  CommandApprovalRequestedEvent,
  FileChangeApprovalRequestedEvent,
  TurnCompletedEvent,
  TurnFailedEvent,
} from '../lib/events'

// ==================== Thread Item Types ====================

export type ThreadItemType =
  | 'userMessage'
  | 'agentMessage'
  | 'commandExecution'
  | 'fileChange'
  | 'reasoning'
  | 'webSearch'
  | 'todoList'
  | 'error'

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
    command: string
    cwd: string
    commandActions: string[]
    output?: string
    exitCode?: number
    needsApproval: boolean
    approved?: boolean
  }
}

export interface FileChangeItem extends ThreadItem {
  type: 'fileChange'
  content: {
    changes: Array<{
      path: string
      kind: 'add' | 'modify' | 'delete'
      diff: string
    }>
    needsApproval: boolean
    approved?: boolean
    applied?: boolean
    snapshotId?: string
  }
}

export type AnyThreadItem =
  | UserMessageItem
  | AgentMessageItem
  | CommandExecutionItem
  | FileChangeItem
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

interface ThreadState {
  activeThread: ThreadInfo | null
  items: Map<string, AnyThreadItem>
  itemOrder: string[]
  turnStatus: TurnStatus
  currentTurnId: string | null
  pendingApprovals: PendingApproval[]
  snapshots: Snapshot[]
  isLoading: boolean
  error: string | null

  // Actions
  startThread: (
    projectId: string,
    cwd: string,
    model?: string,
    sandboxMode?: string,
    askForApproval?: string
  ) => Promise<void>
  resumeThread: (threadId: string) => Promise<void>
  sendMessage: (text: string, images?: string[]) => Promise<void>
  interrupt: () => Promise<void>
  respondToApproval: (
    itemId: string,
    decision: 'accept' | 'acceptForSession' | 'decline',
    snapshotId?: string
  ) => Promise<void>
  clearThread: () => void

  // Event handlers
  handleItemStarted: (event: ItemStartedEvent) => void
  handleItemCompleted: (event: ItemCompletedEvent) => void
  handleAgentMessageDelta: (event: AgentMessageDeltaEvent) => void
  handleCommandApprovalRequested: (event: CommandApprovalRequestedEvent) => void
  handleFileChangeApprovalRequested: (event: FileChangeApprovalRequestedEvent) => void
  handleTurnCompleted: (event: TurnCompletedEvent) => void
  handleTurnFailed: (event: TurnFailedEvent) => void

  // Snapshot actions
  createSnapshot: (projectPath: string) => Promise<Snapshot>
  revertToSnapshot: (snapshotId: string, projectPath: string) => Promise<void>
  fetchSnapshots: () => Promise<void>
}

// Helper to map item types from server to our types
function mapItemType(type: string): ThreadItemType {
  const typeMap: Record<string, ThreadItemType> = {
    'user_message': 'userMessage',
    'userMessage': 'userMessage',
    'agent_message': 'agentMessage',
    'agentMessage': 'agentMessage',
    'message': 'agentMessage',
    'command_execution': 'commandExecution',
    'commandExecution': 'commandExecution',
    'tool_call': 'commandExecution',
    'file_change': 'fileChange',
    'fileChange': 'fileChange',
    'reasoning': 'reasoning',
    'web_search': 'webSearch',
    'webSearch': 'webSearch',
    'todo_list': 'todoList',
    'todoList': 'todoList',
  }
  return typeMap[type] || 'agentMessage'
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  activeThread: null,
  items: new Map(),
  itemOrder: [],
  turnStatus: 'idle',
  currentTurnId: null,
  pendingApprovals: [],
  snapshots: [],
  isLoading: false,
  error: null,

  startThread: async (projectId, cwd, model, sandboxMode, askForApproval) => {
    set({ isLoading: true, error: null })
    try {
      const response = await threadApi.start(
        projectId,
        cwd,
        model,
        sandboxMode,
        askForApproval
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
      set({ error: String(error), isLoading: false })
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
        const item = rawItem as { id: string; type: string; content?: unknown }
        if (!item.id || !item.type) continue

        const threadItem: AnyThreadItem = {
          id: item.id,
          type: mapItemType(item.type),
          status: 'completed',
          content: item.content || {},
          createdAt: Date.now(),
        }

        items.set(item.id, threadItem)
        itemOrder.push(item.id)
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
      set({ error: String(error), isLoading: false })
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
      set({ error: String(error) })
    }
  },

  respondToApproval: async (itemId, decision, snapshotId) => {
    const { activeThread, pendingApprovals } = get()
    if (!activeThread) return

    // Find the pending approval to get the requestId
    const pendingApproval = pendingApprovals.find((p) => p.itemId === itemId)
    if (!pendingApproval) {
      console.error('No pending approval found for itemId:', itemId)
      return
    }

    try {
      await threadApi.respondToApproval(activeThread.id, itemId, decision, pendingApproval.requestId)

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
                  snapshotId: snapshotId,
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
      set({ error: String(error) })
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

  // Event Handlers
  handleItemStarted: (event) => {
    const item: ThreadItem = {
      id: event.itemId,
      type: event.type as ThreadItemType,
      status: 'inProgress',
      content: {},
      createdAt: Date.now(),
    }

    set((state) => ({
      items: new Map(state.items).set(event.itemId, item as AnyThreadItem),
      itemOrder: [...state.itemOrder, event.itemId],
    }))
  },

  handleItemCompleted: (event) => {
    set((state) => {
      const items = new Map(state.items)
      const existing = items.get(event.itemId)
      if (existing) {
        // Merge content to preserve approval state and other existing fields
        const existingContent = existing.content as Record<string, unknown>
        const newContent = event.content as Record<string, unknown>
        items.set(event.itemId, {
          ...existing,
          status: 'completed',
          content: {
            ...existingContent,
            ...newContent,
            // Preserve these fields from existing content if they exist
            needsApproval: existingContent.needsApproval ?? newContent.needsApproval,
            approved: existingContent.approved ?? newContent.approved,
            applied: existingContent.applied ?? newContent.applied,
          },
        } as AnyThreadItem)
      } else {
        // Create new item if it doesn't exist
        const item: AnyThreadItem = {
          id: event.itemId,
          type: mapItemType(event.type),
          status: 'completed',
          content: event.content,
          createdAt: Date.now(),
        }
        items.set(event.itemId, item)
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
    const commandItem: CommandExecutionItem = {
      id: event.itemId,
      type: 'commandExecution',
      status: 'inProgress',
      content: {
        command: event.command,
        cwd: event.cwd,
        commandActions: event.commandActions,
        needsApproval: true,
      },
      createdAt: Date.now(),
    }

    set((state) => ({
      items: new Map(state.items).set(event.itemId, commandItem),
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
    const fileChangeItem: FileChangeItem = {
      id: event.itemId,
      type: 'fileChange',
      status: 'inProgress',
      content: {
        changes: event.changes,
        needsApproval: true,
      },
      createdAt: Date.now(),
    }

    set((state) => ({
      items: new Map(state.items).set(event.itemId, fileChangeItem),
      itemOrder: state.itemOrder.includes(event.itemId)
        ? state.itemOrder
        : [...state.itemOrder, event.itemId],
      pendingApprovals: [
        ...state.pendingApprovals,
        { itemId: event.itemId, type: 'fileChange', data: event, requestId: event._requestId },
      ],
    }))
  },

  handleTurnCompleted: (_event) => {
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
        turnStatus: 'completed',
        currentTurnId: null,
      }
    })
  },

  handleTurnFailed: (event) => {
    set({
      turnStatus: 'failed',
      error: event.error,
      currentTurnId: null,
    })
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
