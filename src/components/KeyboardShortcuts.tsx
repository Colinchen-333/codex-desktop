import { useMemo, useRef, useCallback, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useKeyboardShortcuts, type KeyboardShortcut } from '../hooks/useKeyboardShortcuts'
import { useAppStore } from '../stores/app'
import { useProjectsStore } from '../stores/projects'
import { useThreadStore } from '../stores/thread'
import { useToast } from './ui/Toast'

// Double-escape timeout (like CLI)
const DOUBLE_ESCAPE_TIMEOUT_MS = 1500

export function KeyboardShortcuts() {
  // Store functions are called via getState() to avoid dependency issues
  const { showToast } = useToast()
  const escapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup escape timer on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (escapeTimerRef.current) {
        clearTimeout(escapeTimerRef.current)
        escapeTimerRef.current = null
      }
    }
  }, [])

  // Handle double-escape like CLI
  const handleEscape = useCallback(() => {
    const { turnStatus, interrupt } = useThreadStore.getState()
    const currentEscapePending = useAppStore.getState().escapePending

    // If AI is running, require double-escape
    if (turnStatus === 'running') {
      if (currentEscapePending) {
        // Second escape - actually interrupt
        if (escapeTimerRef.current) {
          clearTimeout(escapeTimerRef.current)
          escapeTimerRef.current = null
        }
        useAppStore.getState().setEscapePending(false)
        interrupt()
      } else {
        // First escape - show pending state
        useAppStore.getState().setEscapePending(true)
        escapeTimerRef.current = setTimeout(() => {
          useAppStore.getState().setEscapePending(false)
          escapeTimerRef.current = null
        }, DOUBLE_ESCAPE_TIMEOUT_MS)
      }
    } else {
      // Not running - close dialogs
      useAppStore.getState().setSettingsOpen(false)
      useAppStore.getState().setKeyboardShortcutsOpen(false)
    }
  }, []) // No dependencies - all store functions called via getState()

  const shortcuts: KeyboardShortcut[] = useMemo(
    () => [
      // Open settings (Cmd/Ctrl + ,)
      {
        key: ',',
        meta: true,
        description: 'Open settings',
        handler: () => useAppStore.getState().setSettingsOpen(true),
      },
      // Focus input (Cmd/Ctrl + K)
      {
        key: 'k',
        meta: true,
        description: 'Focus input',
        handler: () => useAppStore.getState().triggerFocusInput(),
      },
      // Switch to Projects tab (Cmd/Ctrl + 1)
      {
        key: '1',
        meta: true,
        description: 'Switch to Projects tab',
        handler: () => useAppStore.getState().setSidebarTab('projects'),
      },
      // Switch to Sessions tab (Cmd/Ctrl + 2)
      {
        key: '2',
        meta: true,
        description: 'Switch to Sessions tab',
        handler: () => useAppStore.getState().setSidebarTab('sessions'),
      },
      // Open project (Cmd/Ctrl + O)
      {
        key: 'o',
        meta: true,
        description: 'Open project',
        handler: async () => {
          try {
            const selected = await open({
              directory: true,
              multiple: false,
              title: 'Select Project Folder',
            })
            if (selected && typeof selected === 'string') {
              await useProjectsStore.getState().addProject(selected)
              showToast('Project added successfully', 'success')
            }
          } catch (error) {
            console.error('Failed to add project:', error)
            showToast('Failed to add project', 'error')
          }
        },
      },
      // Escape - Double-press to interrupt AI (like CLI)
      {
        key: 'Escape',
        description: 'Interrupt AI / Close dialogs',
        handler: handleEscape,
      },
    ],
    [showToast, handleEscape] // Only dependencies that aren't store functions
  )

  useKeyboardShortcuts(shortcuts)

  return null
}
