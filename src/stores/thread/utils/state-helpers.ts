/**
 * State Helper Functions
 * 
 * P2: Extracted common state update patterns to eliminate code duplication across handlers.
 * These helpers provide safe, type-safe state mutations that work with Immer's draft mode.
 */

import type { WritableDraft } from 'immer'
import type { ThreadState, SingleThreadState, AnyThreadItem } from '../types'

/**
 * Safely update a thread's state.
 * If the thread doesn't exist, returns the original state without modification.
 * 
 * @param state - The root thread state
 * @param threadId - The ID of the thread to update
 * @param updates - Partial updates to apply to the thread state
 * @returns Updated state (or original if thread not found)
 */
export function updateThreadState(
  state: WritableDraft<ThreadState> | ThreadState,
  threadId: string,
  updates: Partial<SingleThreadState>
): ThreadState | void {
  const threadState = state.threads[threadId]
  if (!threadState) {
    return state as ThreadState
  }
  
  // With Immer, we can directly mutate the draft
  Object.assign(threadState, updates)
}

/**
 * Safely update a specific item in a thread.
 * If the thread or item doesn't exist, returns the original state without modification.
 * 
 * @param state - The root thread state
 * @param threadId - The ID of the thread containing the item
 * @param itemId - The ID of the item to update
 * @param updates - Partial updates to apply to the item
 * @returns Updated state (or original if thread/item not found)
 */
export function updateThreadItem<T extends AnyThreadItem>(
  state: WritableDraft<ThreadState> | ThreadState,
  threadId: string,
  itemId: string,
  updates: Partial<T>
): ThreadState | void {
  const threadState = state.threads[threadId]
  if (!threadState) return state as ThreadState
  
  const item = threadState.items[itemId]
  if (!item) return state as ThreadState
  
  // With Immer, we can directly mutate the draft
  Object.assign(item, updates)
}

/**
 * Safely add or update an item in a thread.
 * Creates the item if it doesn't exist, updates if it does.
 * Also ensures the item is in the itemOrder array.
 * 
 * @param state - The root thread state
 * @param threadId - The ID of the thread
 * @param itemId - The ID of the item
 * @param item - The complete item to set
 * @returns Updated state (or original if thread not found)
 */
export function setThreadItem(
  state: WritableDraft<ThreadState> | ThreadState,
  threadId: string,
  itemId: string,
  item: AnyThreadItem
): ThreadState | void {
  const threadState = state.threads[threadId]
  if (!threadState) return state as ThreadState
  
  // Set the item
  threadState.items[itemId] = item as WritableDraft<AnyThreadItem>
  
  // Ensure it's in the item order
  if (!threadState.itemOrder.includes(itemId)) {
    threadState.itemOrder.push(itemId)
  }
}

/**
 * Safely remove an item from a thread.
 * Removes from both the items map and the itemOrder array.
 * 
 * @param state - The root thread state
 * @param threadId - The ID of the thread
 * @param itemId - The ID of the item to remove
 * @returns Updated state (or original if thread not found)
 */
export function removeThreadItem(
  state: WritableDraft<ThreadState> | ThreadState,
  threadId: string,
  itemId: string
): ThreadState | void {
  const threadState = state.threads[threadId]
  if (!threadState) return state as ThreadState
  
  // Remove from items
  delete threadState.items[itemId]
  
  // Remove from order
  const orderIndex = threadState.itemOrder.indexOf(itemId)
  if (orderIndex >= 0) {
    threadState.itemOrder.splice(orderIndex, 1)
  }
}

/**
 * Update thread timing information.
 * Helper for updating turn timing fields.
 * 
 * @param state - The root thread state
 * @param threadId - The ID of the thread
 * @param timing - Partial timing updates
 * @returns Updated state (or original if thread not found)
 */
export function updateThreadTiming(
  state: WritableDraft<ThreadState> | ThreadState,
  threadId: string,
  timing: Partial<{ startedAt: number | null; completedAt: number | null }>
): ThreadState | void {
  const threadState = state.threads[threadId]
  if (!threadState) return state as ThreadState
  
  Object.assign(threadState.turnTiming, timing)
}

/**
 * Update thread error state.
 * Helper for setting error message and status.
 * 
 * @param state - The root thread state
 * @param threadId - The ID of the thread
 * @param error - Error message (or null to clear)
 * @param turnStatus - Optional turn status to set
 * @returns Updated state (or original if thread not found)
 */
export function updateThreadError(
  state: WritableDraft<ThreadState> | ThreadState,
  threadId: string,
  error: string | null,
  turnStatus?: 'failed' | 'interrupted'
): ThreadState | void {
  const threadState = state.threads[threadId]
  if (!threadState) return state as ThreadState
  
  threadState.error = error
  if (turnStatus) {
    threadState.turnStatus = turnStatus
  }
}

/**
 * Clear thread turn state.
 * Resets turn-related fields to their default values.
 * 
 * @param state - The root thread state
 * @param threadId - The ID of the thread
 * @returns Updated state (or original if thread not found)
 */
export function clearThreadTurnState(
  state: WritableDraft<ThreadState> | ThreadState,
  threadId: string
): ThreadState | void {
  const threadState = state.threads[threadId]
  if (!threadState) return state as ThreadState
  
  threadState.currentTurnId = null
  threadState.pendingApprovals = []
  threadState.turnTiming.completedAt = Date.now()
}
