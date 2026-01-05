import { useEffect, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'
import { StatusBar } from './components/layout/StatusBar'
import { OnboardingFlow, useNeedsOnboarding } from './components/onboarding/OnboardingFlow'
import { ToastProvider } from './components/ui/Toast'
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
    <ToastProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <MainArea />
          <StatusBar />
        </div>
      </div>
    </ToastProvider>
  )
}

export default App
