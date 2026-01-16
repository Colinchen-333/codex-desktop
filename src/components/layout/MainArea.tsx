import { useEffect, useRef, useState, useMemo, useCallback, useReducer } from 'react'
import { useProjectsStore } from '../../stores/projects'
import { useThreadStore, selectFocusedThread } from '../../stores/thread'
import { useSessionsStore } from '../../stores/sessions'
import { useServerConnectionStore } from '../../stores/server-connection'
import {
  useSettingsStore,
  mergeProjectSettings,
  getEffectiveWorkingDirectory,
} from '../../stores/settings'
import { ChatView } from '../chat/ChatView'
import { logError } from '../../lib/errorUtils'
import { SessionTabs } from '../sessions/SessionTabs'
import { parseError } from '../../lib/errorUtils'
import { log } from '../../lib/logger'

// Timeout for resume operations to prevent permanent blocking
const RESUME_TIMEOUT_MS = 30000

// ==================== Session Switch State Machine ====================
// Explicit state machine for session switching to replace implicit ref flags

/**
 * Session switch states
 * - idle: No switch in progress
 * - transitioning: Switch initiated, checking if session is loaded
 * - resuming: Loading unloaded session from backend
 */
type SessionStatus = 'idle' | 'transitioning' | 'resuming'

/**
 * Queued session switch with timestamp for staleness detection
 */
interface QueuedSessionSwitch {
  sessionId: string
  timestamp: number
}

/**
 * Session switch state machine state
 */
interface SessionSwitchState {
  status: SessionStatus
  targetSessionId: string | null
  prevSessionId: string | null
  queue: QueuedSessionSwitch[]
  timeoutId: ReturnType<typeof setTimeout> | null
}

/**
 * Session switch events
 */
type SessionSwitchEvent =
  | { type: 'SELECT_SESSION'; sessionId: string }
  | { type: 'SESSION_ALREADY_LOADED' }
  | { type: 'START_RESUME'; timeoutId: ReturnType<typeof setTimeout> }
  | { type: 'RESUME_COMPLETE'; sessionId: string }
  | { type: 'RESUME_FAILED' }
  | { type: 'RESUME_TIMEOUT' }
  | { type: 'PROCESS_QUEUE' }
  | { type: 'CLEAR_SESSION' }
  | { type: 'CLEANUP' }

/**
 * Initial state for session switch state machine
 */
const initialSessionState: SessionSwitchState = {
  status: 'idle',
  targetSessionId: null,
  prevSessionId: null,
  queue: [],
  timeoutId: null,
}

function pruneQueuedSessions(queue: QueuedSessionSwitch[]): QueuedSessionSwitch[] {
  const now = Date.now()
  return queue.filter((entry) => now - entry.timestamp <= RESUME_TIMEOUT_MS)
}

/**
 * Session switch reducer - handles all state transitions
 */
function sessionSwitchReducer(
  state: SessionSwitchState,
  event: SessionSwitchEvent
): SessionSwitchState {
  switch (event.type) {
    case 'SELECT_SESSION': {
      const { sessionId } = event

      // Same session as previous - no-op
      if (state.prevSessionId === sessionId) {
        return state
      }

      // If already transitioning/resuming, queue the request (with deduplication)
      if (state.status !== 'idle') {
        const filteredQueue = state.queue.filter((q) => q.sessionId !== sessionId)
        const prunedQueue = pruneQueuedSessions(filteredQueue)
        return {
          ...state,
          queue: [...prunedQueue, { sessionId, timestamp: Date.now() }],
        }
      }

      // Start transitioning
      return {
        ...state,
        status: 'transitioning',
        targetSessionId: sessionId,
      }
    }

    case 'SESSION_ALREADY_LOADED': {
      // Session was already loaded, transition complete
      return {
        ...state,
        status: 'idle',
        prevSessionId: state.targetSessionId,
      }
    }

    case 'START_RESUME': {
      // Starting async resume operation
      return {
        ...state,
        status: 'resuming',
        timeoutId: event.timeoutId,
      }
    }

    case 'RESUME_COMPLETE': {
      // Resume succeeded
      return {
        ...state,
        status: 'idle',
        prevSessionId: event.sessionId,
        targetSessionId: null,
        timeoutId: null,
      }
    }

    case 'RESUME_FAILED':
    case 'RESUME_TIMEOUT': {
      // Resume failed or timed out - return to idle
      return {
        ...state,
        status: 'idle',
        targetSessionId: null,
        timeoutId: null,
      }
    }

    case 'PROCESS_QUEUE': {
      // Process next queued session switch
      const prunedQueue = pruneQueuedSessions(state.queue)
      if (prunedQueue.length === 0 || state.status !== 'idle') {
        return state
      }

      const [next, ...rest] = prunedQueue
      return {
        ...state,
        status: 'transitioning',
        targetSessionId: next.sessionId,
        queue: rest,
      }
    }

    case 'CLEAR_SESSION': {
      // Session deselected
      return {
        ...state,
        status: 'idle',
        targetSessionId: null,
        prevSessionId: null,
      }
    }

    case 'CLEANUP': {
      // Component unmounting - clear everything
      return {
        ...initialSessionState,
        timeoutId: null,
      }
    }

    default:
      return state
  }
}

export function MainArea() {
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)

  // Multi-session state - only subscribe to what we need for rendering
  const threads = useThreadStore((state) => state.threads)
  // Use proper selector instead of getter to avoid potential re-render loops
  const focusedThreadState = useThreadStore(selectFocusedThread)
  const activeThread = focusedThreadState?.thread ?? null

  const selectedSessionId = useSessionsStore((state) => state.selectedSessionId)

  // Session switch state machine
  const [sessionState, dispatch] = useReducer(sessionSwitchReducer, initialSessionState)

  // Ref to hold current state for async operations (avoids stale closure)
  const sessionStateRef = useRef(sessionState)
  const isMountedRef = useRef(true)

  // Sync ref with state in effect to avoid render-time ref update
  useEffect(() => {
    sessionStateRef.current = sessionState
  }, [sessionState])

  // Load Git info when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      // Use getState() to get current projects and avoid dependency issues
      const currentProjects = useProjectsStore.getState().projects
      const project = currentProjects.find((p) => p.id === selectedProjectId)
      if (project) {
        void useProjectsStore.getState().fetchGitInfo(selectedProjectId, project.path)
      }
    }
  }, [selectedProjectId])

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      // Clear timeout if any
      if (sessionStateRef.current.timeoutId) {
        clearTimeout(sessionStateRef.current.timeoutId)
      }
      dispatch({ type: 'CLEANUP' })
    }
  }, [])

  // Process session switch when state machine enters 'transitioning'
  useEffect(() => {
    const { status, targetSessionId } = sessionState

    // Only process when transitioning with a target
    if (status !== 'transitioning' || !targetSessionId) {
      return
    }

    const processTransition = async () => {
      const threadState = useThreadStore.getState()
      const isLoaded = !!threadState.threads[targetSessionId]

      if (isLoaded) {
        // Session already loaded, just switch to it
        if (threadState.focusedThreadId !== targetSessionId) {
          threadState.switchThread(targetSessionId)
        }
        dispatch({ type: 'SESSION_ALREADY_LOADED' })
        return
      }

      // Check if we can add more sessions
      if (!threadState.canAddSession()) {
        log.warn(`[MainArea] Maximum sessions reached, cannot resume: ${targetSessionId}`, 'MainArea')
        dispatch({ type: 'RESUME_FAILED' })
        return
      }

      // Start resume with timeout protection
      const timeoutId = setTimeout(() => {
        log.warn('[MainArea] Resume operation timed out after 30s', 'MainArea')
        if (isMountedRef.current) {
          dispatch({ type: 'RESUME_TIMEOUT' })
        }
      }, RESUME_TIMEOUT_MS)

      dispatch({ type: 'START_RESUME', timeoutId })

      try {
        await useThreadStore.getState().resumeThread(targetSessionId)

        // Clear timeout on success
        clearTimeout(timeoutId)
        if (isMountedRef.current) {
          dispatch({ type: 'RESUME_COMPLETE', sessionId: targetSessionId })
        }
      } catch (error) {
        clearTimeout(timeoutId)
        logError(error, {
          context: 'MainArea',
          source: 'layout',
          details: 'Failed to resume session'
        })
        if (isMountedRef.current) {
          dispatch({ type: 'RESUME_FAILED' })
        }
      }
    }

    void processTransition()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally depend only on status and targetSessionId to avoid re-running when queue changes
  }, [sessionState.status, sessionState.targetSessionId])

  // Process queue when returning to idle
  useEffect(() => {
    if (sessionState.status === 'idle' && sessionState.queue.length > 0) {
      // Use setTimeout to avoid synchronous dispatch during render
      const timerId = setTimeout(() => {
        dispatch({ type: 'PROCESS_QUEUE' })
      }, 0)
      return () => clearTimeout(timerId)
    }
  }, [sessionState.status, sessionState.queue])

  // Handle session selection changes
  useEffect(() => {
    if (!selectedSessionId) {
      dispatch({ type: 'CLEAR_SESSION' })
      return
    }

    dispatch({ type: 'SELECT_SESSION', sessionId: selectedSessionId })
  }, [selectedSessionId])

  // Callback for creating a new session from SessionTabs
  const handleNewSession = useCallback(() => {
    // This will trigger StartSessionView to appear
    // by not having an active thread for the selected project
  }, [])

  // No project selected - show welcome
  if (!selectedProjectId) {
    return <WelcomeView />
  }

  // Check if we have any active threads
  const hasActiveThreads = Object.keys(threads).length > 0

  // Show start session view if no active threads
  if (!hasActiveThreads) {
    return <StartSessionView projectId={selectedProjectId} />
  }

  // Active threads exist - show chat with tabs
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Session Tabs */}
      <SessionTabs onNewSession={handleNewSession} />
      
      {/* Chat View or Start Session */}
      {activeThread ? (
        <ChatView />
      ) : (
        <StartSessionView projectId={selectedProjectId} />
      )}
    </div>
  )
}

// Welcome View when no project is selected
function WelcomeView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-3xl font-bold text-foreground">
          Welcome to Codex Desktop
        </h1>
        <p className="mb-8 text-muted-foreground">
          Select a project from the sidebar or add a new project to get started.
        </p>
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-2 text-lg font-semibold">Quick Start</h2>
          <ol className="text-left text-sm text-muted-foreground">
            <li className="mb-2">1. Click "Add Project" to select a folder</li>
            <li className="mb-2">2. Start a new session to chat with Codex</li>
            <li>3. Review and apply changes safely</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

// Start Session View when project is selected but no thread
interface StartSessionViewProps {
  projectId: string
}

function StartSessionView({ projectId }: StartSessionViewProps) {
  const projects = useProjectsStore((state) => state.projects)
  const gitInfo = useProjectsStore((state) => state.gitInfo)
  const startThread = useThreadStore((state) => state.startThread)
  const isLoading = useThreadStore((state) => state.isLoading)
  const globalError = useThreadStore((state) => state.globalError)
  const canAddSession = useThreadStore((state) => state.canAddSession)
  const maxSessions = useThreadStore((state) => state.maxSessions)
  const threads = useThreadStore((state) => state.threads)
  const settings = useSettingsStore((state) => state.settings)
  const [localError, setLocalError] = useState<string | null>(null)
  const { status: serverStatus, isConnected: isServerConnected } = useServerConnectionStore()

  const project = projects.find((p) => p.id === projectId)
  const info = gitInfo[projectId]
  const currentSessionCount = Object.keys(threads).length

  // Compute effective settings for display (merged with project overrides)
  const effectiveSettings = useMemo(
    () => mergeProjectSettings(settings, project?.settingsJson ?? null),
    [settings, project?.settingsJson]
  )

  const serverReady = serverStatus ? serverStatus.isRunning : isServerConnected ? null : false

  // Clear local error when project changes
  useEffect(() => {
    setLocalError(null)
  }, [projectId])

  if (!project) return null

  const handleStartSession = async () => {
    setLocalError(null)

    // Check if we can add more sessions
    if (!canAddSession()) {
      setLocalError(`Maximum number of parallel sessions (${maxSessions}) reached. Please close a session first.`)
      return
    }

    // Get effective working directory (may be overridden in project settings)
    const effectiveCwd = getEffectiveWorkingDirectory(project.path, project.settingsJson)

    log.debug('[StartSession] Starting session with:', 'MainArea')

    try {
      await startThread(
        projectId,
        effectiveCwd,
        effectiveSettings.model,
        effectiveSettings.sandboxMode,
        effectiveSettings.approvalPolicy
      )
      log.debug('[StartSession] Session started successfully', 'MainArea')
    } catch (error) {
      log.error(`[StartSession] Failed to start session: ${error}`, 'MainArea')
      setLocalError(parseError(error))
    }
  }

  const displayError = localError || globalError

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mb-6">
          <h1 className="mb-2 text-2xl font-bold text-foreground">
            {project.displayName || project.path.split('/').pop()}
          </h1>
          <p className="text-sm text-muted-foreground">{project.path}</p>
        </div>

        {/* Git Info */}
        {info?.isGitRepo && (
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Branch:</span>
              <span className="font-mono">{info.branch}</span>
            </div>
            {info.isDirty !== null && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className={info.isDirty ? 'text-yellow-500' : 'text-green-500'}>
                  {info.isDirty ? 'Uncommitted changes' : 'Clean'}
                </span>
              </div>
            )}
            {info.lastCommit && (
              <div className="mt-2 text-xs text-muted-foreground">
                Last commit: {info.lastCommit}
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {displayError && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-left">
            <div className="flex items-start gap-2">
              <span className="text-destructive">Warning</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Failed to start session</p>
                <p className="mt-1 text-xs text-destructive/80 break-words">{displayError}</p>
                {displayError.includes('Codex CLI not found') && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p>Please install Codex CLI first:</p>
                    <code className="mt-1 block rounded bg-secondary px-2 py-1 font-mono">
                      npm install -g @anthropic/codex
                    </code>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <button
          className="w-full rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          onClick={handleStartSession}
          disabled={isLoading || !canAddSession()}
        >
          {isLoading && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          {isLoading ? 'Starting Session...' : 'Start New Session'}
        </button>

        {/* Session count warning */}
        {!canAddSession() && (
          <div className="mt-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
            <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
              <span>Warning</span>
              <span>Maximum sessions ({maxSessions}) reached. Close a session to start a new one.</span>
            </div>
          </div>
        )}

        {/* Server Status Warning */}
        {serverReady === false && (
          <div className="mt-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
            <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
              <span>Warning</span>
              <span>Codex engine is not running. It will start automatically when you begin a session.</span>
            </div>
          </div>
        )}

        {/* Model Info */}
        <div className="mt-4 text-xs text-muted-foreground">
          Model: <span className="font-medium">{effectiveSettings.model || 'default'}</span>
          {' | '}
          Sandbox: <span className="font-medium">{effectiveSettings.sandboxMode}</span>
          {' | '}
          Sessions: <span className="font-medium">{currentSessionCount}/{maxSessions}</span>
          {project?.settingsJson && (
            <span className="text-blue-500 ml-2">(project settings active)</span>
          )}
        </div>
      </div>
    </div>
  )
}

export { WelcomeView, StartSessionView }
