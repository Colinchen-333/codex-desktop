import { useEffect, useRef, useCallback, type RefObject } from 'react'

/**
 * Selector for all focusable elements within a container
 */
const FOCUSABLE_ELEMENTS_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ')

/**
 * Initial focus target type
 * - 'first': Focus the first focusable element
 * - 'last': Focus the last focusable element
 * - 'container': Focus the container itself
 * - RefObject<HTMLElement>: Focus a specific element
 */
export type InitialFocusTarget = 'first' | 'last' | 'container' | RefObject<HTMLElement | null>

export interface UseFocusTrapOptions {
  /**
   * Whether the focus trap is active
   */
  isActive: boolean
  /**
   * Callback when Escape key is pressed
   */
  onEscape?: () => void
  /**
   * Initial element to focus (ref). If not provided, focuses first focusable element.
   * @deprecated Use `initialFocus` instead
   */
  initialFocusRef?: RefObject<HTMLElement | null>
  /**
   * Initial focus target
   * - 'first': Focus the first focusable element (default)
   * - 'last': Focus the last focusable element
   * - 'container': Focus the container itself
   * - RefObject<HTMLElement>: Focus a specific element
   * @default 'first'
   */
  initialFocus?: InitialFocusTarget
  /**
   * Whether to restore focus to the previously focused element when trap is deactivated
   * @default true
   */
  restoreFocus?: boolean
  /**
   * Whether to auto-focus the first element when activated
   * @default true
   */
  autoFocus?: boolean
}

/**
 * Hook to trap focus within a container element for accessibility.
 * Implements focus trapping for modal dialogs according to WAI-ARIA guidelines.
 *
 * Features:
 * - Tab cycles through focusable elements within the container
 * - Shift+Tab cycles in reverse
 * - Escape key support with callback
 * - Auto-focuses first element or specified initial element
 * - Restores focus to previously focused element on deactivation
 *
 * @example
 * ```tsx
 * function Dialog({ isOpen, onClose }) {
 *   const containerRef = useFocusTrap({
 *     isActive: isOpen,
 *     onEscape: onClose,
 *   })
 *
 *   return (
 *     <div ref={containerRef} role="dialog" aria-modal="true">
 *       <button>First focusable</button>
 *       <button onClick={onClose}>Close</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  isActive,
  onEscape,
  initialFocusRef,
  initialFocus = 'first',
  restoreFocus = true,
  autoFocus = true,
}: UseFocusTrapOptions): RefObject<T | null> {
  const containerRef = useRef<T>(null)
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null)
  // P1 Fix: Track previous isActive state to detect transitions
  const wasActiveRef = useRef(false)

  /**
   * Get all focusable elements within the container
   */
  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return []

    const elements = containerRef.current.querySelectorAll<HTMLElement>(
      FOCUSABLE_ELEMENTS_SELECTOR
    )

    // Filter out elements that are not visible
    return Array.from(elements).filter((el) => {
      const style = window.getComputedStyle(el)
      return (
        el.offsetParent !== null &&
        !el.hasAttribute('aria-hidden') &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    })
  }, [])

  /**
   * Focus the initial element based on the initialFocus setting
   */
  const focusInitialElement = useCallback(() => {
    // Legacy support for initialFocusRef
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus()
      return
    }

    const focusableElements = getFocusableElements()

    // Handle different initialFocus types
    if (typeof initialFocus === 'object' && initialFocus !== null) {
      // It's a RefObject
      if (initialFocus.current) {
        initialFocus.current.focus()
        return
      }
    }

    switch (initialFocus) {
      case 'last':
        if (focusableElements.length > 0) {
          focusableElements[focusableElements.length - 1].focus()
        }
        break
      case 'container':
        if (containerRef.current) {
          // Ensure the container can receive focus
          if (containerRef.current.tabIndex < 0) {
            containerRef.current.tabIndex = -1
          }
          containerRef.current.focus()
        }
        break
      case 'first':
      default:
        if (focusableElements.length > 0) {
          focusableElements[0].focus()
        }
        break
    }
  }, [getFocusableElements, initialFocusRef, initialFocus])

  /**
   * Handle keyboard navigation for focus trapping
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isActive) return

      // Handle Escape key
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onEscape?.()
        return
      }

      // Handle Tab key for focus trapping
      if (event.key === 'Tab') {
        const focusableElements = getFocusableElements()

        if (focusableElements.length === 0) {
          event.preventDefault()
          return
        }

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]
        const activeElement = document.activeElement as HTMLElement

        // Shift+Tab from first element -> go to last
        if (event.shiftKey && activeElement === firstElement) {
          event.preventDefault()
          lastElement.focus()
          return
        }

        // Tab from last element -> go to first
        if (!event.shiftKey && activeElement === lastElement) {
          event.preventDefault()
          firstElement.focus()
          return
        }

        // If focus is outside the container, bring it back
        if (!containerRef.current?.contains(activeElement)) {
          event.preventDefault()
          if (event.shiftKey) {
            lastElement.focus()
          } else {
            firstElement.focus()
          }
        }
      }
    },
    [isActive, onEscape, getFocusableElements]
  )

  // Store previously focused element and set up initial focus
  useEffect(() => {
    // P1 Fix: Only store previouslyFocusedElement when transitioning from inactive to active
    // This prevents nested dialogs from overwriting the outer dialog's stored focus
    const wasActive = wasActiveRef.current
    wasActiveRef.current = isActive

    if (!isActive) return

    // Only store focus on activation transition (false -> true)
    if (!wasActive) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement
    }

    // Auto-focus initial element after a small delay to ensure DOM is ready
    if (autoFocus) {
      const timeoutId = setTimeout(() => {
        focusInitialElement()
      }, 0)

      return () => clearTimeout(timeoutId)
    }
  }, [isActive, autoFocus, restoreFocus, focusInitialElement])

  // Set up keyboard event listeners
  useEffect(() => {
    if (!isActive) return

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isActive, handleKeyDown])

  // Restore focus when deactivated
  useEffect(() => {
    if (isActive) return

    if (restoreFocus && previouslyFocusedElementRef.current) {
      // Small delay to ensure the dialog is fully closed
      const timeoutId = setTimeout(() => {
        previouslyFocusedElementRef.current?.focus()
        previouslyFocusedElementRef.current = null
      }, 0)

      return () => clearTimeout(timeoutId)
    }
  }, [isActive, restoreFocus])

  return containerRef
}

export default useFocusTrap
