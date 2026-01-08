import { useEffect, useState, useRef } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'
import { StatusBar } from './components/layout/StatusBar'
import { OnboardingFlow } from './components/onboarding/OnboardingFlow'
import { useNeedsOnboarding } from './components/onboarding/useNeedsOnboarding'
import { ToastProvider } from './components/ui/Toast'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ConnectionStatus } from './components/ui/ConnectionStatus'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { useProjectsStore } from './stores/projects'
import { useThreadStore } from './stores/thread'
import { setupEventListeners, cleanupEventListeners } from './lib/events'

// Helper to create a thread-filtered event handler
// This ensures events from other threads are ignored
function withThreadFilter<T extends { threadId: string }>(
  handler: (event: T) => void
): (event: T) => void {
  return (event: T) => {
    const state = useThreadStore.getState()
    const activeThread = state.activeThread

    if (!activeThread) {
      return
    }
    if (event.threadId !== activeThread.id) {
      return
    }
    handler(event)
  }
}

function App() {
  const fetchProjects = useProjectsStore((state) => state.fetchProjects)
  const needsOnboarding = useNeedsOnboarding()
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Use ref to access latest store functions without causing re-renders
  const unlistenersRef = useRef<(() => void)[]>([])
  const listenersSetupRef = useRef(false)

  // Check if onboarding is needed
  useEffect(() => {
    setShowOnboarding(needsOnboarding)
  }, [needsOnboarding])

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Setup event listeners - only once on mount
  useEffect(() => {
    // Prevent duplicate setup
    if (listenersSetupRef.current) return
    listenersSetupRef.current = true

    // Track if component is still mounted
    let isMounted = true
    let setupPromise: Promise<(() => void)[]> | null = null

    setupPromise = setupEventListeners({
      // Thread lifecycle
      onThreadStarted: (event) => useThreadStore.getState().handleThreadStarted(event),
      // Item lifecycle - filtered by threadId
      onItemStarted: withThreadFilter((event) => useThreadStore.getState().handleItemStarted(event)),
      onItemCompleted: withThreadFilter((event) => useThreadStore.getState().handleItemCompleted(event)),
      // Agent messages - filtered by threadId
      onAgentMessageDelta: withThreadFilter((event) => useThreadStore.getState().handleAgentMessageDelta(event)),
      // Approvals - filtered by threadId
      onCommandApprovalRequested: withThreadFilter((event) => useThreadStore.getState().handleCommandApprovalRequested(event)),
      onFileChangeApprovalRequested: withThreadFilter((event) => useThreadStore.getState().handleFileChangeApprovalRequested(event)),
      // Turn lifecycle - filtered by threadId
      onTurnStarted: withThreadFilter((event) => useThreadStore.getState().handleTurnStarted(event)),
      onTurnCompleted: withThreadFilter((event) => useThreadStore.getState().handleTurnCompleted(event)),
      onTurnDiffUpdated: withThreadFilter((event) => useThreadStore.getState().handleTurnDiffUpdated(event)),
      onTurnPlanUpdated: withThreadFilter((event) => useThreadStore.getState().handleTurnPlanUpdated(event)),
      onThreadCompacted: withThreadFilter((event) => useThreadStore.getState().handleThreadCompacted(event)),
      // Command execution output - filtered by threadId
      onCommandExecutionOutputDelta: withThreadFilter((event) =>
        useThreadStore.getState().handleCommandExecutionOutputDelta(event)),
      onFileChangeOutputDelta: withThreadFilter((event) =>
        useThreadStore.getState().handleFileChangeOutputDelta(event)),
      // Reasoning - filtered by threadId
      onReasoningSummaryTextDelta: withThreadFilter((event) =>
        useThreadStore.getState().handleReasoningSummaryTextDelta(event)),
      onReasoningSummaryPartAdded: withThreadFilter((event) =>
        useThreadStore.getState().handleReasoningSummaryPartAdded(event)),
      onReasoningTextDelta: withThreadFilter((event) => useThreadStore.getState().handleReasoningTextDelta(event)),
      // MCP Tools - filtered by threadId
      onMcpToolCallProgress: withThreadFilter((event) =>
        useThreadStore.getState().handleMcpToolCallProgress(event)),
      // Token usage - filtered by threadId
      onTokenUsage: withThreadFilter((event) => useThreadStore.getState().handleTokenUsage(event)),
      // Errors - filtered by threadId
      onStreamError: withThreadFilter((event) => useThreadStore.getState().handleStreamError(event)),
      // Rate limiting - filtered by threadId
      onRateLimitExceeded: withThreadFilter((event) => useThreadStore.getState().handleRateLimitExceeded(event)),
      onServerDisconnected: () => {
        console.log('Server disconnected')
        useThreadStore.getState().handleServerDisconnected()
      },
    })

    setupPromise
      .then((listeners) => {
        if (isMounted) {
          unlistenersRef.current = listeners
        } else {
          // Component unmounted before setup completed, cleanup immediately
          cleanupEventListeners(listeners)
        }
      })
      .catch((error) => {
        console.error('Failed to setup event listeners:', error)
        // Reset flag so setup can be retried on next mount
        listenersSetupRef.current = false
      })

    return () => {
      isMounted = false
      // Cleanup any listeners that were set up
      cleanupEventListeners(unlistenersRef.current)
      unlistenersRef.current = []
      listenersSetupRef.current = false
    }
  }, []) // Empty deps - only run once

  // Show onboarding flow if needed
  if (showOnboarding) {
    return (
      <ToastProvider>
        <OnboardingFlow
          onComplete={() => {
            setShowOnboarding(false)
            fetchProjects()
          }}
        />
      </ToastProvider>
    )
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <KeyboardShortcuts />
        <div className="flex h-screen w-screen overflow-hidden bg-background p-3 gap-3">
          {/* Left Sidebar */}
          <Sidebar />

          {/* Main Content Area */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-sm border border-border/50 relative">
            <MainArea />
            <StatusBar />
          </div>
        </div>
        <ConnectionStatus />
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
