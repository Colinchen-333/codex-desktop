/**
 * TokenUsageIndicator - Token usage display component
 *
 * Displays token usage with context window progress bar.
 * Memoized to prevent unnecessary re-renders.
 */
import { memo } from 'react'
import { Coins } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useThreadStore } from '../../../stores/thread'
import { selectTokenUsage, selectActiveThread } from '../../../stores/thread/selectors'
import type { TokenUsage } from '../../../stores/thread'

// Format token count like CLI: 1.2K, 3.5M, etc.
function formatTokenCount(count: number): string {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toString()
}

export interface TokenUsageIndicatorProps {
  tokenUsage: TokenUsage
}

export const TokenUsageIndicator = memo(function TokenUsageIndicator({
  tokenUsage,
}: TokenUsageIndicatorProps) {
  // Use dynamic context window from server, fallback to 200k
  const contextWindow = tokenUsage.modelContextWindow || 200000

  const usagePercent = Math.min((tokenUsage.totalTokens / contextWindow) * 100, 100)
  const remainingPercent = 100 - usagePercent
  const cachePercent =
    tokenUsage.inputTokens > 0
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
    <div
      className="flex items-center gap-2"
      title={`${formatTokenCount(tokenUsage.totalTokens)} / ${formatTokenCount(contextWindow)} tokens used`}
    >
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
        {cachePercent > 0 && <span className="text-green-500/70 ml-1">({cachePercent}%)</span>}
      </span>
    </div>
  )
})

/**
 * Connected component that uses the thread store
 */
export const ConnectedTokenUsageIndicator = memo(function ConnectedTokenUsageIndicator() {
  const activeThread = useThreadStore(selectActiveThread)
  const tokenUsage = useThreadStore(selectTokenUsage)

  // Don't render if no active thread or no tokens used
  if (!activeThread || tokenUsage.totalTokens === 0) {
    return null
  }

  return <TokenUsageIndicator tokenUsage={tokenUsage} />
})
