/**
 * Thread Store Constants
 *
 * Configuration constants for the thread store including
 * timeouts, buffer sizes, and cache limits.
 */

// ==================== Session Limits ====================
export const MAX_PARALLEL_SESSIONS = 5

// ==================== Delta Batching ====================
export const FLUSH_INTERVAL_MS = 50 // 20 FPS
export const MAX_BUFFER_SIZE = 500_000 // 500KB - force flush to prevent memory issues

// ==================== Timeouts ====================
export const TURN_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes - generous timeout for long operations
export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes - generous timeout for user decisions
export const APPROVAL_CLEANUP_INTERVAL_MS = 60 * 1000 // Check every minute
export const TIMER_CLEANUP_INTERVAL_MS = 60 * 1000 // Clean up stale timers every minute
export const CLOSING_THREAD_CLEANUP_DELAY_MS = 100 // Delay before removing from closing set
export const THREAD_SWITCH_LOCK_TIMEOUT_MS = 30 * 1000 // 30 seconds - thread switch lock timeout to prevent deadlocks

// ==================== LRU Cache Configuration ====================
export const MAX_LRU_CACHE_SIZE = 500 // Maximum number of entries in LRU cache
export const LRU_CLEANUP_BATCH_SIZE = 50 // Number of entries to clean when cache is full
