import { useMemo } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useKeyboardShortcuts, type KeyboardShortcut } from '../hooks/useKeyboardShortcuts'
import { useAppStore } from '../stores/app'
import { useProjectsStore } from '../stores/projects'
import { useThreadStore } from '../stores/thread'
import { useToast } from './ui/Toast'

export function KeyboardShortcuts() {
  const { setSettingsOpen, setSidebarTab, triggerFocusInput } = useAppStore()
  const { addProject } = useProjectsStore()
  const { showToast } = useToast()

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
      // Escape - Interrupt AI or close dialogs
      {
        key: 'Escape',
        description: 'Interrupt AI / Close dialogs',
        handler: () => {
          const { turnStatus, interrupt } = useThreadStore.getState()
          // If AI is running, interrupt it
          if (turnStatus === 'running') {
            interrupt()
          } else {
            // Otherwise close settings dialog
            setSettingsOpen(false)
          }
        },
      },
    ],
    [setSettingsOpen, setSidebarTab, triggerFocusInput, addProject, showToast]
  )

  useKeyboardShortcuts(shortcuts)

  return null
}
