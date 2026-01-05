import { useRef, useEffect, useState, useCallback } from 'react'
import { cn } from '../../lib/utils'
import { useThreadStore, type AnyThreadItem } from '../../stores/thread'
import { useAppStore } from '../../stores/app'
import { Markdown } from '../ui/Markdown'
import { DiffView, parseDiff, type FileDiff } from '../ui/DiffView'

// Maximum height for the textarea (in pixels)
const MAX_TEXTAREA_HEIGHT = 200

export function ChatView() {
  const { items, itemOrder, turnStatus, sendMessage, interrupt } = useThreadStore()
  const { shouldFocusInput, clearFocusInput } = useAppStore()
  const [inputValue, setInputValue] = useState('')
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [itemOrder])

  // Handle focus input trigger from keyboard shortcut
  useEffect(() => {
    if (shouldFocusInput) {
      inputRef.current?.focus()
      clearFocusInput()
    }
  }, [shouldFocusInput, clearFocusInput])

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current
    if (!textarea) return

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'
    // Set the height to scrollHeight, capped at MAX_TEXTAREA_HEIGHT
    const newHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)
    textarea.style.height = `${newHeight}px`
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue, adjustTextareaHeight])

  const handleSend = async () => {
    const text = inputValue.trim()
    if ((!text && attachedImages.length === 0) || turnStatus === 'running') return

    setInputValue('')
    setAttachedImages([])
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    try {
      await sendMessage(text, attachedImages.length > 0 ? attachedImages : undefined)
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

  // Handle image file
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target?.result as string
      setAttachedImages((prev) => [...prev, base64])
    }
    reader.readAsDataURL(file)
  }, [])

  // Handle paste event for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            handleImageFile(file)
          }
          break
        }
      }
    },
    [handleImageFile]
  )

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = e.dataTransfer.files
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          handleImageFile(file)
        }
      }
    },
    [handleImageFile]
  )

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

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
      <div
        className={cn(
          'border-t border-border bg-card p-4 transition-colors',
          isDragging && 'bg-primary/5 border-primary'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mx-auto max-w-3xl">
          {/* Attached Images Preview */}
          {attachedImages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={img}
                    alt={`Attached ${i + 1}`}
                    className="h-16 w-16 rounded-lg object-cover border border-border"
                  />
                  <button
                    className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeImage(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end">
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                className={cn(
                  'w-full min-h-[44px] max-h-[200px] resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none',
                  isDragging && 'border-primary'
                )}
                placeholder={isDragging ? 'Drop image here...' : 'Type a message... (Paste or drop images)'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={turnStatus === 'running'}
              />
            </div>
            {turnStatus === 'running' ? (
              <button
                className="h-[44px] rounded-lg bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                onClick={interrupt}
              >
                Stop
              </button>
            ) : (
              <button
                className="h-[44px] rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={handleSend}
                disabled={!inputValue.trim() && attachedImages.length === 0}
                title="Send message (Enter)"
              >
                Send
              </button>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {turnStatus === 'running' ? (
                'Codex is thinking...'
              ) : (
                <>Shift+Enter for new line • Paste or drag images</>
              )}
            </span>
            {attachedImages.length > 0 && (
              <span>{attachedImages.length} image(s) attached</span>
            )}
          </div>
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
