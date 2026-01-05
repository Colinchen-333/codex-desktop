import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { cn } from '../../lib/utils'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'

type Tab = 'projects' | 'sessions'

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<Tab>('projects')
  const { projects, selectedProjectId, selectProject, addProject } = useProjectsStore()
  const { sessions, selectedSessionId, selectSession } = useSessionsStore()

  const handleAddProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      })
      if (selected && typeof selected === 'string') {
        await addProject(selected)
      }
    } catch (error) {
      console.error('Failed to add project:', error)
    }
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-card">
      {/* Tab Headers */}
      <div className="flex border-b border-border">
        <button
          className={cn(
            'flex-1 px-4 py-3 text-sm font-medium transition-colors',
            activeTab === 'projects'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('projects')}
        >
          Projects
        </button>
        <button
          className={cn(
            'flex-1 px-4 py-3 text-sm font-medium transition-colors',
            activeTab === 'sessions'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === 'projects' ? (
          <ProjectList
            projects={projects}
            selectedId={selectedProjectId}
            onSelect={selectProject}
          />
        ) : (
          <SessionList
            sessions={sessions}
            selectedId={selectedSessionId}
            onSelect={selectSession}
          />
        )}
      </div>

      {/* Add Button */}
      <div className="border-t border-border p-2">
        <button
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={activeTab === 'projects' ? handleAddProject : () => console.log('New session')}
        >
          {activeTab === 'projects' ? '+ Add Project' : '+ New Session'}
        </button>
      </div>
    </div>
  )
}

// Project List Component
interface ProjectListProps {
  projects: Array<{
    id: string
    path: string
    displayName: string | null
    lastOpenedAt: number | null
  }>
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function ProjectList({ projects, selectedId, onSelect }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No projects yet
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {projects.map((project) => (
        <button
          key={project.id}
          className={cn(
            'w-full rounded-md px-3 py-2 text-left transition-colors',
            selectedId === project.id
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'
          )}
          onClick={() => onSelect(project.id)}
        >
          <div className="truncate text-sm font-medium">
            {project.displayName || project.path.split('/').pop()}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {project.path}
          </div>
        </button>
      ))}
    </div>
  )
}

// Session List Component
interface SessionListProps {
  sessions: Array<{
    sessionId: string
    title: string | null
    tags: string | null
    isFavorite: boolean
    lastAccessedAt: number | null
    createdAt: number
  }>
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function SessionList({ sessions, selectedId, onSelect }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No sessions yet
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {sessions.map((session) => {
        const tags = session.tags ? JSON.parse(session.tags) : []
        return (
          <button
            key={session.sessionId}
            className={cn(
              'w-full rounded-md px-3 py-2 text-left transition-colors',
              selectedId === session.sessionId
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50'
            )}
            onClick={() => onSelect(session.sessionId)}
          >
            <div className="flex items-center gap-2">
              {session.isFavorite && <span className="text-yellow-500">★</span>}
              <span className="truncate text-sm font-medium">
                {session.title || `Session ${session.sessionId.slice(0, 8)}`}
              </span>
            </div>
            {tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {tags.slice(0, 3).map((tag: string) => (
                  <span
                    key={tag}
                    className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
