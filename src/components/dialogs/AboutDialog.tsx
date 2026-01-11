import { useEffect, useState, useRef } from 'react'
import { serverApi, type ServerStatus } from '../../lib/api'
import { useToast } from '../ui/Toast'
import { useDialogKeyboardShortcut } from '../../hooks/useDialogKeyboardShortcut'
import { logError } from '../../lib/errorUtils'

interface AboutDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null)
  const { showToast } = useToast()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Use keyboard shortcut hook for Escape to close
  useDialogKeyboardShortcut({
    isOpen,
    onConfirm: () => closeButtonRef.current?.click(),
    onCancel: onClose,
    requireModifierKey: false,
  })

  useEffect(() => {
    if (isOpen) {
      serverApi
        .getStatus()
        .then(setServerStatus)
        .catch((error) => {
          logError(error, {
            context: 'AboutDialog',
            source: 'dialogs',
            details: 'Failed to get server status'
          })
          showToast('Failed to load server status information', 'error')
        })
    }
  }, [isOpen, showToast])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">About Codex Desktop</h2>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          <div className="mb-4 text-5xl">🚀</div>
          <h1 className="mb-2 text-2xl font-bold">Codex Desktop</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            A beautiful desktop interface for the Codex AI coding assistant
          </p>

          <div className="mb-6 rounded-lg border border-border bg-secondary/30 p-4 text-left">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">App Version:</span>
                <span className="font-mono">1.0.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Engine Version:</span>
                <span className="font-mono">{serverStatus?.version || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Engine Status:</span>
                <span className={serverStatus?.isRunning ? 'text-green-500' : 'text-red-500'}>
                  {serverStatus?.isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <p>Built with Tauri + React</p>
            <p>
              <a
                href="https://github.com/Colinchen-333/codex-desktop"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub Repository
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-center border-t border-border px-6 py-4">
          <button
            ref={closeButtonRef}
            className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
