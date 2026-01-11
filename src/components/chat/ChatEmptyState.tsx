/**
 * ChatEmptyState - Empty state component for chat message list
 *
 * Provides a friendly empty state with helpful hints and animations.
 * Improves user experience when there are no messages yet.
 */
import { memo } from 'react'
import { MessageSquare, Sparkles, Keyboard } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface ChatEmptyStateProps {
  /** Whether the list is filtered */
  isFiltered?: boolean
  /** Optional custom message */
  message?: string
  /** Additional CSS classes */
  className?: string
}

export const ChatEmptyState = memo(function ChatEmptyState({
  isFiltered = false,
  message,
  className,
}: ChatEmptyStateProps) {
  // Show different content based on state
  if (isFiltered) {
    return (
      <div
        className={cn(
          'h-full flex flex-col items-center justify-center text-muted-foreground gap-4',
          className
        )}
      >
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <MessageSquare size={48} className="relative text-muted-foreground/50" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">No matching messages</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Try adjusting your search or filter
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'h-full flex flex-col items-center justify-center text-muted-foreground gap-6',
        className
      )}
    >
      {/* Animated icon */}
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <div className="relative flex items-center justify-center">
          <Sparkles size={48} className="text-primary/50" />
          <MessageSquare
            size={48}
            className="absolute text-muted-foreground/30 animate-in fade-in zoom-in duration-500"
          />
        </div>
      </div>

      {/* Welcome message */}
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-foreground">
          {message || 'Start a conversation'}
        </p>
        <p className="text-xs text-muted-foreground/60 max-w-xs">
          Type a message below to begin working with Claude
        </p>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground/50 bg-muted/30 px-3 py-2 rounded-lg border border-border/20">
        <Keyboard size={14} />
        <span>
          Press <kbd className="px-1.5 py-0.5 bg-background rounded text-[10px] font-mono">?</kbd> for shortcuts
        </span>
      </div>
    </div>
  )
})
