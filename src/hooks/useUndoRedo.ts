/**
 * useUndoRedo Hook
 *
 * Hook for managing undo/redo operations in the thread store.
 * Integrates with the UndoRedoStore to provide undo/redo functionality.
 */

import { useCallback } from 'react'
import { useUndoRedoStore, OPERATION_DESCRIPTIONS } from '../stores/undoRedo'
import { useThreadStore } from '../stores/thread'
import { useToast } from '../components/ui/useToast'
import type { UndoableOperationType, OperationState } from '../stores/undoRedo'
import type { AnyThreadItem } from '../stores/thread/types'
import type { UndoableOperation } from '../stores/undoRedo'

/**
 * Hook for undo/redo functionality
 */
export function useUndoRedo() {
  const { toast } = useToast()
  const {
    undo: undoOperation,
    redo: redoOperation,
    canUndo,
    canRedo,
    clearHistory,
  } = useUndoRedoStore()

  const focusedThreadId = useThreadStore((state) => state.focusedThreadId)
  const threads = useThreadStore((state) => state.threads)

  /**
   * Get the current thread state
   */
  const getCurrentThread = useCallback(() => {
    if (!focusedThreadId) return null
    return threads[focusedThreadId] ?? null
  }, [focusedThreadId, threads])

  /**
   * Record an operation for potential undo
   */
  const recordOperation = useCallback(
    (
      type: UndoableOperationType,
      previousState: OperationState,
      description?: string
    ) => {
      const thread = getCurrentThread()
      if (!thread) return

      const { pushOperation } = useUndoRedoStore.getState()

      pushOperation({
        type,
        description: description ?? OPERATION_DESCRIPTIONS[type],
        previousState,
        threadId: thread.thread.id,
      })
    },
    [getCurrentThread]
  )

  /**
   * Undo the last operation
   */
  const undo = useCallback(() => {
    if (!canUndo()) {
      toast.info('Nothing to undo', { message: 'There are no operations to undo.' })
      return
    }

    const operation = undoOperation()
    if (!operation) return

    // Perform the undo based on operation type
    performUndo(operation)

    toast.success('Undo successful', { message: `Undone: ${operation.description}` })
  }, [canUndo, undoOperation, toast])

  /**
   * Redo the last undone operation
   */
  const redo = useCallback(() => {
    if (!canRedo()) {
      toast.info('Nothing to redo', { message: 'There are no operations to redo.' })
      return
    }

    const operation = redoOperation()
    if (!operation) return

    // Perform the redo based on operation type
    performRedo(operation)

    toast.success('Redo successful', { message: `Redone: ${operation.description}` })
  }, [canRedo, redoOperation, toast])

  /**
   * Perform undo based on operation type
   */
  const performUndo = useCallback((operation: UndoableOperation | null) => {
    if (!operation) return

    const { previousState, threadId } = operation

    switch (operation.type) {
      case 'sendMessage': {
        // Undo: Delete the message that was sent
        const { deleteMessage } = useThreadStore.getState()
        if (previousState.itemId) {
          deleteMessage(previousState.itemId, threadId)
        }
        break
      }

      case 'deleteMessage': {
        // Undo: Restore the deleted message
        const { addItemBack, restoreItemOrder } = useThreadStore.getState()
        if (previousState.itemData && previousState.itemId) {
          addItemBack(previousState.itemId, previousState.itemData as AnyThreadItem, threadId)
          // Restore item order if available
          if (previousState.itemOrder) {
            restoreItemOrder(previousState.itemOrder, threadId)
          }
        }
        break
      }

      case 'editMessage': {
        // Undo: Restore the original message content
        const { restoreMessageContent } = useThreadStore.getState()
        if (previousState.itemData && previousState.itemId) {
          restoreMessageContent(
            previousState.itemId,
            previousState.itemData as AnyThreadItem,
            threadId
          )
        }
        break
      }

      case 'revertSnapshot': {
        // Undo: This is complex - would need to restore to previous state
        // For now, we'll just show a message
        toast.info('Snapshot undo not supported', {
          message: 'Snapshot restoration cannot be undone. Please restore a different snapshot.',
        })
        break
      }

      case 'clearThread': {
        // Undo: Restore the thread state
        const { restoreThreadState } = useThreadStore.getState()
        if (previousState.threadState) {
          restoreThreadState(previousState.threadState, threadId)
        }
        break
      }
    }
  }, [toast])

  /**
   * Perform redo based on operation type
   */
  const performRedo = useCallback((operation: UndoableOperation | null) => {
    if (!operation) return

    const { threadId } = operation

    switch (operation.type) {
      case 'sendMessage': {
        // Redo: Resend the message
        // This would require storing the original message content
        // For now, we'll just show a message
        toast.info('Message resend', { message: 'Please resend the message manually.' })
        break
      }

      case 'deleteMessage': {
        // Redo: Delete the message again
        const { deleteMessage } = useThreadStore.getState()
        if (operation.previousState.itemId) {
          deleteMessage(operation.previousState.itemId, threadId)
        }
        break
      }

      case 'editMessage': {
        // Redo: Apply the edit again
        // This would require storing the edited content
        toast.info('Edit redo', { message: 'Please edit the message again.' })
        break
      }

      case 'revertSnapshot':
      case 'clearThread': {
        toast.info('Redo not supported', { message: 'This operation cannot be redone.' })
        break
      }
    }
  }, [toast])

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    recordOperation,
    clearHistory,
  }
}

// ==================== Helper Functions ====================

/**
 * Create operation state for message operations
 */
export function createMessageOperationState(
  itemId: string,
  itemData: AnyThreadItem,
  itemOrder?: string[]
): OperationState {
  // P2: Type-safe access to editState for user messages
  const editState = itemData.type === 'userMessage' 
    ? (itemData as import('../stores/thread/types').UserMessageItem).editState 
    : undefined
  
  return {
    itemId,
    itemData: {
      id: itemData.id,
      type: itemData.type,
      content: itemData.content,
      createdAt: itemData.createdAt,
      editState,
    },
    itemOrder,
  }
}

/**
 * Create operation state for snapshot operations
 */
export function createSnapshotOperationState(
  snapshotId: string,
  previousSnapshotId?: string
): OperationState {
  return {
    snapshotState: {
      snapshotId,
      previousSnapshotId,
    },
  }
}

/**
 * Create operation state for clear thread operations
 */
export function createClearThreadOperationState(
  items: Record<string, AnyThreadItem>,
  itemOrder: string[]
): OperationState {
  return {
    threadState: {
      items,
      itemOrder,
    },
  }
}
