import { memo } from 'react'
import { cn } from '../../../lib/utils'
import { ContextMenu, type ContextMenuItem } from '../../ui/ContextMenu'

export interface Project {
  id: string
  path: string
  displayName: string | null
  lastOpenedAt: number | null
}

export interface ProjectListProps {
  projects: Project[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onRename: (id: string, currentName: string) => void
  onDelete: (id: string, name: string) => void
  onSettings: (id: string) => void
}

/**
 * ProjectList - Displays list of projects with context menu actions
 *
 * Features:
 * - Project selection with visual feedback
 * - Context menu for rename, settings, open in Finder, remove
 * - Empty state display
 * - Optimized with React.memo
 *
 * Context menu items are created per-project as they depend on project data.
 */
export const ProjectList = memo(function ProjectList({
  projects,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onSettings,
}: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No projects yet
      </div>
    )
  }

  return (
    <div
      className="space-y-1"
      role="listbox"
      aria-label="Projects list"
      id="projects-panel"
      aria-labelledby="projects-tab"
    >
      {projects.map((project) => {
        const displayName =
          project.displayName || project.path.split('/').pop() || 'Unknown'
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
              void import('@tauri-apps/plugin-shell').then(async ({ open }) => {
                await open(project.path)
              })
            },
          },
          {
            label: 'Remove',
            icon: '🗑️',
            onClick: () => onDelete(project.id, displayName),
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
})
