/**
 * useCommandHistory Hook
 *
 * Provides keyboard navigation through command history using up/down arrows.
 * Only triggers when the cursor is at the beginning of the input or the input is empty.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useCommandHistoryStore } from '../stores/commandHistory'

export interface UseCommandHistoryOptions {
  /** Reference to the textarea element */
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  /** Current input value */
  inputValue: string
  /** Function to set the input value */
  setInputValue: (value: string) => void
  /** Whether popups are open (disable navigation when true) */
  popupsOpen?: boolean
}

export interface UseCommandHistoryReturn {
  /** Handle keydown event for arrow navigation */
  handleHistoryKeyDown: (e: React.KeyboardEvent) => void
  /** Add a command to history (call on send) */
  addToHistory: (command: string) => void
  /** Reset cursor when user modifies input */
  resetHistoryCursor: () => void
  /** Clear all history */
  clearHistory: () => void
}

export function useCommandHistory({
  inputRef,
  inputValue,
  setInputValue,
  popupsOpen = false,
}: UseCommandHistoryOptions): UseCommandHistoryReturn {
  const { add, getPrevious, getNext, resetCursor, clear } = useCommandHistoryStore()

  // Track if we're currently navigating to prevent resetting cursor
  const isNavigatingRef = useRef(false)
  const rafIdRef = useRef<number | null>(null)

  const handleHistoryKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't handle if popups are open
      if (popupsOpen) return

      const textarea = inputRef.current
      if (!textarea) return

      const isArrowUp = e.key === 'ArrowUp'
      const isArrowDown = e.key === 'ArrowDown'

      if (!isArrowUp && !isArrowDown) return

      // Get cursor position
      const cursorPos = textarea.selectionStart
      const hasSelection = textarea.selectionStart !== textarea.selectionEnd

      // Only trigger navigation when:
      // - Input is empty, OR
      // - Cursor is at the very beginning (for up), OR
      // - Cursor is at the very end (for down)
      const shouldNavigate =
        !hasSelection &&
        (inputValue.trim() === '' ||
          (isArrowUp && cursorPos === 0) ||
          (isArrowDown && cursorPos === inputValue.length))

      if (!shouldNavigate) return

      // Mark as navigating to prevent resetCursor from being called
      isNavigatingRef.current = true

      if (isArrowUp) {
        const previous = getPrevious(inputValue)
        if (previous !== null) {
          e.preventDefault()
          setInputValue(previous)
          // Move cursor to end after state update
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current)
          }
          rafIdRef.current = requestAnimationFrame(() => {
            if (textarea) {
              textarea.selectionStart = textarea.selectionEnd = previous.length
            }
            isNavigatingRef.current = false
            rafIdRef.current = null
          })
        } else {
          isNavigatingRef.current = false
        }
      } else if (isArrowDown) {
        const next = getNext()
        if (next !== null) {
          e.preventDefault()
          setInputValue(next)
          // Move cursor to end after state update
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current)
          }
          rafIdRef.current = requestAnimationFrame(() => {
            if (textarea) {
              textarea.selectionStart = textarea.selectionEnd = next.length
            }
            isNavigatingRef.current = false
            rafIdRef.current = null
          })
        } else {
          isNavigatingRef.current = false
        }
      }
    },
    [inputRef, inputValue, popupsOpen, getPrevious, getNext, setInputValue]
  )

  const addToHistory = useCallback(
    (command: string) => {
      add(command)
    },
    [add]
  )

  const resetHistoryCursor = useCallback(() => {
    // Don't reset if we're in the middle of navigation
    if (!isNavigatingRef.current) {
      resetCursor()
    }
  }, [resetCursor])

  const clearHistory = useCallback(() => {
    clear()
  }, [clear])

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  return {
    handleHistoryKeyDown,
    addToHistory,
    resetHistoryCursor,
    clearHistory,
  }
}
