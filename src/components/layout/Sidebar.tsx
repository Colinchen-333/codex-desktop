import { useState, useEffect, useCallback, useRef } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { cn } from '../../lib/utils'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import { useAppStore } from '../../stores/app'
import { useThreadStore } from '../../stores/thread'
import { useSettingsStore } from '../../stores/settings'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { RenameDialog } from '../ui/RenameDialog'
import { ProjectSettingsDialog } from '../dialogs/ProjectSettingsDialog'
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
  const {
    sessions,
    selectedSessionId,
    selectSession,
    fetchSessions,
    updateSession,
    deleteSession,
    isLoading: sessionsLoading,
    searchQuery: storeSearchQuery,
    searchResults,
    isSearching,
    searchSessions,
    clearSearch,
  } = useSessionsStore()
  const { startThread, clearThread } = useThreadStore()
  const settings = useSettingsStore((state) => state.settings)
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

  // Session rename dialog state
  const [sessionRenameDialogOpen, setSessionRenameDialogOpen] = useState(false)
  const [sessionToRename, setSessionToRename] = useState<{
    id: string
    name: string
  } | null>(null)

  // Project settings dialog state
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false)
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null)

  // Search state with debounce
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced search
  const handleSearchChange = useCallback(
    (query: string) => {
      setLocalSearchQuery(query)

      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }

      // Debounce search API call
      searchTimeoutRef.current = setTimeout(() => {
        if (query.trim()) {
          searchSessions(query)
        } else {
          clearSearch()
        }
      }, 300)
    },
    [searchSessions, clearSearch]
  )

  // Clear search when switching tabs or projects
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  // Determine which sessions to display
  const displaySessions = storeSearchQuery ? searchResults : sessions
  const isGlobalSearch = !!storeSearchQuery

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

  const handleOpenProjectSettings = (id: string) => {
    setProjectSettingsId(id)
    setProjectSettingsOpen(true)
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

  const handleRenameSession = (id: string, currentName: string) => {
    setSessionToRename({ id, name: currentName })
    setSessionRenameDialogOpen(true)
  }

  const handleConfirmSessionRename = async (newName: string) => {
    if (sessionToRename) {
      try {
        await updateSession(sessionToRename.id, { title: newName })
        showToast('Session renamed', 'success')
      } catch (error) {
        console.error('Failed to rename session:', error)
        showToast('Failed to rename session', 'error')
      }
    }
    setSessionRenameDialogOpen(false)
    setSessionToRename(null)
  }

  const handleNewSession = async () => {
    if (!selectedProjectId) {
      showToast('Please select a project first', 'error')
      return
    }

    const project = projects.find((p) => p.id === selectedProjectId)
    if (!project) return

    try {
      // Clear any existing thread first
      clearThread()
      // Deselect current session
      selectSession(null)
      // Start a new thread
      await startThread(
        selectedProjectId,
        project.path,
        settings.model,
        settings.sandboxMode,
        settings.approvalPolicy
      )
      // Refresh sessions list to show the new session
      await fetchSessions(selectedProjectId)
      // Switch to sessions tab to show the new session
      setActiveTab('sessions')
      showToast('New session started', 'success')
    } catch (error) {
      console.error('Failed to start new session:', error)
      showToast('Failed to start new session', 'error')
    }
  }

  return (
    <div className="flex h-full w-64 flex-col bg-background p-3">
      {/* Tab Headers */}
      <div className="flex mb-4 rounded-lg bg-secondary/50 p-1">
        <button
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            activeTab === 'projects'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('projects')}
        >
          Projects
        </button>
        <button
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            activeTab === 'sessions'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions
        </button>
      </div>

      {/* Search Input */}
      {activeTab === 'sessions' && (
        <div className="mb-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search all sessions..."
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none pr-8"
              value={localSearchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {isSearching && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {localSearchQuery && !isSearching && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setLocalSearchQuery('')
                  clearSearch()
                }}
              >
                ✕
              </button>
            )}
          </div>
          {isGlobalSearch && searchResults.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              Found {searchResults.length} session(s) across all projects
            </div>
          )}
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto -mx-2 px-2">
        {activeTab === 'projects' ? (
          <ProjectList
            projects={projects}
            selectedId={selectedProjectId}
            onSelect={selectProject}
            onRename={handleRenameProject}
            onDelete={handleDeleteProject}
            onSettings={handleOpenProjectSettings}
          />
        ) : (
          <SessionList
            sessions={displaySessions}
            selectedId={selectedSessionId}
            onSelect={selectSession}
            onToggleFavorite={async (sessionId, isFavorite) => {
              try {
                await updateSession(sessionId, { isFavorite: !isFavorite })
              } catch (error) {
                showToast('Failed to update session', 'error')
              }
            }}
            onRename={handleRenameSession}
            onDelete={async (sessionId) => {
              try {
                await deleteSession(sessionId)
                showToast('Session deleted', 'success')
              } catch (error) {
                showToast('Failed to delete session', 'error')
              }
            }}
            isLoading={sessionsLoading || isSearching}
            hasProject={!!selectedProjectId}
            isGlobalSearch={isGlobalSearch}
          />
        )}
      </div>

      {/* Add Button */}
      <div className="mt-2 pt-2">
        <button
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
          onClick={activeTab === 'projects' ? handleAddProject : handleNewSession}
          disabled={activeTab === 'sessions' && !selectedProjectId}
        >
          {activeTab === 'projects' ? 'Add Project' : 'New Session'}
        </button>
      </div>

      {/* Rename Project Dialog */}
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

      {/* Rename Session Dialog */}
      <RenameDialog
        isOpen={sessionRenameDialogOpen}
        title="Rename Session"
        currentName={sessionToRename?.name || ''}
        onConfirm={handleConfirmSessionRename}
        onCancel={() => {
          setSessionRenameDialogOpen(false)
          setSessionToRename(null)
        }}
      />

      {/* Project Settings Dialog */}
      <ProjectSettingsDialog
        isOpen={projectSettingsOpen}
        onClose={() => {
          setProjectSettingsOpen(false)
          setProjectSettingsId(null)
        }}
        projectId={projectSettingsId}
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
  onSettings: (id: string) => void
}

function ProjectList({ projects, selectedId, onSelect, onRename, onDelete, onSettings }: ProjectListProps) {
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
            label: 'Settings',
            icon: '⚙️',
            onClick: () => onSettings(project.id),
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
                'w-full rounded-md px-3 py-2 text-left transition-all mb-1',
                selectedId === project.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
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
    projectId: string
    title: string | null
    tags: string | null
    isFavorite: boolean
    lastAccessedAt: number | null
    createdAt: number
  }>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onToggleFavorite: (sessionId: string, isFavorite: boolean) => void
  onRename: (sessionId: string, currentTitle: string) => void
  onDelete: (sessionId: string) => void
  isLoading: boolean
  hasProject: boolean
  isGlobalSearch?: boolean
}

function SessionList({
  sessions,
  selectedId,
  onSelect,
  onToggleFavorite,
  onRename,
  onDelete,
  isLoading,
  hasProject,
  isGlobalSearch,
}: SessionListProps) {
  // When doing global search, don't require project selection
  if (!hasProject && !isGlobalSearch) {
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
        {isGlobalSearch ? 'Searching...' : 'Loading sessions...'}
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {isGlobalSearch ? 'No matching sessions found' : 'No sessions yet'}
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
            label: 'Rename',
            icon: '✏️',
            onClick: () => onRename(session.sessionId, session.title || `Session ${session.sessionId.slice(0, 8)}`),
          },
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
                'w-full rounded-md px-3 py-2 text-left transition-all mb-1',
                selectedId === session.sessionId
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
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
