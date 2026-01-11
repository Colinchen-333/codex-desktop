/**
 * Undo Helper Actions
 *
 * Helper actions for undo/redo functionality.
 * These methods are used by the useUndoRedo hook to restore state.
 */

import type { WritableDraft } from 'immer'
import { log } from '../../../lib/logger'
import type { ThreadState, AnyThreadItem } from '../types'

// ==================== Add Item Back (Undo Delete) ====================

export function createAddItemBack(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (itemId: string, itemData: AnyThreadItem, threadId: string) => {
    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) {
        log.warn(`[addItemBack] Thread ${threadId} not found`, 'undo-actions')
        return state
      }

      // Restore the item
      ts.items[itemId] = itemData

      // Add to item order if not already present
      if (!ts.itemOrder.includes(itemId)) {
        ts.itemOrder.push(itemId)
      }

      log.debug(`[addItemBack] Restored item ${itemId}`, 'undo-actions')
      return state
    })
  }
}

// ==================== Restore Message Content (Undo Edit) ====================

export function createRestoreMessageContent(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (itemId: string, previousItemData: AnyThreadItem, threadId: string) => {
    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) {
        log.warn(`[restoreMessageContent] Thread ${threadId} not found`, 'undo-actions')
        return state
      }

      const currentItem = ts.items[itemId]
      if (!currentItem) {
        log.warn(`[restoreMessageContent] Item ${itemId} not found`, 'undo-actions')
        return state
      }

      // Only restore user message content
      if (currentItem.type !== 'userMessage' || previousItemData.type !== 'userMessage') {
        log.warn(`[restoreMessageContent] Item ${itemId} is not a user message`, 'undo-actions')
        return state
      }

      // Restore the content
      currentItem.content = previousItemData.content
      
      // P2: Type-safe access to editState for user messages
      if ('editState' in previousItemData) {
        (currentItem as import('../types').UserMessageItem).editState = 
          (previousItemData as import('../types').UserMessageItem).editState
      }

      log.debug(`[restoreMessageContent] Restored content for item ${itemId}`, 'undo-actions')
      return state
    })
  }
}

// ==================== Restore Thread State (Undo Clear) ====================

export function createRestoreThreadState(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (threadStateData: { items: Record<string, unknown>; itemOrder: string[] }, threadId: string) => {
    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) {
        log.warn(`[restoreThreadState] Thread ${threadId} not found`, 'undo-actions')
        return state
      }

      // Restore items and order
      ts.items = threadStateData.items as Record<string, AnyThreadItem>
      ts.itemOrder = threadStateData.itemOrder

      log.debug(`[restoreThreadState] Restored state for thread ${threadId}`, 'undo-actions')
      return state
    })
  }
}

// ==================== Restore Item Order ====================

export function createRestoreItemOrder(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (itemOrder: string[], threadId: string) => {
    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) {
        log.warn(`[restoreItemOrder] Thread ${threadId} not found`, 'undo-actions')
        return state
      }

      ts.itemOrder = itemOrder

      log.debug(`[restoreItemOrder] Restored item order for thread ${threadId}`, 'undo-actions')
      return state
    })
  }
}
