/**
 * WorkingStatusBar - CLI-style status bar shown above input when AI is working
 * Also shows reasoning summary like CLI does
 * Memoized to prevent unnecessary re-renders when only unrelated state changes
 */
import { memo, useState, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import { useThreadStore, selectFocusedThread } from '../../../stores/thread'
import { useAppStore, type AppState } from '../../../stores/app'
import { isReasoningContent } from '../../../lib/typeGuards'
import { parseReasoningSummary } from '../utils'

export const WorkingStatusBar = memo(function WorkingStatusBar() {
  // Use proper selector to avoid re-render loops from getter-based state access
  const focusedThread = useThreadStore(selectFocusedThread)
  const focusedThreadId = focusedThread?.thread?.id ?? null

  // Extract data from focused thread state
  const turnStatus = focusedThread?.turnStatus ?? 'idle'
  const turnTiming = focusedThread?.turnTiming ?? { startedAt: null, completedAt: null }
  const pendingApprovals = focusedThread?.pendingApprovals ?? []
  const items = focusedThread?.items ?? {}
  const itemOrder = focusedThread?.itemOrder ?? []
  const escapePending = useAppStore((state: AppState) => state.escapePending)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [tokenRate, setTokenRate] = useState(0)
  const prevTokensRef = useRef(0)
  const prevTimeRef = useRef(0)

  // Real-time elapsed time update at 50ms for smoother display (like CLI)
  useEffect(() => {
    if (turnStatus !== 'running' || !turnTiming.startedAt || !focusedThreadId) {
      return
    }

    const getThreadSnapshot = () => useThreadStore.getState().threads[focusedThreadId]

    // Reset refs when starting - use focused thread snapshot to avoid races
    const initialTokens = getThreadSnapshot()?.tokenUsage.totalTokens ?? 0
    prevTokensRef.current = initialTokens
    prevTimeRef.current = Date.now()

    const interval = setInterval(() => {
      const now = Date.now()
      const threadState = getThreadSnapshot()
      const startedAt = threadState?.turnTiming.startedAt
      if (startedAt) {
        setElapsedMs(now - startedAt)
      }

      // Calculate token rate (tokens per second)
      const timeDelta = (now - prevTimeRef.current) / 1000
      if (timeDelta >= 0.5) {
        // Update rate every 500ms for stability
        const currentTokens = threadState?.tokenUsage.totalTokens ?? 0
        const tokenDelta = currentTokens - prevTokensRef.current
        if (tokenDelta > 0 && timeDelta > 0) {
          setTokenRate(Math.round(tokenDelta / timeDelta))
        }
        prevTokensRef.current = currentTokens
        prevTimeRef.current = now
      }
    }, 50) // 50ms update for smoother time display
    return () => clearInterval(interval)
  }, [turnStatus, turnTiming.startedAt, focusedThreadId])

  // Find current reasoning summary (streaming or recent)
  // React Compiler will automatically optimize this computation
  const currentReasoning = (() => {
    // Look for reasoning items in reverse order (most recent first)
    for (let i = itemOrder.length - 1; i >= 0; i--) {
      const item = items[itemOrder[i]]
      if (item?.type === 'reasoning') {
        if (!isReasoningContent(item.content)) {
          continue
        }
        const content = item.content
        if (content.isStreaming && content.summary && content.summary.length > 0) {
          // Get the latest summary line and parse it
          const latestSummary = content.summary[content.summary.length - 1]
          if (latestSummary) {
            return parseReasoningSummary(latestSummary)
          }
        }
      }
    }
    return null
  })()

  if (turnStatus !== 'running') return null

  const formatElapsed = (ms: number) => {
    const secs = Math.floor(ms / 1000)
    const tenths = Math.floor((ms % 1000) / 100)
    return `${secs}.${tenths}s`
  }

  const pendingCount = pendingApprovals.length

  return (
    <div className="mb-3 px-4 py-3 rounded-2xl bg-secondary/40 border border-border/30 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Spinning indicator */}
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          {/* Status text with shimmer or reasoning summary */}
          {currentReasoning ? (
            <span className="text-sm text-muted-foreground truncate">{currentReasoning}</span>
          ) : (
            <span className="text-sm font-medium shimmer-text">Working</span>
          )}
        </div>
        {/* Right side stats */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {/* Pending approvals badge */}
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-medium">
              {pendingCount} pending
            </span>
          )}
          {/* Token rate */}
          {tokenRate > 0 && (
            <span className="text-[10px] text-muted-foreground/70">{tokenRate} tok/s</span>
          )}
          {/* Elapsed time */}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock size={12} />
            {formatElapsed(elapsedMs)}
          </span>
          {/* Interrupt hint - CLI-style double-escape */}
          <span
            className={`text-[10px] transition-colors ${escapePending ? 'text-orange-500 font-medium' : 'text-muted-foreground/70'}`}
          >
            {escapePending ? 'esc again to interrupt' : 'esc esc to interrupt'}
          </span>
        </div>
      </div>
    </div>
  )
})
