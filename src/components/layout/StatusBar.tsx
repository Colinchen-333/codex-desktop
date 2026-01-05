import { useEffect, useState } from 'react'
import { Activity, ShieldCheck, HelpCircle, Info, Settings, Camera, Coins, GitBranch } from 'lucide-react'
import { cn } from '../../lib/utils'
import { serverApi, projectApi, type ServerStatus, type AccountInfo, type GitInfo } from '../../lib/api'
import { useProjectsStore } from '../../stores/projects'
import { SettingsDialog } from '../settings/SettingsDialog'
import { SnapshotListDialog } from '../dialogs/SnapshotListDialog'
import { AboutDialog } from '../dialogs/AboutDialog'
import { HelpDialog } from '../dialogs/HelpDialog'
import { KeyboardShortcutsDialog } from '../dialogs/KeyboardShortcutsDialog'
import { useAppStore } from '../../stores/app'
import { useThreadStore } from '../../stores/thread'

export function StatusBar() {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null)
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null)
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
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
  const activeThread = useThreadStore((state) => state.activeThread)
  const tokenUsage = useThreadStore((state) => state.tokenUsage)
  const turnStatus = useThreadStore((state) => state.turnStatus)

  useEffect(() => {
    // Fetch status on mount
    const fetchStatus = async () => {
      try {
        const status = await serverApi.getStatus()
        setServerStatus(status)
      } catch (error) {
        console.error('Failed to fetch server status:', error)
      }
    }

    const fetchAccount = async () => {
      try {
        const info = await serverApi.getAccountInfo()
        setAccountInfo(info)
      } catch (error) {
        console.error('Failed to fetch account info:', error)
      }
    }

    fetchStatus()
    fetchAccount()

    // Poll status every 10 seconds
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  // Fetch git info when project changes
  useEffect(() => {
    if (!selectedProject?.path) {
      setGitInfo(null)
      return
    }

    const fetchGitInfo = async () => {
      try {
        const info = await projectApi.getGitInfo(selectedProject.path)
        setGitInfo(info)
      } catch (error) {
        console.error('Failed to fetch git info:', error)
        setGitInfo(null)
      }
    }

    fetchGitInfo()
    // Poll git status every 30 seconds
    const interval = setInterval(fetchGitInfo, 30000)
    return () => clearInterval(interval)
  }, [selectedProject?.path])

  // Listen for ? key to open keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not in an input/textarea and ? is pressed
      if (
        e.key === '?' &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '')
      ) {
        e.preventDefault()
        setKeyboardShortcutsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setKeyboardShortcutsOpen])

  const handleRestartServer = async () => {
    try {
      await serverApi.restart()
      const status = await serverApi.getStatus()
      setServerStatus(status)
    } catch (error) {
      console.error('Failed to restart server:', error)
    }
  }

  return (
    <>
      <div className="flex h-9 items-center justify-between border-t border-border/40 bg-card/50 backdrop-blur-md px-4 text-[11px] font-medium tracking-tight text-muted-foreground/80">
        {/* Left side - Server status */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              {serverStatus?.isRunning && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
              )}
              <span
                className={cn(
                  'relative inline-flex h-2 w-2 rounded-full',
                  serverStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'
                )}
              />
            </div>
            <span className="flex items-center gap-1.5 uppercase tracking-widest text-[10px]">
              <Activity size={12} strokeWidth={2.5} />
              Engine: {serverStatus?.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>

          {!serverStatus?.isRunning && (
            <button
              className="text-primary hover:text-primary/80 transition-colors uppercase tracking-widest text-[10px] font-bold"
              onClick={handleRestartServer}
            >
              Restart
            </button>
          )}

          {/* Git branch indicator */}
          {gitInfo?.isGitRepo && gitInfo.branch && (
            <div className="flex items-center gap-1.5 text-muted-foreground/70">
              <GitBranch size={12} />
              <span className="text-[10px] max-w-[80px] truncate">{gitInfo.branch}</span>
              {gitInfo.isDirty && (
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" title="Uncommitted changes" />
              )}
            </div>
          )}

          {/* Turn status indicator */}
          {turnStatus === 'running' && (
            <div className="flex items-center gap-1.5 text-blue-500">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="uppercase tracking-widest text-[10px]">Processing...</span>
            </div>
          )}

          {/* Token usage with context window indicator */}
          {activeThread && tokenUsage.totalTokens > 0 && (
            <ContextWindowIndicator tokenUsage={tokenUsage} />
          )}
        </div>

        {/* Right side - Account info & Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 pr-3 border-r border-border/30">
            <ShieldCheck size={12} className={accountInfo?.account ? 'text-green-500' : 'text-yellow-500'} />
            {accountInfo?.account ? (
              <span className="truncate max-w-[120px]">
                {accountInfo.account.email || 'Logged in'}
                {accountInfo.account.planType && ` (${accountInfo.account.planType})`}
              </span>
            ) : (
              <span className="text-yellow-600/80 uppercase tracking-widest text-[10px]">Auth Required</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {activeThread && (
              <button
                className="hover:bg-primary/5 p-1.5 rounded-md transition-colors hover:text-foreground"
                onClick={() => setSnapshotsOpen(true)}
                title="Snapshots"
              >
                <Camera size={14} />
              </button>
            )}
            <button
              className="hover:bg-primary/5 p-1.5 rounded-md transition-colors hover:text-foreground"
              onClick={() => setHelpOpen(true)}
              title="Help"
            >
              <HelpCircle size={14} />
            </button>
            <button
              className="hover:bg-primary/5 p-1.5 rounded-md transition-colors hover:text-foreground"
              onClick={() => setAboutOpen(true)}
              title="About"
            >
              <Info size={14} />
            </button>
            <button
              className="hover:bg-primary/5 p-1.5 rounded-md transition-colors hover:text-foreground"
              onClick={() => setSettingsOpen(true)}
              title="Settings (⌘,)"
            >
              <Settings size={14} />
            </button>
          </div>
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

// Context Window Indicator Component
interface ContextWindowIndicatorProps {
  tokenUsage: {
    totalTokens: number
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
  }
}

function ContextWindowIndicator({ tokenUsage }: ContextWindowIndicatorProps) {
  // Common model context windows (conservative estimate)
  const MAX_CONTEXT = 200000 // 200k tokens (Claude 3.5)

  const usagePercent = Math.min((tokenUsage.totalTokens / MAX_CONTEXT) * 100, 100)
  const cachePercent = tokenUsage.inputTokens > 0
    ? Math.round((tokenUsage.cachedInputTokens / tokenUsage.inputTokens) * 100)
    : 0

  // Color based on usage
  const getColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500'
    if (percent >= 70) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getTextColor = (percent: number) => {
    if (percent >= 90) return 'text-red-500'
    if (percent >= 70) return 'text-yellow-500'
    return 'text-muted-foreground/70'
  }

  return (
    <div className="flex items-center gap-2">
      <Coins size={12} className={getTextColor(usagePercent)} />

      {/* Progress bar */}
      <div className="relative w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', getColor(usagePercent))}
          style={{ width: `${usagePercent}%` }}
        />
      </div>

      <span className={cn('text-[10px]', getTextColor(usagePercent))}>
        {tokenUsage.totalTokens.toLocaleString()}
        {cachePercent > 0 && (
          <span className="text-green-500/70 ml-1">
            ({cachePercent}% cached)
          </span>
        )}
      </span>
    </div>
  )
}

