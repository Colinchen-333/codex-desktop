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
  const { setSettingsOpen, setSidebarTab, triggerFocusInput, setEscapePending } = useAppStore()
  const { addProject } = useProjectsStore()
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
        setEscapePending(false)
        interrupt()
      } else {
        // First escape - show pending state
        setEscapePending(true)
        escapeTimerRef.current = setTimeout(() => {
          setEscapePending(false)
          escapeTimerRef.current = null
        }, DOUBLE_ESCAPE_TIMEOUT_MS)
      }
    } else {
      // Not running - close dialogs
      setSettingsOpen(false)
      useAppStore.getState().setKeyboardShortcutsOpen(false)
    }
  }, [setSettingsOpen, setEscapePending])

  const shortcuts: KeyboardShortcut[] = useMemo(
    () => [
      // Open settings (Cmd/Ctrl + ,)
      {
        key: ',',
        meta: true,
        description: 'Open settings',
        handler: () => setSettingsOpen(true),
      },
      // Focus input (Cmd/Ctrl + K)
      {
        key: 'k',
        meta: true,
        description: 'Focus input',
        handler: () => triggerFocusInput(),
      },
      // Switch to Projects tab (Cmd/Ctrl + 1)
      {
        key: '1',
        meta: true,
        description: 'Switch to Projects tab',
        handler: () => setSidebarTab('projects'),
      },
      // Switch to Sessions tab (Cmd/Ctrl + 2)
      {
        key: '2',
        meta: true,
        description: 'Switch to Sessions tab',
        handler: () => setSidebarTab('sessions'),
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
              await addProject(selected)
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
    [setSettingsOpen, setSidebarTab, triggerFocusInput, addProject, showToast, handleEscape]
  )

  useKeyboardShortcuts(shortcuts)

  return null
}
