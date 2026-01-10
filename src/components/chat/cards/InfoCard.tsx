/**
 * InfoCard - Shows informational messages
 * Memoized to prevent unnecessary re-renders
 */
import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import { isInfoContent } from '../../../lib/typeGuards'
import { log } from '../../../lib/logger'
import { formatTimestamp } from '../utils'
import type { MessageItemProps } from '../types'

export const InfoCard = memo(
  function InfoCard({ item }: MessageItemProps) {
    if (!isInfoContent(item.content)) {
      log.warn(`Invalid info content for item ${item.id}`, 'InfoCard')
      return null
    }
    const content = item.content
    return (
      <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
        <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-background p-1 text-muted-foreground shadow-sm">
                <ChevronRight size={14} />
              </div>
              <span className="text-xs font-medium text-foreground">{content.title}</span>
            </div>
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
          </div>
          {content.details && (
            <pre className="p-4 text-xs text-muted-foreground whitespace-pre-wrap font-mono">
              {content.details}
            </pre>
          )}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison: info cards are immutable once created
    return prevProps.item === nextProps.item
  }
)
