import { useState, memo, useMemo, useCallback, useRef, useEffect } from 'react'
import { X, Plus, MessageSquare, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useThreadStore, type SingleThreadState } from '../../stores/thread'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import { CloseSessionDialog } from './CloseSessionDialog'
import { TaskProgressCompact } from '../chat/TaskProgress'

interface SessionTabsProps {
  onNewSession?: () => void
}

export function SessionTabs({ onNewSession }: SessionTabsProps) {
  const threads = useThreadStore((state) => state.threads)
  const focusedThreadId = useThreadStore((state) => state.focusedThreadId)
  const switchThread = useThreadStore((state) => state.switchThread)
  const canAddSession = useThreadStore((state) => state.canAddSession)
  const maxSessions = useThreadStore((state) => state.maxSessions)
  const isLoading = useThreadStore((state) => state.isLoading)

  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [threadToClose, setThreadToClose] = useState<string | null>(null)
  const [switchingTabId, setSwitchingTabId] = useState<string | null>(null)
  const switchingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (switchingTimeoutRef.current) {
        clearTimeout(switchingTimeoutRef.current)
      }
    }
  }, [])

  const handleTabClick = useCallback((threadId: string) => {
    // Prevent clicking if already switching or if it's the current tab
    if (threadId === focusedThreadId || switchingTabId !== null) {
      return
    }

    // Set switching state
    setSwitchingTabId(threadId)

    // Clear any existing timeout
    if (switchingTimeoutRef.current) {
      clearTimeout(switchingTimeoutRef.current)
    }

    // Perform the switch
    try {
      switchThread(threadId)
    } catch {
      // Revert switching state on error
      setSwitchingTabId(null)
      return
    }

    // Clear switching state after a short delay for visual feedback
    // This also handles the global isLoading state from thread store
    switchingTimeoutRef.current = setTimeout(() => {
      setSwitchingTabId(null)
    }, 300)
  }, [focusedThreadId, switchingTabId, switchThread])

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

  const threadEntries = Object.entries(threads)

  // Don't render if no threads
  if (threadEntries.length === 0) {
    return null
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
            isSwitching={threadId === switchingTabId}
            isGloballyLoading={isLoading}
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
  isSwitching: boolean
  isGloballyLoading: boolean
  onClick: () => void
  onClose: (e: React.MouseEvent) => void
}

const SessionTab = memo(function SessionTab({
  threadId,
  threadState,
  isActive,
  isSwitching,
  isGloballyLoading,
  onClick,
  onClose
}: SessionTabProps) {
  const { thread, turnStatus, pendingApprovals } = threadState

  // Use selectors to only subscribe to needed data
  const sessionMeta = useSessionsStore((state) =>
    state.sessions.find(s => s.sessionId === threadId)
  )

  const project = useProjectsStore((state) =>
    state.projects.find(p => thread.cwd?.startsWith(p.path))
  )

  // Memoize expensive label computation
  const label = useMemo(() =>
    sessionMeta?.title || project?.displayName || thread.cwd?.split('/').pop() || 'Session'
  , [sessionMeta?.title, project?.displayName, thread.cwd])

  const displayLabel = useMemo(() =>
    label.length > 20 ? label.slice(0, 18) + '...' : label
  , [label])

  // Memoize status indicators
  const isRunning = useMemo(() =>
    turnStatus === 'running'
  , [turnStatus])

  const hasPendingApprovals = useMemo(() =>
    pendingApprovals.length > 0
  , [pendingApprovals.length])

  // Get session status for task progress
  const sessionStatus = useMemo(() =>
    sessionMeta?.status || 'idle'
  , [sessionMeta?.status])

  // Wrap handlers in useCallback
  const handleClick = useCallback(() => {
    onClick()
  }, [onClick])

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClose(e)
  }, [onClose])

  // Determine if this tab is in a loading state
  const isLoading = isSwitching || (isGloballyLoading && !isActive)

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
        'transition-all duration-150 min-w-[100px] max-w-[200px]',
        'relative overflow-hidden',
        isActive
          ? 'bg-primary/10 text-primary border border-primary/30'
          : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent',
        isLoading && 'cursor-not-allowed opacity-70',
        !isLoading && 'cursor-pointer'
      )}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/20 flex items-center justify-center">
          <Loader2 size={14} className="animate-spin text-primary" />
        </div>
      )}

      {/* Status icon */}
      <span className={cn('flex-shrink-0', isLoading && 'opacity-0')}>
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
      <span className={cn('truncate flex-1', isLoading && 'opacity-0')}>{displayLabel}</span>

      {/* Task progress indicator (compact) */}
      <span className={cn(isLoading && 'opacity-0')}>
        <TaskProgressCompact
          tasksJson={sessionMeta?.tasksJson || null}
          status={sessionStatus}
        />
      </span>

      {/* Close button */}
      <button
        onClick={handleClose}
        disabled={isLoading}
        className={cn(
          'flex-shrink-0 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          isActive && 'opacity-60',
          isLoading && 'cursor-not-allowed opacity-0'
        )}
        title="Close session"
      >
        <X size={12} />
      </button>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for React.memo
  const arePropsEqual = prevProps.threadId === nextProps.threadId &&
                       prevProps.isActive === nextProps.isActive &&
                       prevProps.isSwitching === nextProps.isSwitching &&
                       prevProps.isGloballyLoading === nextProps.isGloballyLoading &&
                       prevProps.threadState.turnStatus === nextProps.threadState.turnStatus &&
                       prevProps.threadState.pendingApprovals.length === nextProps.threadState.pendingApprovals.length &&
                       prevProps.threadState.thread.cwd === nextProps.threadState.thread.cwd

  // Compare session metadata for task progress updates
  const prevSession = useSessionsStore.getState().sessions.find(s => s.sessionId === prevProps.threadId)
  const nextSession = useSessionsStore.getState().sessions.find(s => s.sessionId === nextProps.threadId)
  const isSessionEqual = prevSession?.tasksJson === nextSession?.tasksJson &&
                        prevSession?.status === nextSession?.status

  return arePropsEqual && isSessionEqual
})
