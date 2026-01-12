/**
 * Timer Cleanup Utilities
 *
 * Comprehensive cleanup functions for all timers associated with threads.
 * Prevents memory leaks by ensuring all timers are properly cleared.
 */

import { log } from '../../../lib/logger'
import {
  deltaBuffers,
  flushTimers,
  turnTimeoutTimers,
  closingThreads,
  clearDeltaBuffer,
  clearAllTimers,
  clearAllTimersForAllThreads,
  clearOperationSequence,
  clearFlushMetrics,
  clearAllOperationSequences,
  clearAllFlushMetrics,
  clearThreadSwitchLockQueue,
  cleanupStaleClosingThreads,
} from '../delta-buffer'
import { TIMER_CLEANUP_INTERVAL_MS } from '../constants'

// Global approval cleanup timer
let approvalCleanupTimer: ReturnType<typeof setInterval> | null = null

// Global timer cleanup interval - cleans up orphaned timers
let timerCleanupInterval: ReturnType<typeof setInterval> | null = null

// Track orphaned timer detection runs for debugging
let orphanedTimerCleanupCount = 0
let lastOrphanedCleanupTime = 0

// ==================== Thread Timer Cleanup ====================

/**
 * Comprehensive cleanup function for all timers associated with a thread.
 * Delegates to the optimized clearAllTimers function from delta-buffer.
 */
export function clearThreadTimers(threadId: string): void {
  clearAllTimers(threadId)
}

/**
 * Get statistics about active timers for debugging.
 */
export function getTimerStats(): {
  flushTimers: number
  timeoutTimers: number
  deltaBuffers: number
  closingThreads: number
  total: number
  orphanedCleanupRuns: number
  lastCleanupTime: number
  lruStats: {
    deltaBuffers: ReturnType<typeof deltaBuffers.getStats>
    flushTimers: ReturnType<typeof flushTimers.getStats>
    turnTimeoutTimers: ReturnType<typeof turnTimeoutTimers.getStats>
  }
} {
  return {
    flushTimers: flushTimers.size,
    timeoutTimers: turnTimeoutTimers.size,
    deltaBuffers: deltaBuffers.size,
    closingThreads: closingThreads.size,
    total: flushTimers.size + turnTimeoutTimers.size + deltaBuffers.size,
    orphanedCleanupRuns: orphanedTimerCleanupCount,
    lastCleanupTime: lastOrphanedCleanupTime,
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
  const now = Date.now()
  orphanedTimerCleanupCount++
  lastOrphanedCleanupTime = now

  // Clean up orphaned flush timers
  let flushCleanups = 0
  const flushEntries = flushTimers.entries()
  for (const [threadId, timer] of flushEntries) {
    if (!activeThreadIds.has(threadId) || closingThreads.has(threadId)) {
      clearTimeout(timer)
      flushTimers.delete(threadId)
      flushCleanups++
      log.debug(`[cleanupStaleTimers] Cleared orphaned flush timer for thread: ${threadId}`, 'timer-cleanup')
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
      log.debug(`[cleanupStaleTimers] Cleared orphaned timeout timer for thread: ${threadId}`, 'timer-cleanup')
    }
  }

  // Clean up orphaned delta buffers (memory leak prevention)
  let bufferCleanups = 0
  const bufferKeys = deltaBuffers.keys()
  for (const threadId of bufferKeys) {
    if (!activeThreadIds.has(threadId) || closingThreads.has(threadId)) {
      clearDeltaBuffer(threadId)
      deltaBuffers.delete(threadId)
      clearFlushMetrics(threadId)
      clearOperationSequence(threadId)
      bufferCleanups++
      log.debug(`[cleanupStaleTimers] Cleared orphaned delta buffer for thread: ${threadId}`, 'timer-cleanup')
    }
  }

  // Clean up stale entries in closingThreads set (threads that have been closing too long)
  let closingCleanups = 0
  // Note: We can't track timing for closingThreads entries, so we rely on the
  // CLOSING_THREAD_CLEANUP_DELAY_MS timeout in closeThread to handle this.
  // However, we can clean up if the thread is in closingThreads but has no related resources
  for (const threadId of closingThreads) {
    if (!deltaBuffers.has(threadId) && !flushTimers.has(threadId) && !turnTimeoutTimers.has(threadId)) {
      // All resources cleaned up, safe to remove from closing set
      closingThreads.delete(threadId)
      closingCleanups++
    }
  }

  closingCleanups += cleanupStaleClosingThreads()

  const totalCleanups = flushCleanups + timeoutCleanups + bufferCleanups + closingCleanups
  if (totalCleanups > 0) {
    log.debug(
      `[cleanupStaleTimers] Run #${orphanedTimerCleanupCount}: Cleaned up ${flushCleanups} flush timers, ` +
      `${timeoutCleanups} timeout timers, ${bufferCleanups} buffers, ${closingCleanups} closing entries`,
      'timer-cleanup'
    )
  }
}

/**
 * Perform immediate cleanup for a specific thread.
 * Called when closing a thread to ensure all resources are cleaned immediately.
 * Uses the comprehensive clearAllTimers function for complete cleanup.
 */
export function performImmediateThreadCleanup(threadId: string): void {
  // Clear all timers comprehensively
  clearAllTimers(threadId)

  // Clear delta buffer and remove from map
  clearDeltaBuffer(threadId)
  deltaBuffers.delete(threadId)
  clearOperationSequence(threadId)
  clearFlushMetrics(threadId)

  log.debug(`[performImmediateThreadCleanup] Completed cleanup for thread: ${threadId}`, 'timer-cleanup')
}

/**
 * Start the periodic timer cleanup interval.
 */
export function startTimerCleanupInterval(getActiveThreadIds: () => Set<string>): void {
  if (timerCleanupInterval === null) {
    timerCleanupInterval = setInterval(() => {
      cleanupStaleTimers(getActiveThreadIds())
    }, TIMER_CLEANUP_INTERVAL_MS)
    log.debug('[startTimerCleanupInterval] Started periodic timer cleanup', 'timer-cleanup')
  }
}

/**
 * Stop the periodic timer cleanup interval.
 */
export function stopTimerCleanupInterval(): void {
  if (timerCleanupInterval !== null) {
    clearInterval(timerCleanupInterval)
    timerCleanupInterval = null
    log.debug('[stopTimerCleanupInterval] Stopped periodic timer cleanup', 'timer-cleanup')
  }
}

// ==================== Global Resource Cleanup ====================

/**
 * Clean up all thread resources.
 * Called on app unmount to prevent memory leaks.
 * Uses the comprehensive clearAllTimersForAllThreads function.
 */
export function cleanupThreadResources(): void {
  stopApprovalCleanupTimer()
  stopTimerCleanupInterval()

  // Clear all timers comprehensively
  clearAllTimersForAllThreads()

  // Clear all delta buffers
  deltaBuffers.clear()

  // Clear closing threads set
  closingThreads.clear()
  clearAllOperationSequences()
  clearAllFlushMetrics()
  clearThreadSwitchLockQueue()

  log.debug('[cleanupThreadResources] Cleaned up all thread resources', 'timer-cleanup')
}
