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
} from './utils'

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
      sendMessage: createSendMessage(typedSet, get, enqueueQueuedMessage, dispatchNextQueuedMessage),
      interrupt: createInterrupt(typedSet, get),
      respondToApproval: createRespondToApproval(typedSet, get),
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
      revertToSnapshot: createRevertToSnapshot(),
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
