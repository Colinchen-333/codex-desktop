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
import { eventBus } from '../../../lib/eventBus'
import {
  normalizeApprovalPolicy,
  normalizeSandboxMode,
} from '../../../lib/normalize'
import type { ThreadState, AnyThreadItem, SingleThreadState } from '../types'
import { CLOSING_THREAD_CLEANUP_DELAY_MS } from '../constants'
import {
  getNextOperationSequence,
  getCurrentOperationSequence,
  isOperationValid,
  acquireThreadSwitchLock,
  releaseThreadSwitchLock,
  closingThreads,
  markThreadAsClosing,
  performFullTurnCleanup,
} from '../delta-buffer'
import {
  createEmptyThreadState,
  toThreadItem,
  defaultTokenUsage,
  defaultTurnTiming,
} from '../utils/helpers'
import {
  startApprovalCleanupTimer,
  stopApprovalCleanupTimer,
  startTimerCleanupInterval,
  stopTimerCleanupInterval,
  performImmediateThreadCleanup,
} from '../utils/timer-cleanup'

function beginThreadOperation(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  getThreadStore: () => ThreadState,
  cleanupStaleApprovals: () => Promise<void>,
  opKey: string
): number {
  const opSeq = getNextOperationSequence(opKey)
  startApprovalCleanupTimer(cleanupStaleApprovals, 60000)
  startTimerCleanupInterval(() => new Set(Object.keys(getThreadStore().threads)))
  set((state) => {
    state.isLoading = true
    state.globalError = null
    return state
  })
  return opSeq
}

function stopCleanupTimersIfIdle(get: () => ThreadState, context: string): void {
  if (Object.keys(get().threads).length === 0) {
    stopApprovalCleanupTimer()
    stopTimerCleanupInterval()
    log.debug(`[${context}] No threads remaining, stopped cleanup timers`, 'thread-actions')
  }
}

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
    // Acquire thread switch lock to prevent concurrent operations
    await acquireThreadSwitchLock()

    try {
      const { threads, maxSessions } = get()

      // Check if we can add another session
      if (Object.keys(threads).length >= maxSessions) {
        throw new Error(`Maximum number of parallel sessions (${maxSessions}) reached. Please close a session first.`)
      }

      // Use projectId as temporary threadId for operation sequencing
      // This prevents concurrent startThread for the same project
      const opSeq = beginThreadOperation(set, getThreadStore, cleanupStaleApprovals, projectId)

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

      // Validate operation sequence after async operation (using projectId as key)
      if (!isOperationValid(projectId, opSeq)) {
        log.warn('[startThread] Another operation started, discarding result', 'thread-actions')
        return
      }

      const threadId = response.thread.id

      // Validate thread is not being closed
      if (closingThreads.has(threadId)) {
        log.warn(`[startThread] Thread ${threadId} is being closed, discarding result`, 'thread-actions')
        set((state) => {
          state.isLoading = false
          return state
        })
        stopCleanupTimersIfIdle(get, 'startThread')
        return
      }

      const newThreadState = createEmptyThreadState(response.thread)

      set((state) => {
        state.threads[threadId] = newThreadState
        state.focusedThreadId = threadId
        state.isLoading = false
        state.globalError = null
        return state
      })
    } catch (error) {
      const currentOpSeq = getCurrentOperationSequence(projectId)
      set((state) => {
        state.globalError = parseError(error)
        state.isLoading = false
        return state
      })
      stopCleanupTimersIfIdle(get, 'startThread')
      log.error(`[startThread] Failed with opSeq mismatch check: ${currentOpSeq}`, 'thread-actions')
      throw error
    } finally {
      // Always release the lock
      releaseThreadSwitchLock()
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

    // Check if thread is being closed - early exit
    if (closingThreads.has(threadId)) {
      log.warn(`[resumeThread] Thread ${threadId} is being closed, aborting resume`, 'thread-actions')
      return
    }

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

    // P1 Fix: Capture initial state snapshot for proper rollback on failure
    const initialState = {
      isLoading: get().isLoading,
      globalError: get().globalError,
      focusedThreadId: get().focusedThreadId,
    }

    const rollbackToInitialState = () => {
      set((state) => {
        state.isLoading = initialState.isLoading
        state.globalError = initialState.globalError
        state.focusedThreadId = initialState.focusedThreadId
        return state
      })
    }

    // Acquire thread switch lock to prevent concurrent operations
    await acquireThreadSwitchLock()

    try {
      // Use threadId for operation sequencing
      const opSeq = beginThreadOperation(set, getThreadStore, cleanupStaleApprovals, threadId)

      const response = await threadApi.resume(threadId)

      // P1 Fix: Validate operation sequence - rollback state if stale
      if (!isOperationValid(threadId, opSeq)) {
        log.warn(
          `[resumeThread] Another operation started, rolling back state for threadId: ${threadId}`,
          'thread-actions'
        )
        rollbackToInitialState()
        stopCleanupTimersIfIdle(get, 'resumeThread')
        return
      }

      // P1 Fix: Validate thread is not being closed - rollback state if closing
      if (closingThreads.has(response.thread.id)) {
        log.warn(
          `[resumeThread] Thread ${response.thread.id} is being closed, rolling back state`,
          'thread-actions'
        )
        rollbackToInitialState()
        stopCleanupTimersIfIdle(get, 'resumeThread')
        return
      }

      log.debug(`[resumeThread] Resume response - thread.id: ${response.thread.id}, requested threadId: ${threadId}`, 'thread-actions')

      // Convert items from response to our format
      const items: Record<string, AnyThreadItem> = {}
      const itemOrder: string[] = []

      for (const rawItem of response.items) {
        if (!rawItem || typeof rawItem !== 'object') {
          log.warn(`[resumeThread] Skipping invalid item (not an object): ${rawItem}`, 'thread-actions')
          continue
        }
        const item = rawItem as { id?: string; type?: string }
        if (!item.id || !item.type) {
          log.warn(`[resumeThread] Skipping item with missing id or type: ${JSON.stringify(item)}`, 'thread-actions')
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

      // Final validation before state update
      if (!isOperationValid(threadId, opSeq)) {
        log.warn(`[resumeThread] Operation became stale before state update`, 'thread-actions')
        rollbackToInitialState()
        stopCleanupTimersIfIdle(get, 'resumeThread')
        return
      }

      set((state) => {
        state.threads[response.thread.id] = newThreadState
        state.focusedThreadId = response.thread.id
        state.isLoading = false
        state.globalError = null
        return state
      })

      // P1 Fix: Use event bus instead of dynamic import
      try {
        // Check thread still exists to prevent race condition with closeThread
        if (getThreadStore().threads[response.thread.id] && !closingThreads.has(response.thread.id)) {
          eventBus.emit('session:status-update', {
            sessionId: response.thread.id,
            status: 'idle'
          })
        }
      } catch (err) {
        handleAsyncError(err, 'resumeThread session sync', 'thread')
      }

      log.debug(`[resumeThread] Resume completed, activeThread.id: ${response.thread.id}`, 'thread-actions')
    } catch (error) {
      log.error(`[resumeThread] Resume failed: ${error}`, 'thread-actions')

      // P1 Fix: Complete rollback to initial state on error
      set((state) => {
        state.isLoading = initialState.isLoading
        state.globalError = parseError(error)
        state.focusedThreadId = initialState.focusedThreadId
        return state
      })

      // P1 Fix: Stop cleanup timers if no threads remain
      stopCleanupTimersIfIdle(get, 'resumeThread')

      throw error
    } finally {
      // Always release the lock
      releaseThreadSwitchLock()
    }
  }
}

// ==================== Switch Thread Action ====================

export function createSwitchThread(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (threadId: string) => {
    // Check if thread is being closed
    if (closingThreads.has(threadId)) {
      log.warn(`[switchThread] Thread ${threadId} is being closed, cannot switch`, 'thread-actions')
      return
    }

    const { threads } = get()
    if (!threads[threadId]) {
      log.warn(`[switchThread] Thread not found: ${threadId}`, 'thread-actions')
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
      log.warn(`[closeThread] Thread not found: ${threadId}`, 'thread-actions')
      return
    }

    // Mark thread as closing IMMEDIATELY to prevent any new operations
    // This must happen before any async operations or state changes
    const releasePromise = markThreadAsClosing(threadId).catch((error) => {
      log.warn(`[closeThread] Failed to mark thread as closing: ${error}`, 'thread-actions')
      return () => {}
    })
    log.debug(`[closeThread] Marked thread ${threadId} as closing`, 'thread-actions')

    // Perform comprehensive immediate cleanup of all thread resources
    // This includes timers, buffers, and all associated state
    performImmediateThreadCleanup(threadId)

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
      void releasePromise.then((release) => release())
      log.debug('[closeThread] All threads closed, cleared closingThreads set', 'thread-actions')
    } else {
      // Start periodic cleanup if there are still threads
      startTimerCleanupInterval(() => new Set(Object.keys(getThreadStore().threads)))

      // Remove from closing set after a short delay to ensure all pending events are handled
      // This allows any in-flight events to be properly rejected
      void releasePromise.then((release) => {
        setTimeout(() => {
          release()
          log.debug(`[closeThread] Removed thread ${threadId} from closing set`, 'thread-actions')
        }, CLOSING_THREAD_CLEANUP_DELAY_MS)
      })
    }
  }
}

// ==================== Close All Threads Action ====================

export function createCloseAllThreads(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return () => {
    const { threads } = get()
    const threadIds = Object.keys(threads)

    if (threadIds.length === 0) {
      stopApprovalCleanupTimer()
      stopTimerCleanupInterval()
      return
    }

    const releasePromises = threadIds.map((threadId) =>
      markThreadAsClosing(threadId).catch((error) => {
        log.warn(`[closeAllThreads] Failed to mark thread as closing: ${error}`, 'thread-actions')
        return () => {}
      })
    )
    log.debug(`[closeAllThreads] Marked ${threadIds.length} threads as closing`, 'thread-actions')

    // Clean up all thread-specific resources using comprehensive cleanup
    threadIds.forEach((threadId) => {
      performImmediateThreadCleanup(threadId)
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

    void Promise.all(releasePromises).then((releases) => {
      releases.forEach((release) => release())
      log.debug('[closeAllThreads] Cleared closingThreads set', 'thread-actions')
    })
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
      log.warn('[interrupt] No active thread', 'thread-actions')
      return
    }

    const threadState = threads[focusedThreadId]
    if (threadState.turnStatus !== 'running') {
      log.warn(`[interrupt] Turn is not running, status: ${threadState.turnStatus}`, 'thread-actions')
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
      log.error(`[interrupt] Failed to interrupt: ${error}`, 'thread-actions')
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
