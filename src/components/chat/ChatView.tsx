import { useRef, useEffect, useState, useCallback, memo, useMemo } from 'react'
import { X, Paperclip, Image as ImageIcon, StopCircle, ArrowUp, Terminal, FileCode, Brain, Wrench, AlertCircle, ChevronDown, ChevronRight, ExternalLink, ListChecks, Circle, CheckCircle2, XCircle, Loader2, Clock, Coins } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useThreadStore, type AnyThreadItem, type PlanStep } from '../../stores/thread'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import {
  useSettingsStore,
  mergeProjectSettings,
  getEffectiveWorkingDirectory,
} from '../../stores/settings'
import { useAppStore } from '../../stores/app'
import { useAccountStore } from '../../stores/account'
import { Markdown } from '../ui/Markdown'
import { DiffView, parseDiff, type FileDiff } from '../ui/DiffView'
import { SlashCommandPopup } from './SlashCommandPopup'
import { FileMentionPopup } from './FileMentionPopup'
import { type SlashCommand } from '../../lib/slashCommands'
import { type FileEntry } from '../../lib/api'
import { executeCommand } from '../../lib/commandExecutor'
import { useToast } from '../ui/Toast'
import { serverApi, projectApi, type SkillInput, type ReviewTarget } from '../../lib/api'
import { ReviewSelectorDialog } from '../dialogs/ReviewSelectorDialog'

// Maximum height for the textarea (in pixels)
const MAX_TEXTAREA_HEIGHT = 200

// Maximum lines before truncating output
const MAX_OUTPUT_LINES = 50

// Maximum image size (5MB) and max images count
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_IMAGES_COUNT = 5

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

// Truncate output preserving head and tail (like CLI)
function truncateOutput(output: string, maxLines: number = MAX_OUTPUT_LINES): { text: string; truncated: boolean; omittedLines: number } {
  const lines = output.split('\n')
  if (lines.length <= maxLines) {
    return { text: output, truncated: false, omittedLines: 0 }
  }
  // Keep head (60%) and tail (40%) of max lines
  const headLines = Math.floor(maxLines * 0.6)
  const tailLines = maxLines - headLines
  const omitted = lines.length - maxLines
  const head = lines.slice(0, headLines).join('\n')
  const tail = lines.slice(-tailLines).join('\n')
  const truncatedText = `${head}\n\n... +${omitted} lines omitted ...\n\n${tail}`
  return { text: truncatedText, truncated: true, omittedLines: omitted }
}

// Colorize diff output like CLI
function ColorizedOutput({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        let className = ''
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className = 'text-green-600 dark:text-green-400'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = 'text-red-600 dark:text-red-400'
        } else if (line.startsWith('@@') || line.startsWith('diff --git')) {
          className = 'text-cyan-600 dark:text-cyan-400'
        }
        return (
          <span key={i} className={className}>
            {line}
            {i < lines.length - 1 && '\n'}
          </span>
        )
      })}
    </>
  )
}

export function ChatView() {
  // Use individual selectors for better performance (prevents re-render on unrelated state changes)
  const items = useThreadStore((state) => state.items)
  const itemOrder = useThreadStore((state) => state.itemOrder)
  const turnStatus = useThreadStore((state) => state.turnStatus)
  const sendMessage = useThreadStore((state) => state.sendMessage)
  const interrupt = useThreadStore((state) => state.interrupt)
  const addInfoItem = useThreadStore((state) => state.addInfoItem)
  const shouldFocusInput = useAppStore((state) => state.shouldFocusInput)
  // clearFocusInput is called via getState() to avoid dependency issues
  const { showToast } = useToast()
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setSettingsTab = useAppStore((state) => state.setSettingsTab)
  const setSidebarTab = useAppStore((state) => state.setSidebarTab)
  const setKeyboardShortcutsOpen = useAppStore((state) => state.setKeyboardShortcutsOpen)
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
  const [showReviewSelector, setShowReviewSelector] = useState(false)
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
  const handleFileMentionSelect = useCallback(
    async (file: FileEntry) => {
      const project = projects.find((p) => p.id === selectedProjectId)
      if (!project) return

      // Check if file is an image - mount it instead of text mention
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
      const ext = file.path.toLowerCase().slice(file.path.lastIndexOf('.'))
      if (imageExts.includes(ext)) {
        // Load image file and add to attached images
        try {
          const { readFile, stat } = await import('@tauri-apps/plugin-fs')
          const fullPath = `${project.path}/${file.path}`

          // Pre-check file size before reading to avoid loading large files into memory
          const fileInfo = await stat(fullPath)
          if (fileInfo.size > MAX_IMAGE_SIZE) {
            showToast(`Image too large: ${(fileInfo.size / 1024 / 1024).toFixed(1)}MB (max 5MB)`, 'error')
            return
          }

          const bytes = await readFile(fullPath)
          const blob = new Blob([bytes], { type: `image/${ext.slice(1)}` })
          const reader = new FileReader()
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              setAttachedImages((prev) => [...prev, reader.result as string])
              showToast(`Image attached: ${file.name}`, 'success')
            }
          }
          reader.readAsDataURL(blob)
        } catch (error) {
          console.error('Failed to load image:', error)
          showToast(`Failed to load image: ${file.name}`, 'error')
        }

        // Remove the @query from input
        if (mentionStartPos >= 0) {
          const queryEndPos = mentionStartPos + 1 + fileMentionQuery.length
          const before = inputValue.slice(0, mentionStartPos)
          const after = inputValue.slice(queryEndPos)
          setInputValue(`${before}${after}`.trim())
        }
      } else {
        // Text file - insert as @mention with proper quoting
        if (mentionStartPos >= 0) {
          const queryEndPos = mentionStartPos + 1 + fileMentionQuery.length
          const before = inputValue.slice(0, mentionStartPos)
          const after = inputValue.slice(queryEndPos)

          // Quote path if it contains spaces or special characters
          const needsQuotes = /[\s"'`$\\]/.test(file.path)
          const quotedPath = needsQuotes ? `"${file.path}"` : file.path
          const newValue = `${before}@${quotedPath} ${after}`
          setInputValue(newValue)

          // Move cursor after the inserted path
          setTimeout(() => {
            if (inputRef.current) {
              const newPos = mentionStartPos + quotedPath.length + 2 // @ + path + space
              inputRef.current.setSelectionRange(newPos, newPos)
              inputRef.current.focus()
            }
          }, 0)
        }
      }
      setShowFileMention(false)
      setFileMentionQuery('')
      setMentionStartPos(-1)
    },
    [inputValue, mentionStartPos, fileMentionQuery, projects, selectedProjectId, showToast]
  )

  // RAF-optimized auto-scroll to bottom when new messages or deltas arrive
  // Use 'instant' during streaming to avoid jitter, 'smooth' otherwise
  // IMPORTANT: Only depend on itemOrder.length, not items object, to prevent RAF stacking
  const scrollRAFRef = useRef<number | null>(null)
  const lastItemId = itemOrder[itemOrder.length - 1] || ''
  const lastItem = items[lastItemId]
  const lastItemText = lastItem?.type === 'agentMessage'
    ? (lastItem.content as { text: string }).text.length
    : 0
  useEffect(() => {
    if (autoScroll) {
      // Cancel any pending RAF to avoid stacking
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current)
      }
      // Use RAF for smoother scroll timing aligned with browser repaint
      scrollRAFRef.current = requestAnimationFrame(() => {
        const isStreaming = turnStatus === 'running'
        messagesEndRef.current?.scrollIntoView({
          behavior: isStreaming ? 'instant' : 'smooth'
        })
        scrollRAFRef.current = null
      })
    }
    return () => {
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current)
      }
    }
  }, [itemOrder.length, lastItemText, autoScroll, turnStatus])

  // Throttled scroll handler using RAF for better performance
  const scrollThrottleRef = useRef(false)
  const handleScroll = useCallback(() => {
    if (scrollThrottleRef.current) return
    scrollThrottleRef.current = true
    requestAnimationFrame(() => {
      const container = scrollAreaRef.current
      if (container) {
        const threshold = 120
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight
        setAutoScroll(distanceFromBottom < threshold)
      }
      scrollThrottleRef.current = false
    })
  }, [])

  // Handle focus input trigger from keyboard shortcut
  useEffect(() => {
    if (shouldFocusInput) {
      inputRef.current?.focus()
      // Use getState() to avoid dependency on clearFocusInput
      useAppStore.getState().clearFocusInput()
    }
  }, [shouldFocusInput]) // Only depend on shouldFocusInput (data), not clearFocusInput (function)

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
    // Allow sending slash commands and queue messages while running

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

            // Merge project-specific settings with global settings
            const effectiveSettings = mergeProjectSettings(settings, project.settingsJson)
            const effectiveCwd = getEffectiveWorkingDirectory(project.path, project.settingsJson)

            clearThread()
            selectSession(null)
            await startThread(
              selectedProjectId,
              effectiveCwd,
              effectiveSettings.model,
              effectiveSettings.sandboxMode,
              effectiveSettings.approvalPolicy
            )
            // Get the newly created thread from the store and select it as current session
            const newThread = useThreadStore.getState().activeThread
            if (newThread) {
              selectSession(newThread.id)
            }
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
              if (response.data.length === 0) {
                addInfoItem('MCP Servers', 'No MCP servers configured.')
                return
              }
              const sections = response.data.map((server) => {
                const tools = Object.keys(server.tools || {})
                const resources = server.resources || []
                const templates = server.resourceTemplates || []
                const authStatus = server.authStatus
                  ? typeof server.authStatus === 'object'
                    ? JSON.stringify(server.authStatus)
                    : String(server.authStatus)
                  : 'none'

                const lines = [`## ${server.name}`]
                lines.push(`  Auth: ${authStatus}`)
                lines.push(`  Tools (${tools.length}): ${tools.length > 0 ? tools.slice(0, 5).join(', ') + (tools.length > 5 ? ` +${tools.length - 5} more` : '') : 'none'}`)
                lines.push(`  Resources: ${resources.length}`)
                lines.push(`  Templates: ${templates.length}`)
                return lines.join('\n')
              })
              addInfoItem('MCP Servers', sections.join('\n\n'))
            } catch (error) {
              addInfoItem('MCP Servers', `Failed to load MCP servers: ${String(error)}`)
            }
          },
          startReview: async (args: string[]) => {
            if (!activeThread) {
              showToast('No active session', 'error')
              return
            }

            // Parse review args to determine target type
            // Matches CLI behavior: /review [base branch|commit sha|custom instructions]
            let target: import('../../lib/api').ReviewTarget | undefined

            if (args.length > 0) {
              const arg = args.join(' ').trim()

              // Check if it looks like a commit SHA (7-40 hex chars)
              if (/^[a-f0-9]{7,40}$/i.test(arg)) {
                target = { type: 'commit', sha: arg }
                addInfoItem('Review', `Starting review of commit ${arg}...`)
              }
              // Check if it looks like a branch name (no spaces, common patterns)
              else if (/^[\w\-./]+$/.test(arg) && !arg.includes(' ')) {
                target = { type: 'baseBranch', branch: arg }
                addInfoItem('Review', `Starting review against base branch: ${arg}...`)
              }
              // Otherwise treat as custom instructions
              else {
                target = { type: 'custom', instructions: arg }
                addInfoItem('Review', `Starting review with custom instructions...`)
              }
              await serverApi.startReview(activeThread.id, target)
            } else {
              // No args: show interactive selector dialog
              setShowReviewSelector(true)
              return
            }
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
          openHelpDialog: () => {
            setKeyboardShortcutsOpen(true)
          },
          openSessionsPanel: () => {
            setSidebarTab('sessions')
          },
          compactConversation: async (instructions) => {
            // Send compact request to AI with optional custom instructions
            const prompt = instructions
              ? `Please summarize our conversation so far: ${instructions}`
              : 'Please summarize our conversation so far and compact the context.'
            await sendMessage(prompt)
          },
          generateBugReport: async () => {
            // Generate bug report URL with session info
            const version = 'Codex Desktop'
            const model = settings.model || 'default'
            const platform = navigator.platform
            const sessionInfo = activeThread
              ? `Session: ${activeThread.id}\nTokens: ${tokenUsage.totalTokens}`
              : 'No active session'

            const params = new URLSearchParams({
              labels: 'bug',
              template: 'bug_report.yml',
              version,
              model,
              platform,
              'session-info': sessionInfo,
            })

            const url = `https://github.com/anthropics/claude-code/issues/new?${params.toString()}`
            import('@tauri-apps/plugin-shell').then(({ open }) => open(url))
            addInfoItem('Bug Report', `Opening GitHub issue form...\n\nIncluded info:\n- Model: ${model}\n- Platform: ${platform}\n- ${sessionInfo}`)
          },
          setModelOverride: (model) => {
            useThreadStore.getState().setSessionOverride('model', model)
          },
          setApprovalOverride: (policy) => {
            useThreadStore.getState().setSessionOverride('approvalPolicy', policy)
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

    // Handle ! shell command prefix (like CLI)
    // !<command> runs a local shell command without sending to the model
    if (text.startsWith('!') && text.length > 1) {
      const shellCommand = text.slice(1).trim()
      if (!shellCommand) {
        showToast('Please provide a command after !', 'error')
        return
      }

      if (!activeThread) {
        showToast('No active session', 'error')
        return
      }

      try {
        addInfoItem('Shell Command', `Running: ${shellCommand}`)
        await serverApi.runUserShellCommand(activeThread.id, shellCommand)
      } catch (error) {
        console.error('Failed to run shell command:', error)
        showToast('Failed to run shell command', 'error')
      }
      return
    }

    try {
      // Get project for skill lookup
      const project = projects.find((p) => p.id === selectedProjectId)

      // Detect skill mentions in the text (pattern: $skillName)
      // Only match $ at start of string or after whitespace to avoid false positives
      // in URLs, code blocks, or variable references like ${var}
      const skillMentionPattern = /(?:^|[\s(])(\$([a-zA-Z][a-zA-Z0-9_-]*))(?=[\s,.):]|$)/g
      const skillMentions: string[] = []
      let match
      while ((match = skillMentionPattern.exec(text)) !== null) {
        // match[2] is the skill name without $
        skillMentions.push(match[2])
      }

      // Look up skill metadata if there are mentions
      let skills: SkillInput[] | undefined
      if (skillMentions.length > 0 && project) {
        try {
          const response = await serverApi.listSkills([project.path])
          const allSkills = response.data.flatMap((entry) => entry.skills)
          skills = skillMentions
            .map((name) => {
              const skill = allSkills.find(
                (s) => s.name === name || s.name.toLowerCase() === name.toLowerCase()
              )
              if (skill) {
                return { name: skill.name, path: skill.path }
              }
              return null
            })
            .filter((s): s is SkillInput => s !== null)

          if (skills.length === 0) {
            skills = undefined
          }
        } catch (error) {
          console.warn('Failed to load skills for mentions:', error)
          // Continue without skills
        }
      }

      await sendMessage(
        text,
        attachedImages.length > 0 ? attachedImages : undefined,
        skills
      )
    } catch (error) {
      console.error('Failed to send message:', error)
      showToast('Failed to send message. Please try again.', 'error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't send if slash command or file mention popup is open
    if (e.key === 'Enter' && !e.shiftKey) {
      if (showSlashCommands || showFileMention) {
        // Let the popup handle the Enter key
        return
      }
      e.preventDefault()
      handleSend()
    }
  }

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
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Check if files are being dragged (not just DOM elements)
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
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

  // Handle review target selection from dialog
  const handleReviewSelect = useCallback(
    async (target: ReviewTarget) => {
      // Get fresh activeThread from store to avoid stale closure
      const currentThread = useThreadStore.getState().activeThread
      if (!currentThread) return
      const targetDesc =
        target.type === 'uncommittedChanges'
          ? 'uncommitted changes'
          : target.type === 'baseBranch'
            ? `branch: ${target.branch}`
            : target.type === 'commit'
              ? `commit: ${(target as { sha: string }).sha.slice(0, 7)}`
              : 'custom instructions'
      // Use getState() to avoid addInfoItem dependency
      useThreadStore.getState().addInfoItem('Review', `Starting review of ${targetDesc}...`)
      await serverApi.startReview(currentThread.id, target)
    },
    [] // No dependencies - store functions called via getState()
  )

  // Get current project for review selector
  const currentProject = projects.find((p) => p.id === selectedProjectId)

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative">
      {/* Drag Overlay */}
      {isDragging && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-primary/5 via-background/95 to-primary/10 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
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
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onScroll={handleScroll}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        <div className="mx-auto max-w-3xl space-y-3 pb-2">
          {itemOrder.map((id) => {
            const item = items[id]
            if (!item) return null
            return <MessageItem key={id} item={item} />
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-transparent" role="form" aria-label="Message composer">
        <div className="mx-auto max-w-3xl">
          {/* Rate Limit Warning - Like CLI's "Heads up..." */}
          <RateLimitWarning />

          {/* CLI-style Working Status - Above Input */}
          <WorkingStatusBar />

          {/* Queued Messages Display */}
          <QueuedMessagesDisplay />

          <div
            className={cn(
              "relative rounded-2xl bg-card shadow-lg border border-border/40 p-2.5 transition-all duration-150",
              "hover:shadow-xl hover:border-border/60",
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
                  <div key={i} className="relative group animate-in zoom-in duration-100">
                    <img
                      src={img}
                      alt={`Attached ${i + 1}`}
                      loading="lazy"
                      decoding="async"
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
                placeholder={turnStatus === 'running' ? "Type to queue next message..." : "Message Codex..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                rows={1}
                aria-label="Message input"
                aria-describedby="input-hint"
              />

              {/* Send/Stop button - allow sending queue messages while running */}
              <div className="flex items-center gap-1 mb-1">
                {turnStatus === 'running' && (
                  <button
                    className="h-10 w-10 flex items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground transition-all duration-100"
                    onClick={interrupt}
                    title="Stop generation (Esc)"
                    aria-label="Stop generation"
                  >
                    <StopCircle size={20} aria-hidden="true" />
                  </button>
                )}
                <button
                  className={cn(
                    "h-10 w-10 flex items-center justify-center rounded-full transition-all duration-100 shadow-sm",
                    !inputValue.trim() && attachedImages.length === 0
                      ? "bg-secondary text-muted-foreground cursor-not-allowed opacity-50"
                      : "bg-primary text-primary-foreground hover:scale-105 hover:shadow-md"
                  )}
                  onClick={handleSend}
                  disabled={!inputValue.trim() && attachedImages.length === 0}
                  title={turnStatus === 'running' ? "Queue message" : "Send message (Enter)"}
                  aria-label={turnStatus === 'running' ? "Queue message" : "Send message"}
                >
                  <ArrowUp size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <InputStatusHint />
        </div>
      </div>

      {/* Review Selector Dialog */}
      <ReviewSelectorDialog
        isOpen={showReviewSelector}
        onClose={() => setShowReviewSelector(false)}
        onSelect={handleReviewSelect}
        projectPath={currentProject?.path ?? ''}
      />
    </div>
  )
}

// Message Item Component - Memoized to prevent unnecessary re-renders
interface MessageItemProps {
  item: AnyThreadItem
}

// Shallow compare two objects (O(1) instead of O(n) JSON.stringify)
function shallowContentEqual(prev: unknown, next: unknown): boolean {
  if (prev === next) return true
  if (typeof prev !== 'object' || typeof next !== 'object') return prev === next
  if (prev === null || next === null) return prev === next

  const prevObj = prev as Record<string, unknown>
  const nextObj = next as Record<string, unknown>
  const prevKeys = Object.keys(prevObj)
  const nextKeys = Object.keys(nextObj)

  if (prevKeys.length !== nextKeys.length) return false

  for (const key of prevKeys) {
    const prevVal = prevObj[key]
    const nextVal = nextObj[key]
    // For arrays, compare length and first/last elements (fast heuristic)
    if (Array.isArray(prevVal) && Array.isArray(nextVal)) {
      if (prevVal.length !== nextVal.length) return false
      if (prevVal.length > 0 && prevVal[prevVal.length - 1] !== nextVal[nextVal.length - 1]) return false
    } else if (prevVal !== nextVal) {
      return false
    }
  }
  return true
}

const MessageItem = memo(
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
  },
  // Custom comparison function for better memoization - O(1) shallow compare
  (prevProps, nextProps) => {
    const prev = prevProps.item
    const next = nextProps.item
    // Compare identity first (fastest path)
    if (prev === next) return true
    // Compare key properties
    if (prev.id !== next.id) return false
    if (prev.status !== next.status) return false
    if (prev.type !== next.type) return false
    // Use O(1) shallow comparison instead of O(n) JSON.stringify
    return shallowContentEqual(prev.content, next.content)
  }
)

// User Message
function UserMessage({ item }: { item: AnyThreadItem }) {
  const content = item.content as { text: string; images?: string[] }
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
}

// Agent Message
function AgentMessage({ item }: { item: AnyThreadItem }) {
  const content = item.content as { text: string; isStreaming: boolean }
  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-200">
      <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-card px-5 py-4 shadow-md border border-border/30 backdrop-blur-sm">
        <Markdown content={content.text} />
        {content.isStreaming && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
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
  const { respondToApproval, activeThread, sendMessage } = useThreadStore()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [showFullOutput, setShowFullOutput] = useState(false)
  const [approvalMode, setApprovalMode] = useState<'select' | 'explain' | 'feedback'>('select')
  const [feedbackText, setFeedbackText] = useState('')
  const [explanation, setExplanation] = useState('')
  const [isExplaining, setIsExplaining] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  // Synchronous lock to prevent double-click race condition (state updates are async)
  const isApprovingRef = useRef(false)
  const outputRef = useRef<HTMLPreElement>(null)
  const feedbackInputRef = useRef<HTMLInputElement>(null)

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

  const handleApprove = async (
    decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline'
  ) => {
    // Prevent double-click race condition using synchronous ref check
    // State updates are async, so we use a ref for immediate synchronous check
    if (isApprovingRef.current || !activeThread) return
    isApprovingRef.current = true
    setIsApproving(true)
    try {
      await respondToApproval(item.id, decision, {
        execpolicyAmendment: content.proposedExecpolicyAmendment,
      })
    } finally {
      isApprovingRef.current = false
      setIsApproving(false)
    }
  }

  // Handle explain request - like CLI's 'x' option
  const handleExplain = async () => {
    // CRITICAL: Validate thread hasn't changed since component rendered
    const currentThread = useThreadStore.getState().activeThread
    if (!currentThread || !activeThread || currentThread.id !== activeThread.id) {
      console.error('[CommandExecutionCard] Thread changed before explain, aborting')
      return
    }

    setApprovalMode('explain')
    setIsExplaining(true)
    try {
      // Generate explanation by sending a message to the AI
      const cmd = commandDisplay
      await sendMessage(`Please explain what this command does step by step, including any potential risks:\n\`\`\`\n${cmd}\n\`\`\``)
      setExplanation('Explanation sent to AI. Check the response above.')
    } catch {
      setExplanation('Unable to generate explanation.')
    } finally {
      setIsExplaining(false)
    }
  }

  // Handle feedback submission - like CLI's 'e' option
  const handleFeedbackSubmit = async () => {
    // Prevent double submission
    if (isApproving) return

    // CRITICAL: Validate thread hasn't changed since component rendered
    const currentThread = useThreadStore.getState().activeThread
    if (!currentThread || !activeThread || currentThread.id !== activeThread.id) {
      console.error('[CommandExecutionCard] Thread changed before feedback submit, aborting')
      setFeedbackText('')
      setApprovalMode('select')
      return
    }

    setIsApproving(true)
    try {
      await respondToApproval(item.id, 'decline')
      if (feedbackText.trim()) {
        sendMessage(feedbackText.trim())
      }
    } finally {
      setIsApproving(false)
      setFeedbackText('')
      setApprovalMode('select')
    }
  }

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
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
                    "max-h-60 overflow-auto rounded-lg p-3 font-mono text-xs scrollbar-thin scrollbar-thumb-border whitespace-pre-wrap",
                    content.exitCode !== undefined && content.exitCode !== 0
                      ? "bg-red-50/50 dark:bg-red-900/10 text-red-800 dark:text-red-300"
                      : "bg-black/[0.03] dark:bg-white/[0.03] text-muted-foreground"
                  )}
                >
                  {outputContent ? <ColorizedOutput text={outputContent} /> : (content.isRunning ? '...' : '')}
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
                {/* Explanation Mode - like CLI 'x' option */}
                {approvalMode === 'explain' && (
                  <div className="animate-in fade-in duration-100">
                    <div className="mb-3 text-sm font-medium text-yellow-600 dark:text-yellow-400">
                      Command Explanation:
                    </div>
                    {isExplaining ? (
                      <div className="text-sm text-muted-foreground italic">Generating explanation...</div>
                    ) : (
                      <div className="text-sm text-muted-foreground">{explanation}</div>
                    )}
                    <button
                      className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setApprovalMode('select')}
                    >
                      ← Back to options
                    </button>
                  </div>
                )}

                {/* Feedback Mode - like CLI 'e' option */}
                {approvalMode === 'feedback' && (
                  <div className="animate-in fade-in duration-100">
                    <div className="mb-2 text-sm">Give the model feedback (Enter to submit):</div>
                    <div className="flex gap-2">
                      <input
                        ref={feedbackInputRef}
                        type="text"
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleFeedbackSubmit()}
                        placeholder="Type a reason..."
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                      <button
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        onClick={handleFeedbackSubmit}
                      >
                        Submit
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Default: Decline and continue without feedback
                    </div>
                    <button
                      className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setApprovalMode('select')}
                    >
                      ← Back to options
                    </button>
                  </div>
                )}

                {/* Selection Mode - main approval options */}
                {approvalMode === 'select' && (
                  <>
                    {/* Primary Actions */}
                    <div className="flex gap-2">
                      <button
                        className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                        onClick={() => handleApprove('accept')}
                        title="Keyboard: Y"
                      >
                        Yes (y)
                      </button>
                      <button
                        className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        onClick={() => handleApprove('acceptForSession')}
                        title="Keyboard: A"
                      >
                        Always (a)
                      </button>
                      <button
                        className="rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                        onClick={() => handleApprove('decline')}
                        title="Keyboard: N"
                      >
                        No (n)
                      </button>
                    </div>

                    {/* Secondary Actions - like CLI */}
                    <div className="mt-2 flex gap-2">
                      <button
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
                        onClick={handleExplain}
                        title="Keyboard: X"
                      >
                        Explain (x)
                      </button>
                      <button
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
                        onClick={() => {
                          setApprovalMode('feedback')
                          setTimeout(() => feedbackInputRef.current?.focus(), 100)
                        }}
                        title="Keyboard: E"
                      >
                        Edit/Feedback (e)
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
                      <div className="mt-2 flex gap-2 animate-in slide-in-from-top-2 duration-100">
                        <button
                          className="flex-1 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                          onClick={() => handleApprove('acceptWithExecpolicyAmendment')}
                        >
                          Always Allow (Persistent)
                        </button>
                      </div>
                    )}
                  </>
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
  const { showToast } = useToast()
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  const [isReverting, setIsReverting] = useState(false)
  const [, setIsDeclining] = useState(false)

  // Refs for double-click protection (state updates are async, refs are synchronous)
  const isApplyingRef = useRef(false)
  const isRevertingRef = useRef(false)
  const isDecliningRef = useRef(false)

  const project = projects.find((p) => p.id === selectedProjectId)

  const handleApplyChanges = async (decision: 'accept' | 'acceptForSession' = 'accept') => {
    if (isApplyingRef.current || !activeThread || !project) return
    isApplyingRef.current = true
    setIsApplying(true)

    // Capture thread ID at start to detect if it changes during async operations
    const threadIdAtStart = activeThread.id

    try {
      // Try to create snapshot before applying changes
      let snapshotId: string | undefined
      try {
        const snapshot = await createSnapshot(project.path)
        snapshotId = snapshot.id
      } catch (snapshotError) {
        console.warn('[FileChangeCard] Failed to create snapshot, proceeding without:', snapshotError)
        showToast('Could not create snapshot (changes will still be applied)', 'warning')
      }

      // CRITICAL: Validate thread hasn't changed during snapshot creation
      const currentThread = useThreadStore.getState().activeThread
      if (!currentThread || currentThread.id !== threadIdAtStart) {
        console.error(
          '[FileChangeCard] Thread changed during apply - threadIdAtStart:',
          threadIdAtStart,
          'currentThread:',
          currentThread?.id
        )
        return
      }

      // Approve the changes (with or without snapshot ID)
      await respondToApproval(item.id, decision, { snapshotId })
    } catch (error) {
      console.error('Failed to apply changes:', error)
      showToast('Failed to apply changes', 'error')
    } finally {
      isApplyingRef.current = false
      setIsApplying(false)
    }
  }

  const handleRevert = async () => {
    if (isRevertingRef.current || !content.snapshotId || !project) return
    isRevertingRef.current = true
    setIsReverting(true)
    try {
      await revertToSnapshot(content.snapshotId, project.path)
      showToast('Changes reverted successfully', 'success')
    } catch (error) {
      console.error('Failed to revert changes:', error)
      showToast('Failed to revert changes', 'error')
    } finally {
      isRevertingRef.current = false
      setIsReverting(false)
    }
  }

  const handleDecline = async () => {
    if (isDecliningRef.current || !activeThread) return
    isDecliningRef.current = true
    setIsDeclining(true)
    try {
      await respondToApproval(item.id, 'decline')
    } finally {
      isDecliningRef.current = false
      setIsDeclining(false)
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
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
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

// Reasoning Card - Shows AI's thinking process (only when completed, streaming is shown in WorkingStatusBar)
function ReasoningCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as {
    summary: string[]
    fullContent?: string[]
    isStreaming: boolean
  }
  const [isExpanded, setIsExpanded] = useState(false)
  const [showFullContent, setShowFullContent] = useState(false)

  // Don't show card while streaming - it's displayed in WorkingStatusBar
  if (content.isStreaming) {
    return null
  }

  const hasFullContent = content.fullContent && content.fullContent.length > 0

  // Parse summaries to remove **header** format
  const parsedSummaries = content.summary?.map(parseReasoningSummary) || []

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm transition-all">
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border/40 bg-purple-50/50 dark:bg-purple-900/10 px-4 py-2.5 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div className="rounded-md p-1 shadow-sm bg-background text-muted-foreground">
              <Brain size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">Reasoning</span>
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

            {/* Summary content - parsed to remove **header** */}
            {(!showFullContent || !hasFullContent) && parsedSummaries.length > 0 && (
              <div className="space-y-2">
                {parsedSummaries.map((text, i) => (
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

        {/* Collapsed preview - parsed to remove **header** */}
        {!isExpanded && parsedSummaries.length > 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground truncate">
            {parsedSummaries[0]?.slice(0, 100)}...
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

  // Memoize JSON.stringify to avoid re-computation on every render
  const argumentsJson = useMemo(() =>
    content.arguments ? JSON.stringify(content.arguments, null, 2) : '',
    [content.arguments]
  )
  const resultJson = useMemo(() =>
    content.result && typeof content.result !== 'string'
      ? JSON.stringify(content.result, null, 2)
      : null,
    [content.result]
  )

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
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
            {argumentsJson && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Arguments
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-secondary/50 p-3 font-mono text-xs text-muted-foreground">
                  {argumentsJson}
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
                  {typeof content.result === 'string' ? content.result : resultJson}
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
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
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

// Info Card
function InfoCard({ item }: { item: AnyThreadItem }) {
  const content = item.content as { title: string; details?: string }
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
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
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
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
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
                  'h-full transition-all duration-150',
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

// Parse reasoning summary - strip **header** format like CLI does
function parseReasoningSummary(text: string): string {
  const trimmed = text.trim()
  // Check for **header** format: **High level reasoning**\n\nActual summary
  if (trimmed.startsWith('**')) {
    const closeIdx = trimmed.indexOf('**', 2)
    if (closeIdx > 2) {
      // Found closing **, extract content after it
      const afterHeader = trimmed.slice(closeIdx + 2).trim()
      if (afterHeader) {
        return afterHeader
      }
      // If nothing after header, return the header content without **
      return trimmed.slice(2, closeIdx)
    }
  }
  return trimmed
}

// CLI-style Working Status Bar - Shown above input when AI is working
// Also shows reasoning summary like CLI does
function WorkingStatusBar() {
  const turnStatus = useThreadStore((state) => state.turnStatus)
  const turnTiming = useThreadStore((state) => state.turnTiming)
  // tokenUsage is accessed via getState() in the interval to avoid dependency issues
  const pendingApprovals = useThreadStore((state) => state.pendingApprovals)
  const items = useThreadStore((state) => state.items)
  const itemOrder = useThreadStore((state) => state.itemOrder)
  const escapePending = useAppStore((state) => state.escapePending)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [tokenRate, setTokenRate] = useState(0)
  const prevTokensRef = useRef(0)
  const prevTimeRef = useRef(0)

  // Real-time elapsed time update at 50ms for smoother display (like CLI)
  useEffect(() => {
    if (turnStatus !== 'running' || !turnTiming.startedAt) {
      return
    }

    // Reset refs when starting - use getState() to avoid dependency issues
    const initialTokens = useThreadStore.getState().tokenUsage.totalTokens
    prevTokensRef.current = initialTokens
    prevTimeRef.current = Date.now()
    const interval = setInterval(() => {
      const now = Date.now()
      const startedAt = useThreadStore.getState().turnTiming.startedAt
      if (startedAt) {
        setElapsedMs(now - startedAt)
      }

      // Calculate token rate (tokens per second)
      const timeDelta = (now - prevTimeRef.current) / 1000
      if (timeDelta >= 0.5) { // Update rate every 500ms for stability
        const currentTokens = useThreadStore.getState().tokenUsage.totalTokens
        const tokenDelta = currentTokens - prevTokensRef.current
        if (tokenDelta > 0 && timeDelta > 0) {
          setTokenRate(Math.round(tokenDelta / timeDelta))
        }
        prevTokensRef.current = currentTokens
        prevTimeRef.current = now
      }
    }, 50) // 50ms update for smoother time display
    return () => clearInterval(interval)
  }, [turnStatus, turnTiming.startedAt]) // Remove tokenUsage.totalTokens - use getState() instead

  // Find current reasoning summary (streaming or recent)
  const currentReasoning = useMemo(() => {
    // Look for reasoning items in reverse order (most recent first)
    for (let i = itemOrder.length - 1; i >= 0; i--) {
      const item = items[itemOrder[i]]
      if (item?.type === 'reasoning') {
        const content = item.content as { summary: string[]; isStreaming: boolean }
        if (content.isStreaming && content.summary && content.summary.length > 0) {
          // Get the latest summary line and parse it
          const latestSummary = content.summary[content.summary.length - 1]
          if (latestSummary) {
            return parseReasoningSummary(latestSummary)
          }
        }
      }
    }
    return null
  }, [items, itemOrder])

  if (turnStatus !== 'running') return null

  const formatElapsed = (ms: number) => {
    const secs = Math.floor(ms / 1000)
    const tenths = Math.floor((ms % 1000) / 100)
    return `${secs}.${tenths}s`
  }

  const pendingCount = pendingApprovals.length

  return (
    <div className="mb-3 px-4 py-3 rounded-2xl bg-secondary/40 border border-border/30 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Spinning indicator */}
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          {/* Status text with shimmer or reasoning summary */}
          {currentReasoning ? (
            <span className="text-sm text-muted-foreground truncate">
              {currentReasoning}
            </span>
          ) : (
            <span className="text-sm font-medium shimmer-text">Working</span>
          )}
        </div>
        {/* Right side stats */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {/* Pending approvals badge */}
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-medium">
              {pendingCount} pending
            </span>
          )}
          {/* Token rate */}
          {tokenRate > 0 && (
            <span className="text-[10px] text-muted-foreground/70">
              {tokenRate} tok/s
            </span>
          )}
          {/* Elapsed time */}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock size={12} />
            {formatElapsed(elapsedMs)}
          </span>
          {/* Interrupt hint - CLI-style double-escape */}
          <span className={`text-[10px] transition-colors ${escapePending ? 'text-orange-500 font-medium' : 'text-muted-foreground/70'}`}>
            {escapePending ? 'esc again to interrupt' : 'esc esc to interrupt'}
          </span>
        </div>
      </div>
    </div>
  )
}

// Queued Messages Display - Shows messages waiting to be processed
function QueuedMessagesDisplay() {
  const queuedMessages = useThreadStore((state) => state.queuedMessages)
  const turnStatus = useThreadStore((state) => state.turnStatus)

  // Only show when there are queued messages and turn is running
  if (queuedMessages.length === 0 || turnStatus !== 'running') return null

  return (
    <div className="mb-2 space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="text-xs text-muted-foreground px-2">
        <ListChecks size={12} className="inline mr-1.5" />
        Queued messages ({queuedMessages.length}):
      </div>
      {queuedMessages.map((msg) => (
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
}

// Rate Limit Warning - Shows when approaching quota (like CLI's "Heads up...")
function RateLimitWarning() {
  const rateLimits = useAccountStore((state) => state.rateLimits)
  // refreshRateLimits is called via getState() to avoid dependency issues
  const [dismissed, setDismissed] = useState(false)

  // Refresh rate limits periodically when mounted
  useEffect(() => {
    // Use getState() to avoid dependency on refreshRateLimits function
    useAccountStore.getState().refreshRateLimits()
    const interval = setInterval(() => {
      useAccountStore.getState().refreshRateLimits()
    }, 60000) // Every minute
    return () => clearInterval(interval)
  }, []) // No dependencies - uses getState()

  // Reset dismissed state when limits change significantly
  useEffect(() => {
    setDismissed(false)
  }, [rateLimits?.primary?.usedPercent])

  if (dismissed || !rateLimits) return null

  const primary = rateLimits.primary
  const secondary = rateLimits.secondary

  // Show warning if primary or secondary is above 70%
  const primaryHigh = primary && primary.usedPercent >= 70
  const secondaryHigh = secondary && secondary.usedPercent >= 70

  if (!primaryHigh && !secondaryHigh) return null

  const formatResetTime = (resetsAt?: number | null) => {
    if (!resetsAt) return null
    const now = Date.now()
    const diffMs = resetsAt - now
    if (diffMs <= 0) return 'soon'
    const mins = Math.ceil(diffMs / 60000)
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  const resetTime = formatResetTime(primary?.resetsAt)

  return (
    <div className="mb-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Heads up: Approaching rate limit
          </div>
          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
            {primaryHigh && (
              <div>Primary: {Math.round(primary!.usedPercent)}% used{resetTime && ` • resets in ${resetTime}`}</div>
            )}
            {secondaryHigh && (
              <div>Secondary: {Math.round(secondary!.usedPercent)}% used</div>
            )}
            {rateLimits.planType && (
              <div className="text-muted-foreground/70">Plan: {rateLimits.planType}</div>
            )}
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// Input Status Hint - Shows token usage and shortcuts
function InputStatusHint() {
  const tokenUsage = useThreadStore((state) => state.tokenUsage)
  // Ensure contextWindow is never 0 to prevent NaN/Infinity from division
  const contextWindow = Math.max(tokenUsage.modelContextWindow || 200000, 1)
  const usedPercent = Math.min(tokenUsage.totalTokens / contextWindow, 1)
  const remainingPercent = Math.max(0, Math.round(100 - usedPercent * 100))

  return (
    <div id="input-hint" className="mt-2 flex items-center justify-center gap-3 text-[10px] text-muted-foreground/60 select-none">
      {tokenUsage.totalTokens > 0 && (
        <span className="flex items-center gap-1.5">
          <Coins size={10} />
          {remainingPercent}% context left
        </span>
      )}
      <span>•</span>
      <span>? for shortcuts</span>
    </div>
  )
}
