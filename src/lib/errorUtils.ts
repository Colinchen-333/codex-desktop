// Error utilities for parsing Tauri errors

import { log } from './logger'
import { isRecord, isError, isTauriError, type TauriErrorShape } from './typeGuards'

// ==================== Centralized Error Logging ====================
// Provides a unified interface for error logging across the application

export interface LogErrorOptions {
  context?: string
  source?: string
  details?: unknown
  severity?: 'error' | 'warning' | 'info'
}

/**
 * Centralized error logging function.
 * Use this instead of console.error for consistent error handling.
 *
 * @param error - The error to log (Error object, string, or unknown)
 * @param options - Optional context and metadata
 */
export function logError(error: unknown, options: LogErrorOptions = {}): void {
  const {
    context = 'unknown',
    source,
    details,
    severity = 'error',
  } = options

  const errorMessage = parseError(error)

  // Build the full error message with context
  const fullMessage = context ? `[${context}] ${errorMessage}` : errorMessage

  // Log to the logger
  if (severity === 'error') {
    log.error(fullMessage, source || 'app')
  } else if (severity === 'warning') {
    log.warn(fullMessage, source || 'app')
  } else {
    log.info(fullMessage, source || 'app')
  }

  // Emit error notification for UI components
  if (severity === 'error') {
    emitError(errorMessage, severity, source, context)
  }

  // Log additional details if provided
  if (details) {
    try {
      const detailsStr = typeof details === 'string' ? details : JSON.stringify(details, null, 2)
      log.debug(`[details] ${detailsStr}`, source || 'app')
    } catch {
      // Ignore details serialization errors
    }
  }
}

export interface TauriError {
  message: string
  errorInfo?: {
    type?: string
    httpStatusCode?: number
  }
}

// Re-export type guard for convenience
export { isTauriError, type TauriErrorShape }

// ==================== Global Error Notification System ====================
// Allows stores to emit errors that UI components can subscribe to and display

export type ErrorSeverity = 'error' | 'warning' | 'info'

export interface ErrorNotification {
  message: string
  severity: ErrorSeverity
  source?: string // e.g., 'thread', 'sessions', 'projects'
  details?: string
  timestamp: number
}

type ErrorListener = (notification: ErrorNotification) => void
const errorListeners: Set<ErrorListener> = new Set()

/**
 * Subscribe to error notifications from stores
 * Returns unsubscribe function
 */
export function subscribeToErrors(listener: ErrorListener): () => void {
  errorListeners.add(listener)
  return () => errorListeners.delete(listener)
}

/**
 * Emit an error notification to all subscribers
 * Use this in stores when errors occur that the user should know about
 */
export function emitError(
  message: string,
  severity: ErrorSeverity = 'error',
  source?: string,
  details?: string
): void {
  const notification: ErrorNotification = {
    message,
    severity,
    source,
    details,
    timestamp: Date.now(),
  }
  errorListeners.forEach((listener) => {
    try {
      listener(notification)
    } catch (e) {
      log.error(`Listener threw error: ${e}`, 'emitError')
    }
  })
}

/**
 * Handle async operation errors with notification
 * Logs to console and emits to subscribers
 */
export function handleAsyncError(
  error: unknown,
  context: string,
  source?: string
): void {
  const message = parseError(error)
  log.error(`${message}`, context)
  emitError(message, 'error', source, context)
}

/**
 * Parse an error from Tauri invoke calls into a user-friendly message
 */
export function parseError(error: unknown): string {
  const MAX_ERROR_MESSAGE_LENGTH = 2000

  const truncateMessage = (message: string): string => {
    if (message.length <= MAX_ERROR_MESSAGE_LENGTH) return message
    return `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}... [truncated]`
  }

  const safeStringify = (value: unknown): string => {
    const seen = new WeakSet<object>()
    const MAX_DEPTH = 4
    const MAX_KEYS = 50
    const MAX_ARRAY_ITEMS = 50

    const format = (val: unknown, depth: number): string => {
      if (val === null || val === undefined) return String(val)
      if (typeof val === 'string') return JSON.stringify(val)
      if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') {
        return String(val)
      }
      if (typeof val === 'function') return '"[Function]"'
      if (typeof val !== 'object') return JSON.stringify(String(val))

      if (seen.has(val)) return '"[Circular]"'
      if (depth >= MAX_DEPTH) return '"[MaxDepth]"'
      seen.add(val)

      if (Array.isArray(val)) {
        const items = val.slice(0, MAX_ARRAY_ITEMS).map((item) => format(item, depth + 1))
        const extra = val.length > MAX_ARRAY_ITEMS ? `, "[+${val.length - MAX_ARRAY_ITEMS} more]"` : ''
        return `[${items.join(', ')}${extra}]`
      }

      const keys = Object.keys(val as Record<string, unknown>)
      const selectedKeys = keys.slice(0, MAX_KEYS)
      const entries = selectedKeys.map((key) => {
        const item = (val as Record<string, unknown>)[key]
        return `${JSON.stringify(key)}: ${format(item, depth + 1)}`
      })
      const extra = keys.length > MAX_KEYS ? `, "__more__": "[+${keys.length - MAX_KEYS} more]"` : ''
      return `{${entries.join(', ')}${extra}}`
    }

    return format(value, 0)
  }

  // Handle Error instances
  if (isError(error)) {
    return truncateMessage(error.message)
  }

  // Handle Tauri error objects
  if (isTauriError(error)) {
    return truncateMessage(error.message)
  }

  // Handle generic objects with message property
  if (isRecord(error) && typeof error.message === 'string') {
    return truncateMessage(error.message)
  }

  // Fallback to JSON stringify for unknown object structure
  if (isRecord(error)) {
    return truncateMessage(safeStringify(error))
  }

  return truncateMessage(String(error))
}

/**
 * Get detailed error info if available
 */
export function getErrorInfo(error: unknown): TauriError['errorInfo'] | undefined {
  if (isTauriError(error)) {
    return error.errorInfo
  }
  return undefined
}

/**
 * Check if error is a specific type
 */
export function isErrorType(error: unknown, type: string): boolean {
  const info = getErrorInfo(error)
  return info?.type === type
}

/**
 * Common error type checks
 */
export const ErrorTypes = {
  isUnauthorized: (error: unknown) => isErrorType(error, 'unauthorized'),
  isContextWindowExceeded: (error: unknown) => isErrorType(error, 'context_window_exceeded'),
  isUsageLimitExceeded: (error: unknown) => isErrorType(error, 'usage_limit_exceeded'),
  isConnectionFailed: (error: unknown) => isErrorType(error, 'http_connection_failed'),
  isSandboxError: (error: unknown) => isErrorType(error, 'sandbox_error'),
}

// ==================== Promise Timeout Utilities ====================
// P0 Enhancement: Unified promise timeout handling to prevent hanging operations

/**
 * Wraps a promise with a timeout.
 * If the promise doesn't resolve/reject within the timeout period, rejects with a timeout error.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param context - Context string for error messages (e.g., "import sessions store")
 * @returns Promise that resolves with the original promise result or rejects with timeout error
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(
        `Operation timed out after ${timeoutMs}ms: ${context}`
      )
      log.error(`[withTimeout] ${error.message}`, 'errorUtils')
      reject(error)
    }, timeoutMs)
  })

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise,
  ])
}

/**
 * Wraps a promise with timeout and cleanup function.
 * If the promise times out, the cleanup function is called before rejecting.
 * This is useful for cleaning up resources when an operation times out.
 *
 * @param promise - The promise to wrap
 * @param cleanup - Cleanup function to call on timeout
 * @param timeoutMs - Timeout in milliseconds
 * @param context - Context string for error messages
 * @returns Promise that resolves with the original promise result or rejects with timeout error
 */
export function withTimeoutAndCleanup<T>(
  promise: Promise<T>,
  cleanup: () => void,
  timeoutMs: number,
  context: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(
        `Operation timed out after ${timeoutMs}ms: ${context}`
      )
      log.error(`[withTimeoutAndCleanup] ${error.message}`, 'errorUtils')

      // Run cleanup before rejecting
      try {
        cleanup()
        log.debug(`[withTimeoutAndCleanup] Cleanup completed for: ${context}`, 'errorUtils')
      } catch (cleanupError) {
        log.error(
          `[withTimeoutAndCleanup] Cleanup failed for ${context}: ${parseError(cleanupError)}`,
          'errorUtils'
        )
      }

      reject(error)
    }, timeoutMs)
  })

  // Clear timeout if promise resolves/rejects first
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise,
  ])
}

/**
 * Wraps a dynamic import with timeout and fallback.
 * If the import fails or times out, logs the error and returns the fallback value.
 *
 * @param importFn - Function that returns the import promise
 * @param fallback - Fallback value to return on failure
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @param context - Context string for error messages
 * @returns Promise that resolves with the imported module or fallback value
 */
export async function withImportFallback<T>(
  importFn: () => Promise<T>,
  fallback: T,
  timeoutMs: number = 5000,
  context: string
): Promise<T> {
  try {
    return await withTimeout(importFn(), timeoutMs, context)
  } catch (error) {
    const errorMessage = parseError(error)
    log.error(
      `[withImportFallback] Import failed for ${context}: ${errorMessage}. Using fallback.`,
      'errorUtils'
    )
    return fallback
  }
}
