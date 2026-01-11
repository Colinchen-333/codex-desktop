/**
 * Thread Store Selectors
 *
 * Centralized selector functions to optimize Zustand store access patterns.
 * These selectors help prevent unnecessary re-renders by ensuring components
 * only subscribe to the specific state they need.
 *
 * Performance Benefits:
 * - Reduces re-renders by selecting only needed state
 * - Provides memoized selectors for expensive computations
 * - Centralizes state access logic for easier maintenance
 */

import type { ThreadState, SingleThreadState, AnyThreadItem, ThreadItemType } from './types'

// ==================== Thread State Selectors ====================

/**
 * Select the focused thread's complete state.
 * Use this when you need access to multiple properties of the focused thread.
 */
export function selectFocusedThread(state: ThreadState): SingleThreadState | null {
  const { focusedThreadId, threads } = state
  return focusedThreadId ? threads[focusedThreadId] ?? null : null
}

/**
 * Select the focused thread ID only.
 * Use this when you only need to know which thread is focused.
 */
export function selectFocusedThreadId(state: ThreadState): string | null {
  return state.focusedThreadId
}

/**
 * Select all threads as an array.
 * Returns threads in insertion order (sorted by creation).
 */
export function selectAllThreads(state: ThreadState): SingleThreadState[] {
  const { threads, focusedThreadId } = state
  return Object.values(threads).sort((a, b) => {
    // Focused thread first
    if (a.thread.id === focusedThreadId) return -1
    if (b.thread.id === focusedThreadId) return 1
    // Then by creation time (newest first)
    const aTime = a.thread.createdAt ?? 0
    const bTime = b.thread.createdAt ?? 0
    return bTime - aTime
  })
}

/**
 * Select a specific thread by ID.
 * Returns null if thread doesn't exist.
 */
export function selectThreadById(threadId: string) {
  return (state: ThreadState): SingleThreadState | null => {
    return state.threads[threadId] ?? null
  }
}

// ==================== Thread Status Selectors ====================

/**
 * Select the turn status of the focused thread.
 */
export function selectTurnStatus(state: ThreadState): ThreadState['turnStatus'] {
  const focusedThread = selectFocusedThread(state)
  return focusedThread?.turnStatus ?? 'idle'
}

/**
 * Select whether the focused thread is currently running a turn.
 */
export function selectIsTurnRunning(state: ThreadState): boolean {
  return selectTurnStatus(state) === 'running'
}

/**
 * Select whether the focused thread is idle.
 */
export function selectIsIdle(state: ThreadState): boolean {
  return selectTurnStatus(state) === 'idle'
}

/**
 * Select the error state of the focused thread.
 */
export function selectThreadError(state: ThreadState): string | null {
  const focusedThread = selectFocusedThread(state)
  return focusedThread?.error ?? null
}

// ==================== Item Selectors ====================

/**
 * Select all items from the focused thread.
 * Returns items in their display order.
 */
export function selectItems(state: ThreadState): Record<string, AnyThreadItem> {
  const focusedThread = selectFocusedThread(state)
  return focusedThread?.items ?? {}
}

/**
 * Select the item order array from the focused thread.
 */
export function selectItemOrder(state: ThreadState): string[] {
  const focusedThread = selectFocusedThread(state)
  return focusedThread?.itemOrder ?? []
}

/**
 * Select items as an ordered array.
 * This is more convenient than working with the Record and order array separately.
 */
export function selectOrderedItems(state: ThreadState): AnyThreadItem[] {
  const focusedThread = selectFocusedThread(state)
  if (!focusedThread) return []
  const { items, itemOrder } = focusedThread
  return itemOrder.map((id) => items[id]).filter((item): item is AnyThreadItem => item !== undefined)
}

/**
 * Select a specific item by ID from the focused thread.
 */
export function selectItemById(itemId: string) {
  return (state: ThreadState): AnyThreadItem | null => {
    const items = selectItems(state)
    return items[itemId] ?? null
  }
}

/**
 * Select items of a specific type from the focused thread.
 */
export function selectItemsByType(itemType: ThreadItemType) {
  return (state: ThreadState): AnyThreadItem[] => {
    return selectOrderedItems(state).filter((item) => item.type === itemType)
  }
}

/**
 * Select only user messages from the focused thread.
 */
export function selectUserMessages(state: ThreadState): AnyThreadItem[] {
  return selectItemsByType('userMessage')(state)
}

/**
 * Select only agent messages from the focused thread.
 */
export function selectAgentMessages(state: ThreadState): AnyThreadItem[] {
  return selectItemsByType('agentMessage')(state)
}

/**
 * Select only command execution items from the focused thread.
 */
export function selectCommandExecutions(state: ThreadState): AnyThreadItem[] {
  return selectItemsByType('commandExecution')(state)
}

/**
 * Select only file change items from the focused thread.
 */
export function selectFileChanges(state: ThreadState): AnyThreadItem[] {
  return selectItemsByType('fileChange')(state)
}

// ==================== Approval Selectors ====================

/**
 * Select all pending approvals from the focused thread.
 */
export function selectPendingApprovals(state: ThreadState): ThreadState['pendingApprovals'] {
  const focusedThread = selectFocusedThread(state)
  return focusedThread?.pendingApprovals ?? []
}

/**
 * Select the count of pending approvals for the focused thread.
 */
export function selectPendingApprovalCount(state: ThreadState): number {
  return selectPendingApprovals(state).length
}

/**
 * Select whether the focused thread has any pending approvals.
 */
export function selectHasPendingApprovals(state: ThreadState): boolean {
  return selectPendingApprovalCount(state) > 0
}

/**
 * Select pending approvals of a specific type.
 */
export function selectPendingApprovalsByType(type: 'command' | 'fileChange') {
  return (state: ThreadState): ThreadState['pendingApprovals'] => {
    return selectPendingApprovals(state).filter((p) => p.type === type)
  }
}

// ==================== Queue Selectors ====================

/**
 * Select all queued messages for the focused thread.
 */
export function selectQueuedMessages(state: ThreadState): ThreadState['queuedMessages'] {
  const focusedThread = selectFocusedThread(state)
  return focusedThread?.queuedMessages ?? []
}

/**
 * Select the count of queued messages for the focused thread.
 */
export function selectQueuedMessageCount(state: ThreadState): number {
  return selectQueuedMessages(state).length
}

/**
 * Select whether the focused thread has any queued messages.
 */
export function selectHasQueuedMessages(state: ThreadState): boolean {
  return selectQueuedMessageCount(state) > 0
}

// ==================== Token Usage Selectors ====================

/**
 * Select token usage information for the focused thread.
 */
export function selectTokenUsage(state: ThreadState): ThreadState['tokenUsage'] {
  const focusedThread = selectFocusedThread(state)
  return focusedThread?.tokenUsage ?? {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    modelContextWindow: null,
  }
}

/**
 * Select the total token count for the focused thread.
 */
export function selectTotalTokens(state: ThreadState): number {
  return selectTokenUsage(state).totalTokens
}

/**
 * Select the percentage of context window used.
 * Returns null if context window size is unknown.
 */
export function selectContextWindowUsage(state: ThreadState): number | null {
  const { totalTokens, modelContextWindow } = selectTokenUsage(state)
  return modelContextWindow !== null ? (totalTokens / modelContextWindow) * 100 : null
}

// ==================== Turn Timing Selectors ====================

/**
 * Select turn timing information for the focused thread.
 */
export function selectTurnTiming(state: ThreadState): ThreadState['turnTiming'] {
  const focusedThread = selectFocusedThread(state)
  return focusedThread?.turnTiming ?? {
    startedAt: null,
    completedAt: null,
  }
}

/**
 * Select the current turn duration in milliseconds.
 * Returns null if no turn is in progress.
 */
export function selectTurnDuration(state: ThreadState): number | null {
  const { startedAt, completedAt } = selectTurnTiming(state)
  if (startedAt === null) return null
  const endTime = completedAt ?? Date.now()
  return endTime - startedAt
}

// ==================== Session Override Selectors ====================

/**
 * Select session overrides for the focused thread.
 */
export function selectSessionOverrides(state: ThreadState): ThreadState['sessionOverrides'] {
  const focusedThread = selectFocusedThread(state)
  return focusedThread?.sessionOverrides ?? {}
}

/**
 * Select a specific session override value.
 */
export function selectSessionOverride(key: keyof ThreadState['sessionOverrides']) {
  return (state: ThreadState): string | undefined => {
    return selectSessionOverrides(state)[key]
  }
}

// ==================== Multi-Session Selectors ====================

/**
 * Select the maximum number of allowed parallel sessions.
 */
export function selectMaxSessions(state: ThreadState): number {
  return state.maxSessions
}

/**
 * Select the count of active sessions.
 */
export function selectActiveSessionCount(state: ThreadState): number {
  return Object.keys(state.threads).length
}

/**
 * Select whether a new session can be added.
 */
export function selectCanAddSession(state: ThreadState): boolean {
  return selectActiveSessionCount(state) < selectMaxSessions(state)
}

/**
 * Select active thread IDs as an array.
 */
export function selectActiveThreadIds(state: ThreadState): string[] {
  return Object.keys(state.threads)
}

// ==================== Computed Selectors ====================

/**
 * Select whether the application is currently loading.
 */
export function selectIsLoading(state: ThreadState): boolean {
  return state.isLoading
}

/**
 * Select the global error state.
 */
export function selectGlobalError(state: ThreadState): string | null {
  return state.globalError
}

/**
 * Select snapshots array.
 */
export function selectSnapshots(state: ThreadState): ThreadState['snapshots'] {
  return state.snapshots
}

// ==================== Backward Compatibility Selectors ====================
/**
 * These selectors provide backward-compatible access to state
 * for components that expect the old single-thread API.
 */

/**
 * Select the active thread (backward compatibility).
 * This is an alias for selectFocusedThread.
 */
export const selectActiveThread = selectFocusedThread

/**
 * Select the active thread info (backward compatibility).
 */
export function selectActiveThreadInfo(state: ThreadState): ThreadState['activeThread'] {
  return state.activeThread
}

/**
 * Select items using backward-compatible accessor.
 */
export const selectItemsBC = selectItems

/**
 * Select item order using backward-compatible accessor.
 */
export const selectItemOrderBC = selectItemOrder
