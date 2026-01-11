import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useThreadStore } from '../../stores/thread'
import { useSessionsStore } from '../../stores/sessions'
import { useProjectsStore } from '../../stores/projects'
import { useDialogKeyboardShortcut } from '../../hooks/useDialogKeyboardShortcut'

interface CloseSessionDialogProps {
  isOpen: boolean
  threadId: string | null
  onClose: () => void
}

export function CloseSessionDialog({ isOpen, threadId, onClose }: CloseSessionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const threads = useThreadStore((state) => state.threads)
  const projects = useProjectsStore((state) => state.projects)
  const sessions = useSessionsStore((state) => state.sessions)
  // closeThread is called via getState() to avoid dependency issues

  // Get thread info
  const threadState = threadId ? threads[threadId] : null
  const thread = threadState?.thread
  const isRunning = threadState?.turnStatus === 'running'

  // Get session/project info for display
  const sessionMeta = threadId ? sessions.find((s) => s.sessionId === threadId) : null
  const project = thread ? projects.find((p) => thread.cwd?.startsWith(p.path)) : null
  const sessionLabel = sessionMeta?.title || project?.displayName || thread?.cwd?.split('/').pop() || 'Session'

  const handleConfirm = () => {
    if (threadId) {
      useThreadStore.getState().closeThread(threadId)
    }
    onClose()
  }

  // Use keyboard shortcut hook for Cmd+Enter (or Ctrl+Enter on Windows/Linux)
  useDialogKeyboardShortcut({
    isOpen,
    onConfirm: () => confirmButtonRef.current?.click(),
    onCancel: onClose,
    requireModifierKey: false,
  })

  // Focus dialog when opened
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus()
    }
  }, [isOpen])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen || !threadId) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="bg-card rounded-xl shadow-xl border border-border/50 w-full max-w-md mx-4 overflow-hidden"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Close Session</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to close this session?
          </p>

          {/* Session info */}
          <div className="bg-secondary/30 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Session:</span>
              <span className="font-medium text-foreground truncate">{sessionLabel}</span>
            </div>
            {thread?.cwd && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mt-1">
                <span className="truncate font-mono">{thread.cwd}</span>
              </div>
            )}
          </div>

          {/* Warning if running */}
          {isRunning && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400 mb-4">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <p className="text-xs">
                This session is currently running. Closing it will interrupt the current operation.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground/70">
            You can resume this session later from the session history.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border/50 bg-secondary/20">
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-secondary/60 hover:bg-secondary text-foreground',
              'transition-colors duration-150'
            )}
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
              'transition-colors duration-150'
            )}
          >
            Close Session
          </button>
        </div>
      </div>
    </div>
  )
}
