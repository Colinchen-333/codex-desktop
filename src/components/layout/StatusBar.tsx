import { useEffect, useState, useRef } from 'react'
import { Activity, ShieldCheck, HelpCircle, Info, Settings, Camera, Coins, GitBranch, Clock, Zap } from 'lucide-react'
import { cn } from '../../lib/utils'
import { serverApi, projectApi, type ServerStatus, type AccountInfo, type GitInfo } from '../../lib/api'
import { useProjectsStore } from '../../stores/projects'
import { SettingsDialog } from '../settings/SettingsDialog'
import { SnapshotListDialog } from '../dialogs/SnapshotListDialog'
import { AboutDialog } from '../dialogs/AboutDialog'
import { HelpDialog } from '../dialogs/HelpDialog'
import { KeyboardShortcutsDialog } from '../dialogs/KeyboardShortcutsDialog'
import { useAppStore } from '../../stores/app'
import { useThreadStore, type TokenUsage } from '../../stores/thread'

// Format elapsed time compactly like CLI: "0s", "1m 30s", "1h 05m 30s"
function formatElapsedCompact(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  if (totalSecs < 60) return `${totalSecs}s`
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  if (mins < 60) return `${mins}m ${secs.toString().padStart(2, '0')}s`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hours}h ${remMins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
}

// Format token count like CLI: 1.2K, 3.5M, etc.
function formatTokenCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toString()
}

export function StatusBar() {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null)
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null)
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0) // Real-time elapsed counter
  const [tokenRate, setTokenRate] = useState(0) // Token consumption rate
  const prevTokensRef = useRef(0)
  const prevTimeRef = useRef(0)
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
  const turnTiming = useThreadStore((state) => state.turnTiming)
  const pendingApprovals = useThreadStore((state) => state.pendingApprovals)

  // Real-time elapsed time + token rate update when running (50ms for smooth display)
  useEffect(() => {
    // Only setup interval when running
    if (turnStatus !== 'running' || !turnTiming.startedAt) {
      return
    }

    // Reset refs when starting - use getState() to avoid dependency on tokenUsage
    const initialTokens = useThreadStore.getState().tokenUsage.totalTokens
    prevTokensRef.current = initialTokens
    prevTimeRef.current = Date.now()

    // Update elapsed time every 50ms for CLI-like smooth display
    const interval = setInterval(() => {
      const now = Date.now()
      const startedAt = useThreadStore.getState().turnTiming.startedAt
      if (startedAt) {
        setElapsedMs(now - startedAt)
      }

      // Calculate token rate every 500ms for stability
      const timeDelta = (now - prevTimeRef.current) / 1000
      if (timeDelta >= 0.5) {
        const currentTokens = useThreadStore.getState().tokenUsage.totalTokens
        const tokenDelta = currentTokens - prevTokensRef.current
        if (tokenDelta > 0 && timeDelta > 0) {
          setTokenRate(Math.round(tokenDelta / timeDelta))
        }
        prevTokensRef.current = currentTokens
        prevTimeRef.current = now
      }
    }, 50)
    return () => clearInterval(interval)
  }, [turnStatus, turnTiming.startedAt]) // Remove tokenUsage.totalTokens dependency

  // Reset elapsed when turn completes
  useEffect(() => {
    if (turnStatus !== 'running') {
      setElapsedMs(0)
      setTokenRate(0)
    }
  }, [turnStatus])

  useEffect(() => {
    // Track mounted state to prevent state updates after unmount
    let isMounted = true

    // Fetch status on mount only (no polling - rely on events)
    const fetchStatus = async () => {
      try {
        const status = await serverApi.getStatus()
        if (isMounted) {
          setServerStatus(status)
        }
      } catch (error) {
        console.error('Failed to fetch server status:', error)
      }
    }

    const fetchAccount = async () => {
      try {
        const info = await serverApi.getAccountInfo()
        if (isMounted) {
          setAccountInfo(info)
        }
      } catch (error) {
        console.error('Failed to fetch account info:', error)
      }
    }

    fetchStatus()
    fetchAccount()

    // Reduced polling to 60 seconds (status comes from events now)
    const interval = setInterval(fetchStatus, 60000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  // Fetch git info when project changes
  useEffect(() => {
    if (!selectedProject?.path) {
      setGitInfo(null)
      return
    }

    let isMounted = true

    const fetchGitInfo = async () => {
      try {
        const info = await projectApi.getGitInfo(selectedProject.path)
        if (isMounted) {
          setGitInfo(info)
        }
      } catch (error) {
        console.error('Failed to fetch git info:', error)
        if (isMounted) {
          setGitInfo(null)
        }
      }
    }

    fetchGitInfo()
    // Poll git status every 30 seconds
    const interval = setInterval(fetchGitInfo, 30000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
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
        // Use getState() to avoid dependency on setKeyboardShortcutsOpen
        useAppStore.getState().setKeyboardShortcutsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // No dependencies needed - uses getState()

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
      <div className="flex h-9 items-center justify-between border-t border-border/40 bg-card/50 backdrop-blur-md px-4 text-xs font-medium tracking-tight text-muted-foreground/80">
        {/* Left side - Server status */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2.5 w-2.5">
              {serverStatus?.isRunning && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
              )}
              <span
                className={cn(
                  'relative inline-flex h-2.5 w-2.5 rounded-full',
                  serverStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'
                )}
              />
            </div>
            <span className="flex items-center gap-1.5 uppercase tracking-widest text-xs">
              <Activity size={12} strokeWidth={2.5} />
              Engine: {serverStatus?.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>

          {!serverStatus?.isRunning && (
            <button
              className="text-primary hover:text-primary/80 transition-colors uppercase tracking-widest text-xs font-bold"
              onClick={handleRestartServer}
            >
              Restart
            </button>
          )}

          {/* Git branch indicator */}
          {gitInfo?.isGitRepo && gitInfo.branch && (
            <div className="flex items-center gap-1.5 text-muted-foreground/70">
              <GitBranch size={12} />
              <span className="text-xs max-w-[80px] truncate">{gitInfo.branch}</span>
              {gitInfo.isDirty && (
                <span className="h-2 w-2 rounded-full bg-yellow-500" title="Uncommitted changes" />
              )}
            </div>
          )}

          {/* Turn status indicator with elapsed time - CLI style */}
          {turnStatus === 'running' && (
            <div className="flex items-center gap-2 text-blue-500">
              {/* Shimmer effect spinner */}
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
              </span>
              {/* Shimmer text effect */}
              <span className="uppercase tracking-widest text-xs font-medium shimmer-text">
                Working
              </span>
              {/* Pending approvals badge */}
              {pendingApprovals.length > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 text-xs font-medium">
                  {pendingApprovals.length} pending
                </span>
              )}
              {/* Token rate */}
              {tokenRate > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
                  <Zap size={10} />
                  {tokenRate} tok/s
                </span>
              )}
              {/* Elapsed time */}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={11} />
                {formatElapsedCompact(elapsedMs)}
              </span>
              {/* Interrupt hint */}
              <span className="text-xs text-muted-foreground/60">
                esc
              </span>
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
              <span className="text-yellow-600/80 uppercase tracking-widest text-xs">Auth Required</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {activeThread && (
              <button
                className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
                onClick={() => setSnapshotsOpen(true)}
                title="Snapshots"
              >
                <Camera size={14} />
              </button>
            )}
            <button
              className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
              onClick={() => setHelpOpen(true)}
              title="Help"
            >
              <HelpCircle size={14} />
            </button>
            <button
              className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
              onClick={() => setAboutOpen(true)}
              title="About"
            >
              <Info size={14} />
            </button>
            <button
              className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
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

// Context Window Indicator Component - Uses dynamic context window from server
interface ContextWindowIndicatorProps {
  tokenUsage: TokenUsage
}

function ContextWindowIndicator({ tokenUsage }: ContextWindowIndicatorProps) {
  // Use dynamic context window from server, fallback to 200k
  const contextWindow = tokenUsage.modelContextWindow || 200000

  const usagePercent = Math.min((tokenUsage.totalTokens / contextWindow) * 100, 100)
  const remainingPercent = 100 - usagePercent
  const cachePercent = tokenUsage.inputTokens > 0
    ? Math.round((tokenUsage.cachedInputTokens / tokenUsage.inputTokens) * 100)
    : 0

  // Color based on usage (inverted - show remaining)
  const getColor = (remainPct: number) => {
    if (remainPct <= 10) return 'bg-red-500'
    if (remainPct <= 30) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getTextColor = (remainPct: number) => {
    if (remainPct <= 10) return 'text-red-500'
    if (remainPct <= 30) return 'text-yellow-500'
    return 'text-muted-foreground/70'
  }

  return (
    <div className="flex items-center gap-2" title={`${formatTokenCount(tokenUsage.totalTokens)} / ${formatTokenCount(contextWindow)} tokens used`}>
      <Coins size={12} className={getTextColor(remainingPercent)} />

      {/* CLI-style progress bar */}
      <div className="relative w-20 h-1.5 bg-secondary rounded-lg overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', getColor(remainingPercent))}
          style={{ width: `${usagePercent}%` }}
        />
      </div>

      {/* Token count with remaining percentage */}
      <span className={cn('text-xs tabular-nums', getTextColor(remainingPercent))}>
        {formatTokenCount(tokenUsage.totalTokens)}
        <span className="text-muted-foreground/50 mx-0.5">/</span>
        {formatTokenCount(contextWindow)}
        {cachePercent > 0 && (
          <span className="text-green-500/70 ml-1">
            ({cachePercent}%)
          </span>
        )}
      </span>
    </div>
  )
}

