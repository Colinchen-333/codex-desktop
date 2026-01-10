/**
 * Delta Buffer Management
 *
 * Per-thread delta buffers to accumulate delta updates for smooth streaming.
 * Uses LRU cache to prevent unbounded memory growth.
 */

import { LRUCache } from './lru-cache'
import {
  MAX_LRU_CACHE_SIZE,
  MAX_BUFFER_SIZE,
  FLUSH_INTERVAL_MS,
} from './constants'
import type { DeltaBuffer } from './types'

// ==================== Operation Sequence Tracking ====================
// Prevents race conditions when switching threads during async operations

let operationSequence = 0

export function getNextOperationSequence(): number {
  return ++operationSequence
}

export function getCurrentOperationSequence(): number {
  return operationSequence
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
  }
}

export function getDeltaBuffer(threadId: string): DeltaBuffer | null {
  // Check if thread is being closed - don't create new buffers for closing threads
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
  }
  const timer = flushTimers.get(threadId)
  if (timer) {
    clearTimeout(timer)
    flushTimers.delete(threadId)
    console.debug('[clearDeltaBuffer] Cleared flush timer for thread:', threadId)
  }
}

export function clearTurnTimeout(threadId: string): void {
  const timer = turnTimeoutTimers.get(threadId)
  if (timer) {
    clearTimeout(timer)
    turnTimeoutTimers.delete(threadId)
    console.debug('[clearTurnTimeout] Cleared timeout timer for thread:', threadId)
  }
}

// ==================== Buffer Size Calculation ====================

/**
 * Calculate buffer size in bytes for overflow detection.
 * Uses conservative estimate: ASCII=1 byte, non-ASCII=2 bytes (actual UTF-8 can be 1-4)
 */
export function getBufferSize(buffer: DeltaBuffer): number {
  const estimateBytes = (text: string): number => {
    let bytes = 0
    for (let i = 0; i < text.length; i++) {
      // ASCII characters (0-127) take 1 byte, others take 2+ bytes
      bytes += text.charCodeAt(i) < 128 ? 1 : 2
    }
    return bytes
  }

  let size = 0
  buffer.agentMessages.forEach((text) => { size += estimateBytes(text) })
  buffer.commandOutputs.forEach((text) => { size += estimateBytes(text) })
  buffer.fileChangeOutputs.forEach((text) => { size += estimateBytes(text) })
  buffer.reasoningSummaries.forEach((arr) => {
    arr.forEach((item) => { size += estimateBytes(item.text) })
  })
  buffer.reasoningContents.forEach((arr) => {
    arr.forEach((item) => { size += estimateBytes(item.text) })
  })
  buffer.mcpProgress.forEach((arr) => {
    arr.forEach((msg) => { size += estimateBytes(msg) })
  })
  return size
}

// ==================== Flush Scheduling ====================

/**
 * Schedule a flush for a specific thread.
 * Handles immediate flush for first delta and buffer overflow detection.
 */
export function scheduleFlush(threadId: string, flushFn: () => void, immediate = false): void {
  const buffer = getDeltaBuffer(threadId)
  // If buffer is null, thread is closing - don't schedule flush
  if (!buffer) return

  // Check for buffer overflow - force flush if too large
  if (getBufferSize(buffer) > MAX_BUFFER_SIZE) {
    const timer = flushTimers.get(threadId)
    if (timer) {
      clearTimeout(timer)
      flushTimers.delete(threadId)
    }
    flushFn()
    return
  }

  const existingTimer = flushTimers.get(threadId)
  if (immediate && !existingTimer) {
    // First delta: flush immediately for instant first-character display
    flushFn()
    return
  }
  if (!existingTimer) {
    const timer = setTimeout(() => {
      flushTimers.delete(threadId)
      flushFn()
    }, FLUSH_INTERVAL_MS)
    flushTimers.set(threadId, timer)
  }
}

// ==================== Full Turn Cleanup ====================

/**
 * Perform full cleanup for a specific thread's turn.
 */
export function performFullTurnCleanup(threadId: string): void {
  clearDeltaBuffer(threadId)
  clearTurnTimeout(threadId)
}
