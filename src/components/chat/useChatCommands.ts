/**
 * useChatCommands - Hook for building command context
 * Extracted from ChatView.tsx to reduce component complexity
 */
import { useCallback, useMemo } from 'react'
import { useThreadStore, type ThreadState, selectFocusedThread } from '../../stores/thread'
import { useProjectsStore, type ProjectsState } from '../../stores/projects'
import { useSessionsStore, type SessionsState } from '../../stores/sessions'
import {
  useSettingsStore,
  mergeProjectSettings,
  getEffectiveWorkingDirectory,
  type SettingsState,
} from '../../stores/settings'
import { useAppStore, type AppState } from '../../stores/app'
import { useToast } from '../ui/Toast'
import { serverApi, projectApi, type ReviewTarget } from '../../lib/api'
import { log } from '../../lib/logger'
import type { CommandContext } from '../../lib/commandExecutor'

export interface UseChatCommandsProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  inputValue: string
  setInputValue: React.Dispatch<React.SetStateAction<string>>
  setShowReviewSelector: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Hook that builds the command context for slash command execution
 */
export function useChatCommands({
  inputRef,
  inputValue,
  setInputValue,
  setShowReviewSelector,
}: UseChatCommandsProps) {
  // Store selectors
  const sendMessage = useThreadStore((state: ThreadState) => state.sendMessage)
  const addInfoItem = useThreadStore((state: ThreadState) => state.addInfoItem)
  const clearThread = useThreadStore((state: ThreadState) => state.clearThread)
  // Use proper selector instead of getter to avoid potential re-render loops
  const focusedThreadState = useThreadStore(selectFocusedThread)
  const activeThread = useMemo(() => focusedThreadState?.thread ?? null, [focusedThreadState])
  const tokenUsage = useMemo(() => focusedThreadState?.tokenUsage ?? { totalTokens: 0, modelContextWindow: null }, [focusedThreadState])
  const startThread = useThreadStore((state: ThreadState) => state.startThread)
  const resumeThread = useThreadStore((state: ThreadState) => state.resumeThread)

  const { showToast } = useToast()
  const setSettingsOpen = useAppStore((state: AppState) => state.setSettingsOpen)
  const setSettingsTab = useAppStore((state: AppState) => state.setSettingsTab)
  const setSidebarTab = useAppStore((state: AppState) => state.setSidebarTab)
  const setKeyboardShortcutsOpen = useAppStore((state: AppState) => state.setKeyboardShortcutsOpen)
  const settings = useSettingsStore((state: SettingsState) => state.settings)
  const selectedProjectId = useProjectsStore((state: ProjectsState) => state.selectedProjectId)
  const projects = useProjectsStore((state: ProjectsState) => state.projects)
  const fetchSessions = useSessionsStore((state: SessionsState) => state.fetchSessions)
  const selectSession = useSessionsStore((state: SessionsState) => state.selectSession)

  const buildCommandContext = useCallback((): CommandContext => ({
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
        const response = await serverApi.listSkills([project.path], false, selectedProjectId)
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
        log.error(`Logout failed: ${error}`, 'ChatCommands')
        showToast('Failed to log out', 'error')
      }
    },
    quit: () => {
      void import('@tauri-apps/api/window')
        .then(async ({ getCurrentWindow }) => {
          await getCurrentWindow().close()
        })
        .catch((error) => {
          log.error(`Failed to close window: ${error}`, 'ChatCommands')
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
          log.error(`Failed to open URL: ${error}`, 'ChatCommands')
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
          log.error(`Failed to open bug report URL: ${error}`, 'ChatCommands')
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
  }), [
    clearThread,
    sendMessage,
    showToast,
    addInfoItem,
    setSettingsTab,
    setSettingsOpen,
    selectedProjectId,
    projects,
    settings,
    selectSession,
    startThread,
    fetchSessions,
    setSidebarTab,
    resumeThread,
    tokenUsage,
    activeThread,
    setKeyboardShortcutsOpen,
    inputRef,
    inputValue,
    setInputValue,
    setShowReviewSelector,
  ])

  return {
    buildCommandContext,
    sendMessage,
    addInfoItem,
    showToast,
    projects,
    selectedProjectId,
    activeThread,
  }
}
