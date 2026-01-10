/**
 * Timer Cleanup Utilities
 *
 * Comprehensive cleanup functions for all timers associated with threads.
 * Prevents memory leaks by ensuring all timers are properly cleared.
 */

import {
  deltaBuffers,
  flushTimers,
  turnTimeoutTimers,
  closingThreads,
  clearDeltaBuffer,
  clearTurnTimeout,
} from '../delta-buffer'
import { TIMER_CLEANUP_INTERVAL_MS } from '../constants'

// Global approval cleanup timer
let approvalCleanupTimer: ReturnType<typeof setInterval> | null = null

// Global timer cleanup interval - cleans up orphaned timers
let timerCleanupInterval: ReturnType<typeof setInterval> | null = null

// ==================== Thread Timer Cleanup ====================

/**
 * Comprehensive cleanup function for all timers associated with a thread.
 */
export function clearThreadTimers(threadId: string): void {
  // Clear flush timer if exists
  const flushTimer = flushTimers.get(threadId)
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimers.delete(threadId)
    console.debug('[clearThreadTimers] Cleared flush timer for thread:', threadId)
  }

  // Clear turn timeout timer if exists
  const timeoutTimer = turnTimeoutTimers.get(threadId)
  if (timeoutTimer) {
    clearTimeout(timeoutTimer)
    turnTimeoutTimers.delete(threadId)
    console.debug('[clearThreadTimers] Cleared timeout timer for thread:', threadId)
  }
}

/**
 * Get statistics about active timers for debugging.
 */
export function getTimerStats(): {
  flushTimers: number
  timeoutTimers: number
  total: number
  lruStats: {
    deltaBuffers: ReturnType<typeof deltaBuffers.getStats>
    flushTimers: ReturnType<typeof flushTimers.getStats>
    turnTimeoutTimers: ReturnType<typeof turnTimeoutTimers.getStats>
  }
} {
  return {
    flushTimers: flushTimers.size,
    timeoutTimers: turnTimeoutTimers.size,
    total: flushTimers.size + turnTimeoutTimers.size,
    lruStats: {
      deltaBuffers: deltaBuffers.getStats(),
      flushTimers: flushTimers.getStats(),
      turnTimeoutTimers: turnTimeoutTimers.getStats(),
    },
  }
}

// ==================== Approval Cleanup ====================

/**
 * Start the approval cleanup timer.
 * Called when first thread is created.
 */
export function startApprovalCleanupTimer(cleanupFn: () => Promise<void>, intervalMs: number): void {
  if (approvalCleanupTimer === null) {
    approvalCleanupTimer = setInterval(cleanupFn, intervalMs)
  }
}

/**
 * Stop the approval cleanup timer.
 * Called when all threads are closed.
 */
export function stopApprovalCleanupTimer(): void {
  if (approvalCleanupTimer !== null) {
    clearInterval(approvalCleanupTimer)
    approvalCleanupTimer = null
  }
}

// ==================== Periodic Timer Cleanup ====================

/**
 * Clean up stale timers for threads that no longer exist.
 * This prevents memory leaks from timers that weren't properly cleared.
 */
export function cleanupStaleTimers(activeThreadIds: Set<string>): void {
  // Clean up orphaned flush timers
  let flushCleanups = 0
  const flushEntries = flushTimers.entries()
  for (const [threadId, timer] of flushEntries) {
    if (!activeThreadIds.has(threadId) || closingThreads.has(threadId)) {
      clearTimeout(timer)
      flushTimers.delete(threadId)
      flushCleanups++
    }
  }

  // Clean up orphaned timeout timers
  let timeoutCleanups = 0
  const timeoutEntries = turnTimeoutTimers.entries()
  for (const [threadId, timer] of timeoutEntries) {
    if (!activeThreadIds.has(threadId) || closingThreads.has(threadId)) {
      clearTimeout(timer)
      turnTimeoutTimers.delete(threadId)
      timeoutCleanups++
    }
  }

  if (flushCleanups > 0 || timeoutCleanups > 0) {
    console.debug(
      '[cleanupStaleTimers] Cleaned up',
      flushCleanups,
      'flush timers and',
      timeoutCleanups,
      'timeout timers'
    )
  }
}

/**
 * Start the periodic timer cleanup interval.
 */
export function startTimerCleanupInterval(getActiveThreadIds: () => Set<string>): void {
  if (timerCleanupInterval === null) {
    timerCleanupInterval = setInterval(() => {
      cleanupStaleTimers(getActiveThreadIds())
    }, TIMER_CLEANUP_INTERVAL_MS)
    console.debug('[startTimerCleanupInterval] Started periodic timer cleanup')
  }
}

/**
 * Stop the periodic timer cleanup interval.
 */
export function stopTimerCleanupInterval(): void {
  if (timerCleanupInterval !== null) {
    clearInterval(timerCleanupInterval)
    timerCleanupInterval = null
    console.debug('[stopTimerCleanupInterval] Stopped periodic timer cleanup')
  }
}

// ==================== Global Resource Cleanup ====================

/**
 * Clean up all thread resources.
 * Called on app unmount to prevent memory leaks.
 */
export function cleanupThreadResources(): void {
  stopApprovalCleanupTimer()
  stopTimerCleanupInterval()

  // Clear all delta buffers and timers using the comprehensive cleanup
  const bufferKeys = deltaBuffers.keys()
  for (const threadId of bufferKeys) {
    clearThreadTimers(threadId)
    clearDeltaBuffer(threadId)
    clearTurnTimeout(threadId)
  }
  deltaBuffers.clear()
  flushTimers.clear()
  turnTimeoutTimers.clear()
  closingThreads.clear()

  console.debug('[cleanupThreadResources] Cleaned up all thread resources')
}
