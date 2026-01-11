/**
 * StatusBar - Main application status bar
 *
 * Refactored into smaller, memoized components for better performance.
 * Each sub-component subscribes only to the state it needs.
 *
 * Performance optimizations:
 * - Modular components with React.memo
 * - Optimized selectors from thread store
 * - Reduced re-renders through component isolation
 */
import { useEffect } from 'react'
import {
  SettingsDialog,
  SnapshotListDialog,
  AboutDialog,
  HelpDialog,
  KeyboardShortcutsDialog,
} from '../LazyComponents'
import { useAppStore } from '../../stores/app'
import { useProjectsStore } from '../../stores/projects'
import {
  ServerStatusIndicator,
  GitInfoIndicator,
  TurnStatusIndicator,
  ConnectedTokenUsageIndicator,
  AccountInfoSection,
  StatusBarActions,
} from './status-bar'

export function StatusBar() {
  const { selectedProjectId, projects } = useProjectsStore()
  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const {
    settingsOpen,
    setSettingsOpen,
    snapshotsOpen,
    setSnapshotsOpen,
    aboutOpen,
    setAboutOpen,
    helpOpen,
    setHelpOpen,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
  } = useAppStore()

  // Listen for ? key to open keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not in an input/textarea and ? is pressed
      if (
        e.key === '?' &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '')
      ) {
        e.preventDefault()
        // Use getState() to avoid dependency on setKeyboardShortcutsOpen
        void useAppStore.getState().setKeyboardShortcutsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <div className="flex h-9 items-center justify-between border-t border-border/40 bg-card/50 backdrop-blur-md px-4 text-xs font-medium tracking-tight text-muted-foreground/80">
        {/* Left side - Status indicators */}
        <div className="flex items-center gap-5">
          <ServerStatusIndicator />
          <GitInfoIndicator projectPath={selectedProject?.path} />
          <TurnStatusIndicator />
          <ConnectedTokenUsageIndicator />
        </div>

        {/* Right side - Account info & Actions */}
        <div className="flex items-center gap-4">
          <AccountInfoSection />
          <StatusBarActions
            onHelpClick={() => setHelpOpen(true)}
            onAboutClick={() => setAboutOpen(true)}
            onSettingsClick={() => setSettingsOpen(true)}
            onSnapshotsClick={() => setSnapshotsOpen(true)}
          />
        </div>
      </div>

      <SettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SnapshotListDialog isOpen={snapshotsOpen} onClose={() => setSnapshotsOpen(false)} />
      <AboutDialog isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <KeyboardShortcutsDialog isOpen={keyboardShortcutsOpen} onClose={() => setKeyboardShortcutsOpen(false)} />
    </>
  )
}

