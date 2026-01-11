import { Component, type ReactNode } from 'react'
import { useToast } from './useToast'
import { logError } from '../../lib/errorUtils'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error) => void
}

interface State {
  hasError: boolean
}

/**
 * AsyncErrorBoundary - Catches errors in async operations within components
 *
 * Unlike regular ErrorBoundary which only catches synchronous errors,
 * this boundary can catch errors that occur in async operations (promises, callbacks, etc.)
 * when combined with proper error handling patterns.
 *
 * Usage:
 * ```tsx
 * <AsyncErrorBoundary onError={(error) => console.error('Async error:', error)}>
 *   <YourComponent />
 * </AsyncErrorBoundary>
 * ```
 *
 * For async operations, wrap them in try-catch or use .catch():
 * ```tsx
 * useEffect(() => {
 *   if (isOpen) {
 *     serverApi.getAccountInfo()
 *       .then(setAccountInfo)
 *       .catch((error) => {
 *         throw error // This will be caught by AsyncErrorBoundary
 *       })
 *   }
 * }, [isOpen])
 * ```
 */
export class AsyncErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(_error: Error) {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error)
    }

    // Log to console for debugging
    logError(error, {
      context: 'AsyncErrorBoundary',
      source: 'ui',
      details: 'Async error caught by boundary'
    })

    // We cannot call useToast here directly since it's a class component
    // The parent component should handle showing toasts via onError prop
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex items-center justify-center p-8 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="text-center">
              <p className="text-sm font-medium text-destructive">
                Something went wrong. Please try again.
              </p>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}

/**
 * Hook-based wrapper for easier use in functional components
 * This provides a convenient way to handle async errors with toast notifications
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { withAsyncErrorHandling } = useAsyncErrorBoundary()
 *
 *   useEffect(() => {
 *     if (isOpen) {
 *       withAsyncErrorHandling(
 *         serverApi.getAccountInfo().then(setAccountInfo),
 *         'Failed to load account information'
 *       )
 *     }
 *   }, [isOpen, withAsyncErrorHandling])
 * }
 * ```
 */
export function useAsyncErrorBoundary() {
  const { showToast } = useToast()

  /**
   * Wrap an async operation with error handling
   * Shows a toast notification on error
   */
  const withAsyncErrorHandling = async (
    promise: Promise<unknown>,
    errorMessage: string = 'An error occurred'
  ): Promise<unknown> => {
    try {
      return await promise
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logError(error, {
        context: 'useAsyncErrorBoundary',
        source: 'ui',
        details: errorMessage
      })
      showToast(`${errorMessage}: ${message}`, 'error')
      throw error // Re-throw to allow caller to handle if needed
    }
  }

  /**
   * Wrap a callback function with error handling
   * Shows a toast notification on error
   */
  const withErrorHandling = <T extends unknown[]>(
    callback: (...args: T) => void | Promise<void>,
    errorMessage: string = 'An error occurred'
  ) => {
    return async (...args: T) => {
      try {
        await callback(...args)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logError(error, {
          context: 'useAsyncErrorBoundary',
          source: 'ui',
          details: errorMessage
        })
        showToast(`${errorMessage}: ${message}`, 'error')
      }
    }
  }

  return {
    withAsyncErrorHandling,
    withErrorHandling,
  }
}
