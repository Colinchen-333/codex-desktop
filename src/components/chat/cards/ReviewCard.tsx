/**
 * ReviewCard - Shows code review results
 */
import { AlertCircle } from 'lucide-react'
import { isReviewContent } from '../../../lib/typeGuards'
import { Markdown } from '../../ui/Markdown'
import { log } from '../../../lib/logger'
import { formatTimestamp } from '../utils'
import type { MessageItemProps } from '../types'

export function ReviewCard({ item }: MessageItemProps) {
  if (!isReviewContent(item.content)) {
    log.warn(`Invalid review content for item ${item.id}`, 'ReviewCard')
    return null
  }
  const content = item.content
  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-background p-1 text-muted-foreground shadow-sm">
              <AlertCircle size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">
              {content.phase === 'started' ? 'Review started' : 'Review complete'}
            </span>
          </div>
          {/* Timestamp */}
          <span className="text-[10px] text-muted-foreground/60">
            {formatTimestamp(item.createdAt)}
          </span>
        </div>
        <div className="p-4">
          <Markdown content={content.text} />
        </div>
      </div>
    </div>
  )
}
