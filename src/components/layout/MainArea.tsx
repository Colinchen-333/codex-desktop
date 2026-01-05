import { useProjectsStore } from '../../stores/projects'
import { useThreadStore } from '../../stores/thread'
import { ChatView } from '../chat/ChatView'

export function MainArea() {
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const activeThread = useThreadStore((state) => state.activeThread)

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
    <div className="flex flex-1 flex-col items-center justify-center bg-background p-8">
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

  const project = projects.find((p) => p.id === projectId)
  const info = gitInfo[projectId]

  if (!project) return null

  const handleStartSession = async () => {
    try {
      await startThread(projectId, project.path)
    } catch (error) {
      console.error('Failed to start session:', error)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background p-8">
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

        <button
          className="w-full rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={handleStartSession}
          disabled={isLoading}
        >
          {isLoading ? 'Starting...' : 'Start New Session'}
        </button>
      </div>
    </div>
  )
}

export { WelcomeView, StartSessionView }
