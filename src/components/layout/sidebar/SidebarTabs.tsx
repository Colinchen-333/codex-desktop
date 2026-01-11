import { memo } from 'react'
import { cn } from '../../../lib/utils'

export type SidebarTabType = 'projects' | 'sessions'

interface SidebarTabsProps {
  activeTab: SidebarTabType
  onTabChange: (tab: SidebarTabType) => void
}

/**
 * SidebarTabs - Tab switcher for Projects/Sessions views
 *
 * Extracted from Sidebar.tsx for better separation of concerns.
 * Uses memo to prevent unnecessary re-renders when parent state changes.
 */
export const SidebarTabs = memo(function SidebarTabs({
  activeTab,
  onTabChange,
}: SidebarTabsProps) {
  return (
    <div className="flex mb-4 rounded-lg bg-secondary/50 p-1" role="tablist">
      <button
        className={cn(
          'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
          activeTab === 'projects'
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => onTabChange('projects')}
        role="tab"
        aria-selected={activeTab === 'projects'}
        aria-controls="projects-panel"
        id="projects-tab"
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
        onClick={() => onTabChange('sessions')}
        role="tab"
        aria-selected={activeTab === 'sessions'}
        aria-controls="sessions-panel"
        id="sessions-tab"
      >
        Sessions
      </button>
    </div>
  )
})
