import { useContext, useCallback, useMemo } from 'react'
import { ToastContext, type ToastType, type ToastInput } from './ToastContext'

/**
 * Hook for managing toast notifications
 *
 * @example
 * ```tsx
 * const { showToast, toast, clearAll } = useToast()
 *
 * // Simple usage
 * showToast('Operation successful', 'success')
 *
 * // With message
 * showToast('Error occurred', 'error', 'Please try again later')
 *
 * // With grouping (duplicate messages will be merged)
 * toast.error('Network error', { groupId: 'network-error' })
 *
 * // Full control
 * toast.add({
 *   type: 'warning',
 *   title: 'Low disk space',
 *   message: 'Only 10% remaining',
 *   duration: 10000,
 *   groupId: 'disk-warning'
 * })
 * ```
 */
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  const { toasts, addToast, removeToast, clearAll } = context

  // Simple helper for quick toast messages
  const showToast = useCallback(
    (title: string, type: ToastType = 'info', message?: string) => {
      addToast({ type, title, message })
    },
    [addToast]
  )

  // Type-safe toast helpers with options support
  const toast = useMemo(
    () => ({
      /**
       * Add a toast with full control over options
       */
      add: (input: ToastInput) => addToast(input),

      /**
       * Show an info toast
       */
      info: (title: string, options?: Omit<ToastInput, 'type' | 'title'>) => {
        addToast({ type: 'info', title, ...options })
      },

      /**
       * Show a success toast
       */
      success: (title: string, options?: Omit<ToastInput, 'type' | 'title'>) => {
        addToast({ type: 'success', title, ...options })
      },

      /**
       * Show a warning toast
       */
      warning: (title: string, options?: Omit<ToastInput, 'type' | 'title'>) => {
        addToast({ type: 'warning', title, ...options })
      },

      /**
       * Show an error toast
       */
      error: (title: string, options?: Omit<ToastInput, 'type' | 'title'>) => {
        addToast({ type: 'error', title, ...options })
      },
    }),
    [addToast]
  )

  return {
    toasts,
    addToast,
    removeToast,
    clearAll,
    showToast,
    toast,
  }
}
