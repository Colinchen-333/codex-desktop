import { useRef, useEffect, useState } from 'react'
import { cn } from '../../lib/utils'
import { useThreadStore, type AnyThreadItem } from '../../stores/thread'
import { Markdown } from '../ui/Markdown'
import { DiffView, parseDiff, type FileDiff } from '../ui/DiffView'

export function ChatView() {
  const { items, itemOrder, turnStatus, sendMessage, interrupt } = useThreadStore()
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [itemOrder])

  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text || turnStatus === 'running') return

    setInputValue('')
    try {
      await sendMessage(text)
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {itemOrder.map((id) => {
            const item = items.get(id)
            if (!item) return null
            return <MessageItem key={id} item={item} />
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-card p-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              className="min-h-[44px] flex-1 resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none"
              placeholder="Type your message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={turnStatus === 'running'}
            />
            {turnStatus === 'running' ? (
              <button
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                onClick={interrupt}
              >
                Stop
              </button>
            ) : (
              <button
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={handleSend}
                disabled={!inputValue.trim()}
              >
                Send
              </button>
            )}
          </div>
          {turnStatus === 'running' && (
            <div className="mt-2 text-center text-xs text-muted-foreground">
              Codex is thinking...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Message Item Component
interface MessageItemProps {
  item: AnyThreadItem
}

function MessageItem({ item }: MessageItemProps) {
  switch (item.type) {
    case 'userMessage':
      return <UserMessage item={item} />
    case 'agentMessage':
      return <AgentMessage item={item} />
    case 'commandExecution':
      return <CommandExecutionCard item={item} />
    case 'fileChange':
      return <FileChangeCard item={item} />
    default:
      return null
  }
}

// User Message
function UserMessage({ item }: { item: AnyThreadItem }) {
  const content = item.content as { text: string }
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-lg bg-primary px-4 py-3 text-primary-foreground">
        <p className="whitespace-pre-wrap text-sm">{content.text}</p>
      </div>
    </div>
  )
}

// Agent Message
function AgentMessage({ item }: { item: AnyThreadItem }) {
  const content = item.content as { text: string; isStreaming: boolean }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg bg-card px-4 py-3 shadow-sm border border-border">
        <Markdown content={content.text} />
        {content.isStreaming && (
          <span className="inline-block h-4 w-1 animate-pulse bg-primary mt-1" />
        )}
      </div>
    </div>
  )
}

// Command Execution Card
function CommandExecutionCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as {
    command: string
    cwd: string
    needsApproval: boolean
    approved?: boolean
    output?: string
    exitCode?: number
  }
  const { respondToApproval, activeThread } = useThreadStore()

  const handleApprove = (decision: 'accept' | 'acceptForSession' | 'decline') => {
    if (activeThread) {
      respondToApproval(item.id, decision)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        content.needsApproval ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20' : 'border-border bg-card'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Command</span>
        {content.exitCode !== undefined && (
          <span
            className={cn(
              'text-xs',
              content.exitCode === 0 ? 'text-green-500' : 'text-red-500'
            )}
          >
            Exit: {content.exitCode}
          </span>
        )}
      </div>

      <code className="block rounded bg-secondary p-2 text-sm">{content.command}</code>

      <div className="mt-1 text-xs text-muted-foreground">cwd: {content.cwd}</div>

      {content.output && (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-secondary p-2 text-xs">
          {content.output}
        </pre>
      )}

      {content.needsApproval && (
        <div className="mt-3 flex gap-2">
          <button
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => handleApprove('accept')}
          >
            Run Once
          </button>
          <button
            className="rounded bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
            onClick={() => handleApprove('acceptForSession')}
          >
            Allow for Session
          </button>
          <button
            className="rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            onClick={() => handleApprove('decline')}
          >
            Decline
          </button>
        </div>
      )}
    </div>
  )
}

// File Change Card
function FileChangeCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as {
    changes: Array<{ path: string; kind: string; diff: string }>
    needsApproval: boolean
    approved?: boolean
    applied?: boolean
  }
  const { respondToApproval, activeThread } = useThreadStore()
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set())

  const handleApprove = (decision: 'accept' | 'decline') => {
    if (activeThread) {
      respondToApproval(item.id, decision)
    }
  }

  const toggleFile = (index: number) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const addCount = content.changes.filter((c) => c.kind === 'add').length
  const modifyCount = content.changes.filter((c) => c.kind === 'modify').length
  const deleteCount = content.changes.filter((c) => c.kind === 'delete').length

  // Convert changes to FileDiff format
  const fileDiffs: FileDiff[] = content.changes.map((change) => ({
    path: change.path,
    kind: change.kind as 'add' | 'modify' | 'delete',
    hunks: change.diff ? parseDiff(change.diff) : [],
  }))

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        content.needsApproval ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-border bg-card'
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">File Changes</span>
        <div className="flex gap-3 text-xs">
          {addCount > 0 && <span className="text-green-500">+{addCount} added</span>}
          {modifyCount > 0 && <span className="text-yellow-500">~{modifyCount} modified</span>}
          {deleteCount > 0 && <span className="text-red-500">-{deleteCount} deleted</span>}
        </div>
      </div>

      <div className="space-y-2">
        {fileDiffs.map((diff, i) => (
          <DiffView
            key={i}
            diff={diff}
            collapsed={!expandedFiles.has(i)}
            onToggleCollapse={() => toggleFile(i)}
          />
        ))}
      </div>

      {content.needsApproval && (
        <div className="mt-4 flex gap-2">
          <button
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => handleApprove('accept')}
          >
            Apply Changes
          </button>
          <button
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
            onClick={() => handleApprove('decline')}
          >
            Decline
          </button>
        </div>
      )}

      {content.applied && (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-500">
          <span>✓</span>
          <span>Changes applied successfully</span>
        </div>
      )}
    </div>
  )
}
