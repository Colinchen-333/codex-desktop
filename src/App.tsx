import { useEffect, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'
import { StatusBar } from './components/layout/StatusBar'
import { OnboardingFlow, useNeedsOnboarding } from './components/onboarding/OnboardingFlow'
import { ToastProvider } from './components/ui/Toast'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ConnectionStatus } from './components/ui/ConnectionStatus'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { useProjectsStore } from './stores/projects'
import { useThreadStore } from './stores/thread'
import { setupEventListeners, cleanupEventListeners } from './lib/events'

function App() {
  const fetchProjects = useProjectsStore((state) => state.fetchProjects)
  const needsOnboarding = useNeedsOnboarding()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const {
    handleItemStarted,
    handleItemCompleted,
    handleAgentMessageDelta,
    handleCommandApprovalRequested,
    handleFileChangeApprovalRequested,
    handleTurnCompleted,
    handleTurnFailed,
  } = useThreadStore()

  // Check if onboarding is needed
  useEffect(() => {
    setShowOnboarding(needsOnboarding)
  }, [needsOnboarding])

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Setup event listeners
  useEffect(() => {
    let unlisteners: (() => void)[] = []

    setupEventListeners({
      onItemStarted: handleItemStarted,
      onItemCompleted: handleItemCompleted,
      onAgentMessageDelta: handleAgentMessageDelta,
      onCommandApprovalRequested: handleCommandApprovalRequested,
      onFileChangeApprovalRequested: handleFileChangeApprovalRequested,
      onTurnCompleted: handleTurnCompleted,
      onTurnFailed: handleTurnFailed,
      onServerDisconnected: () => {
        console.log('Server disconnected')
        // TODO: Show reconnection UI
      },
    }).then((listeners) => {
      unlisteners = listeners
    })

    return () => {
      cleanupEventListeners(unlisteners)
    }
  }, [
    handleItemStarted,
    handleItemCompleted,
    handleAgentMessageDelta,
    handleCommandApprovalRequested,
    handleFileChangeApprovalRequested,
    handleTurnCompleted,
    handleTurnFailed,
  ])

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
