/**
 * GitInfoIndicator - Git repository information component
 *
 * Displays git branch and dirty status with loading and error states.
 * Memoized to prevent unnecessary re-renders.
 */
import { memo, useCallback, useState, useEffect, useRef } from 'react'
import { GitBranch, Loader2, AlertCircle } from 'lucide-react'
import { projectApi, type GitInfo } from '../../../lib/api'
import { useToast } from '../../ui/useToast'
import { logError } from '../../../lib/errorUtils'

export interface GitInfoIndicatorProps {
  projectPath: string | undefined
}

export const GitInfoIndicator = memo(function GitInfoIndicator({
  projectPath,
}: GitInfoIndicatorProps) {
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const projectPathRef = useRef(projectPath)
  const gitInfoRef = useRef<GitInfo | null>(null)
  const errorRef = useRef<string | null>(null)
  const gitErrorShownRef = useRef(false)
  const { toast } = useToast()

  const fetchGitInfo = useCallback(async () => {
    if (!projectPath) return

    // Skip fetch if page is hidden to save resources
    if (document.visibilityState === 'hidden') return

    // Set loading state for initial fetch or after errors
    if (!gitInfoRef.current || errorRef.current) {
      setIsLoading(true)
      setError(null)
    }

    requestIdRef.current += 1
    const requestId = requestIdRef.current
    const pathAtRequest = projectPath

    try {
      const info = await projectApi.getGitInfo(projectPath)
      if (requestId !== requestIdRef.current || projectPathRef.current !== pathAtRequest) {
        return
      }
      setGitInfo(info)
      setError(null)
      setIsLoading(false)
      gitErrorShownRef.current = false
    } catch (err) {
      if (requestId !== requestIdRef.current || projectPathRef.current !== pathAtRequest) {
        return
      }
      logError(err, {
        context: 'GitInfoIndicator',
        source: 'status-bar',
        details: 'Failed to fetch git info'
      })
      setGitInfo(null)
      setIsLoading(false)
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Git information'
      setError(errorMessage)

      // Show toast notification for errors (only once per error cycle)
      if (!gitErrorShownRef.current) {
        gitErrorShownRef.current = true
        toast.error('Git Information Error', {
          message: 'Could not fetch repository status. The project path may not be a Git repository.',
          groupId: 'git-error',
          duration: 5000,
        })
      }
    }
  }, [projectPath, toast])

  useEffect(() => {
    gitInfoRef.current = gitInfo
  }, [gitInfo])

  useEffect(() => {
    errorRef.current = error
  }, [error])

  useEffect(() => {
    if (!projectPath) {
      setGitInfo(null)
      setError(null)
      setIsLoading(false)
      gitErrorShownRef.current = false
      return
    }

    projectPathRef.current = projectPath
    requestIdRef.current += 1

    let pollInterval: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (pollInterval) clearInterval(pollInterval)
      // Poll git status every 30 seconds only when page is visible
      pollInterval = setInterval(fetchGitInfo, 30000)
    }

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
    }

    // Handle visibility changes - pause/resume polling
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Fetch immediately when becoming visible, then resume polling
        void fetchGitInfo()
        startPolling()
      } else {
        // Stop polling when hidden
        stopPolling()
      }
    }

    // Initial fetch
    void fetchGitInfo()

    // Start polling if page is visible
    if (document.visibilityState === 'visible') {
      startPolling()
    }

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [projectPath, fetchGitInfo])

  // Don't render anything if no project
  if (!projectPath) return null

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground/70" title="Loading Git information...">
        <Loader2 size={12} className="animate-spin" />
        <span className="text-xs">Loading...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-red-500/80 cursor-help" title={`Git Error: ${error}`}>
        <AlertCircle size={12} />
        <span className="text-xs max-w-[80px] truncate">Git Error</span>
      </div>
    )
  }

  // Normal state - only show if it's a git repo and has a branch
  if (gitInfo?.isGitRepo && gitInfo.branch) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground/70">
        <GitBranch size={12} />
        <span className="text-xs max-w-[80px] truncate">{gitInfo.branch}</span>
        {gitInfo.isDirty && (
          <span className="h-2 w-2 rounded-full bg-yellow-500" title="Uncommitted changes" />
        )}
      </div>
    )
  }

  return null
})
