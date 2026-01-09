import { useEffect, useCallback } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean // Command key on Mac
  shift?: boolean
  alt?: boolean
  handler: () => void
  description: string
}

// Platform detection
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

// Common shortcuts used across the app
export const defaultShortcuts: Omit<KeyboardShortcut, 'handler'>[] = [
  { key: 'n', meta: true, description: 'New session' },
  { key: 'o', meta: true, description: 'Open project' },
  { key: ',', meta: true, description: 'Open settings' },
  { key: 'k', meta: true, description: 'Focus search/input' },
  { key: '1', meta: true, description: 'Switch to Projects tab' },
  { key: '2', meta: true, description: 'Switch to Sessions tab' },
  { key: 'Enter', meta: true, description: 'Send message' },
  { key: 'Escape', description: 'Cancel/Close dialog' },
]

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields (except for specific shortcuts)
      const target = event.target as HTMLElement
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      for (const shortcut of shortcuts) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase()

        // Check modifier keys
        const metaMatches = shortcut.meta
          ? isMac
            ? event.metaKey
            : event.ctrlKey
          : isMac
            ? !event.metaKey
            : true
        const ctrlMatches = shortcut.ctrl
          ? event.ctrlKey
          : shortcut.meta && !isMac
            ? true
            : !event.ctrlKey
        const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey
        const altMatches = shortcut.alt ? event.altKey : !event.altKey

        // For shortcuts with meta key, allow them even in input fields
        const allowInInput = shortcut.meta || shortcut.key === 'Escape'

        if (
          keyMatches &&
          ctrlMatches &&
          metaMatches &&
          shiftMatches &&
          altMatches &&
          (allowInInput || !isInputField)
        ) {
          event.preventDefault()
          event.stopPropagation()
          shortcut.handler()
          return
        }
      }
    },
    [shortcuts]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

// Hook for showing keyboard shortcut hints
export function formatShortcut(shortcut: Omit<KeyboardShortcut, 'handler'>): string {
  const parts: string[] = []

  if (shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Ctrl')
  }
  if (shortcut.ctrl) {
    parts.push('Ctrl')
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt')
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift')
  }

  // Format special keys
  const keyDisplay =
    {
      Enter: '↵',
      Escape: 'Esc',
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      Backspace: '⌫',
      Delete: 'Del',
      Tab: '⇥',
      ' ': 'Space',
    }[shortcut.key] || shortcut.key.toUpperCase()

  parts.push(keyDisplay)

  return isMac ? parts.join('') : parts.join('+')
}
