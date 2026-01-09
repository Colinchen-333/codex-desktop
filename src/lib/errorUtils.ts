// Error utilities for parsing Tauri errors

export interface TauriError {
  message: string
  errorInfo?: {
    type?: string
    httpStatusCode?: number
  }
}

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
      console.error('[emitError] Listener threw error:', e)
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
  console.error(`[${context}] ${message}`, error)
  emitError(message, 'error', source, context)
}

/**
 * Parse an error from Tauri invoke calls into a user-friendly message
 */
export function parseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const errObj = error as TauriError
    if (errObj.message) {
      return errObj.message
    }
    // Fallback to JSON stringify for unknown object structure
    return JSON.stringify(error, null, 2)
  }

  return String(error)
}

/**
 * Get detailed error info if available
 */
export function getErrorInfo(error: unknown): TauriError['errorInfo'] | undefined {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as TauriError
    return errObj.errorInfo
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
