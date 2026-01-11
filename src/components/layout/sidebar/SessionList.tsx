import { memo, useMemo, useCallback, useRef, useEffect } from 'react'
import { Star } from 'lucide-react'
import { cn, formatAbsoluteTime } from '../../../lib/utils'
import type { SessionStatus } from '../../../lib/api'
import { useSessionsStore } from '../../../stores/sessions'
import { useProjectsStore } from '../../../stores/projects'
import { ContextMenu, type ContextMenuItem } from '../../ui/ContextMenu'
import { StatusIcon, getStatusLabel } from '../../ui/StatusIndicator'
import { TaskProgressIndicator } from '../../chat/TaskProgress'
import { VariableSizeList as List } from 'react-window'
import AutoSizer from 'react-window/dist/core/AutoSizer'

export interface Session {
  sessionId: string
  projectId: string
  title: string | null
  tags: string | null
  isFavorite: boolean
  isArchived: boolean
  lastAccessedAt: number | null
  createdAt: number
  status: SessionStatus
  firstMessage: string | null
  tasksJson: string | null
}

export interface SessionListProps {
  sessions: Session[]
  selectedId: string | null
  /** onSelect receives sessionId and optionally projectId (for cross-project switching in global search) */
  onSelect: (id: string | null, projectId?: string) => void
  onToggleFavorite: (sessionId: string, isFavorite: boolean) => void
  onRename: (sessionId: string, currentTitle: string) => void
  onDelete: (sessionId: string, sessionName: string) => void
  isLoading: boolean
  hasProject: boolean
  isGlobalSearch?: boolean
  /**
   * Threshold for enabling virtualization.
   * Virtualization is only enabled when the number of sessions exceeds this value.
   * This avoids virtualization overhead for small lists while providing performance
   * benefits for large lists.
   */
  virtualizationThreshold?: number
}

/**
 * SessionRow - Individual row component for virtualized list
 * Memoized to prevent unnecessary re-renders during scrolling
 */
interface SessionRowProps {
  index: number
  style: React.CSSProperties
  data: {
    sessions: Session[]
    selectedId: string | null
    onSelect: (id: string | null, projectId?: string) => void
    onToggleFavorite: (sessionId: string, isFavorite: boolean) => void
    onRename: (sessionId: string, currentTitle: string) => void
    onDelete: (sessionId: string, sessionName: string) => void
    getSessionDisplayName: (session: Session) => string
    getProjectName: (projectId: string) => string | null
    isGlobalSearch?: boolean
  }
}

const SessionRow = memo(function SessionRow({ index, style, data }: SessionRowProps) {
  const {
    sessions,
    selectedId,
    onSelect,
    onToggleFavorite,
    onRename,
    onDelete,
    getSessionDisplayName,
    getProjectName,
    isGlobalSearch,
  } = data

  const session = sessions[index]
  if (!session) return null

  const displayName = getSessionDisplayName(session)
  const timestamp = session.lastAccessedAt || session.createdAt
  const timeStr = formatAbsoluteTime(timestamp)
  const statusLabel = getStatusLabel(session.status)
  const isRunning = session.status === 'running'
  const isSelected = selectedId === session.sessionId
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
      onClick: () => onDelete(session.sessionId, displayName),
      variant: 'danger',
    },
  ]

  return (
    <div style={style}>
      <ContextMenu key={session.sessionId} items={contextMenuItems}>
        <button
          className={cn(
            'w-full rounded-lg px-3 py-2.5 text-left transition-all mb-1',
            isSelected
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-foreground hover:bg-secondary/50',
            isRunning &&
              !isSelected &&
              'border border-blue-400/30 bg-blue-50/10 dark:bg-blue-950/20'
          )}
          onClick={() =>
            onSelect(session.sessionId, isGlobalSearch ? session.projectId : undefined)
          }
          role="option"
          aria-selected={isSelected}
        >
          {/* First row: Status icon + Session name + Task progress */}
          <div className="flex items-center gap-2">
            <StatusIcon status={session.status} />
            {session.isFavorite && (
              <Star
                size={12}
                className="text-yellow-500 flex-shrink-0 fill-yellow-500"
              />
            )}
            <span className="truncate text-sm font-medium flex-1">
              {displayName}
            </span>
            {/* Task progress indicator */}
            <TaskProgressIndicator
              tasksJson={session.tasksJson}
              status={session.status}
            />
          </div>
          {/* Second row: Status label + Timestamp + Project name (for global search) */}
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            <span
              className={cn(
                'text-muted-foreground',
                isSelected && 'text-primary-foreground/70'
              )}
            >
              {statusLabel}
            </span>
            {timeStr && (
              <>
                <span
                  className={cn(
                    'text-muted-foreground/60',
                    isSelected && 'text-primary-foreground/50'
                  )}
                >
                  ·
                </span>
                <span
                  className={cn(
                    'text-muted-foreground',
                    isSelected && 'text-primary-foreground/70'
                  )}
                >
                  {timeStr}
                </span>
              </>
            )}
            {/* Show project name in global search results */}
            {projectName && (
              <>
                <span
                  className={cn(
                    'text-muted-foreground/60',
                    isSelected && 'text-primary-foreground/50'
                  )}
                >
                  ·
                </span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground truncate max-w-[80px]',
                    isSelected &&
                      'bg-primary-foreground/20 text-primary-foreground/80'
                  )}
                >
                  {projectName}
                </span>
              </>
            )}
          </div>
        </button>
      </ContextMenu>
    </div>
  )
})

/**
 * SessionList - Displays sorted list of sessions with context menu actions
 *
 * Features:
 * - Sorted by: running first, then favorites, then by last accessed time
 * - Context menu for rename, toggle favorite, delete
 * - Status indicator with label
 * - Task progress display
 * - Project name badge in global search mode
 * - Loading and empty states
 * - Optimized with React.memo and useMemo for sorting
 * - Virtualized rendering for large lists using react-window
 */
export const SessionList = memo(function SessionList({
  sessions,
  selectedId,
  onSelect,
  onToggleFavorite,
  onRename,
  onDelete,
  isLoading,
  hasProject,
  isGlobalSearch,
  virtualizationThreshold = 50, // Enable virtualization for 50+ sessions
}: SessionListProps) {
  // Hooks must be called unconditionally at the top
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

  // Determine if virtualization should be enabled
  const shouldVirtualize = sortedSessions.length > virtualizationThreshold

  // Create item data for virtualized rows
  const itemData = useMemo(
    () => ({
      sessions: sortedSessions,
      selectedId,
      onSelect,
      onToggleFavorite,
      onRename,
      onDelete,
      getSessionDisplayName,
      getProjectName,
      isGlobalSearch,
    }),
    [
      sortedSessions,
      selectedId,
      onSelect,
      onToggleFavorite,
      onRename,
      onDelete,
      getSessionDisplayName,
      getProjectName,
      isGlobalSearch,
    ]
  )

  // Ref for the virtualized list to allow programmatic scrolling
  const listRef = useRef<List>(null)

  // Reset scroll position when sessions change significantly
  const prevSessionsLengthRef = useRef(0)
  const sessionsLengthChanged = sortedSessions.length !== prevSessionsLengthRef.current

  // Update ref and scroll to top when sessions change
  useEffect(() => {
    if (sessionsLengthChanged && listRef.current) {
      listRef.current.scrollToItem(0)
      prevSessionsLengthRef.current = sortedSessions.length
    }
  }, [sortedSessions.length, sessionsLengthChanged])

  // Size calculator for dynamic row heights
  const getItemSize = useCallback((index: number) => {
    // Base height: padding + content + margin
    // Each session row is approximately 70-80px depending on content
    return 80 // Fixed height for simplicity, can be made dynamic if needed
  }, [])

  // Render non-virtualized list for small datasets
  const renderStandardList = () => {
    return (
      <div
        className="space-y-1"
        role="listbox"
        aria-label="Sessions list"
        id="sessions-panel"
        aria-labelledby="sessions-tab"
      >
        {sortedSessions.map((session) => {
          const displayName = getSessionDisplayName(session)
          const timestamp = session.lastAccessedAt || session.createdAt
          const timeStr = formatAbsoluteTime(timestamp)
          const statusLabel = getStatusLabel(session.status)
          const isRunning = session.status === 'running'
          const isSelected = selectedId === session.sessionId
          // Get project name for global search results display
          const projectName = isGlobalSearch
            ? getProjectName(session.projectId)
            : null

          const contextMenuItems: ContextMenuItem[] = [
            {
              label: 'Rename',
              icon: '✏️',
              onClick: () => onRename(session.sessionId, displayName),
            },
            {
              label: session.isFavorite
                ? 'Remove from favorites'
                : 'Add to favorites',
              icon: session.isFavorite ? '☆' : '★',
              onClick: () =>
                onToggleFavorite(session.sessionId, session.isFavorite),
            },
            {
              label: 'Delete',
              icon: '🗑️',
              onClick: () => onDelete(session.sessionId, displayName),
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
                  isRunning &&
                    !isSelected &&
                    'border border-blue-400/30 bg-blue-50/10 dark:bg-blue-950/20'
                )}
                onClick={() =>
                  onSelect(
                    session.sessionId,
                    isGlobalSearch ? session.projectId : undefined
                  )
                }
                role="option"
                aria-selected={isSelected}
              >
                {/* First row: Status icon + Session name + Task progress */}
                <div className="flex items-center gap-2">
                  <StatusIcon status={session.status} />
                  {session.isFavorite && (
                    <Star
                      size={12}
                      className="text-yellow-500 flex-shrink-0 fill-yellow-500"
                    />
                  )}
                  <span className="truncate text-sm font-medium flex-1">
                    {displayName}
                  </span>
                  {/* Task progress indicator */}
                  <TaskProgressIndicator
                    tasksJson={session.tasksJson}
                    status={session.status}
                  />
                </div>
                {/* Second row: Status label + Timestamp + Project name (for global search) */}
                <div className="flex items-center gap-1.5 mt-1 text-xs">
                  <span
                    className={cn(
                      'text-muted-foreground',
                      isSelected && 'text-primary-foreground/70'
                    )}
                  >
                    {statusLabel}
                  </span>
                  {timeStr && (
                    <>
                      <span
                        className={cn(
                          'text-muted-foreground/60',
                          isSelected && 'text-primary-foreground/50'
                        )}
                      >
                        ·
                      </span>
                      <span
                        className={cn(
                          'text-muted-foreground',
                          isSelected && 'text-primary-foreground/70'
                        )}
                      >
                        {timeStr}
                      </span>
                    </>
                  )}
                  {/* Show project name in global search results */}
                  {projectName && (
                    <>
                      <span
                        className={cn(
                          'text-muted-foreground/60',
                          isSelected && 'text-primary-foreground/50'
                        )}
                      >
                        ·
                      </span>
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground truncate max-w-[80px]',
                          isSelected &&
                            'bg-primary-foreground/20 text-primary-foreground/80'
                        )}
                      >
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

  // Render virtualized list for large datasets
  const renderVirtualizedList = () => {
    return (
      <div
        role="listbox"
        aria-label="Sessions list"
        id="sessions-panel"
        aria-labelledby="sessions-tab"
        className="h-full"
      >
        <AutoSizer>
          {({ height, width }) => (
            <List
              ref={listRef}
              height={height}
              width={width}
              itemCount={sortedSessions.length}
              itemSize={getItemSize}
              itemData={itemData}
              overscanCount={5} // Render 5 extra items above/below viewport
            >
              {SessionRow}
            </List>
          )}
        </AutoSizer>
      </div>
    )
  }

  // Early returns after all hooks
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
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
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

  // Choose rendering method based on dataset size
  return shouldVirtualize ? renderVirtualizedList() : renderStandardList()
})
