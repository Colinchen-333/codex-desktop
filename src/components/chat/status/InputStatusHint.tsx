/**
 * InputStatusHint - Shows token usage and shortcuts below input
 */
import { Coins } from 'lucide-react'
import { useThreadStore, selectFocusedThread } from '../../../stores/thread'

export function InputStatusHint() {
  // Use proper selector to avoid re-render loops from getter-based state access
  const focusedThread = useThreadStore(selectFocusedThread)
  const tokenUsage = focusedThread?.tokenUsage ?? { totalTokens: 0, modelContextWindow: null }
  // Ensure contextWindow is never 0 to prevent NaN/Infinity from division
  const contextWindow = Math.max(tokenUsage.modelContextWindow || 200000, 1)
  const usedPercent = Math.min(tokenUsage.totalTokens / contextWindow, 1)
  const remainingPercent = Math.max(0, Math.round(100 - usedPercent * 100))

  return (
    <div
      id="input-hint"
      className="mt-2 flex items-center justify-center gap-3 text-[10px] text-muted-foreground/60 select-none"
    >
      {tokenUsage.totalTokens > 0 && (
        <span className="flex items-center gap-1.5">
          <Coins size={10} />
          {remainingPercent}% context left
        </span>
      )}
      <span>•</span>
      <span>? for shortcuts</span>
    </div>
  )
}
