/**
 * GlobalErrorHandler - Listens to store error notifications and displays them as toasts
 * This bridges the gap between stores (which can't use React hooks) and the toast system
 */
import { useEffect } from 'react'
import { subscribeToErrors, type ErrorNotification } from '../../lib/errorUtils'
import { useToast } from './Toast'

export function GlobalErrorHandler() {
  const { showToast } = useToast()

  useEffect(() => {
    // Subscribe to error notifications from stores
    const unsubscribe = subscribeToErrors((notification: ErrorNotification) => {
      // Map error severity to toast type
      const toastType = notification.severity === 'warning' ? 'warning'
        : notification.severity === 'info' ? 'info'
        : 'error'

      // Format message with optional details
      const message = notification.details
        ? `${notification.message} (${notification.details})`
        : notification.message

      showToast(message, toastType)
    })

    return unsubscribe
  }, [showToast])

  // This component doesn't render anything - it just sets up the error listener
  return null
}
