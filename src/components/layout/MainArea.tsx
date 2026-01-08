import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useProjectsStore } from '../../stores/projects'
import { useThreadStore } from '../../stores/thread'
import { useSessionsStore } from '../../stores/sessions'
import {
  useSettingsStore,
  mergeProjectSettings,
  getEffectiveWorkingDirectory,
} from '../../stores/settings'
import { ChatView } from '../chat/ChatView'
import { SessionTabs } from '../sessions/SessionTabs'
import { parseError } from '../../lib/errorUtils'

// Timeout for resume operations to prevent permanent blocking
const RESUME_TIMEOUT_MS = 30000

export function MainArea() {
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)

  // Multi-session state - only subscribe to what we need for rendering
  const threads = useThreadStore((state) => state.threads)
  const activeThread = useThreadStore((state) => state.activeThread)

  const selectedSessionId = useSessionsStore((state) => state.selectedSessionId)

  // Track previous session ID to detect switches
  const prevSessionIdRef = useRef<string | null>(null)

  // Load Git info when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      // Use getState() to get current projects and avoid dependency issues
      const currentProjects = useProjectsStore.getState().projects
      const project = currentProjects.find((p) => p.id === selectedProjectId)
      if (project) {
        useProjectsStore.getState().fetchGitInfo(selectedProjectId, project.path)
      }
    }
  }, [selectedProjectId])

  // Track if we're resuming to prevent duplicate calls
  const isResumingRef = useRef(false)
  // Track the target session ID for microtask validation
  const targetSessionIdRef = useRef<string | null>(null)
  // Timeout ref for auto-reset of isResumingRef
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current)
        resumeTimeoutRef.current = null
      }
    }
  }, [])

  // Resume thread when session is selected or switched
  useEffect(() => {
    // Skip if no session selected
    if (!selectedSessionId) {
      prevSessionIdRef.current = null
      targetSessionIdRef.current = null
      return
    }

    // Check if session changed
    if (prevSessionIdRef.current === selectedSessionId) {
      // Same session, no need to do anything
      return
    }

    // Check if this session is already loaded in threads
    const threadState = useThreadStore.getState()
    const isLoaded = !!threadState.threads[selectedSessionId]

    if (isLoaded) {
      // Session already loaded, just switch to it
      if (threadState.focusedThreadId !== selectedSessionId) {
        threadState.switchThread(selectedSessionId)
      }
      prevSessionIdRef.current = selectedSessionId
      targetSessionIdRef.current = selectedSessionId
      return
    }

    // Update refs for session tracking
    prevSessionIdRef.current = selectedSessionId
    targetSessionIdRef.current = selectedSessionId

    // Skip if already resuming
    if (isResumingRef.current) {
      return
    }

    // Check if we can add more sessions using getState()
    if (!useThreadStore.getState().canAddSession()) {
      console.warn('[MainArea] Maximum sessions reached, cannot resume:', selectedSessionId)
      return
    }

    // Helper function to start resume with timeout protection
    const startResumeWithTimeout = (sessionId: string) => {
      // Clear any existing timeout
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current)
        resumeTimeoutRef.current = null
      }

      isResumingRef.current = true

      // Set a timeout to auto-reset isResumingRef if resume gets stuck
      resumeTimeoutRef.current = setTimeout(() => {
        if (isResumingRef.current) {
          console.warn('[MainArea] Resume operation timed out after 30s, resetting flag')
          isResumingRef.current = false
          resumeTimeoutRef.current = null
        }
      }, RESUME_TIMEOUT_MS)

      // Use getState() to call resumeThread
      useThreadStore.getState().resumeThread(sessionId)
        .catch((error) => {
          console.error('Failed to resume session:', error)
        })
        .finally(() => {
          isResumingRef.current = false
          if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current)
            resumeTimeoutRef.current = null
          }
        })
    }

    // Resume the selected session
    startResumeWithTimeout(selectedSessionId)
  }, [selectedSessionId]) // Only depend on selectedSessionId to prevent loops

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
  const [serverReady, setServerReady] = useState<boolean | null>(null)

  const project = projects.find((p) => p.id === projectId)
  const info = gitInfo[projectId]
  const currentSessionCount = Object.keys(threads).length

  // Compute effective settings for display (merged with project overrides)
  const effectiveSettings = useMemo(
    () => mergeProjectSettings(settings, project?.settingsJson ?? null),
    [settings, project?.settingsJson]
  )

  // Check server status on mount
  useEffect(() => {
    const checkServer = async () => {
      try {
        const { serverApi } = await import('../../lib/api')
        const status = await serverApi.getStatus()
        setServerReady(status.isRunning)
      } catch {
        setServerReady(false)
      }
    }
    checkServer()
  }, [])

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

    console.log('[StartSession] Starting session with:', {
      projectId,
      path: effectiveCwd,
      model: effectiveSettings.model,
      sandboxMode: effectiveSettings.sandboxMode,
      approvalPolicy: effectiveSettings.approvalPolicy,
      hasProjectOverrides: project.settingsJson !== null,
    })

    try {
      await startThread(
        projectId,
        effectiveCwd,
        effectiveSettings.model,
        effectiveSettings.sandboxMode,
        effectiveSettings.approvalPolicy
      )
      console.log('[StartSession] Session started successfully')
    } catch (error) {
      console.error('[StartSession] Failed to start session:', error)
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
