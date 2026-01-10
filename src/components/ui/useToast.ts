import { useContext, useCallback } from 'react'
import { ToastContext, type ToastType } from './ToastContext'

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  // Helper function for simple toast messages
  const showToast = useCallback(
    (title: string, type: ToastType = 'info', message?: string) => {
      context.addToast({ type, title, message })
    },
    [context]
  )

  return { ...context, showToast }
}