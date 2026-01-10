/**
 * AgentMessage - Displays AI agent messages with streaming indicator
 * Memoized to prevent unnecessary re-renders during streaming
 */
import { memo } from 'react'
import { isAgentMessageContent } from '../../../lib/typeGuards'
import { Markdown } from '../../ui/Markdown'
import { log } from '../../../lib/logger'
import type { MessageItemProps } from '../types'

export const AgentMessage = memo(
  function AgentMessage({ item }: MessageItemProps) {
    if (!isAgentMessageContent(item.content)) {
      log.warn(`Invalid agent message content for item ${item.id}`, 'AgentMessage')
      return null
    }
    const content = item.content
    return (
      <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-200">
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-card px-5 py-4 shadow-md border border-border/30 backdrop-blur-sm">
          <Markdown content={content.text} />
          {content.isStreaming && (
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          )}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison: check if content actually changed
    // Agent messages can update during streaming, so we need deeper comparison
    const prev = prevProps.item
    const next = nextProps.item

    // Fast path: same reference
    if (prev === next) return true

    // Must be same type and status
    if (prev.type !== next.type || prev.status !== next.status) return false

    // For agent messages, check if text or streaming status changed
    if (!isAgentMessageContent(prev.content) || !isAgentMessageContent(next.content)) {
      return false
    }

    const prevContent = prev.content
    const nextContent = next.content

    // Re-render if text changed, streaming status changed, or text length changed (during streaming)
    return (
      prevContent.text === nextContent.text && prevContent.isStreaming === nextContent.isStreaming
    )
  }
)
