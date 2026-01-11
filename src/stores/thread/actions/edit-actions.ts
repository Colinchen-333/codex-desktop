/**
 * Edit Actions
 *
 * Actions for editing and deleting user messages.
 * Only user messages (userMessage type) can be edited or deleted.
 *
 * Integrated with undo/redo functionality.
 */

import type { WritableDraft } from 'immer'
import { log } from '../../../lib/logger'
import type { ThreadState, UserMessageItem } from '../types'
import { useUndoRedoStore } from '../../undoRedo'

// ==================== Type Guard ====================

/**
 * Check if an item is a user message that can be edited
 */
function isEditableUserMessage(item: unknown): item is UserMessageItem {
  if (typeof item !== 'object' || item === null) return false
  const threadItem = item as { type?: string }
  return threadItem.type === 'userMessage'
}

// ==================== Start Edit Message ====================

/**
 * Start editing a user message
 * Sets the message into edit mode and preserves the original text
 */
export function createStartEditMessage(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (itemId: string, threadIdOverride?: string) => {
    const { focusedThreadId, threads } = get()
    const threadId = threadIdOverride ?? focusedThreadId
    if (!threadId || !threads[threadId]) {
      log.warn('[startEditMessage] No active thread', 'edit-actions')
      return
    }

    const threadState = threads[threadId]
    const item = threadState.items[itemId]

    if (!isEditableUserMessage(item)) {
      log.warn(`[startEditMessage] Item ${itemId} is not a user message`, 'edit-actions')
      return
    }

    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) return state

      const targetItem = ts.items[itemId] as WritableDraft<UserMessageItem>
      if (!targetItem || targetItem.type !== 'userMessage') return state

      // Initialize edit state
      targetItem.editState = {
        isEditing: true,
        editedText: targetItem.content.text,
        originalText: targetItem.content.text,
      }

      log.debug(`[startEditMessage] Started editing message ${itemId}`, 'edit-actions')
      return state
    })
  }
}

// ==================== Update Edit Text ====================

/**
 * Update the text being edited (draft state)
 * This allows real-time updates as the user types
 */
export function createUpdateEditText(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (itemId: string, text: string, threadIdOverride?: string) => {
    const { focusedThreadId, threads } = get()
    const threadId = threadIdOverride ?? focusedThreadId
    if (!threadId || !threads[threadId]) return

    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) return state

      const targetItem = ts.items[itemId] as WritableDraft<UserMessageItem>
      if (!targetItem || targetItem.type !== 'userMessage') return state

      if (targetItem.editState?.isEditing) {
        targetItem.editState.editedText = text
      }

      return state
    })
  }
}

// ==================== Save Edit Message ====================

/**
 * Save the edited message
 * Updates the message content with the edited text and marks it as edited
 */
export function createSaveEditMessage(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (itemId: string, threadIdOverride?: string) => {
    const { focusedThreadId, threads } = get()
    const threadId = threadIdOverride ?? focusedThreadId
    if (!threadId || !threads[threadId]) {
      log.warn('[saveEditMessage] No active thread', 'edit-actions')
      return
    }

    const threadState = threads[threadId]
    const item = threadState.items[itemId]

    if (!isEditableUserMessage(item)) {
      log.warn(`[saveEditMessage] Item ${itemId} is not a user message`, 'edit-actions')
      return
    }

    if (!item.editState?.isEditing) {
      log.warn(`[saveEditMessage] Item ${itemId} is not in edit mode`, 'edit-actions')
      return
    }

    const newText = item.editState.editedText?.trim()
    if (!newText) {
      log.warn('[saveEditMessage] Cannot save empty message', 'edit-actions')
      return
    }

    // Record state before edit for undo
    const previousState = {
      itemId,
      itemData: { ...item },
    }

    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) return state

      const targetItem = ts.items[itemId] as WritableDraft<UserMessageItem>
      if (!targetItem || targetItem.type !== 'userMessage') return state

      // Update the message content
      targetItem.content.text = newText

      // Mark as edited and exit edit mode
      targetItem.editState = {
        isEditing: false,
        editedAt: Date.now(),
        originalText: targetItem.editState?.originalText,
      }

      log.debug(`[saveEditMessage] Saved edited message ${itemId}`, 'edit-actions')
      return state
    })

    // Record operation for undo
    const { pushOperation } = useUndoRedoStore.getState()
    pushOperation({
      type: 'editMessage',
      description: 'Edit message',
      previousState,
      threadId,
    })
  }
}

// ==================== Cancel Edit Message ====================

/**
 * Cancel editing a message
 * Reverts any changes and exits edit mode
 */
export function createCancelEditMessage(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (itemId: string, threadIdOverride?: string) => {
    const { focusedThreadId, threads } = get()
    const threadId = threadIdOverride ?? focusedThreadId
    if (!threadId || !threads[threadId]) return

    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) return state

      const targetItem = ts.items[itemId] as WritableDraft<UserMessageItem>
      if (!targetItem || targetItem.type !== 'userMessage') return state

      // Preserve editedAt if the message was previously edited
      const previousEditedAt = targetItem.editState?.editedAt

      // Exit edit mode without saving changes
      if (previousEditedAt) {
        // Keep the edited marker if it was edited before
        targetItem.editState = {
          isEditing: false,
          editedAt: previousEditedAt,
        }
      } else {
        // Clear edit state entirely if never edited
        targetItem.editState = undefined
      }

      log.debug(`[cancelEditMessage] Cancelled editing message ${itemId}`, 'edit-actions')
      return state
    })
  }
}

// ==================== Delete Message ====================

/**
 * Delete a user message from the thread
 * Note: This should be called after user confirms the deletion
 */
export function createDeleteMessage(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (itemId: string, threadIdOverride?: string) => {
    const { focusedThreadId, threads } = get()
    const threadId = threadIdOverride ?? focusedThreadId
    if (!threadId || !threads[threadId]) {
      log.warn('[deleteMessage] No active thread', 'edit-actions')
      return
    }

    const threadState = threads[threadId]
    const item = threadState.items[itemId]

    if (!isEditableUserMessage(item)) {
      log.warn(`[deleteMessage] Item ${itemId} is not a user message`, 'edit-actions')
      return
    }

    // Record state before deletion for undo
    const previousState = {
      itemId,
      itemData: { ...item },
      itemOrder: [...threadState.itemOrder],
    }

    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) return state

      // Remove from items
      delete ts.items[itemId]

      // Remove from itemOrder
      ts.itemOrder = ts.itemOrder.filter((id) => id !== itemId)

      log.debug(`[deleteMessage] Deleted message ${itemId}`, 'edit-actions')
      return state
    })

    // Record operation for undo
    const { pushOperation } = useUndoRedoStore.getState()
    pushOperation({
      type: 'deleteMessage',
      description: 'Delete message',
      previousState,
      threadId,
    })
  }
}
