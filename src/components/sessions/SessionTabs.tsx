import { useState } from 'react'
import { X, Plus, MessageSquare, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useThreadStore, type SingleThreadState } from '../../stores/thread'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import { CloseSessionDialog } from './CloseSessionDialog'

interface SessionTabsProps {
  onNewSession?: () => void
}

export function SessionTabs({ onNewSession }: SessionTabsProps) {
  const threads = useThreadStore((state) => state.threads)
  const focusedThreadId = useThreadStore((state) => state.focusedThreadId)
  const switchThread = useThreadStore((state) => state.switchThread)
  const canAddSession = useThreadStore((state) => state.canAddSession)
  const maxSessions = useThreadStore((state) => state.maxSessions)

  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [threadToClose, setThreadToClose] = useState<string | null>(null)

  const threadEntries = Object.entries(threads)

  // Don't render if no threads
  if (threadEntries.length === 0) {
    return null
  }

  const handleTabClick = (threadId: string) => {
    if (threadId !== focusedThreadId) {
      switchThread(threadId)
    }
  }

  const handleCloseClick = (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation()
    setThreadToClose(threadId)
    setCloseDialogOpen(true)
  }

  const handleNewSessionClick = () => {
    if (canAddSession() && onNewSession) {
      onNewSession()
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50 bg-card/30 backdrop-blur-sm overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/50">
        {threadEntries.map(([threadId, threadState]) => (
          <SessionTab
            key={threadId}
            threadId={threadId}
            threadState={threadState}
            isActive={threadId === focusedThreadId}
            onClick={() => handleTabClick(threadId)}
            onClose={(e) => handleCloseClick(e, threadId)}
          />
        ))}

        {/* Add new session button */}
        {canAddSession() && onNewSession && (
          <button
            onClick={handleNewSessionClick}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs',
              'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
              'transition-colors duration-150'
            )}
            title={`New Session (${threadEntries.length}/${maxSessions})`}
          >
            <Plus size={14} />
          </button>
        )}

        {/* Session count indicator */}
        <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums">
          {threadEntries.length}/{maxSessions}
        </span>
      </div>

      <CloseSessionDialog
        isOpen={closeDialogOpen}
        threadId={threadToClose}
        onClose={() => {
          setCloseDialogOpen(false)
          setThreadToClose(null)
        }}
      />
    </>
  )
}

interface SessionTabProps {
  threadId: string
  threadState: SingleThreadState
  isActive: boolean
  onClick: () => void
  onClose: (e: React.MouseEvent) => void
}

function SessionTab({ threadId, threadState, isActive, onClick, onClose }: SessionTabProps) {
  const { thread, turnStatus, pendingApprovals } = threadState

  // Get project info for display
  const projects = useProjectsStore((state) => state.projects)
  const sessions = useSessionsStore((state) => state.sessions)

  // Find session metadata for this thread
  const sessionMeta = sessions.find((s) => s.sessionId === threadId)

  // Find project for this thread
  const project = projects.find((p) => {
    // Match by cwd containing project path
    return thread.cwd?.startsWith(p.path)
  })

  // Determine tab label
  const label = sessionMeta?.title || project?.displayName || thread.cwd?.split('/').pop() || 'Session'

  // Truncate label if too long
  const displayLabel = label.length > 20 ? label.slice(0, 18) + '...' : label

  const isRunning = turnStatus === 'running'
  const hasPendingApprovals = pendingApprovals.length > 0

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer',
        'transition-all duration-150 min-w-[100px] max-w-[200px]',
        isActive
          ? 'bg-primary/10 text-primary border border-primary/30'
          : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent'
      )}
    >
      {/* Status icon */}
      <span className="flex-shrink-0">
        {isRunning ? (
          <Loader2 size={12} className="animate-spin text-blue-500" />
        ) : hasPendingApprovals ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
          </span>
        ) : (
          <MessageSquare size={12} />
        )}
      </span>

      {/* Label */}
      <span className="truncate flex-1">{displayLabel}</span>

      {/* Close button */}
      <button
        onClick={onClose}
        className={cn(
          'flex-shrink-0 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          isActive && 'opacity-60'
        )}
        title="Close session"
      >
        <X size={12} />
      </button>
    </div>
  )
}
