import { useMemo, useRef, useCallback, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useKeyboardShortcuts, type KeyboardShortcut } from '../hooks/useKeyboardShortcuts'
import { useAppStore } from '../stores/app'
import { useProjectsStore } from '../stores/projects'
import { useThreadStore } from '../stores/thread/index'
import { useSessionsStore } from '../stores/sessions'
import { useToast } from './ui/Toast'
import { useUndoRedo } from '../hooks/useUndoRedo'
import { useUndoRedoStore } from '../stores/undoRedo'
import { logError } from '../lib/errorUtils'

// Double-escape timeout (like CLI)
const DOUBLE_ESCAPE_TIMEOUT_MS = 1500

export function KeyboardShortcuts() {
  // Store functions are called via getState() to avoid dependency issues
  const { showToast } = useToast()
  const { undo, redo, canUndo, canRedo } = useUndoRedo()
  const escapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusedThreadId = useThreadStore((state) => state.focusedThreadId)

  // Update current thread in undo store
  useEffect(() => {
    const { setCurrentThread } = useUndoRedoStore.getState()
    setCurrentThread(focusedThreadId)
  }, [focusedThreadId])

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
        void interrupt()
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

  // Navigate to next session
  const navigateToNextSession = useCallback((direction: 'next' | 'prev' | 'first' | 'last') => {
    const threads = useThreadStore.getState().threads
    const focusedThreadId = useThreadStore.getState().focusedThreadId
    const threadEntries = Object.entries(threads)

    if (threadEntries.length === 0) {
      return
    }

    const threadIds = threadEntries.map(([id]) => id)
    const currentIndex = focusedThreadId ? threadIds.indexOf(focusedThreadId) : -1

    let targetIndex: number

    switch (direction) {
      case 'next':
        targetIndex = currentIndex + 1
        if (targetIndex >= threadIds.length) {
          targetIndex = 0 // Wrap to first
        }
        break
      case 'prev':
        targetIndex = currentIndex - 1
        if (targetIndex < 0) {
          targetIndex = threadIds.length - 1 // Wrap to last
        }
        break
      case 'first':
        targetIndex = 0
        break
      case 'last':
        targetIndex = threadIds.length - 1
        break
      default:
        return
    }

    const targetThreadId = threadIds[targetIndex]
    if (targetThreadId && targetThreadId !== focusedThreadId) {
      const session = useSessionsStore.getState().sessions.find(s => s.sessionId === targetThreadId)
      const sessionName = session?.title || session?.firstMessage?.slice(0, 30) || `Session ${targetThreadId.slice(0, 8)}`

      useThreadStore.getState().switchThread(targetThreadId)
      showToast(`Switched to ${sessionName.length > 30 ? sessionName.slice(0, 30) + '...' : sessionName}`, 'info')
    }
  }, [showToast])

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
            logError(error, {
              context: 'KeyboardShortcuts',
              source: 'shortcuts',
              details: 'Failed to add project'
            })
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
      // Navigate to next session (Cmd/Ctrl + ])
      {
        key: ']',
        meta: true,
        description: 'Next session',
        handler: () => navigateToNextSession('next'),
      },
      // Navigate to previous session (Cmd/Ctrl + [)
      {
        key: '[',
        meta: true,
        description: 'Previous session',
        handler: () => navigateToNextSession('prev'),
      },
      // Navigate to first session (Cmd/Ctrl + Shift + [)
      {
        key: '[',
        meta: true,
        shift: true,
        description: 'First session',
        handler: () => navigateToNextSession('first'),
      },
      // Navigate to last session (Cmd/Ctrl + Shift + ])
      {
        key: ']',
        meta: true,
        shift: true,
        description: 'Last session',
        handler: () => navigateToNextSession('last'),
      },
      // Undo (Cmd/Ctrl + Z)
      {
        key: 'z',
        meta: true,
        description: 'Undo',
        handler: () => {
          if (canUndo()) {
            undo()
          }
        },
      },
      // Redo (Cmd/Ctrl + Shift + Z)
      {
        key: 'z',
        meta: true,
        shift: true,
        description: 'Redo',
        handler: () => {
          if (canRedo()) {
            redo()
          }
        },
      },
    ],
    [showToast, handleEscape, navigateToNextSession, undo, redo, canUndo, canRedo] // Only dependencies that aren't store functions
  )

  useKeyboardShortcuts(shortcuts)

  return null
}
