/**
 * SetupView - Configuration view for multi-agent mode
 *
 * Features:
 * - Working directory selection
 * - Workflow mode selection (Plan Mode / Custom)
 * - Global configuration (model, timeout, approval policy)
 */

import { useEffect, useState, useRef } from 'react'
import { FolderOpen, Workflow, Settings, ArrowRight, X, Sparkles } from 'lucide-react'
import { useMultiAgentStore } from '../../stores/multi-agent-v2'
import type { AgentConfigOverrides } from '../../stores/multi-agent-v2'
import { createPlanModeWorkflow } from '../../lib/workflows/plan-mode'
import { useModelsStore } from '../../stores/models'
import { useProjectsStore } from '../../stores/projects'
import { cn } from '../../lib/utils'

interface SetupViewProps {
  onComplete: () => void
}

// Helper: resolve project ID from working directory
function resolveProjectId(
  dir: string,
  projects: Array<{ id: string; path: string }>,
  selectedProjectId: string
): string {
  const normalizedDir = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  const candidates = projects.filter((project) => {
    const normalizedPath = project.path.replace(/\\/g, '/').replace(/\/+$/, '')
    return normalizedDir === normalizedPath || normalizedDir.startsWith(`${normalizedPath}/`)
  })

  if (candidates.length === 0) {
    return selectedProjectId || ''
  }

  candidates.sort((a, b) => b.path.length - a.path.length)
  return candidates[0].id
}

export function SetupView({ onComplete }: SetupViewProps) {
  const { setWorkingDirectory, setConfig, startWorkflow, clearWorkflow, clearAgents } = useMultiAgentStore()
  const { models, fetchModels, isLoading: isModelsLoading } = useModelsStore()
  const { projects, selectedProjectId } = useProjectsStore()

  // Form state
  const [workingDir, setWorkingDir] = useState<string>('')
  const [workflowMode, setWorkflowMode] = useState<'plan' | 'custom'>('plan')
  const [globalConfig, setGlobalConfig] = useState<AgentConfigOverrides>({
    model: '',
    approvalPolicy: 'on-request',
    timeout: 300, // seconds
  })

  const [isStarting, setIsStarting] = useState(false)
  const [isValidatingDir, setIsValidatingDir] = useState(false)
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [taskDescription, setTaskDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dirError, setDirError] = useState<string | null>(null)
  const taskInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void fetchModels()
  }, [fetchModels])

  // Auto-focus task input when dialog opens
  useEffect(() => {
    if (showTaskDialog && taskInputRef.current) {
      taskInputRef.current.focus()
    }
  }, [showTaskDialog])

  const handleSelectDirectory = async () => {
    try {
      // Use Tauri dialog to select directory
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择工作目录',
      })

      if (selected && typeof selected === 'string') {
        // Clear previous errors
        setDirError(null)
        setIsValidatingDir(true)

        try {
          // Validate directory exists and is accessible
          const { exists, stat } = await import('@tauri-apps/plugin-fs')
          const dirExists = await exists(selected)

          if (!dirExists) {
            setDirError('选择的目录不存在')
            setWorkingDir('')
            return
          }

          // Check if it's actually a directory
          const statResult = await stat(selected)
          if (!statResult.isDirectory) {
            setDirError('选择的路径不是目录')
            setWorkingDir('')
            return
          }

          setWorkingDir(selected)
          setDirError(null)
        } catch (validationError) {
          console.error('Directory validation failed:', validationError)
          setDirError(`无法访问目录: ${validationError instanceof Error ? validationError.message : String(validationError)}`)
          setWorkingDir('')
        } finally {
          setIsValidatingDir(false)
        }
      }
    } catch (err) {
      console.error('Failed to select directory:', err)
      setDirError(`选择目录失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleStart = () => {
    if (!workingDir) {
      setError('请选择工作目录')
      return
    }
    setError(null)

    if (workflowMode === 'plan') {
      // Show task dialog for Plan Mode
      setShowTaskDialog(true)
    } else {
      // Custom mode - clear old state first, then apply config and complete
      clearWorkflow()
      clearAgents()
      setConfig({
        model: globalConfig.model,
        approvalPolicy: globalConfig.approvalPolicy,
        timeout: globalConfig.timeout,
        projectId: resolveProjectId(workingDir, projects, selectedProjectId ?? ''),
      })
      setWorkingDirectory(workingDir)
      onComplete()
    }
  }

  const handleTaskSubmit = async () => {
    if (!taskDescription.trim()) {
      setError('请输入任务描述')
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      // Clear old state before starting new workflow
      clearWorkflow()
      clearAgents()

      // Apply global config and working directory
      setConfig({
        model: globalConfig.model,
        approvalPolicy: globalConfig.approvalPolicy,
        timeout: globalConfig.timeout,
        projectId: resolveProjectId(workingDir, projects, selectedProjectId ?? ''),
      })
      setWorkingDirectory(workingDir)

      // Create Plan Mode workflow
      const workflow = createPlanModeWorkflow(taskDescription, {
        workingDirectory: workingDir,
        userTask: taskDescription,
        globalConfig: globalConfig as Record<string, unknown>,
      })

      // Start workflow - this will initialize the first phase
      // Note: startWorkflow is async but we wait for it to complete initial setup
      await startWorkflow(workflow)

      setShowTaskDialog(false)
      onComplete()
    } catch (err) {
      console.error('Failed to start multi-agent mode:', err)
      setError(`启动失败：${err instanceof Error ? err.message : String(err)}`)
      setIsStarting(false)
    }
  }

  const handleTaskDialogClose = () => {
    setShowTaskDialog(false)
    setTaskDescription('')
    setError(null)
  }

  return (
    <>
      {/* Task Input Dialog */}
      {showTaskDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-500 to-indigo-500">
              <div className="flex items-center space-x-3">
                <Sparkles className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">描述您的任务</h3>
              </div>
              <button
                onClick={handleTaskDialogClose}
                className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                详细描述您希望多智能体系统完成的任务，系统将自动规划并执行 4 阶段工作流。
              </p>
              <textarea
                ref={taskInputRef}
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="例如：为项目添加用户认证功能，包括登录、注册和密码重置..."
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) {
                    void handleTaskSubmit()
                  }
                }}
              />
              <p className="text-xs text-gray-400 mt-2">
                提示：按 ⌘+Enter 快速提交
              </p>

              {/* Error Display */}
              {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={handleTaskDialogClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => void handleTaskSubmit()}
                disabled={!taskDescription.trim() || isStarting}
                className={cn(
                  'px-6 py-2 rounded-lg font-medium transition-all flex items-center space-x-2',
                  !taskDescription.trim() || isStarting
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                )}
              >
                {isStarting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>启动中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>开始工作流</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Setup View */}
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="w-full max-w-2xl mx-4">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 text-white rounded-2xl mb-4">
              <Workflow className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">多智能体模式配置</h1>
            <p className="text-gray-600">
              配置工作环境和工作流模式，开始多智能体协作
            </p>
          </div>

        {/* Configuration Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-8">
          {/* Step 1: Working Directory */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <FolderOpen className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900">1. 工作目录</h2>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              选择代理执行任务的工作目录
            </p>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                value={workingDir}
                readOnly
                placeholder="点击按钮选择目录..."
                className={cn(
                  "flex-1 px-4 py-2 border rounded-lg bg-gray-50 text-gray-900",
                  dirError ? "border-red-300 focus:border-red-500" : "border-gray-300"
                )}
              />
              <button
                onClick={() => void handleSelectDirectory()}
                disabled={isValidatingDir}
                className={cn(
                  "px-4 py-2 rounded-lg transition-colors flex items-center space-x-2",
                  isValidatingDir
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                )}
              >
                {isValidatingDir ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>验证中...</span>
                  </>
                ) : (
                  <span>选择目录</span>
                )}
              </button>
            </div>
            {/* Directory Error Display */}
            {dirError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{dirError}</p>
              </div>
            )}
            {/* Success indicator */}
            {workingDir && !dirError && (
              <div className="mt-2 flex items-center space-x-2 text-sm text-green-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>目录已验证</span>
              </div>
            )}
          </div>

          {/* Step 2: Workflow Mode */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Workflow className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900">2. 工作流模式</h2>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              选择工作流执行模式
            </p>
            <div className="space-y-3">
              {/* Plan Mode Option */}
              <button
                onClick={() => setWorkflowMode('plan')}
                className={cn(
                  'w-full p-4 border-2 rounded-lg text-left transition-all',
                  workflowMode === 'plan'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Plan Mode（推荐）
                    </h3>
                    <p className="text-sm text-gray-600">
                      4 阶段结构化工作流：探索 → 设计 → 审查 → 实施
                    </p>
                  </div>
                  {workflowMode === 'plan' && (
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 ml-3">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </button>

              {/* Custom Mode Option */}
              <button
                onClick={() => setWorkflowMode('custom')}
                className={cn(
                  'w-full p-4 border-2 rounded-lg text-left transition-all',
                  workflowMode === 'custom'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      自定义模式
                    </h3>
                    <p className="text-sm text-gray-600">
                      手动创建和管理代理，自由组织工作流
                    </p>
                  </div>
                  {workflowMode === 'custom' && (
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 ml-3">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Step 3: Global Configuration */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Settings className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900">3. 全局配置</h2>
            </div>
            <div className="space-y-4">
              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  默认模型
                </label>
                <select
                  value={globalConfig.model}
                  onChange={(e) =>
                    setGlobalConfig({ ...globalConfig, model: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                >
                  <option value="">{isModelsLoading ? '加载模型中...' : '使用默认模型'}</option>
                  {models.length > 0 ? (
                    models.map((model) => (
                      <option key={model.id} value={model.model}>
                        {model.displayName || model.model}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="claude-sonnet-4-20250514">Claude Sonnet 4.5（推荐）</option>
                      <option value="claude-opus-4-20250514">Claude Opus 4.5（最强）</option>
                      <option value="claude-haiku-4-20250514">Claude Haiku 4.5（快速）</option>
                    </>
                  )}
                </select>
              </div>

              {/* Approval Policy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  审批策略
                </label>
                <select
                  value={globalConfig.approvalPolicy}
                  onChange={(e) =>
                    setGlobalConfig({
                      ...globalConfig,
                      approvalPolicy: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                >
                  <option value="on-request">每次变更需审批（最安全）</option>
                  <option value="on-failure">仅失败时审批（更快捷）</option>
                  <option value="untrusted">不受信任项目审批</option>
                  <option value="never">从不审批（高风险）</option>
                </select>
              </div>

              {/* Timeout */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  超时时间（秒）
                </label>
                <input
                  type="number"
                  value={globalConfig.timeout ?? 300}
                  onChange={(e) =>
                    setGlobalConfig({
                      ...globalConfig,
                      timeout: parseInt(e.target.value),
                    })
                  }
                  min="60"
                  max="3600"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex items-center justify-end space-x-4">
          <button
            onClick={handleStart}
            disabled={!workingDir || isStarting || isValidatingDir || !!dirError}
            className={cn(
              'px-6 py-3 rounded-lg font-semibold transition-all flex items-center space-x-2',
              !workingDir || isStarting || isValidatingDir || dirError
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg hover:shadow-xl'
            )}
          >
            {isStarting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>启动中...</span>
              </>
            ) : (
              <>
                <span>开始协作</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>

        {/* Error Display */}
        {error && !showTaskDialog && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>
            提示：Plan Mode 适合复杂任务，系统会自动规划并执行 4 个阶段的工作流
          </p>
        </div>
        </div>
      </div>
    </>
  )
}
