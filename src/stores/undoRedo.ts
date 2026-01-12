/**
 * Undo/Redo Store
 *
 * Manages operation history for undo/redo functionality.
 * Supports message operations (send, delete, edit) and snapshot operations.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

function areOperationStatesEquivalent(a?: OperationState, b?: OperationState): boolean {
  if (!a || !b) return false
  if (a.itemId !== b.itemId) return false
  if (a.itemOrder && b.itemOrder && a.itemOrder.length !== b.itemOrder.length) return false
  if (a.itemData?.content !== undefined || b.itemData?.content !== undefined) {
    try {
      const aContent = a.itemData?.content ?? null
      const bContent = b.itemData?.content ?? null
      return JSON.stringify(aContent) === JSON.stringify(bContent)
    } catch {
      return false
    }
  }
  return true
}

// ==================== Type Definitions ====================

/**
 * Operation types that can be undone/redone
 */
export type UndoableOperationType =
  | 'sendMessage'
  | 'deleteMessage'
  | 'editMessage'
  | 'revertSnapshot'
  | 'clearThread'

/**
 * Represents a single undoable operation
 */
export interface UndoableOperation {
  id: string
  type: UndoableOperationType
  timestamp: number
  description: string
  // The state before the operation (for undo)
  previousState: OperationState
  // The state after the operation (for redo)
  nextState?: OperationState
  // Thread ID this operation belongs to
  threadId: string
}

/**
 * State snapshot for an operation
 * Uses minimal data to keep memory usage low
 */
export interface OperationState {
  // For message operations
  itemId?: string
  itemData?: {
    id: string
    type: string
    content: unknown
    createdAt: number
    editState?: unknown
  }
  itemOrder?: string[]

  // For snapshot operations
  snapshotState?: {
    snapshotId: string
    previousSnapshotId?: string
  }

  // For clear thread
  threadState?: {
    items: Record<string, unknown>
    itemOrder: string[]
  }
}

/**
 * Undo/Redo store state
 */
export interface UndoRedoState {
  // History stacks (per thread)
  history: Record<string, UndoableOperation[]>
  redoStack: Record<string, UndoableOperation[]>

  // Current focused thread
  currentThreadId: string | null

  // Maximum history size
  maxHistorySize: number

  // Actions
  setCurrentThread: (threadId: string | null) => void
  pushOperation: (operation: Omit<UndoableOperation, 'id' | 'timestamp'>) => void
  undo: (threadId?: string) => UndoableOperation | null
  redo: (threadId?: string) => UndoableOperation | null
  canUndo: (threadId?: string) => boolean
  canRedo: (threadId?: string) => boolean
  clearHistory: (threadId?: string) => void
  getHistory: (threadId?: string) => UndoableOperation[]
  getRedoStack: (threadId?: string) => UndoableOperation[]
}

// ==================== Constants ====================

export const MAX_HISTORY_SIZE = 50

/**
 * P1 Fix: Time window for operation merging (2 seconds)
 * Operations of the same type within this window will be merged
 */
export const OPERATION_MERGE_WINDOW_MS = 2000

export const OPERATION_DESCRIPTIONS: Record<UndoableOperationType, string> = {
  sendMessage: 'Send message',
  deleteMessage: 'Delete message',
  editMessage: 'Edit message',
  revertSnapshot: 'Restore snapshot',
  clearThread: 'Clear thread',
}

/**
 * P1 Fix: Operations that can be merged within the time window
 */
const MERGEABLE_OPERATIONS: Set<UndoableOperationType> = new Set([
  'editMessage',  // Multiple edits to the same message can be merged
])

// ==================== Store Creation ====================

export const useUndoRedoStore = create<UndoRedoState>()(
  immer((set, get) => ({
    // Initial state
    history: {},
    redoStack: {},
    currentThreadId: null,
    maxHistorySize: MAX_HISTORY_SIZE,

    // ==================== Actions ====================

    setCurrentThread: (threadId: string | null) => {
      set((state) => {
        state.currentThreadId = threadId
      })
    },

    pushOperation: (operation: Omit<UndoableOperation, 'id' | 'timestamp'>) => {
      set((state) => {
        const { threadId, type } = operation
        const now = Date.now()

        // Initialize history for this thread if needed
        if (!state.history[threadId]) {
          state.history[threadId] = []
        }
        if (!state.redoStack[threadId]) {
          state.redoStack[threadId] = []
        }

        // Clear redo stack when new operation is pushed
        state.redoStack[threadId] = []

        const threadHistory = state.history[threadId]

        // P1 Fix: Attempt to merge with last operation if within time window
        if (
          MERGEABLE_OPERATIONS.has(type) &&
          threadHistory.length > 0
        ) {
          const lastOp = threadHistory[threadHistory.length - 1]
          const timeSinceLastOp = now - lastOp.timestamp

          // Check if operations can be merged
          if (
            lastOp.type === type &&
            timeSinceLastOp <= OPERATION_MERGE_WINDOW_MS &&
            lastOp.previousState.itemId === operation.previousState.itemId &&
            lastOp.nextState &&
            areOperationStatesEquivalent(lastOp.nextState, operation.previousState)
          ) {
            // Merge: update the nextState of last operation
            lastOp.nextState = operation.nextState
            lastOp.timestamp = now // Update timestamp to latest
            return // Skip adding new operation
          }
        }

        // Create full operation
        const fullOperation: UndoableOperation = {
          ...operation,
          id: `op-${now}-${Math.random().toString(36).slice(2)}`,
          timestamp: now,
        }

        // Add to history
        state.history[threadId].push(fullOperation)

        // Enforce max history size
        if (state.history[threadId].length > state.maxHistorySize) {
          state.history[threadId].shift()
        }
      })
    },

    undo: (threadId?: string) => {
      const targetThreadId = threadId ?? get().currentThreadId
      if (!targetThreadId) return null

      const { history } = get()
      const threadHistory = history[targetThreadId]

      if (!threadHistory || threadHistory.length === 0) return null

      const operation = threadHistory[threadHistory.length - 1]

      set((state) => {
        // Remove from history
        state.history[targetThreadId] = threadHistory.slice(0, -1)

        // Add to redo stack
        if (!state.redoStack[targetThreadId]) {
          state.redoStack[targetThreadId] = []
        }
        state.redoStack[targetThreadId].push(operation)
      })

      return operation
    },

    redo: (threadId?: string) => {
      const targetThreadId = threadId ?? get().currentThreadId
      if (!targetThreadId) return null

      const { redoStack } = get()
      const threadRedoStack = redoStack[targetThreadId]

      if (!threadRedoStack || threadRedoStack.length === 0) return null

      const operation = threadRedoStack[threadRedoStack.length - 1]

      set((state) => {
        // Remove from redo stack
        state.redoStack[targetThreadId] = threadRedoStack.slice(0, -1)

        // Add back to history
        if (!state.history[targetThreadId]) {
          state.history[targetThreadId] = []
        }
        state.history[targetThreadId].push(operation)
      })

      return operation
    },

    canUndo: (threadId?: string) => {
      const targetThreadId = threadId ?? get().currentThreadId
      if (!targetThreadId) return false
      const { history } = get()
      const threadHistory = history[targetThreadId]
      return Boolean(threadHistory && threadHistory.length > 0)
    },

    canRedo: (threadId?: string) => {
      const targetThreadId = threadId ?? get().currentThreadId
      if (!targetThreadId) return false
      const { redoStack } = get()
      const threadRedoStack = redoStack[targetThreadId]
      return Boolean(threadRedoStack && threadRedoStack.length > 0)
    },

    clearHistory: (threadId?: string) => {
      const targetThreadId = threadId ?? get().currentThreadId

      set((state) => {
        if (targetThreadId) {
          // Clear specific thread history
          state.history[targetThreadId] = []
          state.redoStack[targetThreadId] = []
        } else {
          // Clear all history
          state.history = {}
          state.redoStack = {}
        }
      })
    },

    getHistory: (threadId?: string) => {
      const targetThreadId = threadId ?? get().currentThreadId
      if (!targetThreadId) return []
      const { history } = get()
      return history[targetThreadId] ?? []
    },

    getRedoStack: (threadId?: string) => {
      const targetThreadId = threadId ?? get().currentThreadId
      if (!targetThreadId) return []
      const { redoStack } = get()
      return redoStack[targetThreadId] ?? []
    },
  }))
)
