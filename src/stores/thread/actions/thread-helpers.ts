/**
 * Thread Operation Helpers
 *
 * Common utilities and patterns shared between thread lifecycle operations.
 * Provides reusable wrappers for operation validation, state management, and error handling.
 */

import type { WritableDraft } from 'immer'
import { parseError } from '../../../lib/errorUtils'
import { log } from '../../../lib/logger'
import type { ThreadState } from '../types'
import {
  getNextOperationSequence,
  getCurrentOperationSequence,
  isOperationValid,
  acquireThreadSwitchLock,
  releaseThreadSwitchLock,
  closingThreads,
} from '../delta-buffer'
import {
  stopApprovalCleanupTimer,
  stopTimerCleanupInterval,
} from '../utils/timer-cleanup'

/**
 * Options for thread operation wrapper
 */
export interface ThreadOperationOptions {
  name: string
  checkCapacity?: boolean
  captureInitialState?: boolean
}

/**
 * Initial state snapshot for rollback on failure
 */
interface InitialStateSnapshot {
  isLoading: boolean
  globalError: string | null
  focusedThreadId: string | null
}

/**
 * Wrapper for thread operations that provides:
 * - Lock acquisition/release
 * - Operation sequence validation
 * - State rollback on failure
 * - Cleanup timer management
 * - Comprehensive error handling
 *
 * @param options - Operation configuration
 * @param set - Immer set function
 * @param get - Store get function
 * @param getThreadStore - Function to get fresh thread store state
 * @param operation - The async operation to execute
 * @returns The operation result or undefined if operation was cancelled
 */
export async function withThreadOperation<T>(
  options: ThreadOperationOptions,
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState,
  getThreadStore: () => ThreadState,
  operation: (opSeq: number) => Promise<T>
): Promise<T | undefined> {
  const { name, checkCapacity = false, captureInitialState = false } = options

  // Capture initial state for rollback if requested
  const initialState: InitialStateSnapshot | null = captureInitialState
    ? {
        isLoading: get().isLoading,
        globalError: get().globalError,
        focusedThreadId: get().focusedThreadId,
      }
    : null

  // Acquire thread switch lock to prevent concurrent operations
  await acquireThreadSwitchLock()

  try {
    // Check capacity if requested
    if (checkCapacity) {
      const { threads, maxSessions } = get()
      if (Object.keys(threads).length >= maxSessions) {
        throw new Error(
          `Maximum number of parallel sessions (${maxSessions}) reached. Please close a session first.`
        )
      }
    }

    // Get operation sequence number for validation
    const opSeq = getNextOperationSequence()
    log.debug(`[${name}] Started with opSeq: ${opSeq}`, 'thread-helpers')

    // Set loading state
    set((state) => {
      state.isLoading = true
      state.globalError = null
      return state
    })

    // Execute the operation
    const result = await operation(opSeq)

    // Validate operation sequence after async operation
    if (!isOperationValid(opSeq)) {
      log.warn(
        `[${name}] Operation became stale (opSeq: ${opSeq}, current: ${getCurrentOperationSequence()}), discarding result`,
        'thread-helpers'
      )

      // Rollback to initial state if captured
      if (initialState) {
        set((state) => {
          state.isLoading = initialState.isLoading
          state.globalError = initialState.globalError
          state.focusedThreadId = initialState.focusedThreadId
          return state
        })
      } else {
        set((state) => {
          state.isLoading = false
          return state
        })
      }

      return undefined
    }

    return result
  } catch (error) {
    log.error(`[${name}] Operation failed: ${error}`, 'thread-helpers')

    // Rollback to initial state or set error
    set((state) => {
      if (initialState) {
        state.isLoading = initialState.isLoading
        state.focusedThreadId = initialState.focusedThreadId
      } else {
        state.isLoading = false
      }
      state.globalError = parseError(error)
      return state
    })

    // Stop cleanup timers if no threads remain
    const threadCount = Object.keys(get().threads).length
    if (threadCount === 0) {
      stopApprovalCleanupTimer()
      stopTimerCleanupInterval()
      log.debug(`[${name}] No threads remaining, stopped cleanup timers`, 'thread-helpers')
    }

    throw error
  } finally {
    // Always release the lock
    releaseThreadSwitchLock()
  }
}

/**
 * Validate that an operation can proceed for a given thread.
 * Checks operation sequence validity and ensures thread is not being closed.
 *
 * @param opSeq - Operation sequence number to validate
 * @param threadId - Thread ID to check
 * @param operationName - Name of the operation (for logging)
 * @returns true if operation should proceed, false otherwise
 */
export function validateOperation(
  opSeq: number,
  threadId: string,
  operationName: string
): boolean {
  // Check operation sequence
  if (!isOperationValid(opSeq)) {
    log.warn(
      `[${operationName}] Stale operation detected for thread ${threadId}`,
      'thread-helpers'
    )
    return false
  }

  // Check if thread is being closed
  if (closingThreads.has(threadId)) {
    log.warn(
      `[${operationName}] Thread ${threadId} is being closed, aborting operation`,
      'thread-helpers'
    )
    return false
  }

  return true
}

/**
 * Helper to check if a thread exists and is not being closed.
 * Useful for early validation in operations.
 *
 * @param threadId - Thread ID to check
 * @param threads - Current threads map
 * @param operationName - Name of the operation (for logging)
 * @returns true if thread exists and is valid, false otherwise
 */
export function isThreadValid(
  threadId: string,
  threads: Record<string, unknown>,
  operationName: string
): boolean {
  // Check if thread is being closed
  if (closingThreads.has(threadId)) {
    log.warn(
      `[${operationName}] Thread ${threadId} is being closed, operation not allowed`,
      'thread-helpers'
    )
    return false
  }

  // Check if thread exists
  if (!threads[threadId]) {
    log.warn(`[${operationName}] Thread ${threadId} not found in store`, 'thread-helpers')
    return false
  }

  return true
}
