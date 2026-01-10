/**
 * UserMessage - Displays user messages with optional images
 * Memoized to prevent unnecessary re-renders when parent state changes
 */
import { memo } from 'react'
import { isUserMessageContent } from '../../../lib/typeGuards'
import { log } from '../../../lib/logger'
import type { MessageItemProps } from '../types'

export const UserMessage = memo(
  function UserMessage({ item }: MessageItemProps) {
    if (!isUserMessageContent(item.content)) {
      log.warn(`Invalid user message content for item ${item.id}`, 'UserMessage')
      return null
    }
    const content = item.content
    return (
      <div className="flex justify-end pl-12 animate-in slide-in-from-bottom-2 duration-200">
        <div className="group relative max-w-[85%]">
          <div className="rounded-2xl rounded-tr-sm bg-primary px-5 py-4 text-primary-foreground shadow-md">
            {content.images && content.images.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {content.images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt={`Attached ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="h-32 w-32 rounded-xl object-cover border border-primary-foreground/10 bg-black/20 shadow-sm"
                  />
                ))}
              </div>
            )}
            {content.text && (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed selection:bg-primary-foreground/30">
                {content.text}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if item identity or content changes
    // User messages are immutable once created, so reference equality is sufficient
    return prevProps.item === nextProps.item
  }
)
