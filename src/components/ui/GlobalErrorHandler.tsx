/**
 * GlobalErrorHandler - Listens to store error notifications and displays them as toasts
 * This bridges the gap between stores (which can't use React hooks) and the toast system
 */
import { useEffect, useRef } from 'react'
import { subscribeToErrors, type ErrorNotification } from '../../lib/errorUtils'
import { useToast } from './useToast'

export function GlobalErrorHandler() {
  const { showToast } = useToast()

  // P1 Fix: Use ref to store the latest showToast function
  // This prevents re-subscription when showToast changes identity
  const showToastRef = useRef(showToast)
  showToastRef.current = showToast

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

      // P1 Fix: Use ref to always call the latest showToast
      showToastRef.current(message, toastType)
    })

    return unsubscribe
  }, []) // P1 Fix: Empty dependency array - subscription is stable

  // This component doesn't render anything - it just sets up the error listener
  return null
}
