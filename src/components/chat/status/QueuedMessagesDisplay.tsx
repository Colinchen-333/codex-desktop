/**
 * QueuedMessagesDisplay - Shows messages waiting to be processed
 * Memoized to prevent unnecessary re-renders when only turnStatus changes
 */
import { memo } from 'react'
import { ListChecks, Clock } from 'lucide-react'
import { useThreadStore, type ThreadState, type QueuedMessage } from '../../../stores/thread'

export const QueuedMessagesDisplay = memo(function QueuedMessagesDisplay() {
  const queuedMessages = useThreadStore((state: ThreadState) => state.queuedMessages)
  const turnStatus = useThreadStore((state: ThreadState) => state.turnStatus)

  if (queuedMessages.length === 0) return null

  return (
    <div className="mb-2 space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="text-xs text-muted-foreground px-2">
        <ListChecks size={12} className="inline mr-1.5" />
        Queued messages{turnStatus === 'running' ? '' : ' (pending)'} ({queuedMessages.length}):
      </div>
      {queuedMessages.map((msg: QueuedMessage) => (
        <div
          key={msg.id}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/60 border border-border/30 text-sm"
        >
          <Clock size={14} className="text-muted-foreground shrink-0" />
          <span className="truncate flex-1">{msg.text}</span>
          {msg.images && msg.images.length > 0 && (
            <span className="text-xs text-muted-foreground">
              +{msg.images.length} image{msg.images.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      ))}
    </div>
  )
})
