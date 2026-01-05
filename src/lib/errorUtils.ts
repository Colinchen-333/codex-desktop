// Error utilities for parsing Tauri errors

export interface TauriError {
  message: string
  errorInfo?: {
    type?: string
    httpStatusCode?: number
  }
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
