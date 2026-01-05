import { useRef, useEffect, useState, useCallback } from 'react'
import { X, Paperclip, Image as ImageIcon, StopCircle, ArrowUp, Terminal, FileCode, Brain, Wrench, AlertCircle, ChevronDown, ChevronRight, ExternalLink, ListChecks, Circle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useThreadStore, type AnyThreadItem, type PlanStep } from '../../stores/thread'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import { useSettingsStore } from '../../stores/settings'
import { useAppStore } from '../../stores/app'
import { Markdown } from '../ui/Markdown'
import { DiffView, parseDiff, type FileDiff } from '../ui/DiffView'
import { SlashCommandPopup } from './SlashCommandPopup'
import { FileMentionPopup } from './FileMentionPopup'
import { type SlashCommand } from '../../lib/slashCommands'
import { type FileEntry } from '../../lib/api'
import { executeCommand } from '../../lib/commandExecutor'
import { useToast } from '../ui/Toast'
import { serverApi, projectApi } from '../../lib/api'

// Maximum height for the textarea (in pixels)
const MAX_TEXTAREA_HEIGHT = 200

// Maximum lines before truncating output
const MAX_OUTPUT_LINES = 50

// Format timestamp for display
function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Truncate output and return truncation info
function truncateOutput(output: string, maxLines: number = MAX_OUTPUT_LINES): { text: string; truncated: boolean; omittedLines: number } {
  const lines = output.split('\n')
  if (lines.length <= maxLines) {
    return { text: output, truncated: false, omittedLines: 0 }
  }
  const truncatedText = lines.slice(0, maxLines).join('\n')
  return { text: truncatedText, truncated: true, omittedLines: lines.length - maxLines }
}

export function ChatView() {
  const { items, itemOrder, turnStatus, sendMessage, interrupt, addInfoItem } = useThreadStore()
  const { shouldFocusInput, clearFocusInput } = useAppStore()
  const { showToast } = useToast()
  const { setSettingsOpen, setSettingsTab, setSidebarTab } = useAppStore()
  const settings = useSettingsStore((state) => state.settings)
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const projects = useProjectsStore((state) => state.projects)
  const fetchSessions = useSessionsStore((state) => state.fetchSessions)
  const selectSession = useSessionsStore((state) => state.selectSession)
  const resumeThread = useThreadStore((state) => state.resumeThread)
  const startThread = useThreadStore((state) => state.startThread)
  const [inputValue, setInputValue] = useState('')
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [showSlashCommands, setShowSlashCommands] = useState(false)
  const [showFileMention, setShowFileMention] = useState(false)
  const [fileMentionQuery, setFileMentionQuery] = useState('')
  const [mentionStartPos, setMentionStartPos] = useState(-1)
  const [autoScroll, setAutoScroll] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Show slash command popup when typing starts with /
  useEffect(() => {
    if (inputValue.startsWith('/') && !inputValue.includes(' ')) {
      setShowSlashCommands(true)
    } else {
      setShowSlashCommands(false)
    }
  }, [inputValue])

  // Detect @ file mention trigger
  useEffect(() => {
    const cursorPos = inputRef.current?.selectionStart ?? inputValue.length

    // Find the last @ before cursor
    const textBeforeCursor = inputValue.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex >= 0) {
      // Check if @ is at start or preceded by whitespace
      const charBefore = lastAtIndex > 0 ? inputValue[lastAtIndex - 1] : ' '
      if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
        // Extract query after @
        const query = textBeforeCursor.slice(lastAtIndex + 1)
        // Only show if no space in query (still typing the mention)
        if (!query.includes(' ')) {
          setShowFileMention(true)
          setFileMentionQuery(query)
          setMentionStartPos(lastAtIndex)
          return
        }
      }
    }

    setShowFileMention(false)
    setFileMentionQuery('')
    setMentionStartPos(-1)
  }, [inputValue])

  // Handle slash command selection
  const handleSlashCommandSelect = useCallback((command: SlashCommand) => {
    setInputValue(`/${command.name} `)
    setShowSlashCommands(false)
    inputRef.current?.focus()
  }, [])

  // Handle file mention selection
  const handleFileMentionSelect = useCallback((file: FileEntry) => {
    if (mentionStartPos >= 0) {
      // Replace @query with @filepath
      // Calculate the end position of the current query (@ + query text)
      const queryEndPos = mentionStartPos + 1 + fileMentionQuery.length
      const before = inputValue.slice(0, mentionStartPos)
      const after = inputValue.slice(queryEndPos)
      const newValue = `${before}@${file.path} ${after}`
      setInputValue(newValue)

      // Move cursor after the inserted path
      setTimeout(() => {
        if (inputRef.current) {
          const newPos = mentionStartPos + file.path.length + 2 // @ + path + space
          inputRef.current.setSelectionRange(newPos, newPos)
          inputRef.current.focus()
        }
      }, 0)
    }
    setShowFileMention(false)
    setFileMentionQuery('')
    setMentionStartPos(-1)
  }, [inputValue, mentionStartPos, fileMentionQuery])

  // Auto-scroll to bottom when new messages or deltas arrive
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [itemOrder, items, autoScroll])

  const handleScroll = useCallback(() => {
    const container = scrollAreaRef.current
    if (!container) return
    const threshold = 120
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    setAutoScroll(distanceFromBottom < threshold)
  }, [])

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

  const { clearThread, tokenUsage, activeThread } = useThreadStore()

  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text && attachedImages.length === 0) return
    if (turnStatus === 'running' && !text.startsWith('/')) return

    setInputValue('')
    setAttachedImages([])
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    // Check if it's a slash command
    if (text.startsWith('/')) {
      try {
        const result = await executeCommand(text, {
          clearThread,
          sendMessage: async (msg, images) => {
            await sendMessage(msg, images)
          },
          showToast: (message, type) => {
            showToast(message, type)
          },
          addInfoItem,
          openSettingsTab: (tab) => {
            setSettingsTab(tab)
            setSettingsOpen(true)
          },
          startNewSession: async () => {
            if (!selectedProjectId) {
              showToast('Please select a project first', 'error')
              return
            }
            const project = projects.find((p) => p.id === selectedProjectId)
            if (!project) return

            clearThread()
            selectSession(null)
            await startThread(
              selectedProjectId,
              project.path,
              settings.model,
              settings.sandboxMode,
              settings.approvalPolicy
            )
            await fetchSessions(selectedProjectId)
            setSidebarTab('sessions')
            showToast('New session started', 'success')
          },
          resumeSession: async (sessionId) => {
            if (!sessionId) {
              setSidebarTab('sessions')
              showToast('Select a session to resume', 'info')
              return
            }
            selectSession(sessionId)
            await resumeThread(sessionId)
            showToast('Session resumed', 'success')
          },
          showStatus: () => {
            const parts = [
              `Model: ${settings.model || 'default'}`,
              `Approval: ${settings.approvalPolicy}`,
              `Sandbox: ${settings.sandboxMode}`,
              `Tokens: ${tokenUsage.totalTokens}`,
              activeThread ? `Thread: ${activeThread.id}` : 'Thread: none',
            ]
            addInfoItem('Status', parts.join('\n'))
          },
          showDiff: async () => {
            if (!selectedProjectId) {
              showToast('Select a project first', 'error')
              return
            }
            const project = projects.find((p) => p.id === selectedProjectId)
            if (!project) return

            try {
              const diff = await projectApi.getGitDiff(project.path)
              if (!diff.isGitRepo) {
                addInfoItem('Git diff', 'Not inside a git repository.')
                return
              }
              addInfoItem('Git diff', diff.diff || '(no changes)')
            } catch (error) {
              addInfoItem('Git diff', `Failed to compute diff: ${String(error)}`)
            }
          },
          listSkills: async () => {
            if (!selectedProjectId) {
              showToast('Select a project first', 'error')
              return
            }
            const project = projects.find((p) => p.id === selectedProjectId)
            if (!project) return
            try {
              const response = await serverApi.listSkills([project.path])
              const lines = response.data.flatMap((entry) =>
                entry.skills.map((skill) => `- ${skill.name}: ${skill.description}`)
              )
              addInfoItem('Skills', lines.length ? lines.join('\n') : 'No skills found.')
            } catch (error) {
              addInfoItem('Skills', `Failed to load skills: ${String(error)}`)
            }
          },
          listMcp: async () => {
            try {
              const response = await serverApi.listMcpServers()
              const lines = response.data.map((server) => {
                const toolCount = Object.keys(server.tools || {}).length
                return `- ${server.name} (${toolCount} tools)`
              })
              addInfoItem('MCP Servers', lines.length ? lines.join('\n') : 'No MCP servers found.')
            } catch (error) {
              addInfoItem('MCP Servers', `Failed to load MCP servers: ${String(error)}`)
            }
          },
          startReview: async () => {
            if (!activeThread) {
              showToast('No active session', 'error')
              return
            }
            await serverApi.startReview(activeThread.id)
            addInfoItem('Review', 'Review started.')
          },
          logout: async () => {
            await serverApi.logout()
            showToast('Logged out', 'success')
          },
          quit: () => {
            import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
              getCurrentWindow().close()
            })
          },
          insertText: (value) => {
            const textarea = inputRef.current
            if (!textarea) {
              setInputValue((prev) => `${prev}${value}`)
              return
            }
            const start = textarea.selectionStart ?? inputValue.length
            const end = textarea.selectionEnd ?? inputValue.length
            const nextValue = `${inputValue.slice(0, start)}${value}${inputValue.slice(end)}`
            setInputValue(nextValue)
            requestAnimationFrame(() => {
              textarea.focus()
              const cursor = start + value.length
              textarea.setSelectionRange(cursor, cursor)
            })
          },
          openUrl: (url) => {
            import('@tauri-apps/plugin-shell').then(({ open }) => open(url))
          },
        })

        if (result.handled) {
          return
        }
      } catch (error) {
        console.error('Failed to execute command:', error)
        showToast('Failed to execute command', 'error')
      }
    }

    try {
      await sendMessage(text, attachedImages.length > 0 ? attachedImages : undefined)
    } catch (error) {
      console.error('Failed to send message:', error)
      showToast('Failed to send message. Please try again.', 'error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Maximum image size (5MB) and max images count
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024
  const MAX_IMAGES_COUNT = 5

  // Handle image file
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Only image files are supported', 'error')
      return
    }

    // Check file size
    if (file.size > MAX_IMAGE_SIZE) {
      showToast('Image too large (max 5MB)', 'error')
      return
    }

    // Check max images count
    setAttachedImages((prev) => {
      if (prev.length >= MAX_IMAGES_COUNT) {
        showToast(`Maximum ${MAX_IMAGES_COUNT} images allowed`, 'error')
        return prev
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        setAttachedImages((current) => {
          if (current.length >= MAX_IMAGES_COUNT) return current
          return [...current, base64]
        })
      }
      reader.onerror = () => {
        showToast('Failed to read image file', 'error')
      }
      reader.readAsDataURL(file)
      return prev
    })
  }, [showToast])

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
    // Only set isDragging to false if we're actually leaving the container
    // Check if the related target is outside the current target
    const relatedTarget = e.relatedTarget as Node | null
    const currentTarget = e.currentTarget as Node
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setIsDragging(false)
    }
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
          className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-primary/5 via-background/95 to-primary/10 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300"
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="relative pointer-events-none">
            {/* Animated rings */}
            <div className="absolute inset-0 -m-8 rounded-full border-2 border-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-0 -m-4 rounded-full border-2 border-primary/30 animate-pulse" />

            {/* Main content */}
            <div className="relative flex flex-col items-center gap-5 p-10 rounded-3xl bg-card/80 border-2 border-dashed border-primary/50 shadow-2xl shadow-primary/10">
              <div className="relative">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-lg">
                  <ImageIcon size={36} className="text-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                  <span className="text-primary-foreground text-xs font-bold">+</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-foreground mb-1">拖放图片到此处</p>
                <p className="text-sm text-muted-foreground">支持 PNG, JPG, GIF, WebP 格式</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto p-4"
        onDragOver={handleDragOver}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
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
      <div className="p-4 bg-transparent" role="form" aria-label="Message composer">
        <div className="mx-auto max-w-3xl">
          <div
            className={cn(
              "relative rounded-3xl bg-card shadow-lg border border-border/50 p-2 transition-all duration-200",
              isDragging && "scale-[1.02] ring-2 ring-primary ring-offset-2"
            )}
          >
            {/* Slash Command Popup */}
            <SlashCommandPopup
              input={inputValue}
              onSelect={handleSlashCommandSelect}
              onClose={() => setShowSlashCommands(false)}
              isVisible={showSlashCommands}
            />
            {/* File Mention Popup */}
            <FileMentionPopup
              query={fileMentionQuery}
              projectPath={projects.find((p) => p.id === selectedProjectId)?.path ?? ''}
              onSelect={handleFileMentionSelect}
              onClose={() => setShowFileMention(false)}
              isVisible={showFileMention && !!selectedProjectId}
            />
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
              <input
                type="file"
                id="image-upload"
                className="hidden"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = e.target.files
                  if (files) {
                    for (const file of files) {
                      handleImageFile(file)
                    }
                  }
                  // Reset input value to allow re-selecting same file
                  e.target.value = ''
                }}
              />
              <button
                className="mb-2 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
                onClick={() => {
                  document.getElementById('image-upload')?.click()
                }}
                title="Attach images"
                aria-label="Attach images"
              >
                <Paperclip size={20} aria-hidden="true" />
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
                aria-label="Message input"
                aria-describedby="input-hint"
              />

              {turnStatus === 'running' ? (
                <button
                  className="mb-1 h-10 w-10 flex items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground transition-all duration-200"
                  onClick={interrupt}
                  title="Stop generation"
                  aria-label="Stop generation"
                >
                  <StopCircle size={20} aria-hidden="true" />
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
                  aria-label="Send message"
                >
                  <ArrowUp size={20} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          
          <div id="input-hint" className="mt-2 text-center text-[10px] text-muted-foreground/60 select-none">
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
    case 'reasoning':
      return <ReasoningCard item={item} />
    case 'mcpTool':
      return <McpToolCard item={item} />
    case 'webSearch':
      return <WebSearchCard item={item} />
    case 'review':
      return <ReviewCard item={item} />
    case 'info':
      return <InfoCard item={item} />
    case 'error':
      return <ErrorCard item={item} />
    case 'plan':
      return <PlanCard item={item} />
    default:
      console.warn(`Unknown item type: ${(item as AnyThreadItem).type}`)
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
    callId?: string
    command: string | string[]
    cwd: string
    commandActions?: string[]
    needsApproval?: boolean
    approved?: boolean
    output?: string
    stdout?: string
    stderr?: string
    exitCode?: number
    durationMs?: number
    isRunning?: boolean
    reason?: string
    proposedExecpolicyAmendment?: { command: string[] } | null
  }
  const { respondToApproval, activeThread } = useThreadStore()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [showFullOutput, setShowFullOutput] = useState(false)
  const outputRef = useRef<HTMLPreElement>(null)

  // Format command for display
  const commandDisplay = Array.isArray(content.command)
    ? content.command.join(' ')
    : content.command

  // Get output content (prefer output, fallback to stdout)
  const rawOutput = content.output || content.stdout || ''
  const { text: outputContent, truncated: isOutputTruncated, omittedLines } =
    showFullOutput ? { text: rawOutput, truncated: false, omittedLines: 0 } : truncateOutput(rawOutput)

  // Auto-scroll output when streaming
  useEffect(() => {
    if (content.isRunning && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [outputContent, content.isRunning])

  const handleApprove = (
    decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline'
  ) => {
    if (activeThread) {
      respondToApproval(item.id, decision, {
        execpolicyAmendment: content.proposedExecpolicyAmendment,
      })
    }
  }

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
      <div
        className={cn(
          'w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.needsApproval
            ? 'border-l-4 border-l-yellow-500 border-y-border/50 border-r-border/50'
            : content.isRunning
            ? 'border-l-4 border-l-blue-500 border-y-border/50 border-r-border/50'
            : 'border-border/50'
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2.5 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div className={cn(
              "rounded-md p-1 shadow-sm",
              content.isRunning
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "bg-background text-muted-foreground"
            )}>
              <Terminal size={14} className={content.isRunning ? "animate-pulse" : ""} />
            </div>
            <code className="text-xs font-medium text-foreground font-mono truncate max-w-md">
              {commandDisplay}
            </code>
          </div>
          <div className="flex items-center gap-2">
            {content.isRunning && (
              <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Running...
              </span>
            )}
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
            {content.durationMs !== undefined && (
              <span className="text-[10px] text-muted-foreground">
                {content.durationMs < 1000
                  ? `${content.durationMs}ms`
                  : `${(content.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
            <span className="text-muted-foreground text-xs">
              {isExpanded ? '▼' : '▶'}
            </span>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-4">
            {/* Working directory */}
            <div className="text-[11px] text-muted-foreground font-mono mb-3">
              <span className="text-muted-foreground/70">cwd:</span> {content.cwd}
            </div>

            {/* Command Actions Tags */}
            {content.commandActions && content.commandActions.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {content.commandActions.map((action, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border/50"
                  >
                    {action}
                  </span>
                ))}
              </div>
            )}

            {/* Output */}
            {(rawOutput || content.isRunning) && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  Output
                  {content.isRunning && (
                    <span className="text-[9px] normal-case text-blue-500 animate-pulse">
                      streaming...
                    </span>
                  )}
                </div>
                <pre
                  ref={outputRef}
                  className={cn(
                    "max-h-60 overflow-auto rounded-lg p-3 font-mono text-xs scrollbar-thin scrollbar-thumb-border",
                    content.exitCode !== undefined && content.exitCode !== 0
                      ? "bg-red-50/50 dark:bg-red-900/10 text-red-800 dark:text-red-300"
                      : "bg-black/[0.03] dark:bg-white/[0.03] text-muted-foreground"
                  )}
                >
                  {outputContent || (content.isRunning ? '...' : '')}
                </pre>
                {/* Truncation indicator */}
                {isOutputTruncated && !content.isRunning && (
                  <button
                    className="mt-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    onClick={() => setShowFullOutput(true)}
                  >
                    <span className="text-yellow-600 dark:text-yellow-400">...</span>
                    +{omittedLines} lines hidden
                    <span className="text-blue-500 hover:underline">Show all</span>
                  </button>
                )}
                {showFullOutput && rawOutput.split('\n').length > MAX_OUTPUT_LINES && (
                  <button
                    className="mt-1 text-[10px] text-blue-500 hover:underline"
                    onClick={() => setShowFullOutput(false)}
                  >
                    Collapse output
                  </button>
                )}
              </div>
            )}

            {/* Stderr if different from output */}
            {content.stderr && content.stderr !== content.output && (
              <div className="mt-3">
                <div className="mb-1 text-[11px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                  Stderr
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-red-50/50 dark:bg-red-900/10 p-3 font-mono text-xs text-red-800 dark:text-red-300 scrollbar-thin scrollbar-thumb-border">
                  {content.stderr}
                </pre>
              </div>
            )}

            {content.reason && (
              <div className="mt-3 text-xs text-muted-foreground">
                Reason: {content.reason}
              </div>
            )}

            {/* Approval UI */}
            {content.needsApproval && (
              <div className="mt-5 pt-3 border-t border-border/40">
                {/* Primary Actions */}
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                    onClick={() => handleApprove('accept')}
                  >
                    Run Once
                  </button>
                  <button
                    className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors"
                    onClick={() => handleApprove('acceptForSession')}
                  >
                    Allow for Session
                  </button>
                  <button
                    className="rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                    onClick={() => handleApprove('decline')}
                  >
                    Decline
                  </button>
                </div>

                {/* Advanced Options Toggle */}
                {content.proposedExecpolicyAmendment && (
                  <button
                    className="mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    {showAdvanced ? '▼ Hide options' : '▶ More options'}
                  </button>
                )}

                {/* Advanced Actions */}
                {showAdvanced && content.proposedExecpolicyAmendment && (
                  <div className="mt-2 flex gap-2 animate-in slide-in-from-top-2 duration-200">
                    <button
                      className="flex-1 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                      onClick={() => handleApprove('acceptWithExecpolicyAmendment')}
                    >
                      Always Allow (Persistent)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// File Change Card
function FileChangeCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as {
    changes: Array<{ path: string; kind: string; diff: string; oldPath?: string }>
    needsApproval: boolean
    approved?: boolean
    applied?: boolean
    snapshotId?: string
    reason?: string
  }
  const { respondToApproval, activeThread, createSnapshot, revertToSnapshot } = useThreadStore()
  const projects = useProjectsStore((state) => state.projects)
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  const [isReverting, setIsReverting] = useState(false)

  const project = projects.find((p) => p.id === selectedProjectId)

  const handleApplyChanges = async (decision: 'accept' | 'acceptForSession' = 'accept') => {
    if (!activeThread || !project || isApplying) return

    setIsApplying(true)
    try {
      // Create snapshot before applying changes
      const snapshot = await createSnapshot(project.path)

      // Approve the changes with the specific snapshot ID
      await respondToApproval(item.id, decision, { snapshotId: snapshot.id })
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
  const modifyCount = content.changes.filter(
    (c) => c.kind === 'modify' || c.kind === 'rename'
  ).length
  const deleteCount = content.changes.filter((c) => c.kind === 'delete').length

  // Convert changes to FileDiff format
  const fileDiffs: FileDiff[] = content.changes.map((change) => ({
    path: change.path,
    kind: change.kind as 'add' | 'modify' | 'delete' | 'rename',
    oldPath: change.oldPath,
    hunks: change.diff ? parseDiff(change.diff) : [],
    raw: change.diff,
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
          <div className="flex items-center gap-3 text-[10px] font-medium">
            {addCount > 0 && <span className="text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">+{addCount} added</span>}
            {modifyCount > 0 && <span className="text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded">~{modifyCount} modified</span>}
            {deleteCount > 0 && <span className="text-red-600 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">-{deleteCount} deleted</span>}
            {/* Timestamp */}
            <span className="text-muted-foreground/60 font-normal">
              {formatTimestamp(item.createdAt)}
            </span>
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
            {content.reason && (
              <div className="mb-3 text-xs text-muted-foreground">Reason: {content.reason}</div>
            )}
            {/* Primary Actions */}
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                onClick={() => handleApplyChanges('accept')}
                disabled={isApplying}
              >
                {isApplying ? 'Applying...' : 'Apply Changes'}
              </button>
              <button
                className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
                onClick={() => handleApplyChanges('acceptForSession')}
                disabled={isApplying}
              >
                Allow for Session
              </button>
              <button
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
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

// Reasoning Card - Shows AI's thinking process
function ReasoningCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as {
    summary: string[]
    fullContent?: string[]
    isStreaming: boolean
  }
  const [isExpanded, setIsExpanded] = useState(false)
  const [showFullContent, setShowFullContent] = useState(false)

  const hasFullContent = content.fullContent && content.fullContent.length > 0

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
      <div
        className={cn(
          'w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.isStreaming
            ? 'border-l-4 border-l-purple-500 border-y-border/50 border-r-border/50'
            : 'border-border/50'
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border/40 bg-purple-50/50 dark:bg-purple-900/10 px-4 py-2.5 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div className={cn(
              "rounded-md p-1 shadow-sm",
              content.isStreaming
                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                : "bg-background text-muted-foreground"
            )}>
              <Brain size={14} className={content.isStreaming ? "animate-pulse" : ""} />
            </div>
            <span className="text-xs font-medium text-foreground">Reasoning</span>
            {content.isStreaming && (
              <span className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                Thinking...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
            <span className="text-muted-foreground text-xs">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-4 space-y-3">
            {/* View mode toggle - only if fullContent exists */}
            {hasFullContent && (
              <div className="flex items-center gap-2 text-[10px]">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowFullContent(false) }}
                  className={cn(
                    'px-2 py-0.5 rounded transition-colors',
                    !showFullContent ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'text-muted-foreground hover:bg-secondary'
                  )}
                >
                  Summary
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowFullContent(true) }}
                  className={cn(
                    'px-2 py-0.5 rounded transition-colors',
                    showFullContent ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'text-muted-foreground hover:bg-secondary'
                  )}
                >
                  Full Thinking
                </button>
              </div>
            )}

            {/* Summary content */}
            {(!showFullContent || !hasFullContent) && content.summary && content.summary.length > 0 && (
              <div className="space-y-2">
                {content.summary.map((text, i) => (
                  <div key={i} className="text-sm text-muted-foreground leading-relaxed">
                    • {text}
                  </div>
                ))}
              </div>
            )}

            {/* Full content */}
            {showFullContent && hasFullContent && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {content.fullContent!.map((text, i) => (
                  <p key={i} className="text-sm text-foreground/80 leading-relaxed">
                    {text}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collapsed preview */}
        {!isExpanded && content.summary && content.summary.length > 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground truncate">
            {content.summary[0]?.slice(0, 100)}...
          </div>
        )}
      </div>
    </div>
  )
}

// MCP Tool Card - Shows external tool calls
function McpToolCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as {
    callId: string
    server: string
    tool: string
    arguments: unknown
    result?: unknown
    error?: string
    durationMs?: number
    isRunning: boolean
    progress?: string[]
  }
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
      <div
        className={cn(
          'w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.isRunning
            ? 'border-l-4 border-l-cyan-500 border-y-border/50 border-r-border/50'
            : content.error
            ? 'border-l-4 border-l-red-500 border-y-border/50 border-r-border/50'
            : 'border-border/50'
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border/40 bg-cyan-50/50 dark:bg-cyan-900/10 px-4 py-2.5 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div className={cn(
              "rounded-md p-1 shadow-sm",
              content.isRunning
                ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400"
                : "bg-background text-muted-foreground"
            )}>
              <Wrench size={14} className={content.isRunning ? "animate-spin" : ""} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">{content.server}</span>
              <span className="text-muted-foreground/50">/</span>
              <code className="text-xs font-medium text-foreground font-mono">{content.tool}</code>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {content.isRunning && (
              <span className="flex items-center gap-1 text-[10px] text-cyan-600 dark:text-cyan-400">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                Running...
              </span>
            )}
            {content.error && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                Failed
              </span>
            )}
            {!content.isRunning && !content.error && content.durationMs !== undefined && (
              <span className="text-[10px] text-muted-foreground">
                {content.durationMs < 1000
                  ? `${content.durationMs}ms`
                  : `${(content.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
            <span className="text-muted-foreground text-xs">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-4 space-y-3">
            {content.progress && content.progress.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Progress
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {content.progress.map((line: string, i: number) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            )}
            {/* Arguments */}
            {content.arguments !== undefined && content.arguments !== null && Object.keys(content.arguments as object).length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Arguments
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-secondary/50 p-3 font-mono text-xs text-muted-foreground">
                  {JSON.stringify(content.arguments, null, 2)}
                </pre>
              </div>
            )}

            {/* Result */}
            {content.result !== undefined && content.result !== null && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">
                  Result
                </div>
                <pre className="max-h-60 overflow-auto rounded-lg bg-green-50/50 dark:bg-green-900/10 p-3 font-mono text-xs text-foreground">
                  {typeof content.result === 'string'
                    ? (content.result as string)
                    : JSON.stringify(content.result, null, 2)}
                </pre>
              </div>
            )}

            {/* Error */}
            {content.error && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                  Error
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-red-50/50 dark:bg-red-900/10 p-3 font-mono text-xs text-red-800 dark:text-red-300">
                  {content.error}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Web Search Card
function WebSearchCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as {
    query: string
    results?: Array<{ title: string; url: string; snippet: string }>
    isSearching: boolean
  }

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-background p-1 text-muted-foreground shadow-sm">
              <ExternalLink size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">Web Search</span>
          </div>
          <div className="flex items-center gap-2">
            {content.isSearching && (
              <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Searching...
              </span>
            )}
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-muted-foreground">Query: {content.query}</div>
          {content.results && content.results.length > 0 && (
            <div className="space-y-2 text-xs">
              {content.results.map((result, i) => (
                <div key={i} className="rounded-lg border border-border/40 p-3">
                  <div className="font-medium text-foreground">{result.title}</div>
                  <div className="text-muted-foreground truncate">{result.url}</div>
                  <div className="text-muted-foreground mt-1">{result.snippet}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Review Card
function ReviewCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as { phase: 'started' | 'completed'; text: string }
  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
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

// Info Card
function InfoCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as { title: string; details?: string }
  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
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
}

// Error Card - Shows stream errors
function ErrorCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as {
    message: string
    errorType?: string
    httpStatusCode?: number
    willRetry?: boolean
  }

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-l-4 border-l-red-500 border-y-border/50 border-r-border/50 bg-card shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 bg-red-50/50 dark:bg-red-900/10 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-red-100 dark:bg-red-900/30 p-1 text-red-600 dark:text-red-400 shadow-sm">
              <AlertCircle size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">Error</span>
            {content.errorType && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {content.errorType}
              </span>
            )}
            {content.httpStatusCode && (
              <span className="text-[10px] text-muted-foreground">
                HTTP {content.httpStatusCode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {content.willRetry && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                Will retry...
              </span>
            )}
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-red-800 dark:text-red-300 leading-relaxed">
            {content.message}
          </p>
        </div>
      </div>
    </div>
  )
}

// Plan Card - Shows turn plan with step progress
function PlanCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as {
    explanation?: string
    steps: PlanStep[]
    isActive: boolean
  }
  const [isExpanded, setIsExpanded] = useState(true)

  // Get step status icon
  const getStepIcon = (status: PlanStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={14} className="text-green-500" />
      case 'in_progress':
        return <Loader2 size={14} className="text-blue-500 animate-spin" />
      case 'failed':
        return <XCircle size={14} className="text-red-500" />
      default:
        return <Circle size={14} className="text-muted-foreground/50" />
    }
  }

  // Calculate progress
  const completedSteps = content.steps.filter((s) => s.status === 'completed').length
  const totalSteps = content.steps.length
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-300">
      <div
        className={cn(
          'w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.isActive
            ? 'border-l-4 border-l-blue-500 border-y-border/50 border-r-border/50'
            : 'border-border/50'
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border/40 bg-blue-50/50 dark:bg-blue-900/10 px-4 py-2.5 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'rounded-md p-1 shadow-sm',
                content.isActive
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              )}
            >
              <ListChecks size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">
              {content.isActive ? 'Executing Plan' : 'Plan Completed'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {completedSteps}/{totalSteps} steps
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress bar */}
            <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  content.isActive ? 'bg-blue-500' : 'bg-green-500'
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
            <span className="text-muted-foreground text-xs">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-4 space-y-3">
            {/* Explanation */}
            {content.explanation && (
              <p className="text-sm text-muted-foreground mb-3">{content.explanation}</p>
            )}

            {/* Steps */}
            <div className="space-y-2">
              {content.steps.map((step, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-start gap-2.5 py-1.5 px-2 rounded-lg transition-colors',
                    step.status === 'in_progress' && 'bg-blue-50/50 dark:bg-blue-900/10',
                    step.status === 'completed' && 'opacity-70'
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0">{getStepIcon(step.status)}</div>
                  <span
                    className={cn(
                      'text-sm leading-relaxed',
                      step.status === 'completed' && 'line-through text-muted-foreground',
                      step.status === 'in_progress' && 'text-blue-700 dark:text-blue-300 font-medium',
                      step.status === 'failed' && 'text-red-700 dark:text-red-300',
                      step.status === 'pending' && 'text-muted-foreground'
                    )}
                  >
                    {step.step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
