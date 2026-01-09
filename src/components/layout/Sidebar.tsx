// React imports
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// External library imports
import { open } from '@tauri-apps/plugin-dialog'
import { Star, X } from 'lucide-react'

// Internal - utilities and types
import { cn, formatAbsoluteTime } from '../../lib/utils'
import type { SessionStatus } from '../../lib/api'

// Internal - stores
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import { useAppStore } from '../../stores/app'
import { useThreadStore } from '../../stores/thread'
import {
  useSettingsStore,
  mergeProjectSettings,
  getEffectiveWorkingDirectory,
} from '../../stores/settings'

// Internal - UI components
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import { RenameDialog } from '../ui/RenameDialog'
import { useToast } from '../ui/Toast'
import { StatusIcon, getStatusLabel } from '../ui/StatusIndicator'

// Internal - dialogs
import { ProjectSettingsDialog } from '../dialogs/ProjectSettingsDialog'

export function Sidebar() {
  const { sidebarTab: activeTab, setSidebarTab: setActiveTab } = useAppStore()
  // Only destructure what we need - functions called via getState() are omitted
  const { projects, selectedProjectId, addProject, removeProject, updateProject } =
    useProjectsStore()
  const {
    sessions,
    selectedSessionId,
    updateSession,
    deleteSession,
    isLoading: sessionsLoading,
    searchQuery: storeSearchQuery,
    searchResults,
    isSearching,
    // searchSessions, clearSearch are called via getState() to avoid dependency issues
  } = useSessionsStore()
  // startThread, closeAllThreads, selectProject, fetchSessions, selectSession are called via getState()
  const { showToast } = useToast()

  // Fetch sessions when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      // Use getState() to avoid function reference in dependencies
      useSessionsStore.getState().fetchSessions(selectedProjectId)
    }
  }, [selectedProjectId])

  // Handle project selection with proper cleanup
  const handleSelectProject = useCallback(
    (projectId: string | null) => {
      if (!projectId) return
      // If selecting a different project, clean up all related state first
      if (projectId !== selectedProjectId) {
        // Use getState() to avoid stale closures and dependency issues
        useSessionsStore.getState().selectSession(null)
        useThreadStore.getState().closeAllThreads()
      }
      useProjectsStore.getState().selectProject(projectId)
      useAppStore.getState().setSidebarTab('sessions')
    },
    [selectedProjectId]
  )

  // Handle session selection using getState() to avoid function reference issues
  // For global search results, also switch project if the session belongs to a different project
  const handleSelectSession = useCallback((sessionId: string | null, sessionProjectId?: string) => {
    const currentProjectId = useProjectsStore.getState().selectedProjectId

    // If selecting a search result from a different project, switch project first
    if (sessionProjectId && sessionProjectId !== currentProjectId) {
      // Close all threads when switching project to avoid state conflicts
      useThreadStore.getState().closeAllThreads()
      useProjectsStore.getState().selectProject(sessionProjectId)
    }

    useSessionsStore.getState().selectSession(sessionId)
  }, [])

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
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search - use getState() to avoid function reference dependencies
  const handleSearchChange = useCallback(
    (query: string) => {
      setLocalSearchQuery(query)

      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }

      // Debounce search API call
      searchTimeoutRef.current = setTimeout(() => {
        searchTimeoutRef.current = null
        if (query.trim()) {
          useSessionsStore.getState().searchSessions(query)
        } else {
          useSessionsStore.getState().clearSearch()
        }
      }, 300)
    },
    [] // No dependencies - store functions called via getState()
  )

  // Clear search timeout on unmount and when switching tabs/projects
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
    }
  }, [])

  // Also clear timeout when activeTab changes to prevent stale callbacks
  useEffect(() => {
    if (activeTab !== 'sessions' && searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
  }, [activeTab])

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

    const currentProjects = useProjectsStore.getState().projects
    const project = currentProjects.find((p) => p.id === selectedProjectId)
    if (!project) return

    // Merge project-specific settings with global settings
    const currentSettings = useSettingsStore.getState().settings
    const effectiveSettings = mergeProjectSettings(currentSettings, project.settingsJson)
    const effectiveCwd = getEffectiveWorkingDirectory(project.path, project.settingsJson)

    try {
      // NOTE: Do NOT call clearThread() here!
      // We want to keep existing sessions running in parallel.
      // startThread() will add the new session to threads map while preserving others.

      // Deselect current session (will be replaced by the new one)
      useSessionsStore.getState().selectSession(null)
      // Start a new thread with merged settings
      await useThreadStore.getState().startThread(
        selectedProjectId,
        effectiveCwd,
        effectiveSettings.model,
        effectiveSettings.sandboxMode,
        effectiveSettings.approvalPolicy
      )
      // Get the newly created thread from the store and select it as current session
      const newThread = useThreadStore.getState().activeThread
      if (newThread) {
        useSessionsStore.getState().selectSession(newThread.id)
      }
      // Refresh sessions list to show the new session
      await useSessionsStore.getState().fetchSessions(selectedProjectId)
      // Switch to sessions tab to show the new session
      useAppStore.getState().setSidebarTab('sessions')
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
            'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
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
            'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none pr-8"
              value={localSearchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Search sessions"
              aria-describedby={isGlobalSearch && searchResults.length > 0 ? 'search-results-count' : undefined}
            />
            {isSearching && (
              <div
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                role="status"
                aria-busy="true"
                aria-label="Searching"
              >
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {localSearchQuery && !isSearching && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                onClick={() => {
                  setLocalSearchQuery('')
                  useSessionsStore.getState().clearSearch()
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {isGlobalSearch && searchResults.length > 0 && (
            <div id="search-results-count" className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
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
            onSelect={handleSelectProject}
            onRename={handleRenameProject}
            onDelete={handleDeleteProject}
            onSettings={handleOpenProjectSettings}
          />
        ) : (
          <SessionList
            sessions={displaySessions}
            selectedId={selectedSessionId}
            onSelect={(sessionId, projectId) => handleSelectSession(sessionId, projectId)}
            onToggleFavorite={async (sessionId, isFavorite) => {
              try {
                await updateSession(sessionId, { isFavorite: !isFavorite })
              } catch {
                showToast('Failed to update session', 'error')
              }
            }}
            onRename={handleRenameSession}
            onDelete={async (sessionId) => {
              try {
                await deleteSession(sessionId)
                showToast('Session deleted', 'success')
              } catch {
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
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50 shadow-sm transition-colors"
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
    <div className="space-y-1" role="listbox" aria-label="Projects list">
      {projects.map((project) => {
        const displayName = project.displayName || project.path.split('/').pop() || 'Unknown'
        const isSelected = selectedId === project.id

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
                'w-full rounded-lg px-3 py-2.5 text-left transition-all mb-1',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              )}
              onClick={() => onSelect(project.id)}
              role="option"
              aria-selected={isSelected}
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
    status: SessionStatus
    firstMessage: string | null
    tasksJson: string | null
  }>
  selectedId: string | null
  // onSelect receives sessionId and optionally projectId (for cross-project switching in global search)
  onSelect: (id: string | null, projectId?: string) => void
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
  const { getSessionDisplayName } = useSessionsStore()
  const { projects } = useProjectsStore()

  // Helper to get project display name by ID (for global search results)
  const getProjectName = useCallback(
    (projectId: string): string | null => {
      const project = projects.find((p) => p.id === projectId)
      if (!project) return null
      return project.displayName || project.path.split('/').pop() || null
    },
    [projects]
  )

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
      <div
        className="flex h-32 items-center justify-center text-sm text-muted-foreground"
        role="status"
        aria-busy="true"
        aria-label={isGlobalSearch ? 'Searching sessions' : 'Loading sessions'}
      >
        <div className="animate-spin mr-2" aria-hidden="true">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        {isGlobalSearch ? 'Searching...' : 'Loading sessions...'}
      </div>
    )
  }

  // Memoize sorted sessions to avoid recalculating on every render
  // Sort order: running first, then favorites, then by last accessed or created time
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      // Running sessions always first
      if (a.status === 'running' && b.status !== 'running') return -1
      if (a.status !== 'running' && b.status === 'running') return 1
      // Then favorites
      if (a.isFavorite !== b.isFavorite) {
        return a.isFavorite ? -1 : 1
      }
      // Then by time
      const timeA = a.lastAccessedAt || a.createdAt
      const timeB = b.lastAccessedAt || b.createdAt
      return timeB - timeA
    })
  }, [sessions])

  if (sessions.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {isGlobalSearch ? 'No matching sessions found' : 'No sessions yet'}
      </div>
    )
  }

  return (
    <div className="space-y-1" role="listbox" aria-label="Sessions list">
      {sortedSessions.map((session) => {
        const displayName = getSessionDisplayName(session)
        const timestamp = session.lastAccessedAt || session.createdAt
        const timeStr = formatAbsoluteTime(timestamp)
        const statusLabel = getStatusLabel(session.status)
        const isRunning = session.status === 'running'
        const isSelected = selectedId === session.sessionId
        // Get project name for global search results display
        const projectName = isGlobalSearch ? getProjectName(session.projectId) : null

        const contextMenuItems: ContextMenuItem[] = [
          {
            label: 'Rename',
            icon: '✏️',
            onClick: () => onRename(session.sessionId, displayName),
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
                'w-full rounded-lg px-3 py-2.5 text-left transition-all mb-1',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground hover:bg-secondary/50',
                isRunning && !isSelected && 'border border-blue-400/30 bg-blue-50/10 dark:bg-blue-950/20'
              )}
              onClick={() => onSelect(session.sessionId, isGlobalSearch ? session.projectId : undefined)}
              role="option"
              aria-selected={isSelected}
            >
              {/* First row: Status icon + Session name */}
              <div className="flex items-center gap-2">
                <StatusIcon status={session.status} />
                {session.isFavorite && <Star size={12} className="text-yellow-500 flex-shrink-0 fill-yellow-500" />}
                <span className="truncate text-sm font-medium flex-1">
                  {displayName}
                </span>
              </div>
              {/* Second row: Status label + Timestamp + Project name (for global search) */}
              <div className="flex items-center gap-1.5 mt-1 text-xs">
                <span className={cn(
                  'text-muted-foreground',
                  isSelected && 'text-primary-foreground/70'
                )}>
                  {statusLabel}
                </span>
                {timeStr && (
                  <>
                    <span className={cn(
                      'text-muted-foreground/60',
                      isSelected && 'text-primary-foreground/50'
                    )}>
                      ·
                    </span>
                    <span className={cn(
                      'text-muted-foreground',
                      isSelected && 'text-primary-foreground/70'
                    )}>
                      {timeStr}
                    </span>
                  </>
                )}
                {/* Show project name in global search results */}
                {projectName && (
                  <>
                    <span className={cn(
                      'text-muted-foreground/60',
                      isSelected && 'text-primary-foreground/50'
                    )}>
                      ·
                    </span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground truncate max-w-[80px]',
                      isSelected && 'bg-primary-foreground/20 text-primary-foreground/80'
                    )}>
                      {projectName}
                    </span>
                  </>
                )}
              </div>
            </button>
          </ContextMenu>
        )
      })}
    </div>
  )
}
