/**
 * SetupView - Multi-agent mode setup interface
 *
 * Allows users to select a working directory and configure multi-agent options
 * before starting an orchestrator session.
 */

import { useState, useRef, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen, Settings, Play, Bot, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react'
import { useMultiAgentStore } from '../../stores/multi-agent'
import { useSettingsStore } from '../../stores/settings'
import { useThreadStore } from '../../stores/thread'
import { useProjectsStore } from '../../stores/projects'
import { useModelsStore, getModelDisplayName } from '../../stores/models'
import { projectApi } from '../../lib/api'
import { useToast } from '../ui/Toast'
import { log } from '../../lib/logger'
import { cn } from '../../lib/utils'
import { generateOrchestratorInitMessage } from '../../lib/multiAgentPrompt'

export function SetupView() {
  const { showToast } = useToast()
  const config = useMultiAgentStore((state) => state.config)
  const setConfig = useMultiAgentStore((state) => state.setConfig)
  const setPhase = useMultiAgentStore((state) => state.setPhase)
  const setOrchestratorThreadId = useMultiAgentStore((state) => state.setOrchestratorThreadId)
  const globalSettings = useSettingsStore((state) => state.settings)
  // P1 Fix: 统一使用订阅方式获取 store actions，避免 getState() 和订阅状态混用导致的版本不一致
  // 原来 startThread 通过订阅获得，sendMessage 通过 getState 获得，可能导致版本不一致
  const startThread = useThreadStore((state) => state.startThread)
  const sendMessage = useThreadStore((state) => state.sendMessage)
  const closeThread = useThreadStore((state) => state.closeThread)
  // 用于查找或创建项目
  const projects = useProjectsStore((state) => state.projects)
  // 获取可用模型列表
  const models = useModelsStore((state) => state.models)
  const fetchModels = useModelsStore((state) => state.fetchModels)
  const getDefaultModel = useModelsStore((state) => state.getDefaultModel)

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const isStartingRef = useRef(false)

  // 组件挂载时获取模型列表
  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // 如果没有选择模型，使用默认模型
  useEffect(() => {
    if (!config.model && models.length > 0) {
      const defaultModel = getDefaultModel()
      if (defaultModel) {
        setConfig({ model: defaultModel.model })
      }
    }
  }, [config.model, models, getDefaultModel, setConfig])

  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Working Directory',
      })
      if (selected && typeof selected === 'string') {
        setConfig({ cwd: selected })
      }
    } catch (error) {
      log.error(`Failed to select directory: ${error}`, 'SetupView')
      showToast('Failed to select directory', 'error')
    }
  }

  const handleStart = async () => {
    // 使用 ref 防止并发执行（解决快速双击的竞态条件）
    if (isStartingRef.current) {
      return
    }
    isStartingRef.current = true

    if (!config.cwd) {
      showToast('Please select a working directory', 'error')
      isStartingRef.current = false
      return
    }

    // 验证模型配置 - 使用动态获取的模型列表
    // 优先级: config.model > globalSettings.model > 默认模型
    let selectedModel = config.model?.trim() || globalSettings.model?.trim() || ''

    // 如果没有选择模型，使用默认模型
    if (!selectedModel && models.length > 0) {
      const defaultModel = getDefaultModel()
      if (defaultModel) {
        selectedModel = defaultModel.model
      }
    }

    if (!selectedModel) {
      showToast('No available models. Please check your API configuration.', 'error')
      isStartingRef.current = false
      return
    }

    // 验证选择的模型是否在可用列表中
    if (models.length > 0 && !models.some(m => m.model === selectedModel)) {
      log.warn(`[SetupView] Selected model ${selectedModel} not in available models, using default`, 'SetupView')
      const defaultModel = getDefaultModel()
      if (defaultModel) {
        selectedModel = defaultModel.model
      }
    }

    setIsStarting(true)
    let newThreadId: string | null = null
    let initMessageSent = false

    try {
      // 确保工作目录对应的项目存在于数据库中
      // 这是因为 session_metadata 表有外键约束 REFERENCES projects(id)
      let projectId: string

      // 检查是否已有项目使用此路径
      const existingProject = projects.find(p => p.path === config.cwd)
      if (existingProject) {
        projectId = existingProject.id
        console.log('[SetupView] Using existing project:', projectId)
      } else {
        // 创建新项目
        console.log('[SetupView] Creating project for path:', config.cwd)
        const newProject = await projectApi.add(config.cwd)
        projectId = newProject.id
        console.log('[SetupView] Created project:', projectId)
        // 刷新项目列表
        useProjectsStore.getState().fetchProjects()
      }

      // Start orchestrator thread with multi-agent system prompt
      // P1 Fix: Use returned threadId instead of relying on focusedThreadId
      // This eliminates timing issues where focusedThreadId might not be set yet
      newThreadId = await startThread(
        projectId,
        config.cwd,
        selectedModel,
        globalSettings.sandboxMode,
        globalSettings.approvalPolicy
      )

      console.log('[SetupView] startThread returned:', newThreadId)

      if (!newThreadId) {
        throw new Error('Failed to create orchestrator thread: no thread ID returned')
      }

      setOrchestratorThreadId(newThreadId)

      // 发送编排器初始化消息，告知其角色和可用工具
      const initMessage = generateOrchestratorInitMessage({
        maxAgents: config.maxAgents,
        timeout: config.timeout,
        cwd: config.cwd,
      })

      // 使用线程的 sendMessage 发送初始化消息
      // P1 Fix: 使用订阅获得的 sendMessage，保持与 startThread 版本一致
      await sendMessage(initMessage, undefined, undefined, newThreadId)
      initMessageSent = true

      setPhase('running')
      showToast('Multi-agent session started', 'success')
    } catch (error) {
      // DEBUG: Log full error
      console.error('[SetupView] Error caught:', error)
      console.error('[SetupView] Error type:', typeof error)
      console.error('[SetupView] Error JSON:', JSON.stringify(error, null, 2))

      // P1 Fix: More granular error handling to distinguish between failure stages
      // and provide appropriate recovery options
      // Handle both Error instances and Tauri error objects
      let errorMsg: string
      if (error instanceof Error) {
        errorMsg = error.message
      } else if (typeof error === 'object' && error !== null) {
        // Tauri errors are often objects with message property
        const errObj = error as Record<string, unknown>
        errorMsg = String(errObj.message || errObj.error || errObj.description || JSON.stringify(error))
      } else {
        errorMsg = String(error)
      }

      if (!newThreadId) {
        // Stage 1 failure: Thread creation failed
        // User can retry - no cleanup needed
        log.error(`[SetupView] Thread creation failed: ${errorMsg}`, 'SetupView')
        // DEBUG: Show full error message in toast
        showToast(`Thread creation failed: ${errorMsg.substring(0, 100)}`, 'error')
        setOrchestratorThreadId(null)
      } else if (!initMessageSent) {
        // Stage 2 failure: Thread created but init message failed
        // P1 Fix: Keep the thread alive and allow retry instead of closing
        // This allows the user to try sending the init message again
        log.error(`[SetupView] Init message failed for thread ${newThreadId}: ${errorMsg}`, 'SetupView')
        showToast('Thread created but initialization failed. Retrying...', 'warning')

        // Attempt to retry sending the init message once
        try {
          const retryMessage = generateOrchestratorInitMessage({
            maxAgents: config.maxAgents,
            timeout: config.timeout,
            cwd: config.cwd,
          })
          // P1 Fix: 使用订阅获得的 sendMessage，保持版本一致性
          await sendMessage(retryMessage, undefined, undefined, newThreadId)

          // Retry succeeded
          setPhase('running')
          showToast('Multi-agent session started (after retry)', 'success')
          return // Early return on success
        } catch (retryError) {
          // Retry also failed, now close the thread
          log.error(`[SetupView] Init message retry also failed: ${retryError}`, 'SetupView')
          showToast('Failed to initialize orchestrator. Please try again.', 'error')
          // P1 Fix: 使用订阅获得的 closeThread，保持版本一致性
          closeThread(newThreadId)
          setOrchestratorThreadId(null)
        }
      } else {
        // Stage 3 failure: Everything succeeded but something else failed
        log.error(`[SetupView] Post-initialization error: ${errorMsg}`, 'SetupView')
        showToast('Multi-agent session started with warnings', 'warning')
        // Don't close the thread - it's already running
        setPhase('running')
        return // Early return - session is actually running
      }
    } finally {
      isStartingRef.current = false
      setIsStarting(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Bot size={32} className="text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Multi-Agent Mode</h1>
          <p className="text-muted-foreground mt-2">
            Start an orchestrator that can spawn and coordinate multiple sub-agents
          </p>
        </div>

        {/* Directory Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Working Directory</label>
          <div className="flex gap-2">
            <div
              className={cn(
                'flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border bg-background',
                config.cwd ? 'border-border' : 'border-dashed border-muted-foreground/30'
              )}
            >
              <FolderOpen size={18} className="text-muted-foreground" />
              <span className={cn('flex-1 truncate', !config.cwd && 'text-muted-foreground')}>
                {config.cwd || 'No directory selected'}
              </span>
            </div>
            <button
              className="px-4 py-3 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              onClick={handleSelectDirectory}
            >
              Browse
            </button>
          </div>
        </div>

        {/* Task Examples Guide */}
        <div className="border border-blue-500/20 rounded-lg bg-blue-500/5 p-3">
          <button
            onClick={() => setShowExamples(!showExamples)}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 w-full"
          >
            <Lightbulb size={14} />
            <span>Good Task Examples</span>
            {showExamples ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showExamples && (
            <div className="mt-3 space-y-2 text-xs">
              <div className="bg-background/50 rounded p-2">
                <p className="font-medium text-foreground/90 mb-1">✓ Code Analysis</p>
                <p className="text-muted-foreground">
                  "Analyze the codebase structure, identify issues, and generate documentation"
                </p>
              </div>
              <div className="bg-background/50 rounded p-2">
                <p className="font-medium text-foreground/90 mb-1">✓ Multi-step Processing</p>
                <p className="text-muted-foreground">
                  "Extract data from logs, parse timestamps, aggregate by hour, generate report"
                </p>
              </div>
              <div className="bg-background/50 rounded p-2">
                <p className="font-medium text-red-500/80 mb-1">✗ Too Vague</p>
                <p className="text-muted-foreground">
                  "Do something useful" — Not specific enough for decomposition
                </p>
              </div>
              <p className="text-blue-600/70 dark:text-blue-400/70 italic pt-1">
                Tip: Clear, multi-step tasks work best with multi-agent mode.
              </p>
            </div>
          )}
        </div>

        {/* Advanced Settings Toggle */}
        <button
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Settings size={14} />
          <span>Advanced Settings</span>
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Advanced Settings */}
        {showAdvanced && (
          <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/20">
            {/* Max Agents */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Max Sub-Agents</label>
                <span className="text-xs text-primary/70">Recommended: 3</span>
              </div>
              <select
                className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                value={config.maxAgents}
                onChange={(e) => setConfig({ maxAgents: parseInt(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} agent{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground/80 bg-blue-500/5 px-2 py-1.5 rounded">
                More agents = better parallelism but higher API costs
              </p>
            </div>

            {/* Timeout */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Task Timeout</label>
                <span className="text-xs text-primary/70">Typical: 5-10 min</span>
              </div>
              <select
                className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                value={config.timeout}
                onChange={(e) => setConfig({ timeout: parseInt(e.target.value) })}
              >
                {[1, 2, 5, 10, 15, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} minute{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground/80 bg-amber-500/5 px-2 py-1.5 rounded">
                Complex tasks may need longer timeouts
              </p>
            </div>

            {/* Model */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Model</label>
                {models.length > 0 && (
                  <span className="text-xs text-primary/70">
                    {models.find(m => m.model === config.model)?.isDefault ? 'Default' : ''}
                  </span>
                )}
              </div>
              <select
                className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                value={config.model}
                onChange={(e) => setConfig({ model: e.target.value })}
                disabled={models.length === 0}
              >
                {models.length === 0 ? (
                  <option value="">Loading models...</option>
                ) : (
                  models.map((m) => (
                    <option key={m.model} value={m.model}>
                      {getModelDisplayName(m)}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        )}

        {/* Start Button */}
        <button
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-4 rounded-lg text-lg font-medium transition-colors',
            config.cwd
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-primary/50 text-primary-foreground/50 cursor-not-allowed'
          )}
          onClick={handleStart}
          disabled={!config.cwd || isStarting}
        >
          {isStarting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary-foreground border-t-transparent" />
              <span>Starting...</span>
            </>
          ) : (
            <>
              <Play size={20} />
              <span>Start Multi-Agent Session</span>
            </>
          )}
        </button>

        {/* Info */}
        <p className="text-xs text-center text-muted-foreground">
          The orchestrator will automatically decompose complex tasks and assign them to specialized sub-agents.
        </p>
      </div>
    </div>
  )
}
