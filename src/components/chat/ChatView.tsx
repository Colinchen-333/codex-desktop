/**
 * ChatView - Main chat interface component
 * Refactored to use modular sub-components for better maintainability
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { X, Paperclip, Image as ImageIcon, StopCircle, ArrowUp } from 'lucide-react'
import { List } from 'react-window'
import type { ListImperativeAPI } from 'react-window'
import { cn } from '../../lib/utils'
import { useThreadStore, type AnyThreadItem } from '../../stores/thread'
import {
  isUserMessageContent,
  isAgentMessageContent,
  isCommandExecutionContent,
  isFileChangeContent,
  isReasoningContent,
  isMcpToolContent,
  isWebSearchContent,
  isInfoContent,
  isPlanContent,
} from '../../lib/typeGuards'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import {
  useSettingsStore,
  mergeProjectSettings,
  getEffectiveWorkingDirectory,
} from '../../stores/settings'
import { useAppStore } from '../../stores/app'
import { SlashCommandPopup } from './SlashCommandPopup'
import { FileMentionPopup } from './FileMentionPopup'
import { type SlashCommand } from '../../lib/slashCommands'
import { type FileEntry } from '../../lib/api'
import { executeCommand } from '../../lib/commandExecutor'
import { useToast } from '../ui/Toast'
import { serverApi, projectApi, type SkillInput, type ReviewTarget } from '../../lib/api'
import { ReviewSelectorDialog } from '../dialogs/ReviewSelectorDialog'
import { log } from '../../lib/logger'

// Import sub-components
import { MessageItem } from './messages'
import { WorkingStatusBar, QueuedMessagesDisplay, RateLimitWarning, InputStatusHint } from './status'
import { validateFilePath } from './utils'
import {
  MAX_TEXTAREA_HEIGHT,
  MAX_IMAGE_SIZE,
  MAX_IMAGES_COUNT,
  MAX_OUTPUT_LINES,
  DEFAULT_ITEM_HEIGHT,
  OVERSCAN_COUNT,
  type VirtualizedRowProps,
} from './types'

// Estimate item height for virtualized list based on content type
function estimateItemHeight(item: AnyThreadItem | undefined): number {
  if (!item) return DEFAULT_ITEM_HEIGHT

  const content = item.content

  switch (item.type) {
    case 'userMessage':
      if (isUserMessageContent(content)) {
        // User messages with images are taller
        const baseHeight = 80
        const imageHeight = (content.images?.length || 0) * 140
        const textLines = (content.text?.split('\n').length || 1) * 24
        return baseHeight + imageHeight + textLines
      }
      return DEFAULT_ITEM_HEIGHT

    case 'agentMessage':
      if (isAgentMessageContent(content)) {
        // Agent messages vary based on text length
        const textLength = content.text?.length || 0
        const estimatedLines = Math.min(Math.ceil(textLength / 80), 20) // Cap at 20 lines
        return 80 + estimatedLines * 24
      }
      return DEFAULT_ITEM_HEIGHT

    case 'commandExecution':
      if (isCommandExecutionContent(content)) {
        // Command execution cards can be tall with output
        const baseHeight = 120
        const outputLines = content.output?.split('\n').length || 0
        const truncatedLines = Math.min(outputLines, MAX_OUTPUT_LINES)
        return baseHeight + truncatedLines * 18 + (content.needsApproval ? 100 : 0)
      }
      return DEFAULT_ITEM_HEIGHT

    case 'fileChange':
      if (isFileChangeContent(content)) {
        // File change cards vary based on number of files
        const baseHeight = 100
        const fileHeight = content.changes?.length * 150 || 0
        return baseHeight + fileHeight
      }
      return DEFAULT_ITEM_HEIGHT

    case 'reasoning':
      if (isReasoningContent(content)) {
        // Reasoning cards can be expanded or collapsed
        const baseHeight = 80
        const summaryLines = (content.summary?.length || 0) * 24
        return baseHeight + summaryLines
      }
      return DEFAULT_ITEM_HEIGHT

    case 'mcpTool':
      if (isMcpToolContent(content)) {
        // MCP tool cards vary based on arguments and results
        const baseHeight = 100
        const argsHeight = content.arguments ? 80 : 0
        const resultHeight = content.result ? 100 : 0
        return baseHeight + argsHeight + resultHeight
      }
      return DEFAULT_ITEM_HEIGHT

    case 'webSearch':
      if (isWebSearchContent(content)) {
        // Web search cards vary based on number of results
        const baseHeight = 80
        const resultHeight = (content.results?.length || 0) * 120
        return baseHeight + resultHeight
      }
      return DEFAULT_ITEM_HEIGHT

    case 'info':
      if (isInfoContent(content)) {
        // Info cards vary based on details
        const baseHeight = 80
        const detailsLines = (content.details?.split('\n').length || 0) * 18
        return baseHeight + detailsLines
      }
      return DEFAULT_ITEM_HEIGHT

    case 'error':
      // Error cards have relatively fixed height
      return 120

    case 'plan':
      if (isPlanContent(content)) {
        // Plan cards vary based on number of steps
        const baseHeight = 100
        const stepHeight = (content.steps?.length || 0) * 40
        const explanationHeight = content.explanation ? 50 : 0
        return baseHeight + stepHeight + explanationHeight
      }
      return DEFAULT_ITEM_HEIGHT

    default:
      return DEFAULT_ITEM_HEIGHT
  }
}

// Virtualized list row component
function VirtualizedRow({ index, style, itemOrder, items }: VirtualizedRowProps) {
  const id = itemOrder[index]
  const item = items[id]

  if (!item) return null

  return (
    <div style={style} className="py-1.5">
      <MessageItem key={id} item={item} />
    </div>
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
  const virtualListRef = useRef<ListImperativeAPI | null>(null) // Virtualized list ref

  // Cache for item heights to avoid recalculating on every scroll
  const itemSizeCache = useRef<Map<string, number>>(new Map())

  // Track previous items to detect which items changed
  const prevItemsRef = useRef<Record<string, AnyThreadItem>>(items)

  // Clear cache only for items that actually changed
  useEffect(() => {
    const prevItems = prevItemsRef.current

    // Find items that were added, removed, or modified
    const currentIds = new Set(Object.keys(items))
    const prevIds = new Set(Object.keys(prevItems))

    // Clear cache for removed items
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        for (const key of itemSizeCache.current.keys()) {
          if (key.startsWith(`${id}-`)) {
            itemSizeCache.current.delete(key)
          }
        }
      }
    }

    // Clear cache for modified items
    for (const id of currentIds) {
      const prevItem = prevItems[id]
      const currentItem = items[id]

      if (prevItem && currentItem) {
        if (
          prevItem.type !== currentItem.type ||
          prevItem.status !== currentItem.status ||
          prevItem.content !== currentItem.content
        ) {
          for (const key of itemSizeCache.current.keys()) {
            if (key.startsWith(`${id}-`)) {
              itemSizeCache.current.delete(key)
            }
          }
        }
      }
    }

    prevItemsRef.current = items
  }, [items])

  // Get item height for virtualized list with caching
  const getItemSize = useCallback(
    (index: number) => {
      const id = itemOrder[index]
      const item = items[id]

      if (!item) return DEFAULT_ITEM_HEIGHT

      const cacheKey = `${id}-${item.type}-${item.status}`
      const cachedHeight = itemSizeCache.current.get(cacheKey)
      if (cachedHeight !== undefined) {
        return cachedHeight
      }

      const height = estimateItemHeight(item)
      itemSizeCache.current.set(cacheKey, height)
      return height
    },
    [itemOrder, items]
  )

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
    const textBeforeCursor = inputValue.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex >= 0) {
      const charBefore = lastAtIndex > 0 ? inputValue[lastAtIndex - 1] : ' '
      if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
        const query = textBeforeCursor.slice(lastAtIndex + 1)
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

      const fullPath = validateFilePath(project.path, file.path)
      if (!fullPath) {
        showToast(`Invalid file path: ${file.path}`, 'error')
        return
      }

      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
      const ext = file.path.toLowerCase().slice(file.path.lastIndexOf('.'))
      if (imageExts.includes(ext)) {
        try {
          const { readFile, stat } = await import('@tauri-apps/plugin-fs')

          const fileInfo = await stat(fullPath)
          if (fileInfo.size > MAX_IMAGE_SIZE) {
            showToast(
              `Image too large: ${(fileInfo.size / 1024 / 1024).toFixed(1)}MB (max 5MB)`,
              'error'
            )
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
          log.error(`Failed to load image: ${error}`, 'ChatView')
          showToast(`Failed to load image: ${file.name}`, 'error')
        }

        if (mentionStartPos >= 0) {
          const queryEndPos = mentionStartPos + 1 + fileMentionQuery.length
          const before = inputValue.slice(0, mentionStartPos)
          const after = inputValue.slice(queryEndPos)
          setInputValue(`${before}${after}`.trim())
        }
      } else {
        if (mentionStartPos >= 0) {
          const queryEndPos = mentionStartPos + 1 + fileMentionQuery.length
          const before = inputValue.slice(0, mentionStartPos)
          const after = inputValue.slice(queryEndPos)

          const needsQuotes = /[\s"'`$\\]/.test(file.path)
          const quotedPath = needsQuotes ? `"${file.path}"` : file.path
          const newValue = `${before}@${quotedPath} ${after}`
          setInputValue(newValue)

          setTimeout(() => {
            if (inputRef.current) {
              const newPos = mentionStartPos + quotedPath.length + 2
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
  const scrollRAFRef = useRef<number | null>(null)
  const lastItemId = itemOrder[itemOrder.length - 1] || ''
  const lastItem = items[lastItemId]
  const lastItemText =
    lastItem?.type === 'agentMessage' && isAgentMessageContent(lastItem.content)
      ? lastItem.content.text.length
      : 0

  useEffect(() => {
    if (autoScroll) {
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current)
      }
      scrollRAFRef.current = requestAnimationFrame(() => {
        const isStreaming = turnStatus === 'running'
        if (virtualListRef.current && itemOrder.length > 0) {
          virtualListRef.current.scrollToRow({
            index: itemOrder.length - 1,
            align: 'end',
            behavior: isStreaming ? 'instant' : 'smooth',
          })
        }
        messagesEndRef.current?.scrollIntoView({
          behavior: isStreaming ? 'instant' : 'smooth',
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
      useAppStore.getState().clearFocusInput()
    }
  }, [shouldFocusInput])

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
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

    setInputValue('')
    setAttachedImages([])
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
                lines.push(
                  `  Tools (${tools.length}): ${tools.length > 0 ? tools.slice(0, 5).join(', ') + (tools.length > 5 ? ` +${tools.length - 5} more` : '') : 'none'}`
                )
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

            let target: ReviewTarget | undefined

            if (args.length > 0) {
              const arg = args.join(' ').trim()

              if (/^[a-f0-9]{7,40}$/i.test(arg)) {
                target = { type: 'commit', sha: arg }
                addInfoItem('Review', `Starting review of commit ${arg}...`)
              } else if (/^[\w\-./]+$/.test(arg) && !arg.includes(' ')) {
                target = { type: 'baseBranch', branch: arg }
                addInfoItem('Review', `Starting review against base branch: ${arg}...`)
              } else {
                target = { type: 'custom', instructions: arg }
                addInfoItem('Review', `Starting review with custom instructions...`)
              }
              await serverApi.startReview(activeThread.id, target)
            } else {
              setShowReviewSelector(true)
              return
            }
          },
          logout: async () => {
            try {
              await serverApi.logout()
              showToast('Logged out', 'success')
            } catch (error) {
              log.error(`Logout failed: ${error}`, 'ChatView')
              showToast('Failed to log out', 'error')
            }
          },
          quit: () => {
            void import('@tauri-apps/api/window')
              .then(async ({ getCurrentWindow }) => {
                await getCurrentWindow().close()
              })
              .catch((error) => {
                log.error(`Failed to close window: ${error}`, 'ChatView')
                showToast('Failed to close application', 'error')
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
            import('@tauri-apps/plugin-shell')
              .then(({ open }) => open(url))
              .catch((error) => {
                log.error(`Failed to open URL: ${error}`, 'ChatView')
                showToast(`Failed to open URL: ${url}`, 'error')
              })
          },
          openHelpDialog: () => {
            setKeyboardShortcutsOpen(true)
          },
          openSessionsPanel: () => {
            setSidebarTab('sessions')
          },
          compactConversation: async (instructions) => {
            const prompt = instructions
              ? `Please summarize our conversation so far: ${instructions}`
              : 'Please summarize our conversation so far and compact the context.'
            await sendMessage(prompt)
          },
          generateBugReport: async () => {
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
            import('@tauri-apps/plugin-shell')
              .then(({ open }) => open(url))
              .catch((error) => {
                log.error(`Failed to open bug report URL: ${error}`, 'ChatView')
                showToast('Failed to open bug report form', 'error')
              })
            addInfoItem(
              'Bug Report',
              `Opening GitHub issue form...\n\nIncluded info:\n- Model: ${model}\n- Platform: ${platform}\n- ${sessionInfo}`
            )
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
        log.error(`Failed to execute command: ${error}`, 'ChatView')
        showToast('Failed to execute command', 'error')
      }
    }

    // Handle ! shell command prefix (like CLI)
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
        log.error(`Failed to run shell command: ${error}`, 'ChatView')
        showToast('Failed to run shell command', 'error')
      }
      return
    }

    try {
      const project = projects.find((p) => p.id === selectedProjectId)

      // Detect skill mentions in the text
      const skillMentionPattern = /(?:^|[\s(])(\$([a-zA-Z][a-zA-Z0-9_-]*))(?=[\s,.):]|$)/g
      const skillMentions: string[] = []
      let match
      while ((match = skillMentionPattern.exec(text)) !== null) {
        skillMentions.push(match[2])
      }

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
          log.warn(`Failed to load skills for mentions: ${error}`, 'ChatView')
        }
      }

      await sendMessage(text, attachedImages.length > 0 ? attachedImages : undefined, skills)
    } catch (error) {
      log.error(`Failed to send message: ${error}`, 'ChatView')
      showToast('Failed to send message. Please try again.', 'error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (showSlashCommands || showFileMention) {
        return
      }
      e.preventDefault()
      void handleSend()
    }
  }

  // Handle image file
  const handleImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        showToast('Only image files are supported', 'error')
        return
      }

      if (file.size > MAX_IMAGE_SIZE) {
        showToast('Image too large (max 5MB)', 'error')
        return
      }

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
    },
    [showToast]
  )

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
  const handleReviewSelect = useCallback(async (target: ReviewTarget) => {
    const currentThread = useThreadStore.getState().activeThread
    if (!currentThread) return
    const targetDesc =
      target.type === 'uncommittedChanges'
        ? 'uncommitted changes'
        : target.type === 'baseBranch'
          ? `branch: ${target.branch}`
          : target.type === 'commit'
            ? `commit: ${target.sha.slice(0, 7)}`
            : 'custom instructions'
    useThreadStore.getState().addInfoItem('Review', `Starting review of ${targetDesc}...`)
    await serverApi.startReview(currentThread.id, target)
  }, [])

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
            <div
              className="absolute inset-0 -m-8 rounded-full border-2 border-primary/20 animate-ping"
              style={{ animationDuration: '2s' }}
            />
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
                <p className="text-xl font-semibold text-foreground mb-1">Drop images here</p>
                <p className="text-sm text-muted-foreground">PNG, JPG, GIF, WebP supported</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages Area - Virtualized */}
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
        <div className="mx-auto max-w-3xl h-full">
          {itemOrder.length > 0 ? (
            <List
              listRef={virtualListRef}
              rowCount={itemOrder.length}
              rowHeight={getItemSize}
              overscanCount={OVERSCAN_COUNT}
              rowProps={{ itemOrder, items } as Omit<VirtualizedRowProps, 'index' | 'style'>}
              defaultHeight={600}
              rowComponent={VirtualizedRow}
              className="overflow-y-auto scrollbar-thin scrollbar-thumb-border"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              No messages yet
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-transparent" role="form" aria-label="Message composer">
        <div className="mx-auto max-w-3xl">
          {/* Rate Limit Warning */}
          <RateLimitWarning />

          {/* CLI-style Working Status */}
          <WorkingStatusBar />

          {/* Queued Messages Display */}
          <QueuedMessagesDisplay />

          <div
            className={cn(
              'relative rounded-2xl bg-card shadow-lg border border-border/40 p-2.5 transition-all duration-150',
              'hover:shadow-xl hover:border-border/60',
              isDragging && 'scale-[1.02] ring-2 ring-primary ring-offset-2'
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
                placeholder={
                  turnStatus === 'running'
                    ? 'Type to queue next message...'
                    : 'Message Codex...'
                }
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                rows={1}
                aria-label="Message input"
                aria-describedby="input-hint"
              />

              {/* Send/Stop button */}
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
                    'h-10 w-10 flex items-center justify-center rounded-full transition-all duration-100 shadow-sm',
                    !inputValue.trim() && attachedImages.length === 0
                      ? 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50'
                      : 'bg-primary text-primary-foreground hover:scale-105 hover:shadow-md'
                  )}
                  onClick={handleSend}
                  disabled={!inputValue.trim() && attachedImages.length === 0}
                  title={turnStatus === 'running' ? 'Queue message' : 'Send message (Enter)'}
                  aria-label={turnStatus === 'running' ? 'Queue message' : 'Send message'}
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
