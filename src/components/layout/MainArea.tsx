import { useEffect, useRef, useState } from 'react'
import { useProjectsStore } from '../../stores/projects'
import { useThreadStore } from '../../stores/thread'
import { useSessionsStore } from '../../stores/sessions'
import { useSettingsStore } from '../../stores/settings'
import { ChatView } from '../chat/ChatView'
import { parseError } from '../../lib/errorUtils'

export function MainArea() {
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const projects = useProjectsStore((state) => state.projects)
  const fetchGitInfo = useProjectsStore((state) => state.fetchGitInfo)
  const activeThread = useThreadStore((state) => state.activeThread)
  const clearThread = useThreadStore((state) => state.clearThread)
  const selectedSessionId = useSessionsStore((state) => state.selectedSessionId)
  const resumeThread = useThreadStore((state) => state.resumeThread)

  // Track previous session ID to detect switches
  const prevSessionIdRef = useRef<string | null>(null)

  // Load Git info when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      const project = projects.find((p) => p.id === selectedProjectId)
      if (project) {
        fetchGitInfo(selectedProjectId, project.path)
      }
    }
  }, [selectedProjectId, projects, fetchGitInfo])

  // Track if we're resuming to prevent duplicate calls
  const isResumingRef = useRef(false)
  // Track the target session ID for microtask validation
  const targetSessionIdRef = useRef<string | null>(null)

  // Resume thread when session is selected or switched
  useEffect(() => {
    // Skip if no session selected
    if (!selectedSessionId) {
      prevSessionIdRef.current = null
      targetSessionIdRef.current = null
      // Clear thread if we had one
      if (activeThread) {
        clearThread()
      }
      return
    }

    // Check if session changed
    const sessionChanged = prevSessionIdRef.current !== selectedSessionId
    prevSessionIdRef.current = selectedSessionId
    targetSessionIdRef.current = selectedSessionId

    // Skip if already resuming the same session
    if (isResumingRef.current) {
      return
    }

    // If session changed and we have an active thread for a different session, clear it first
    if (sessionChanged && activeThread && activeThread.id !== selectedSessionId) {
      clearThread()
      // Use microtask to let event queue clear before resuming new thread
      // This prevents events from old thread being applied to new thread
      queueMicrotask(() => {
        // Validate that the session hasn't changed again during the microtask delay
        const currentTargetId = targetSessionIdRef.current
        if (!currentTargetId || isResumingRef.current) {
          return
        }
        // Double-check we still want to resume this session
        const currentSelectedId = useSessionsStore.getState().selectedSessionId
        if (currentSelectedId !== currentTargetId) {
          console.debug('[MainArea] Session changed during microtask, skipping resume')
          return
        }
        isResumingRef.current = true
        resumeThread(currentTargetId)
          .catch((error) => {
            console.error('Failed to resume session:', error)
          })
          .finally(() => {
            isResumingRef.current = false
          })
      })
      return
    }

    // Resume the selected session if no active thread
    if (!activeThread) {
      isResumingRef.current = true
      resumeThread(selectedSessionId)
        .catch((error) => {
          console.error('Failed to resume session:', error)
        })
        .finally(() => {
          isResumingRef.current = false
        })
    }
  }, [selectedSessionId, activeThread, resumeThread, clearThread])

  // No project selected - show welcome
  if (!selectedProjectId) {
    return <WelcomeView />
  }

  // Project selected but no active thread - show start session prompt
  if (!activeThread) {
    return <StartSessionView projectId={selectedProjectId} />
  }

  // Active thread - show chat
  return <ChatView />
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
  const threadError = useThreadStore((state) => state.error)
  const settings = useSettingsStore((state) => state.settings)
  const [localError, setLocalError] = useState<string | null>(null)
  const [serverReady, setServerReady] = useState<boolean | null>(null)

  const project = projects.find((p) => p.id === projectId)
  const info = gitInfo[projectId]

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
    console.log('[StartSession] Starting session with:', {
      projectId,
      path: project.path,
      model: settings.model,
      sandboxMode: settings.sandboxMode,
      approvalPolicy: settings.approvalPolicy,
    })

    try {
      await startThread(
        projectId,
        project.path,
        settings.model,
        settings.sandboxMode,
        settings.approvalPolicy
      )
      console.log('[StartSession] Session started successfully')
    } catch (error) {
      console.error('[StartSession] Failed to start session:', error)
      setLocalError(parseError(error))
    }
  }

  const displayError = localError || threadError

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
              <span className="text-destructive">⚠️</span>
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
          disabled={isLoading}
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

        {/* Server Status Warning */}
        {serverReady === false && (
          <div className="mt-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
            <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
              <span>⚠️</span>
              <span>Codex engine is not running. It will start automatically when you begin a session.</span>
            </div>
          </div>
        )}

        {/* Model Info */}
        <div className="mt-4 text-xs text-muted-foreground">
          Model: <span className="font-medium">{settings.model}</span>
          {' • '}
          Sandbox: <span className="font-medium">{settings.sandboxMode}</span>
        </div>
      </div>
    </div>
  )
}

export { WelcomeView, StartSessionView }
