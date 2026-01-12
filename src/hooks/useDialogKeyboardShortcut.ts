import { useEffect, useRef } from 'react'

/**
 * Options for the dialog keyboard shortcut hook
 */
export interface UseDialogKeyboardShortcutOptions {
  /** Whether the dialog is currently open */
  isOpen: boolean
  /** Callback when Cmd+Enter is pressed (or Ctrl+Enter on Windows/Linux) */
  onConfirm: () => void
  /** Optional: Callback when Escape is pressed */
  onCancel?: () => void
  /** Optional: If true, only trigger Cmd+Enter (not plain Enter) */
  requireModifierKey?: boolean
  /** Optional: Ref to an input element that should handle Enter key first */
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
}

/**
 * Hook for handling keyboard shortcuts in dialog components
 *
 * Provides Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to trigger confirm action.
 * Optionally handles Escape key for cancel.
 *
 * @example
 * ```tsx
 * function MyDialog({ isOpen, onConfirm, onCancel }) {
 *   const confirmButtonRef = useRef<HTMLButtonElement>(null)
 *   useDialogKeyboardShortcut({
 *     isOpen,
 *     onConfirm: () => confirmButtonRef.current?.click(),
 *     onCancel,
 *     requireModifierKey: false,
 *   })
 *
 *   return (
 *     <dialog>
 *       <button ref={confirmButtonRef} onClick={onConfirm}>
 *         Confirm
 *       </button>
 *     </dialog>
 *   )
 * }
 * ```
 */
export function useDialogKeyboardShortcut({
  isOpen,
  onConfirm,
  onCancel,
  requireModifierKey = false,
  inputRef,
}: UseDialogKeyboardShortcutOptions) {
  const isHandlingInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    // Store reference to input element
    isHandlingInputRef.current = inputRef?.current || null

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return

      // Handle Escape key
      if (e.key === 'Escape' && onCancel) {
        e.preventDefault()
        onCancel()
        return
      }

      // Handle Enter key
      if (e.key === 'Enter') {
        // Check if the event target is an input/textarea element
        const target = e.target as HTMLElement
        const isInputElement =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable

        // If we have an input ref and the target is that input, let it handle Enter normally
        if (inputRef?.current && target === inputRef.current) {
          // The input will handle the Enter key (e.g., form submission)
          // Don't trigger dialog confirm
          return
        }

        // Check for Cmd (Mac) or Ctrl (Windows/Linux) modifier
        const hasModifier = e.metaKey || e.ctrlKey

        // Never hijack plain Enter in input elements
        if (isInputElement && !hasModifier) {
          return
        }

        // If modifier key is required, ensure it is pressed
        if (requireModifierKey && !hasModifier) {
          return
        }

        // Trigger confirm if:
        // 1. We have a modifier key (Cmd/Ctrl), OR
        // 2. We're not in an input element and modifier key is not required
        if (hasModifier || (!isInputElement && !requireModifierKey)) {
          e.preventDefault()
          onConfirm()
        }
      }
    }

    // Add event listener to window to capture all keydown events
    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      isHandlingInputRef.current = null
    }
  }, [isOpen, onConfirm, onCancel, requireModifierKey, inputRef])
}
