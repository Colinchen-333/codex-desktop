import { useRef, useEffect, useState, useCallback } from 'react'
import { Send, X, Paperclip, Image as ImageIcon, StopCircle, ArrowUp, Terminal, FileCode } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useThreadStore, type AnyThreadItem } from '../../stores/thread'
import { useProjectsStore } from '../../stores/projects'
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
    <div className="flex flex-1 flex-col overflow-hidden relative">
      {/* Drag Overlay */}
      {isDragging && (
        <div 
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm m-4 rounded-2xl border-2 border-dashed border-primary animate-in fade-in duration-200"
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center gap-4 text-primary pointer-events-none">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <ImageIcon size={32} />
            </div>
            <p className="text-xl font-medium">Drop images here</p>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div 
        className="flex-1 overflow-y-auto p-4" 
        onDragOver={handleDragOver}
      >
        <div className="mx-auto max-w-3xl space-y-6 pb-4">
          {itemOrder.map((id) => {
            const item = items.get(id)
            if (!item) return null
            return <MessageItem key={id} item={item} />
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-transparent">
        <div className="mx-auto max-w-3xl">
          <div 
            className={cn(
              "relative rounded-3xl bg-card shadow-lg border border-border/50 p-2 transition-all duration-200",
              isDragging && "scale-[1.02] ring-2 ring-primary ring-offset-2"
            )}
          >
            {/* Attached Images Preview */}
            {attachedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2 pt-2 pb-1">
                {attachedImages.map((img, i) => (
                  <div key={i} className="relative group animate-in zoom-in duration-200">
                    <img
                      src={img}
                      alt={`Attached ${i + 1}`}
                      className="h-14 w-14 rounded-xl object-cover border border-border/50 shadow-sm"
                    />
                    <button
                      className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-background shadow-md text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                      onClick={() => removeImage(i)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 pl-2">
              <button 
                className="mb-2 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
                onClick={() => {
                  // TODO: Trigger file selection
                }}
                title="Attach images"
              >
                <Paperclip size={20} />
              </button>
              
              <textarea
                ref={inputRef}
                className="flex-1 max-h-[200px] min-h-[44px] resize-none bg-transparent py-3 text-sm focus:outline-none placeholder:text-muted-foreground/70"
                placeholder="Message Codex..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={turnStatus === 'running'}
                rows={1}
              />

              {turnStatus === 'running' ? (
                <button
                  className="mb-1 h-10 w-10 flex items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground transition-all duration-200"
                  onClick={interrupt}
                  title="Stop generation"
                >
                  <StopCircle size={20} />
                </button>
              ) : (
                <button
                  className={cn(
                    "mb-1 h-10 w-10 flex items-center justify-center rounded-full transition-all duration-200 shadow-sm",
                    !inputValue.trim() && attachedImages.length === 0
                      ? "bg-secondary text-muted-foreground cursor-not-allowed opacity-50"
                      : "bg-primary text-primary-foreground hover:scale-105 hover:shadow-md"
                  )}
                  onClick={handleSend}
                  disabled={!inputValue.trim() && attachedImages.length === 0}
                  title="Send message (Enter)"
                >
                  <ArrowUp size={20} />
                </button>
              )}
            </div>
          </div>
          
          <div className="mt-2 text-center text-[10px] text-muted-foreground/60 select-none">
            Codex can make mistakes. Review code before applying.
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
  const content = item.content as { text: string; images?: string[] }
  return (
    <div className="flex justify-end pl-12 animate-in slide-in-from-bottom-2 duration-300">
      <div className="group relative max-w-[85%]">
        <div className="rounded-2xl rounded-tr-sm bg-primary px-5 py-3.5 text-primary-foreground shadow-sm">
          {content.images && content.images.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {content.images.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt={`Attached ${i + 1}`}
                  className="h-32 w-32 rounded-lg object-cover border border-primary-foreground/10 bg-black/20"
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
}

// Agent Message
function AgentMessage({ item }: { item: AnyThreadItem }) {
  const content = item.content as { text: string; isStreaming: boolean }
  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
      <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-card px-6 py-4 shadow-sm border border-border/40">
        <Markdown content={content.text} />
        {content.isStreaming && (
          <div className="mt-2 flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40" />
          </div>
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
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
      <div
        className={cn(
          'w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.needsApproval 
            ? 'border-l-4 border-l-yellow-500 border-y-border/50 border-r-border/50' 
            : 'border-border/50'
        )}
      >
        <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-background p-1 text-muted-foreground shadow-sm">
              <Terminal size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">Command Execution</span>
          </div>
          {content.exitCode !== undefined && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                content.exitCode === 0 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}
            >
              Exit: {content.exitCode}
            </span>
          )}
        </div>

        <div className="p-4">
          <div className="group relative">
            <code className="block rounded-lg bg-secondary/50 px-4 py-3 font-mono text-sm text-foreground border border-border/50">
              {content.command}
            </code>
            <div className="mt-2 text-[11px] text-muted-foreground font-mono px-1">
              cwd: {content.cwd}
            </div>
          </div>

          {content.output && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Output</div>
              <pre className="max-h-60 overflow-auto rounded-lg bg-black/[0.03] p-3 font-mono text-xs text-muted-foreground scrollbar-thin scrollbar-thumb-border">
                {content.output}
              </pre>
            </div>
          )}

          {content.needsApproval && (
            <div className="mt-5 flex gap-3 pt-3 border-t border-border/40">
              <button
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                onClick={() => handleApprove('accept')}
              >
                Run Once
              </button>
              <button
                className="flex-1 rounded-lg bg-secondary px-4 py-2 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors"
                onClick={() => handleApprove('acceptForSession')}
              >
                Always Allow
              </button>
              <button
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                onClick={() => handleApprove('decline')}
              >
                Decline
              </button>
            </div>
          )}
        </div>
      </div>
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
    snapshotId?: string
  }
  const { respondToApproval, activeThread, createSnapshot, revertToSnapshot } = useThreadStore()
  const projects = useProjectsStore((state) => state.projects)
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  const [isReverting, setIsReverting] = useState(false)

  const project = projects.find((p) => p.id === selectedProjectId)

  const handleApplyChanges = async () => {
    if (!activeThread || !project || isApplying) return

    setIsApplying(true)
    try {
      // Create snapshot before applying changes
      const snapshot = await createSnapshot(project.path)

      // Approve the changes with the specific snapshot ID
      await respondToApproval(item.id, 'accept', snapshot.id)
    } catch (error) {
      console.error('Failed to apply changes:', error)
    } finally {
      setIsApplying(false)
    }
  }

  const handleRevert = async () => {
    if (!content.snapshotId || !project) return

    setIsReverting(true)
    try {
      await revertToSnapshot(content.snapshotId, project.path)
    } catch (error) {
      console.error('Failed to revert changes:', error)
    } finally {
      setIsReverting(false)
    }
  }

  const handleDecline = () => {
    if (activeThread) {
      respondToApproval(item.id, 'decline')
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
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
      <div
        className={cn(
          'w-full max-w-3xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.needsApproval 
            ? 'border-l-4 border-l-blue-500 border-y-border/50 border-r-border/50' 
            : 'border-border/50'
        )}
      >
        <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-background p-1 text-muted-foreground shadow-sm">
              <FileCode size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">Proposed Changes</span>
          </div>
          <div className="flex gap-3 text-[10px] font-medium">
            {addCount > 0 && <span className="text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">+{addCount} added</span>}
            {modifyCount > 0 && <span className="text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded">~{modifyCount} modified</span>}
            {deleteCount > 0 && <span className="text-red-600 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">-{deleteCount} deleted</span>}
          </div>
        </div>

        <div className="p-0">
          <div className="divide-y divide-border/30">
            {fileDiffs.map((diff, i) => (
              <DiffView
                key={i}
                diff={diff}
                collapsed={!expandedFiles.has(i)}
                onToggleCollapse={() => toggleFile(i)}
              />
            ))}
          </div>
        </div>

        {content.needsApproval && (
          <div className="bg-secondary/10 p-4 border-t border-border/40">
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                onClick={handleApplyChanges}
                disabled={isApplying}
              >
                {isApplying ? 'Applying...' : 'Apply Changes'}
              </button>
              <button
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                onClick={handleDecline}
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {content.applied && (
          <div className="bg-green-50/50 dark:bg-green-900/10 p-3 border-t border-green-100 dark:border-green-900/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-400">
                <div className="h-4 w-4 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                  <span className="text-[10px]">✓</span>
                </div>
                <span>Changes applied</span>
              </div>
              {content.snapshotId && (
                <button
                  className="rounded-md bg-background/50 px-3 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors border border-transparent hover:border-destructive/20 disabled:opacity-50"
                  onClick={handleRevert}
                  disabled={isReverting}
                >
                  {isReverting ? 'Reverting...' : 'Revert Changes'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
