import { useEffect, useState, useCallback, useRef } from 'react'
import { cn } from '../../lib/utils'
import {
  ToastContext,
  TOAST_MAX_STACK_SIZE,
  TOAST_PRIORITY,
  type Toast,
  type ToastInput,
} from './ToastContext'
import { useToast } from './useToast'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique toast ID
 */
function generateToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Find an existing toast with the same groupId
 */
function findGroupedToast(toasts: Toast[], groupId: string | undefined): Toast | undefined {
  if (!groupId) return undefined
  return toasts.find((t) => t.groupId === groupId)
}

/**
 * Sort toasts by priority (higher priority first), then by timestamp (newer first)
 */
function sortToastsByPriority(toasts: Toast[]): Toast[] {
  return [...toasts].sort((a, b) => {
    const priorityDiff = TOAST_PRIORITY[b.type] - TOAST_PRIORITY[a.type]
    if (priorityDiff !== 0) return priorityDiff
    return b.timestamp - a.timestamp
  })
}

/**
 * Apply stack limit, removing lowest priority/oldest toasts first
 * High priority toasts are protected from being removed by lower priority ones
 */
function applyStackLimit(toasts: Toast[], newToast: Toast): Toast[] {
  if (toasts.length < TOAST_MAX_STACK_SIZE) {
    return [...toasts, newToast]
  }

  const newPriority = TOAST_PRIORITY[newToast.type]

  // Find the lowest priority toast that can be removed
  // Only remove a toast if the new one has equal or higher priority
  const sortedByRemovalOrder = [...toasts].sort((a, b) => {
    // Lower priority first (candidates for removal)
    const priorityDiff = TOAST_PRIORITY[a.type] - TOAST_PRIORITY[b.type]
    if (priorityDiff !== 0) return priorityDiff
    // Older first among same priority
    return a.timestamp - b.timestamp
  })

  const toastToRemove = sortedByRemovalOrder[0]
  const removePriority = TOAST_PRIORITY[toastToRemove.type]

  // Only remove if new toast has >= priority than the one being removed
  if (newPriority >= removePriority) {
    const filtered = toasts.filter((t) => t.id !== toastToRemove.id)
    return [...filtered, newToast]
  }

  // New toast has lower priority than all existing - don't add it
  return toasts
}

// ============================================================================
// Toast Provider
// ============================================================================

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((input: ToastInput) => {
    setToasts((prev) => {
      // Check for message grouping
      const existingGrouped = findGroupedToast(prev, input.groupId)

      if (existingGrouped) {
        // Merge with existing grouped toast - increment count and update timestamp
        return prev.map((t) =>
          t.id === existingGrouped.id
            ? {
                ...t,
                count: (t.count ?? 1) + 1,
                timestamp: Date.now(),
                // Update message if provided
                message: input.message ?? t.message,
              }
            : t
        )
      }

      // Create new toast
      const newToast: Toast = {
        ...input,
        id: generateToastId(),
        timestamp: Date.now(),
        count: 1,
      }

      // Apply stack limit with priority protection
      return applyStackLimit(prev, newToast)
    })
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setToasts([])
  }, [])

  // Sort toasts for display (high priority first)
  const sortedToasts = sortToastsByPriority(toasts)

  return (
    <ToastContext.Provider value={{ toasts: sortedToasts, addToast, removeToast, clearAll }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

// ============================================================================
// Toast Container
// ============================================================================

function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

// ============================================================================
// Toast Item
// ============================================================================

const TOAST_ICONS: Record<Toast['type'], string> = {
  info: 'i',
  success: '\u2713',
  warning: '!',
  error: '\u2717',
}

const TOAST_COLORS: Record<Toast['type'], string> = {
  info: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
  success: 'border-green-500 bg-green-50 dark:bg-green-950/30',
  warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30',
  error: 'border-red-500 bg-red-50 dark:bg-red-950/30',
}

const TOAST_ICON_COLORS: Record<Toast['type'], string> = {
  info: 'bg-blue-500 text-white',
  success: 'bg-green-500 text-white',
  warning: 'bg-yellow-500 text-white',
  error: 'bg-red-500 text-white',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // P1 Fix: Use ref to store latest onDismiss to avoid timer resets on callback changes
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      const timer = setTimeout(() => onDismissRef.current(), duration)
      return () => clearTimeout(timer)
    }
  }, [toast.duration, toast.timestamp]) // P1 Fix: Removed onDismiss from deps

  const showCount = toast.count !== undefined && toast.count > 1

  return (
    <div
      className={cn(
        'flex min-w-[300px] max-w-[400px] items-start gap-3 rounded-lg border-l-4 p-4 shadow-lg',
        TOAST_COLORS[toast.type],
        'animate-in slide-in-from-right duration-300'
      )}
      role="alert"
    >
      {/* Icon */}
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          TOAST_ICON_COLORS[toast.type]
        )}
      >
        {TOAST_ICONS[toast.type]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{toast.title}</p>
          {showCount && (
            <span className="shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium">
              {toast.count}
            </span>
          )}
        </div>
        {toast.message && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{toast.message}</p>
        )}
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// Re-export useToast for convenience
export { useToast } from './useToast'
