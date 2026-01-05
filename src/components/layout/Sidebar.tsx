import { useState, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { cn } from '../../lib/utils'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import { useAppStore } from '../../stores/app'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { RenameDialog } from '../ui/RenameDialog'
import { useToast } from '../ui/Toast'

// Helper function to format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function Sidebar() {
  const { sidebarTab: activeTab, setSidebarTab: setActiveTab } = useAppStore()
  const { projects, selectedProjectId, selectProject, addProject, removeProject, updateProject } =
    useProjectsStore()
  const { sessions, selectedSessionId, selectSession, fetchSessions, updateSession, deleteSession, isLoading: sessionsLoading } =
    useSessionsStore()
  const { showToast } = useToast()

  // Fetch sessions when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      fetchSessions(selectedProjectId)
    }
  }, [selectedProjectId, fetchSessions])

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [projectToRename, setProjectToRename] = useState<{
    id: string
    name: string
  } | null>(null)

  const handleAddProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      })
      if (selected && typeof selected === 'string') {
        await addProject(selected)
        showToast('Project added successfully', 'success')
      }
    } catch (error) {
      console.error('Failed to add project:', error)
      showToast('Failed to add project', 'error')
    }
  }

  const handleRenameProject = (id: string, currentName: string) => {
    setProjectToRename({ id, name: currentName })
    setRenameDialogOpen(true)
  }

  const handleConfirmRename = async (newName: string) => {
    if (projectToRename) {
      try {
        await updateProject(projectToRename.id, newName)
        showToast('Project renamed successfully', 'success')
      } catch (error) {
        console.error('Failed to rename project:', error)
        showToast('Failed to rename project', 'error')
      }
    }
    setRenameDialogOpen(false)
    setProjectToRename(null)
  }

  const handleDeleteProject = async (id: string) => {
    try {
      await removeProject(id)
      showToast('Project removed', 'success')
    } catch (error) {
      console.error('Failed to remove project:', error)
      showToast('Failed to remove project', 'error')
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
            onRename={handleRenameProject}
            onDelete={handleDeleteProject}
          />
        ) : (
          <SessionList
            sessions={sessions}
            selectedId={selectedSessionId}
            onSelect={selectSession}
            onToggleFavorite={async (sessionId, isFavorite) => {
              try {
                await updateSession(sessionId, { isFavorite: !isFavorite })
              } catch (error) {
                showToast('Failed to update session', 'error')
              }
            }}
            onDelete={async (sessionId) => {
              try {
                await deleteSession(sessionId)
                showToast('Session deleted', 'success')
              } catch (error) {
                showToast('Failed to delete session', 'error')
              }
            }}
            isLoading={sessionsLoading}
            hasProject={!!selectedProjectId}
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

      {/* Rename Dialog */}
      <RenameDialog
        isOpen={renameDialogOpen}
        title="Rename Project"
        currentName={projectToRename?.name || ''}
        onConfirm={handleConfirmRename}
        onCancel={() => {
          setRenameDialogOpen(false)
          setProjectToRename(null)
        }}
      />
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
  onRename: (id: string, currentName: string) => void
  onDelete: (id: string) => void
}

function ProjectList({ projects, selectedId, onSelect, onRename, onDelete }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No projects yet
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {projects.map((project) => {
        const displayName = project.displayName || project.path.split('/').pop() || 'Unknown'

        const contextMenuItems: ContextMenuItem[] = [
          {
            label: 'Rename',
            icon: '✏️',
            onClick: () => onRename(project.id, displayName),
          },
          {
            label: 'Open in Finder',
            icon: '📂',
            onClick: () => {
              // Use Tauri shell to open folder
              import('@tauri-apps/plugin-shell').then(({ open }) => {
                open(project.path)
              })
            },
          },
          {
            label: 'Remove',
            icon: '🗑️',
            onClick: () => onDelete(project.id),
            variant: 'danger',
          },
        ]

        return (
          <ContextMenu key={project.id} items={contextMenuItems}>
            <button
              className={cn(
                'w-full rounded-md px-3 py-2 text-left transition-colors',
                selectedId === project.id
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
              onClick={() => onSelect(project.id)}
            >
              <div className="truncate text-sm font-medium">{displayName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {project.path}
              </div>
            </button>
          </ContextMenu>
        )
      })}
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
  onToggleFavorite: (sessionId: string, isFavorite: boolean) => void
  onDelete: (sessionId: string) => void
  isLoading: boolean
  hasProject: boolean
}

function SessionList({
  sessions,
  selectedId,
  onSelect,
  onToggleFavorite,
  onDelete,
  isLoading,
  hasProject,
}: SessionListProps) {
  if (!hasProject) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Select a project to view sessions
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <div className="animate-spin mr-2">⚙️</div>
        Loading sessions...
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No sessions yet
      </div>
    )
  }

  // Sort sessions: favorites first, then by last accessed or created time
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) {
      return a.isFavorite ? -1 : 1
    }
    const timeA = a.lastAccessedAt || a.createdAt
    const timeB = b.lastAccessedAt || b.createdAt
    return timeB - timeA
  })

  return (
    <div className="space-y-1">
      {sortedSessions.map((session) => {
        const tags = session.tags ? JSON.parse(session.tags) : []
        const timeAgo = formatRelativeTime(session.lastAccessedAt || session.createdAt)

        const contextMenuItems: ContextMenuItem[] = [
          {
            label: session.isFavorite ? 'Remove from favorites' : 'Add to favorites',
            icon: session.isFavorite ? '☆' : '★',
            onClick: () => onToggleFavorite(session.sessionId, session.isFavorite),
          },
          {
            label: 'Delete',
            icon: '🗑️',
            onClick: () => onDelete(session.sessionId),
            variant: 'danger',
          },
        ]

        return (
          <ContextMenu key={session.sessionId} items={contextMenuItems}>
            <button
              className={cn(
                'w-full rounded-md px-3 py-2 text-left transition-colors',
                selectedId === session.sessionId
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
              onClick={() => onSelect(session.sessionId)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {session.isFavorite && <span className="text-yellow-500 flex-shrink-0">★</span>}
                  <span className="truncate text-sm font-medium">
                    {session.title || `Session ${session.sessionId.slice(0, 8)}`}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo}</span>
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
          </ContextMenu>
        )
      })}
    </div>
  )
}
