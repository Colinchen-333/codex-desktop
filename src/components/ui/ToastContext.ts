import { createContext } from 'react'

// ============================================================================
// Configuration Constants
// ============================================================================

/** Maximum number of toasts that can be displayed simultaneously */
export const TOAST_MAX_STACK_SIZE = 5

/** Default duration for toast display in milliseconds */
export const TOAST_DEFAULT_DURATION = 5000

/** Priority values for each toast type (higher = more important) */
export const TOAST_PRIORITY: Record<ToastType, number> = {
  error: 4,
  warning: 3,
  info: 2,
  success: 1,
} as const

// ============================================================================
// Types
// ============================================================================

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  /** Group ID for message deduplication - toasts with same groupId will be merged */
  groupId?: string
  /** Number of merged messages (for grouped toasts) */
  count?: number
  /** Timestamp for ordering */
  timestamp: number
}

/** Input type for adding new toasts (excludes auto-generated fields) */
export type ToastInput = Omit<Toast, 'id' | 'timestamp' | 'count'>

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: ToastInput) => void
  removeToast: (id: string) => void
  clearAll: () => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
