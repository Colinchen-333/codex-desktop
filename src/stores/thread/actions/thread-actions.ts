/**
 * Thread Lifecycle Actions
 *
 * Actions for managing thread lifecycle including start, resume,
 * switch, close, and interrupt operations.
 */

import type { WritableDraft } from 'immer'
import { threadApi } from '../../../lib/api'
import { parseError, handleAsyncError } from '../../../lib/errorUtils'
import { log } from '../../../lib/logger'
import {
  normalizeApprovalPolicy,
  normalizeSandboxMode,
} from '../../../lib/normalize'
import type { ThreadState, AnyThreadItem, SingleThreadState } from '../types'
import { CLOSING_THREAD_CLEANUP_DELAY_MS } from '../constants'
import {
  getNextOperationSequence,
  getCurrentOperationSequence,
  deltaBuffers,
  closingThreads,
  clearDeltaBuffer,
  clearTurnTimeout,
  performFullTurnCleanup,
} from '../delta-buffer'
import {
  createEmptyThreadState,
  toThreadItem,
  defaultTokenUsage,
  defaultTurnTiming,
} from '../utils/helpers'
import {
  clearThreadTimers,
  startApprovalCleanupTimer,
  stopApprovalCleanupTimer,
  startTimerCleanupInterval,
  stopTimerCleanupInterval,
} from '../utils/timer-cleanup'

// ==================== Start Thread Action ====================

export function createStartThread(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState,
  getThreadStore: () => ThreadState,
  cleanupStaleApprovals: () => Promise<void>
) {
  return async (
    projectId: string,
    cwd: string,
    model?: string,
    sandboxMode?: string,
    approvalPolicy?: string
  ) => {
    const { threads, maxSessions } = get()

    // Check if we can add another session
    if (Object.keys(threads).length >= maxSessions) {
      throw new Error(`Maximum number of parallel sessions (${maxSessions}) reached. Please close a session first.`)
    }

    const opSeq = getNextOperationSequence()
    startApprovalCleanupTimer(cleanupStaleApprovals, 60000)
    startTimerCleanupInterval(() => new Set(Object.keys(getThreadStore().threads)))

    set((state) => {
      state.isLoading = true
      state.globalError = null
      return state
    })

    try {
      const safeModel = model?.trim() || undefined
      const safeSandboxMode = normalizeSandboxMode(sandboxMode)
      const safeApprovalPolicy = normalizeApprovalPolicy(approvalPolicy)

      const response = await threadApi.start(
        projectId,
        cwd,
        safeModel,
        safeSandboxMode,
        safeApprovalPolicy
      )

      if (getCurrentOperationSequence() !== opSeq) {
        console.warn('[startThread] Another operation started, discarding result')
        return
      }

      const threadId = response.thread.id
      const newThreadState = createEmptyThreadState(response.thread)

      set((state) => {
        state.threads[threadId] = newThreadState
        state.focusedThreadId = threadId
        state.isLoading = false
        state.globalError = null
        return state
      })
    } catch (error) {
      if (getCurrentOperationSequence() === opSeq) {
        set((state) => {
          state.globalError = parseError(error)
          state.isLoading = false
          return state
        })
      }
      throw error
    }
  }
}

// ==================== Resume Thread Action ====================

export function createResumeThread(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState,
  getThreadStore: () => ThreadState,
  cleanupStaleApprovals: () => Promise<void>
) {
  return async (threadId: string) => {
    log.debug(`[resumeThread] Starting resume with threadId: ${threadId}`, 'thread-actions')

    const { threads, maxSessions } = get()

    // If thread already exists in our store, just switch to it
    if (threads[threadId]) {
      set((state) => {
        state.focusedThreadId = threadId
        return state
      })
      return
    }

    // Check if we can add another session
    if (Object.keys(threads).length >= maxSessions) {
      throw new Error(`Maximum number of parallel sessions (${maxSessions}) reached. Please close a session first.`)
    }

    const opSeq = getNextOperationSequence()
    startApprovalCleanupTimer(cleanupStaleApprovals, 60000)
    startTimerCleanupInterval(() => new Set(Object.keys(getThreadStore().threads)))

    set((state) => {
      state.isLoading = true
      state.globalError = null
      return state
    })

    try {
      const response = await threadApi.resume(threadId)

      if (getCurrentOperationSequence() !== opSeq) {
        console.warn('[resumeThread] Another operation started, discarding result for threadId:', threadId)
        return
      }

      log.debug(`[resumeThread] Resume response - thread.id: ${response.thread.id}, requested threadId: ${threadId}`, 'thread-actions')

      // Convert items from response to our format
      const items: Record<string, AnyThreadItem> = {}
      const itemOrder: string[] = []

      for (const rawItem of response.items) {
        if (!rawItem || typeof rawItem !== 'object') {
          console.warn('[resumeThread] Skipping invalid item (not an object):', rawItem)
          continue
        }
        const item = rawItem as { id?: string; type?: string }
        if (!item.id || !item.type) {
          console.warn('[resumeThread] Skipping item with missing id or type:', item)
          continue
        }
        const threadItem = toThreadItem(rawItem as { id: string; type: string } & Record<string, unknown>)
        items[threadItem.id] = threadItem
        itemOrder.push(threadItem.id)
      }

      const newThreadState: SingleThreadState = {
        thread: response.thread,
        items,
        itemOrder,
        turnStatus: 'idle',
        currentTurnId: null,
        pendingApprovals: [],
        tokenUsage: defaultTokenUsage,
        turnTiming: defaultTurnTiming,
        sessionOverrides: {},
        queuedMessages: [],
        error: null,
      }

      set((state) => {
        state.threads[response.thread.id] = newThreadState
        state.focusedThreadId = response.thread.id
        state.isLoading = false
        state.globalError = null
        return state
      })

      // Sync session status to 'idle' after successful resume
      void import('../../sessions').then(async ({ useSessionsStore }) => {
        // Check thread still exists to prevent race condition with closeThread
        if (!getThreadStore().threads[response.thread.id]) return
        await useSessionsStore.getState().updateSessionStatus(response.thread.id, 'idle')
      }).catch((err) => handleAsyncError(err, 'resumeThread session sync', 'thread'))

      log.debug(`[resumeThread] Resume completed, activeThread.id: ${response.thread.id}`, 'thread-actions')
    } catch (error) {
      log.error(`[resumeThread] Resume failed: ${error}`, 'thread-actions')
      if (getCurrentOperationSequence() === opSeq) {
        set((state) => {
          state.globalError = parseError(error)
          state.isLoading = false
          return state
        })
      }
      throw error
    }
  }
}

// ==================== Switch Thread Action ====================

export function createSwitchThread(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (threadId: string) => {
    const { threads } = get()
    if (!threads[threadId]) {
      console.warn('[switchThread] Thread not found:', threadId)
      return
    }
    set((state) => {
      state.focusedThreadId = threadId
      return state
    })
  }
}

// ==================== Close Thread Action ====================

export function createCloseThread(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState,
  getThreadStore: () => ThreadState
) {
  return (threadId: string) => {
    const { threads, focusedThreadId } = get()
    if (!threads[threadId]) {
      console.warn('[closeThread] Thread not found:', threadId)
      return
    }

    // Mark thread as closing to prevent race conditions with delta events
    closingThreads.add(threadId)

    // Clean up all thread-specific timers comprehensively
    clearThreadTimers(threadId)
    clearDeltaBuffer(threadId)
    clearTurnTimeout(threadId)
    deltaBuffers.delete(threadId)

    // Remove thread from state
    const updatedThreads = { ...threads }
    delete updatedThreads[threadId]

    // Update focused thread if the closed one was focused
    let newFocusedId = focusedThreadId
    if (focusedThreadId === threadId) {
      const remainingIds = Object.keys(updatedThreads)
      newFocusedId = remainingIds.length > 0 ? remainingIds[0] : null
    }

    set((state) => {
      state.threads = updatedThreads
      state.focusedThreadId = newFocusedId
      return state
    })

    // Stop approval cleanup if no threads left
    if (Object.keys(updatedThreads).length === 0) {
      stopApprovalCleanupTimer()
      stopTimerCleanupInterval()
    } else {
      // Start periodic cleanup if there are still threads
      startTimerCleanupInterval(() => new Set(Object.keys(getThreadStore().threads)))
    }

    // Remove from closing set after a short delay to ensure all pending events are handled
    setTimeout(() => {
      closingThreads.delete(threadId)
    }, CLOSING_THREAD_CLEANUP_DELAY_MS)
  }
}

// ==================== Close All Threads Action ====================

export function createCloseAllThreads(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return () => {
    const { threads } = get()

    // Clean up all thread-specific resources
    Object.keys(threads).forEach((threadId) => {
      clearThreadTimers(threadId)
      clearDeltaBuffer(threadId)
      clearTurnTimeout(threadId)
      deltaBuffers.delete(threadId)
    })

    // Clear all threads
    set((state) => {
      state.threads = {}
      state.focusedThreadId = null
      return state
    })

    // Stop cleanup timers
    stopApprovalCleanupTimer()
    stopTimerCleanupInterval()
  }
}

// ==================== Interrupt Action ====================

export function createInterrupt(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return async () => {
    const { focusedThreadId, threads } = get()
    if (!focusedThreadId || !threads[focusedThreadId]) {
      console.warn('[interrupt] No active thread')
      return
    }

    const threadState = threads[focusedThreadId]
    if (threadState.turnStatus !== 'running') {
      console.warn('[interrupt] Turn is not running, status:', threadState.turnStatus)
      return
    }

    const threadId = focusedThreadId
    try {
      set((state) => {
        const ts = state.threads[threadId]
        if (!ts) return state
        ts.turnStatus = 'interrupted'
        return state
      })

      performFullTurnCleanup(threadId)

      set((state) => {
        const ts = state.threads[threadId]
        if (!ts) return state
        ts.currentTurnId = null
        ts.pendingApprovals = []
        ts.turnTiming.completedAt = Date.now()
        return state
      })

      await threadApi.interrupt(threadId)
    } catch (error) {
      console.error('[interrupt] Failed to interrupt:', error)
      const { threads: currentThreads } = get()
      if (currentThreads[threadId]) {
        set((state) => {
          const ts = state.threads[threadId]
          if (!ts) return state
          ts.error = parseError(error)
          return state
        })
      }
    }
  }
}

// ==================== Clear Thread Action ====================

export function createClearThread(
  get: () => ThreadState,
  closeThread: (threadId: string) => void
) {
  return () => {
    const { focusedThreadId } = get()
    if (focusedThreadId) {
      closeThread(focusedThreadId)
    }
  }
}

// ==================== Helper Actions ====================

export function createGetActiveThreadIds(get: () => ThreadState) {
  return () => {
    return Object.keys(get().threads)
  }
}

export function createCanAddSession(get: () => ThreadState) {
  return () => {
    const { threads, maxSessions } = get()
    return Object.keys(threads).length < maxSessions
  }
}
