/**
 * StatusBarActions - Action buttons component
 *
 * Displays help, about, settings, and other action buttons.
 * Memoized to prevent unnecessary re-renders.
 */
import { memo } from 'react'
import { HelpCircle, Info, Settings, Camera } from 'lucide-react'
import { useThreadStore } from '../../../stores/thread'
import { selectActiveThread } from '../../../stores/thread/selectors'
import { preloadSettingsDialog } from '../../../lib/lazyPreload'

export interface StatusBarActionsProps {
  onHelpClick: () => void
  onAboutClick: () => void
  onSettingsClick: () => void
  onSnapshotsClick: () => void
}

export const StatusBarActions = memo(function StatusBarActions({
  onHelpClick,
  onAboutClick,
  onSettingsClick,
  onSnapshotsClick,
}: StatusBarActionsProps) {
  const activeThread = useThreadStore(selectActiveThread)

  return (
    <div className="flex items-center gap-1">
      {activeThread && (
        <button
          className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
          onClick={onSnapshotsClick}
          title="Snapshots"
        >
          <Camera size={14} />
        </button>
      )}
      <button
        className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
        onClick={onHelpClick}
        title="Help"
      >
        <HelpCircle size={14} />
      </button>
      <button
        className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
        onClick={onAboutClick}
        title="About"
      >
        <Info size={14} />
      </button>
      <button
        className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
        onClick={onSettingsClick}
        onMouseEnter={preloadSettingsDialog}
        title="Settings"
      >
        <Settings size={14} />
      </button>
    </div>
  )
})
