import { useEffect, useState, useRef } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'
import { StatusBar } from './components/layout/StatusBar'
import { OnboardingFlow } from './components/onboarding/OnboardingFlow'
import { useNeedsOnboarding } from './components/onboarding/useNeedsOnboarding'
import { ToastProvider } from './components/ui/Toast'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ConnectionStatus } from './components/ui/ConnectionStatus'
import { GlobalErrorHandler } from './components/ui/GlobalErrorHandler'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { useProjectsStore } from './stores/projects'
import { useThreadStore, cleanupThreadResources } from './stores/thread'
import { setupEventListeners, cleanupEventListeners } from './lib/events'

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
  // Note: With multi-session support, event handlers now route by threadId internally
  // so we no longer need the withThreadFilter wrapper
  useEffect(() => {
    // Prevent duplicate setup
    if (listenersSetupRef.current) return
    listenersSetupRef.current = true

    // Track if component is still mounted
    let isMounted = true
    let setupPromise: Promise<(() => void)[]> | null = null

    setupPromise = setupEventListeners({
      // Thread lifecycle - routes by threadId internally
      onThreadStarted: (event) => useThreadStore.getState().handleThreadStarted(event),
      // Item lifecycle - routes by threadId internally
      onItemStarted: (event) => useThreadStore.getState().handleItemStarted(event),
      onItemCompleted: (event) => useThreadStore.getState().handleItemCompleted(event),
      // Agent messages - routes by threadId internally
      onAgentMessageDelta: (event) => useThreadStore.getState().handleAgentMessageDelta(event),
      // Approvals - routes by threadId internally
      onCommandApprovalRequested: (event) => useThreadStore.getState().handleCommandApprovalRequested(event),
      onFileChangeApprovalRequested: (event) => useThreadStore.getState().handleFileChangeApprovalRequested(event),
      // Turn lifecycle - routes by threadId internally
      onTurnStarted: (event) => useThreadStore.getState().handleTurnStarted(event),
      onTurnCompleted: (event) => useThreadStore.getState().handleTurnCompleted(event),
      onTurnDiffUpdated: (event) => useThreadStore.getState().handleTurnDiffUpdated(event),
      onTurnPlanUpdated: (event) => useThreadStore.getState().handleTurnPlanUpdated(event),
      onThreadCompacted: (event) => useThreadStore.getState().handleThreadCompacted(event),
      // Command execution output - routes by threadId internally
      onCommandExecutionOutputDelta: (event) =>
        useThreadStore.getState().handleCommandExecutionOutputDelta(event),
      onFileChangeOutputDelta: (event) =>
        useThreadStore.getState().handleFileChangeOutputDelta(event),
      // Reasoning - routes by threadId internally
      onReasoningSummaryTextDelta: (event) =>
        useThreadStore.getState().handleReasoningSummaryTextDelta(event),
      onReasoningSummaryPartAdded: (event) =>
        useThreadStore.getState().handleReasoningSummaryPartAdded(event),
      onReasoningTextDelta: (event) => useThreadStore.getState().handleReasoningTextDelta(event),
      // MCP Tools - routes by threadId internally
      onMcpToolCallProgress: (event) =>
        useThreadStore.getState().handleMcpToolCallProgress(event),
      // Token usage - routes by threadId internally
      onTokenUsage: (event) => useThreadStore.getState().handleTokenUsage(event),
      // Errors - routes by threadId internally
      onStreamError: (event) => useThreadStore.getState().handleStreamError(event),
      // Rate limiting - routes by threadId internally
      onRateLimitExceeded: (event) => useThreadStore.getState().handleRateLimitExceeded(event),
      // Server disconnected - affects all threads
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
      // Cleanup thread resources (timers, buffers) to prevent memory leaks
      cleanupThreadResources()
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
        <GlobalErrorHandler />
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
