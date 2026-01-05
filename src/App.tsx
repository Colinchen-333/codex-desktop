import { useEffect } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainArea } from './components/layout/MainArea'
import { StatusBar } from './components/layout/StatusBar'
import { useProjectsStore } from './stores/projects'
import { useThreadStore } from './stores/thread'
import { setupEventListeners, cleanupEventListeners } from './lib/events'

function App() {
  const fetchProjects = useProjectsStore((state) => state.fetchProjects)
  const {
    handleItemStarted,
    handleItemCompleted,
    handleAgentMessageDelta,
    handleCommandApprovalRequested,
    handleFileChangeApprovalRequested,
    handleTurnCompleted,
    handleTurnFailed,
  } = useThreadStore()

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <MainArea />
        <StatusBar />
      </div>
    </div>
  )
}

export default App
