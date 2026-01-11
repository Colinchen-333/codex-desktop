/**
 * Delta Buffer Management
 *
 * Per-thread delta buffers to accumulate delta updates for smooth streaming.
 * Uses LRU cache to prevent unbounded memory growth.
 *
 * Performance Optimizations:
 * - Incremental size tracking with _cachedSize to avoid recalculating on every check
 * - TextEncoder for accurate UTF-8 byte calculation
 * - requestIdleCallback for batch flushing during idle time
 * - Pending flush queue for coalescing multiple flush requests
 */

import { log } from '../../lib/logger'
import { LRUCache } from './lru-cache'
import {
  MAX_LRU_CACHE_SIZE,
  MAX_BUFFER_SIZE,
  FLUSH_INTERVAL_MS,
  THREAD_SWITCH_LOCK_TIMEOUT_MS,
} from './constants'
import type { DeltaBuffer } from './types'

// ==================== P2: Lock Queue Monitoring Configuration ====================

/**
 * Maximum number of requests allowed in the lock queue.
 * If exceeded, new requests will be rejected to prevent memory exhaustion.
 */
const MAX_LOCK_QUEUE_SIZE = 100

/**
 * Warning threshold for lock queue size.
 * Logs a warning when queue size exceeds this threshold.
 */
const LOCK_QUEUE_WARN_THRESHOLD = 10

// ==================== Performance Utilities ====================

/**
 * Shared TextEncoder instance for UTF-8 byte calculation.
 * Reusing a single instance is more efficient than creating new ones.
 */
const textEncoder = new TextEncoder()

/**
 * Calculate UTF-8 byte length of a string using TextEncoder.
 * More accurate than character-based estimation.
 */
function getUtf8ByteLength(text: string): number {
  return textEncoder.encode(text).length
}

/**
 * Performance timing helper for debugging.
 * Only logs in development mode when performance logging is enabled.
 */
function logPerformance(operation: string, startTime: number, context?: string): void {
  const duration = performance.now() - startTime
  if (duration > 1) {
    // Only log operations taking more than 1ms
    log.debug(
      `[delta-buffer:perf] ${operation}: ${duration.toFixed(2)}ms${context ? ` (${context})` : ''}`,
      'delta-buffer'
    )
  }
}

// ==================== Operation Sequence Tracking ====================
// Prevents race conditions when switching threads during async operations

let operationSequence = 0

export function getNextOperationSequence(): number {
  return ++operationSequence
}

export function getCurrentOperationSequence(): number {
  return operationSequence
}

// ==================== Thread Switch Lock ====================
// Prevents concurrent thread operations that could cause race conditions
// P0 Enhancement: Added lock queue to prevent timeout errors during high concurrency

let threadSwitchLock: Promise<void> | null = null
let pendingLockResolve: (() => void) | null = null

// P0 Enhancement: Lock waiting queue to handle multiple concurrent lock requests
// Instead of timing out, requests wait in queue for their turn
interface LockRequest {
  resolve: () => void
  reject: (error: Error) => void
  requestedAt: number
  timeoutId: ReturnType<typeof setTimeout>
}

const lockWaitQueue: LockRequest[] = []

/**
 * Process the next request in the lock wait queue.
 * Called when the current lock is released.
 */
function processNextLockRequest(): void {
  const nextRequest = lockWaitQueue.shift()
  if (nextRequest) {
    clearTimeout(nextRequest.timeoutId)

    // Create new lock for this request
    threadSwitchLock = new Promise<void>((resolve) => {
      pendingLockResolve = resolve
    })

    // Resolve the waiting request
    nextRequest.resolve()

    const waitTime = Date.now() - nextRequest.requestedAt
    log.debug(
      `[processNextLockRequest] Processed queued request after ${waitTime}ms wait`,
      'delta-buffer'
    )
  } else {
    // No more requests, clear lock
    threadSwitchLock = null
    pendingLockResolve = null
  }
}

/**
 * Acquire a lock before performing thread switch operations.
 * Returns a promise that resolves when the lock is acquired.
 *
 * P0 Enhancement: Now uses a queue system instead of immediate timeout.
 * Requests wait in line for the lock to be available, with a timeout as fallback.
 */
export async function acquireThreadSwitchLock(): Promise<void> {
  // P2: Check for queue overflow before processing
  if (lockWaitQueue.length >= MAX_LOCK_QUEUE_SIZE) {
    const error = new Error(
      `Lock queue overflow: ${lockWaitQueue.length} requests waiting. System may be under high load.`
    )
    log.error(`[acquireThreadSwitchLock] ${error.message}`, 'delta-buffer')
    throw error
  }
  
  // P2: Warn about high lock contention
  if (lockWaitQueue.length >= LOCK_QUEUE_WARN_THRESHOLD) {
    log.warn(
      `[acquireThreadSwitchLock] High lock contention: ${lockWaitQueue.length} requests in queue`,
      'delta-buffer'
    )
  }
  
  // Fast path: no existing lock
  if (!threadSwitchLock) {
    threadSwitchLock = new Promise<void>((resolve) => {
      pendingLockResolve = resolve
    })
    log.debug('[acquireThreadSwitchLock] Lock acquired immediately', 'delta-buffer')
    return
  }

  // Slow path: add to queue and wait
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      // Remove from queue on timeout
      const index = lockWaitQueue.findIndex(req => req.resolve === resolve)
      if (index >= 0) {
        lockWaitQueue.splice(index, 1)
      }

      const error = new Error(
        `Thread switch lock timeout after ${THREAD_SWITCH_LOCK_TIMEOUT_MS}ms ` +
        `(${lockWaitQueue.length} requests still in queue)`
      )
      log.error(
        `[acquireThreadSwitchLock] ${error.message}`,
        'delta-buffer'
      )
      reject(error)
    }, THREAD_SWITCH_LOCK_TIMEOUT_MS)

    const request: LockRequest = {
      resolve,
      reject,
      requestedAt: Date.now(),
      timeoutId,
    }

    lockWaitQueue.push(request)
    log.debug(
      `[acquireThreadSwitchLock] Added to queue (position: ${lockWaitQueue.length})`,
      'delta-buffer'
    )
  })
}

/**
 * Release the thread switch lock.
 *
 * P0 Enhancement: Now processes the next request in queue instead of just clearing.
 */
export function releaseThreadSwitchLock(): void {
  if (pendingLockResolve) {
    pendingLockResolve()
    pendingLockResolve = null
  }

  // P0 Enhancement: Process next queued request if any
  if (lockWaitQueue.length > 0) {
    log.debug(
      `[releaseThreadSwitchLock] Processing next request (${lockWaitQueue.length} in queue)`,
      'delta-buffer'
    )
    processNextLockRequest()
  } else {
    // No more requests, clear lock
    threadSwitchLock = null
    log.debug('[releaseThreadSwitchLock] Lock released, queue empty', 'delta-buffer')
  }
}

/**
 * Check if thread switch is currently locked.
 */
export function isThreadSwitchLocked(): boolean {
  return threadSwitchLock !== null
}

/**
 * Validates that an operation is still valid based on its sequence number.
 * Returns true if the operation should continue, false if it's stale.
 */
export function isOperationValid(opSeq: number): boolean {
  return getCurrentOperationSequence() === opSeq
}

// ==================== Delta Buffers ====================
// Per-thread delta buffers - using LRU cache to prevent unbounded growth

export const deltaBuffers = new LRUCache<string, DeltaBuffer>(MAX_LRU_CACHE_SIZE)

// Per-thread flush timers - using LRU cache to prevent unbounded growth
export const flushTimers = new LRUCache<string, ReturnType<typeof setTimeout>>(MAX_LRU_CACHE_SIZE)

// Per-thread turn timeout timers - using LRU cache to prevent unbounded growth
export const turnTimeoutTimers = new LRUCache<string, ReturnType<typeof setTimeout>>(MAX_LRU_CACHE_SIZE)

// Set of threads currently being closed - prevents race conditions
// where delta events might recreate buffers during closeThread
export const closingThreads: Set<string> = new Set()

// P1 Fix: Lock mechanism to protect closingThreads Set from concurrent access
// Prevents race conditions when multiple operations try to modify closingThreads simultaneously
const closingThreadsLock = new Map<string, Promise<void>>()

/**
 * Mark a thread as closing with lock protection
 * Returns a cleanup function that must be called to release the lock
 *
 * @param threadId - Thread ID to mark as closing
 * @returns Cleanup function to remove thread from closing set and release lock
 */
export async function markThreadAsClosing(threadId: string): Promise<() => void> {
  // Wait for any existing operation on this thread to complete
  while (closingThreadsLock.has(threadId)) {
    await closingThreadsLock.get(threadId)
  }

  // Create lock promise for this operation
  let resolveLock: () => void
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve
  })
  closingThreadsLock.set(threadId, lockPromise)

  // Add to closing set
  closingThreads.add(threadId)

  // Return cleanup function
  return () => {
    closingThreads.delete(threadId)
    closingThreadsLock.delete(threadId)
    resolveLock!()
  }
}

/**
 * Check if thread is marked as closing (thread-safe)
 *
 * @param threadId - Thread ID to check
 * @returns True if thread is being closed
 */
export function isThreadClosing(threadId: string): boolean {
  return closingThreads.has(threadId)
}

/**
 * Clear all closing thread markers (for cleanup scenarios)
 * This is safe because it waits for all locks to be released
 */
export async function clearAllClosingThreads(): Promise<void> {
  // Wait for all locks to be released
  const lockPromises = Array.from(closingThreadsLock.values())
  if (lockPromises.length > 0) {
    await Promise.all(lockPromises)
  }

  // Clear the set
  closingThreads.clear()
  closingThreadsLock.clear()
}

// ==================== Batch Flush Queue ====================
// Coalesces multiple flush requests for efficiency

interface PendingFlush {
  threadId: string
  flushFn: () => void
  scheduledAt: number
  version: number  // P2: Version number to prevent race conditions
}

const pendingFlushQueue: Map<string, PendingFlush> = new Map()
let idleCallbackId: number | null = null

// ==================== Cleanup Idempotency Protection ====================
// P1 Fix: Prevent duplicate cleanup operations within a short time window

/**
 * Set to track recent cleanup operations to prevent duplicate cleanups.
 * Cleanup keys are automatically removed after a short delay.
 */
const recentCleanups = new Set<string>()

/**
 * Check if requestIdleCallback is available (browser environment).
 */
const hasIdleCallback = typeof requestIdleCallback === 'function'

/**
 * Process all pending flush operations.
 * Called during idle time or after a timeout.
 */
function processPendingFlushes(): void {
  const startTime = performance.now()
  const flushCount = pendingFlushQueue.size

  if (flushCount === 0) {
    idleCallbackId = null
    return
  }

  // Process all pending flushes
  const flushes = Array.from(pendingFlushQueue.values())
  pendingFlushQueue.clear()
  idleCallbackId = null

  for (const flush of flushes) {
    try {
      flush.flushFn()
    } catch (error) {
      log.error(`[delta-buffer] Error during batch flush for thread ${flush.threadId}: ${error instanceof Error ? error.message : String(error)}`, 'delta-buffer')
    }
  }

  logPerformance('processPendingFlushes', startTime, `${flushCount} threads`)
}

/**
 * Schedule processing of pending flushes during idle time.
 */
function scheduleIdleFlush(): void {
  if (idleCallbackId !== null) {
    return // Already scheduled
  }

  if (hasIdleCallback) {
    idleCallbackId = requestIdleCallback(
      (deadline) => {
        // Process flushes if we have time, otherwise process anyway
        // since we have a deadline
        if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
          processPendingFlushes()
        }
      },
      { timeout: FLUSH_INTERVAL_MS * 2 } // Ensure processing within reasonable time
    )
  } else {
    // Fallback for environments without requestIdleCallback
    idleCallbackId = setTimeout(processPendingFlushes, FLUSH_INTERVAL_MS) as unknown as number
  }
}

// ==================== Buffer Creation and Management ====================

export function createEmptyDeltaBuffer(): DeltaBuffer {
  return {
    turnId: null,
    operationSeq: getCurrentOperationSequence(),
    agentMessages: new Map(),
    commandOutputs: new Map(),
    fileChangeOutputs: new Map(),
    reasoningSummaries: new Map(),
    reasoningContents: new Map(),
    mcpProgress: new Map(),
    _cachedSize: 0,
  }
}

export function getDeltaBuffer(threadId: string): DeltaBuffer | null {
  // Check if thread is being closed - don't create/access buffers
  if (closingThreads.has(threadId)) {
    return null
  }

  let buffer = deltaBuffers.get(threadId)

  if (!buffer) {
    buffer = createEmptyDeltaBuffer()
    deltaBuffers.set(threadId, buffer)
  }
  return buffer
}

export function clearDeltaBuffer(threadId: string): void {
  const buffer = deltaBuffers.get(threadId)
  if (buffer) {
    buffer.turnId = null
    buffer.operationSeq = getCurrentOperationSequence()
    buffer.agentMessages.clear()
    buffer.commandOutputs.clear()
    buffer.fileChangeOutputs.clear()
    buffer.reasoningSummaries.clear()
    buffer.reasoningContents.clear()
    buffer.mcpProgress.clear()
    buffer._cachedSize = 0 // Reset cached size
  }

  // Clear any pending flush for this thread
  pendingFlushQueue.delete(threadId)

  const timer = flushTimers.get(threadId)
  if (timer) {
    clearTimeout(timer)
    flushTimers.delete(threadId)
    log.debug(`[clearDeltaBuffer] Cleared flush timer for thread: ${threadId}`, 'delta-buffer')
  }
}

export function clearTurnTimeout(threadId: string): void {
  const timer = turnTimeoutTimers.get(threadId)
  if (timer) {
    clearTimeout(timer)
    turnTimeoutTimers.delete(threadId)
    log.debug(`[clearTurnTimeout] Cleared timeout timer for thread: ${threadId}`, 'delta-buffer')
  }
}

// ==================== Incremental Size Tracking ====================

/**
 * Update the cached size when adding content to the buffer.
 * This is the key optimization - we track size incrementally instead of
 * recalculating on every check.
 *
 * @param buffer - The delta buffer to update
 * @param newContent - The new content being added
 * @param oldContent - The old content being replaced (if any)
 */
export function updateBufferSize(
  buffer: DeltaBuffer,
  newContent: string,
  oldContent?: string
): void {
  const startTime = performance.now()

  // Calculate the size difference
  const newBytes = getUtf8ByteLength(newContent)
  const oldBytes = oldContent ? getUtf8ByteLength(oldContent) : 0
  const sizeDelta = newBytes - oldBytes

  buffer._cachedSize += sizeDelta

  logPerformance('updateBufferSize', startTime, `delta=${sizeDelta}`)
}

/**
 * Update cached size for array-based content (reasoning summaries/contents, mcp progress).
 *
 * @param buffer - The delta buffer to update
 * @param newItems - The new items being added
 * @param itemExtractor - Function to extract text from items
 */
export function updateBufferSizeForArray<T>(
  buffer: DeltaBuffer,
  newItems: T[],
  itemExtractor: (item: T) => string
): void {
  const startTime = performance.now()

  let totalBytes = 0
  for (const item of newItems) {
    totalBytes += getUtf8ByteLength(itemExtractor(item))
  }

  buffer._cachedSize += totalBytes

  logPerformance('updateBufferSizeForArray', startTime, `items=${newItems.length}`)
}

// ==================== Buffer Size Calculation ====================

/**
 * Get the cached buffer size. This is O(1) after optimization.
 * Falls back to full calculation if cache appears corrupted.
 */
export function getBufferSize(buffer: DeltaBuffer): number {
  // Fast path: return cached size
  if (buffer._cachedSize >= 0) {
    return buffer._cachedSize
  }

  // Fallback: recalculate and cache (should rarely happen)
  const startTime = performance.now()
  const size = calculateFullBufferSize(buffer)
  buffer._cachedSize = size

  logPerformance('getBufferSize:recalculated', startTime)
  log.warn('[delta-buffer] Had to recalculate buffer size - cache was corrupted', 'delta-buffer')

  return size
}

/**
 * Calculate the full buffer size by iterating all content.
 * This is the original implementation, now used only as fallback.
 */
function calculateFullBufferSize(buffer: DeltaBuffer): number {
  let size = 0

  buffer.agentMessages.forEach((text) => {
    size += getUtf8ByteLength(text)
  })
  buffer.commandOutputs.forEach((text) => {
    size += getUtf8ByteLength(text)
  })
  buffer.fileChangeOutputs.forEach((text) => {
    size += getUtf8ByteLength(text)
  })
  buffer.reasoningSummaries.forEach((arr) => {
    arr.forEach((item) => {
      size += getUtf8ByteLength(item.text)
    })
  })
  buffer.reasoningContents.forEach((arr) => {
    arr.forEach((item) => {
      size += getUtf8ByteLength(item.text)
    })
  })
  buffer.mcpProgress.forEach((arr) => {
    arr.forEach((msg) => {
      size += getUtf8ByteLength(msg)
    })
  })

  return size
}

/**
 * Verify and repair cached size if needed.
 * Useful for debugging or after suspected corruption.
 */
export function verifyCachedSize(buffer: DeltaBuffer): boolean {
  const calculatedSize = calculateFullBufferSize(buffer)
  const cachedSize = buffer._cachedSize

  if (Math.abs(calculatedSize - cachedSize) > 1) {
    log.warn(
      `[delta-buffer] Cache size mismatch: cached=${cachedSize}, calculated=${calculatedSize}`,
      'delta-buffer'
    )
    buffer._cachedSize = calculatedSize
    return false
  }

  return true
}

// ==================== Flush Scheduling ====================

// P0 Enhancement: Track flush metrics for debugging and monitoring
interface FlushMetrics {
  successCount: number
  failureCount: number
  lastFlushTime: number
  lastError?: string
}

const flushMetricsMap = new Map<string, FlushMetrics>()

/**
 * Get or create flush metrics for a thread.
 */
function getFlushMetrics(threadId: string): FlushMetrics {
  let metrics = flushMetricsMap.get(threadId)
  if (!metrics) {
    metrics = {
      successCount: 0,
      failureCount: 0,
      lastFlushTime: 0,
    }
    flushMetricsMap.set(threadId, metrics)
  }
  return metrics
}

/**
 * P2: Clean up flush metrics for a thread.
 * Should be called when thread is closed to prevent memory leaks.
 */
export function clearFlushMetrics(threadId: string): void {
  flushMetricsMap.delete(threadId)
}

/**
 * P0 Enhancement: Flush with retry logic for improved reliability.
 * Retries failed flushes up to maxRetries times with exponential backoff.
 *
 * @param threadId - The thread ID
 * @param flushFn - The flush function to execute
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @returns Promise that resolves when flush succeeds or all retries exhausted
 */
export async function flushWithRetry(
  threadId: string,
  flushFn: () => void,
  maxRetries = 2
): Promise<void> {
  const metrics = getFlushMetrics(threadId)
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      flushFn()
      metrics.successCount++
      metrics.lastFlushTime = Date.now()
      log.debug(
        `[flushWithRetry] Flush succeeded for thread ${threadId} (attempt ${attempt + 1}/${maxRetries + 1})`,
        'delta-buffer'
      )
      return
    } catch (error) {
      lastError = error
      metrics.failureCount++
      metrics.lastError = error instanceof Error ? error.message : String(error)

      if (attempt < maxRetries) {
        const backoffMs = Math.min(100 * Math.pow(2, attempt), 1000) // Max 1s
        log.warn(
          `[flushWithRetry] Flush failed for thread ${threadId}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`,
          'delta-buffer'
        )
        await new Promise(resolve => setTimeout(resolve, backoffMs))
      }
    }
  }

  // All retries exhausted
  log.error(
    `[flushWithRetry] All flush attempts failed for thread ${threadId}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    'delta-buffer'
  )
  throw lastError
}

/**
 * Schedule a flush for a specific thread.
 * Handles immediate flush for first delta and buffer overflow detection.
 *
 * Optimization: Uses batch flushing with requestIdleCallback for
 * non-immediate flushes to coalesce multiple small updates.
 *
 * P0 Enhancement: Added operation sequence validation before scheduling flush.
 */
export function scheduleFlush(threadId: string, flushFn: () => void, immediate = false): void {
  const buffer = getDeltaBuffer(threadId)
  // If buffer is null, thread is closing - don't schedule flush
  if (!buffer) return

  // P0 Enhancement: Validate operation sequence before scheduling
  if (!isOperationValid(buffer.operationSeq)) {
    log.debug(
      `[scheduleFlush] Stale operation (buffer: ${buffer.operationSeq}, current: ${getCurrentOperationSequence()}), skipping flush for thread: ${threadId}`,
      'delta-buffer'
    )
    return
  }

  const currentSize = getBufferSize(buffer)

  // Check for buffer overflow - force flush if too large
  if (currentSize > MAX_BUFFER_SIZE) {
    const startTime = performance.now()
    log.debug(
      `[delta-buffer] Buffer overflow detected: ${currentSize} bytes > ${MAX_BUFFER_SIZE}`,
      'delta-buffer'
    )

    const timer = flushTimers.get(threadId)
    if (timer) {
      clearTimeout(timer)
      flushTimers.delete(threadId)
    }

    // Clear from pending queue if present
    pendingFlushQueue.delete(threadId)

    flushFn()
    logPerformance('scheduleFlush:overflow', startTime)
    return
  }

  const existingTimer = flushTimers.get(threadId)
  if (immediate && !existingTimer) {
    // First delta: flush immediately for instant first-character display
    flushFn()
    return
  }

  if (!existingTimer) {
    // P2: Get existing entry to increment version
    const existing = pendingFlushQueue.get(threadId)
    
    // P2: Prevent duplicate scheduling within short time window (10ms)
    if (existing && existing.scheduledAt > performance.now() - 10) {
      log.debug(`[scheduleFlush] Skipping duplicate flush for ${threadId}`, 'delta-buffer')
      return
    }
    
    // Add to pending flush queue for batch processing
    pendingFlushQueue.set(threadId, {
      threadId,
      flushFn,
      scheduledAt: performance.now(),
      version: (existing?.version ?? 0) + 1,  // P2: Increment version
    })

    // Schedule the timer
    const timer = setTimeout(() => {
      flushTimers.delete(threadId)

      // Check if still in pending queue (not already processed by idle callback)
      const pending = pendingFlushQueue.get(threadId)
      if (pending) {
        pendingFlushQueue.delete(threadId)
        pending.flushFn()
      }
    }, FLUSH_INTERVAL_MS)

    flushTimers.set(threadId, timer)

    // Also schedule idle processing for potential batch optimization
    scheduleIdleFlush()
  }
}

// ==================== Full Turn Cleanup ====================

/**
 * Perform full cleanup for a specific thread's turn.
 * Clears all timers, buffers, and pending operations for the thread.
 *
 * P1 Fix: Added idempotency protection to prevent duplicate cleanups.
 * Multiple calls within a short time window (1000ms) are safely ignored.
 */
export function performFullTurnCleanup(threadId: string): void {
  // P1 Fix: Check if cleanup was recently performed
  const cleanupKey = `cleanup-${threadId}`
  if (recentCleanups.has(cleanupKey)) {
    log.debug(
      `[performFullTurnCleanup] Already cleaned up thread ${threadId}, skipping duplicate cleanup`,
      'delta-buffer'
    )
    return
  }

  // Mark as recently cleaned up
  recentCleanups.add(cleanupKey)

  // Execute cleanup operations
  clearDeltaBuffer(threadId)      // Clears buffer + flush timer + pending flush
  clearTurnTimeout(threadId)      // Clears turn timeout timer separately

  log.debug(
    `[performFullTurnCleanup] Completed cleanup for thread ${threadId}`,
    'delta-buffer'
  )

  // Remove from recent cleanups after 1 second to allow future cleanups
  setTimeout(() => {
    recentCleanups.delete(cleanupKey)
  }, 1000)
}

/**
 * Clear all timers for a specific thread.
 * This ensures complete cleanup of all timer types for a thread.
 *
 * @param threadId - The thread ID to clear timers for
 */
export function clearAllTimers(threadId: string): void {
  // Clear flush timer
  const flushTimer = flushTimers.get(threadId)
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimers.delete(threadId)
    log.debug(`[clearAllTimers] Cleared flush timer for thread: ${threadId}`, 'delta-buffer')
  }

  // Clear turn timeout timer
  const turnTimer = turnTimeoutTimers.get(threadId)
  if (turnTimer) {
    clearTimeout(turnTimer)
    turnTimeoutTimers.delete(threadId)
    log.debug(`[clearAllTimers] Cleared turn timeout timer for thread: ${threadId}`, 'delta-buffer')
  }

  // Clear from pending flush queue
  const wasPending = pendingFlushQueue.delete(threadId)
  if (wasPending) {
    log.debug(`[clearAllTimers] Removed thread from pending flush queue: ${threadId}`, 'delta-buffer')
  }
}

/**
 * Clear all timers across all threads.
 * Useful for application shutdown or complete reset scenarios.
 */
export function clearAllTimersForAllThreads(): void {
  // Clear all flush timers
  const flushTimerEntries = Array.from(flushTimers.entries())
  for (const [threadId, timer] of flushTimerEntries) {
    clearTimeout(timer)
    flushTimers.delete(threadId)
  }

  // Clear all turn timeout timers
  const turnTimerEntries = Array.from(turnTimeoutTimers.entries())
  for (const [threadId, timer] of turnTimerEntries) {
    clearTimeout(timer)
    turnTimeoutTimers.delete(threadId)
  }

  // Clear all pending flushes
  const pendingCount = pendingFlushQueue.size
  pendingFlushQueue.clear()

  // Clear idle callback if active
  if (idleCallbackId !== null) {
    if (hasIdleCallback) {
      cancelIdleCallback(idleCallbackId)
    } else {
      clearTimeout(idleCallbackId as unknown as ReturnType<typeof setTimeout>)
    }
    idleCallbackId = null
  }

  log.debug(
    `[clearAllTimersForAllThreads] Cleared ${flushTimerEntries.length} flush timers, ${turnTimerEntries.length} turn timers, ${pendingCount} pending flushes`,
    'delta-buffer'
  )
}

// ==================== Buffer Content Update Helpers ====================

/**
 * Set agent message content with incremental size tracking.
 */
export function setAgentMessage(buffer: DeltaBuffer, itemId: string, text: string): void {
  const oldText = buffer.agentMessages.get(itemId)
  buffer.agentMessages.set(itemId, text)
  updateBufferSize(buffer, text, oldText)
}

/**
 * Set command output content with incremental size tracking.
 */
export function setCommandOutput(buffer: DeltaBuffer, itemId: string, output: string): void {
  const oldOutput = buffer.commandOutputs.get(itemId)
  buffer.commandOutputs.set(itemId, output)
  updateBufferSize(buffer, output, oldOutput)
}

/**
 * Set file change output content with incremental size tracking.
 */
export function setFileChangeOutput(buffer: DeltaBuffer, itemId: string, output: string): void {
  const oldOutput = buffer.fileChangeOutputs.get(itemId)
  buffer.fileChangeOutputs.set(itemId, output)
  updateBufferSize(buffer, output, oldOutput)
}

/**
 * Add reasoning summary with incremental size tracking.
 */
export function addReasoningSummary(
  buffer: DeltaBuffer,
  itemId: string,
  summary: { index: number; text: string }
): void {
  let summaries = buffer.reasoningSummaries.get(itemId)
  if (!summaries) {
    summaries = []
    buffer.reasoningSummaries.set(itemId, summaries)
  }

  // Find existing summary with same index
  const existingIdx = summaries.findIndex((s) => s.index === summary.index)
  if (existingIdx >= 0) {
    const oldText = summaries[existingIdx].text
    summaries[existingIdx] = summary
    updateBufferSize(buffer, summary.text, oldText)
  } else {
    summaries.push(summary)
    updateBufferSize(buffer, summary.text)
  }
}

/**
 * Add reasoning content with incremental size tracking.
 */
export function addReasoningContent(
  buffer: DeltaBuffer,
  itemId: string,
  content: { index: number; text: string }
): void {
  let contents = buffer.reasoningContents.get(itemId)
  if (!contents) {
    contents = []
    buffer.reasoningContents.set(itemId, contents)
  }

  // Find existing content with same index
  const existingIdx = contents.findIndex((c) => c.index === content.index)
  if (existingIdx >= 0) {
    const oldText = contents[existingIdx].text
    contents[existingIdx] = content
    updateBufferSize(buffer, content.text, oldText)
  } else {
    contents.push(content)
    updateBufferSize(buffer, content.text)
  }
}

/**
 * Add MCP progress message with incremental size tracking.
 */
export function addMcpProgress(buffer: DeltaBuffer, itemId: string, message: string): void {
  let messages = buffer.mcpProgress.get(itemId)
  if (!messages) {
    messages = []
    buffer.mcpProgress.set(itemId, messages)
  }

  messages.push(message)
  updateBufferSize(buffer, message)
}

// ==================== Cleanup on Module Unload ====================

/**
 * Cancel any pending idle callbacks when the module is unloaded.
 * This is important for hot module replacement scenarios.
 */
if (typeof window !== 'undefined' && hasIdleCallback) {
  window.addEventListener('beforeunload', () => {
    if (idleCallbackId !== null) {
      cancelIdleCallback(idleCallbackId)
      idleCallbackId = null
    }
  })
}
