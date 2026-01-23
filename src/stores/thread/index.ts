/**
 * Thread Store - Main Entry Point
 *
 * This module composes all the thread store functionality from
 * the various sub-modules and exports the unified Zustand store.
 *
 * Directory Structure:
 * - types.ts: All type definitions
 * - constants.ts: Configuration constants
 * - lru-cache.ts: LRU cache implementation
 * - delta-buffer.ts: Delta buffering logic
 * - handlers/: Event handlers
 * - actions/: Store actions
 * - utils/: Utility functions
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { StoreApi, UseBoundStore } from 'zustand'
import type { WritableDraft } from 'immer'

// Import types
import type { ThreadState } from './types'

// Import constants
import { MAX_PARALLEL_SESSIONS } from './constants'

// Import utilities
import {
  defaultTokenUsage,
  defaultTurnTiming,
  getFocusedThreadState,
  createEmptyThreadState,
} from './utils'
import { safeClosingThreadsOperation } from './delta-buffer'

// Import handlers
import {
  createHandleItemStarted,
  createHandleItemCompleted,
  createHandleAgentMessageDelta,
  createHandleCommandExecutionOutputDelta,
  createHandleFileChangeOutputDelta,
  createHandleReasoningSummaryTextDelta,
  createHandleReasoningSummaryPartAdded,
  createHandleReasoningTextDelta,
  createHandleMcpToolCallProgress,
  createHandleThreadStarted,
  createHandleTurnStarted,
  createHandleTurnCompleted,
  createHandleTurnDiffUpdated,
  createHandleTurnPlanUpdated,
  createHandleThreadCompacted,
  createHandleTokenUsage,
  createHandleStreamError,
  createHandleRateLimitExceeded,
  createHandleServerDisconnected,
  createHandleCommandApprovalRequested,
  createHandleFileChangeApprovalRequested,
  createCleanupStaleApprovals,
} from './handlers'

// Import actions
import {
  createStartThread,
  createResumeThread,
  createSwitchThread,
  createCloseThread,
  createCloseAllThreads,
  createInterrupt,
  createClearThread,
  createGetActiveThreadIds,
  createCanAddSession,
  createEnqueueQueuedMessage,
  createDequeueQueuedMessage,
  createRequeueMessageFront,
  createDispatchNextQueuedMessage,
  createSendMessage,
  createRespondToApprovalInThread,
  createRespondToApproval,
  createFlushDeltaBuffer,
  createAddInfoItem,
  createSetSessionOverride,
  createClearSessionOverrides,
  createCreateSnapshot,
  createRevertToSnapshot,
  createFetchSnapshots,
  createStartEditMessage,
  createUpdateEditText,
  createSaveEditMessage,
  createCancelEditMessage,
  createDeleteMessage,
  createAddItemBack,
  createRestoreMessageContent,
  createRestoreThreadState,
  createRestoreItemOrder,
} from './actions'

// Import timer cleanup utilities
import {
  startApprovalCleanupTimer,
  startTimerCleanupInterval,
} from './utils'

// Import agent integration utilities
import { cleanupEventVersion } from './agent-integration'

// ==================== Store Creation ====================

export const useThreadStore: UseBoundStore<StoreApi<ThreadState>> = create<ThreadState>()(
  immer((set, get) => {
    // Type-safe set function wrapper
    const typedSet = set as (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void

    // Create helper function to get thread store state (for use in async callbacks)
    const getThreadStore = (): ThreadState => useThreadStore.getState()

    // Create stale approvals cleanup function
    const cleanupStaleApprovals = createCleanupStaleApprovals(getThreadStore, typedSet)

    // Create queue message helpers
    const enqueueQueuedMessage = createEnqueueQueuedMessage(typedSet)
    const dequeueQueuedMessage = createDequeueQueuedMessage(typedSet, get)
    const requeueMessageFront = createRequeueMessageFront(typedSet)
    const dispatchNextQueuedMessage = createDispatchNextQueuedMessage(
      get,
      dequeueQueuedMessage,
      requeueMessageFront
    )

    // Create undo helper actions
    const addItemBack = createAddItemBack(typedSet)
    const restoreMessageContent = createRestoreMessageContent(typedSet)
    const restoreThreadState = createRestoreThreadState(typedSet)
    const restoreItemOrder = createRestoreItemOrder(typedSet)

    const respondToApprovalInThread = createRespondToApprovalInThread(typedSet, get)

    // Create thread actions
    const closeThread = createCloseThread(typedSet, get, getThreadStore)

    return {
      // ==================== Multi-thread State ====================
      threads: {},
      focusedThreadId: null,
      maxSessions: MAX_PARALLEL_SESSIONS,

      // ==================== Global State ====================
      snapshots: [],
      isLoading: false,
      globalError: null,

      // ==================== Backward-compatible Getters ====================
      get activeThread() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.thread ?? null
      },

      get items() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.items ?? {}
      },

      get itemOrder() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.itemOrder ?? []
      },

      get turnStatus() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.turnStatus ?? 'idle'
      },

      get currentTurnId() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.currentTurnId ?? null
      },

      get pendingApprovals() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.pendingApprovals ?? []
      },

      get tokenUsage() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.tokenUsage ?? defaultTokenUsage
      },

      get turnTiming() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.turnTiming ?? defaultTurnTiming
      },

      get sessionOverrides() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.sessionOverrides ?? {}
      },

      get queuedMessages() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.queuedMessages ?? []
      },

      get error() {
        const state = get()
        const focusedState = getFocusedThreadState(state.threads, state.focusedThreadId)
        return focusedState?.error ?? state.globalError
      },

      // ==================== Multi-Session Actions ====================
      switchThread: createSwitchThread(typedSet, get),
      closeThread,
      closeAllThreads: createCloseAllThreads(typedSet, get),
      getActiveThreadIds: createGetActiveThreadIds(get),
      canAddSession: createCanAddSession(get),

      // ==================== Thread Lifecycle ====================
      startThread: createStartThread(typedSet, get, getThreadStore, cleanupStaleApprovals),
      resumeThread: createResumeThread(typedSet, get, getThreadStore, cleanupStaleApprovals),
      registerAgentThread: (thread, _agentId, options) => {
        startApprovalCleanupTimer(cleanupStaleApprovals, 60000)
        startTimerCleanupInterval(() => new Set(Object.keys(getThreadStore().threads)))

        // P1 Fix: Always reset event version when registering a thread
        // This ensures that if a thread ID is reused, old event versions don't block new events
        cleanupEventVersion(thread.id)

        set((state) => {
          safeClosingThreadsOperation(thread.id, 'delete')

          if (!state.threads[thread.id]) {
            state.threads[thread.id] = createEmptyThreadState(thread)
          } else {
            // Thread is being reused - reset the thread state while preserving the thread info
            state.threads[thread.id].thread = {
              ...state.threads[thread.id].thread,
              ...thread,
            }
            // P1 Fix: Reset turn-related state when thread is reused
            state.threads[thread.id].turnStatus = 'idle'
            state.threads[thread.id].currentTurnId = null
            state.threads[thread.id].pendingApprovals = []
            state.threads[thread.id].error = null
          }

          // Note: agentMapping is maintained in multi-agent-v2 store as the single source of truth

          if (options?.focus) {
            state.focusedThreadId = thread.id
          }
        })
      },
      unregisterAgentThread: (threadId) => {
        // Note: agentMapping cleanup is handled by multi-agent-v2 store
        // P1 Fix: Clean up event version tracking when unregistering a thread
        // This prevents memory leaks and ensures proper event version reset on re-registration
        cleanupEventVersion(threadId)
      },
      sendMessage: createSendMessage(typedSet, get, enqueueQueuedMessage, dispatchNextQueuedMessage),
      interrupt: createInterrupt(typedSet, get),
      respondToApprovalInThread,
      respondToApproval: createRespondToApproval(typedSet, get, respondToApprovalInThread),
      clearThread: createClearThread(get, closeThread),

      // ==================== Buffer and Info Actions ====================
      flushDeltaBuffer: createFlushDeltaBuffer(typedSet, get),
      addInfoItem: createAddInfoItem(typedSet, get),
      setSessionOverride: createSetSessionOverride(typedSet, get),
      clearSessionOverrides: createClearSessionOverrides(typedSet, get),

      // ==================== Message Edit/Delete Actions ====================
      startEditMessage: createStartEditMessage(typedSet, get),
      updateEditText: createUpdateEditText(typedSet, get),
      saveEditMessage: createSaveEditMessage(typedSet, get),
      cancelEditMessage: createCancelEditMessage(typedSet, get),
      deleteMessage: createDeleteMessage(typedSet, get),

      // ==================== Undo Helper Actions ====================
      addItemBack,
      restoreMessageContent,
      restoreThreadState,
      restoreItemOrder,

      // ==================== Event Handlers ====================
      handleThreadStarted: createHandleThreadStarted(typedSet),
      handleItemStarted: createHandleItemStarted(typedSet, get),
      handleItemCompleted: createHandleItemCompleted(typedSet, get),
      handleAgentMessageDelta: createHandleAgentMessageDelta(get),
      handleCommandApprovalRequested: createHandleCommandApprovalRequested(typedSet),
      handleFileChangeApprovalRequested: createHandleFileChangeApprovalRequested(typedSet),
      handleTurnStarted: createHandleTurnStarted(typedSet, get, getThreadStore),
      handleTurnCompleted: createHandleTurnCompleted(typedSet, get, getThreadStore, dispatchNextQueuedMessage),
      handleTurnDiffUpdated: createHandleTurnDiffUpdated(typedSet),
      handleTurnPlanUpdated: createHandleTurnPlanUpdated(typedSet),
      handleThreadCompacted: createHandleThreadCompacted(typedSet),
      handleCommandExecutionOutputDelta: createHandleCommandExecutionOutputDelta(get),
      handleFileChangeOutputDelta: createHandleFileChangeOutputDelta(get),
      handleReasoningSummaryTextDelta: createHandleReasoningSummaryTextDelta(get),
      handleReasoningSummaryPartAdded: createHandleReasoningSummaryPartAdded(),
      handleReasoningTextDelta: createHandleReasoningTextDelta(get),
      handleMcpToolCallProgress: createHandleMcpToolCallProgress(get),
      handleTokenUsage: createHandleTokenUsage(typedSet),
      handleStreamError: createHandleStreamError(typedSet),
      handleRateLimitExceeded: createHandleRateLimitExceeded(typedSet, get),
      handleServerDisconnected: createHandleServerDisconnected(typedSet, get),

      // ==================== Snapshot Actions ====================
      createSnapshot: createCreateSnapshot(typedSet, get),
      revertToSnapshot: createRevertToSnapshot(typedSet, get),
      fetchSnapshots: createFetchSnapshots(typedSet, get),
    }
  })
)

// ==================== Re-exports ====================

// Export types
export type {
  ThreadItemType,
  ThreadItem,
  EditableMessage,
  UserMessageItem,
  AgentMessageItem,
  CommandExecutionItem,
  FileChangeItem,
  ReasoningItem,
  McpToolItem,
  WebSearchItem,
  ReviewItem,
  InfoItem,
  ErrorItem,
  PlanStep,
  PlanItem,
  AnyThreadItem,
  TurnStatus,
  PendingApproval,
  TokenUsage,
  TurnTiming,
  SessionOverrides,
  QueuedMessage,
  SingleThreadState,
  ThreadState,
  DeltaBuffer,
  LRUCacheNode,
} from './types'

// Export utilities for external use
export { clearThreadTimers, getTimerStats, cleanupThreadResources } from './utils/timer-cleanup'

// Export LRU cache for use in components (e.g., ChatView itemSizeCache)
export { LRUCache } from './lru-cache'
export { MAX_LRU_CACHE_SIZE } from './constants'

// Export selectors for optimized state access
// Use these instead of getter-based state access to avoid potential re-render loops
export {
  selectFocusedThread,
  selectFocusedThreadId,
  selectTurnStatus,
  selectItems,
  selectItemOrder,
  selectOrderedItems,
  selectPendingApprovals,
  selectPendingApprovalsByThread,
  selectGlobalPendingApprovalCount,
  selectPendingApprovalsForThread,
  selectQueuedMessages,
  selectTokenUsage,
  selectTurnTiming,
  selectSessionOverrides,
  selectActiveThread,
  selectCanAddSession,
  selectIsLoading,
  selectGlobalError,
  selectSnapshots,
} from './selectors'
