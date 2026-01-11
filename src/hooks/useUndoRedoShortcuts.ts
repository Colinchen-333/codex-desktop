/**
 * useUndoRedoShortcuts Hook
 *
 * Hook for registering keyboard shortcuts for undo/redo functionality.
 * Handles Cmd+Z (undo) and Cmd+Shift+Z (redo) on Mac,
 * or Ctrl+Z and Ctrl+Shift+Z on Windows/Linux.
 */

import { useEffect } from 'react'
import { useUndoRedo } from './useUndoRedo'
import { useThreadStore } from '../stores/thread'
import { useUndoRedoStore } from '../stores/undoRedo'

// Platform detection
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

/**
 * Hook for registering undo/redo keyboard shortcuts
 */
export function useUndoRedoShortcuts() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo()
  const focusedThreadId = useThreadStore((state) => state.focusedThreadId)

  // Update current thread in undo store
  useEffect(() => {
    const { setCurrentThread } = useUndoRedoStore.getState()
    setCurrentThread(focusedThreadId)
  }, [focusedThreadId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're in an input field
      const target = event.target as HTMLElement
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // Only trigger shortcuts when not in input field
      // (unless it's a specific case where we want to allow it)
      if (isInputField) return

      // Check for Cmd+Z (Mac) or Ctrl+Z (Windows/Linux) - Undo
      const isUndoKey = event.key.toLowerCase() === 'z'
      const isModifierPressed = isMac ? event.metaKey : event.ctrlKey
      const isShiftPressed = event.shiftKey

      if (isUndoKey && isModifierPressed && !isShiftPressed) {
        // Cmd+Z / Ctrl+Z - Undo
        event.preventDefault()
        event.stopPropagation()
        if (canUndo()) {
          undo()
        }
        return
      }

      if (isUndoKey && isModifierPressed && isShiftPressed) {
        // Cmd+Shift+Z / Ctrl+Shift+Z - Redo
        event.preventDefault()
        event.stopPropagation()
        if (canRedo()) {
          redo()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, canUndo, canRedo])
}

/**
 * Get the display string for undo/redo shortcuts
 */
export function getUndoRedoShortcutDisplay(): { undo: string; redo: string } {
  const modifier = isMac ? '⌘' : 'Ctrl'
  return {
    undo: `${modifier}+Z`,
    redo: `${modifier}+Shift+Z`,
  }
}
