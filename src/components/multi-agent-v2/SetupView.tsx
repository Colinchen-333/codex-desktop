/**
 * SetupView - Configuration view for multi-agent mode
 *
 * Features:
 * - Working directory selection
 * - Workflow mode selection (Plan Mode / Custom)
 * - Global configuration (model, timeout, approval policy)
 */

import { useState } from 'react'
import { FolderOpen, Workflow, Settings, ArrowRight } from 'lucide-react'
import { useMultiAgentStore } from '../../stores/multi-agent-v2'
import type { AgentConfigOverrides } from '../../stores/multi-agent-v2'
import { createPlanModeWorkflow } from '../../lib/workflows/plan-mode'
import { cn } from '../../lib/utils'

interface SetupViewProps {
  onComplete: () => void
}

export function SetupView({ onComplete }: SetupViewProps) {
  const { setWorkingDirectory, startWorkflow } = useMultiAgentStore()

  // Form state
  const [workingDir, setWorkingDir] = useState<string>('')
  const [workflowMode, setWorkflowMode] = useState<'plan' | 'custom'>('plan')
  const [globalConfig, setGlobalConfig] = useState<AgentConfigOverrides>({
    model: 'sonnet',
    approvalPolicy: 'auto',
    timeout: 300000, // 5 minutes
  })

  const [isStarting, setIsStarting] = useState(false)

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
        setWorkingDir(selected)
      }
    } catch (error) {
      console.error('Failed to select directory:', error)
    }
  }

  const handleStart = async () => {
    if (!workingDir) {
      alert('请选择工作目录')
      return
    }

    setIsStarting(true)
    try {
      // Set working directory
      setWorkingDirectory(workingDir)

      if (workflowMode === 'plan') {
        // Prompt user for task description
        const userTask = prompt('请输入要完成的任务描述：')
        if (!userTask) {
          setIsStarting(false)
          return
        }

        // Create Plan Mode workflow
        const workflow = createPlanModeWorkflow(userTask, {
          workingDirectory: workingDir,
          userTask,
          globalConfig: globalConfig as Record<string, unknown>,
        })

        // Start workflow
        await startWorkflow(workflow)

        onComplete()
      } else {
        // Custom mode - just complete setup
        onComplete()
      }
    } catch (error) {
      console.error('Failed to start multi-agent mode:', error)
      alert(`启动失败：${error instanceof Error ? error.message : String(error)}`)
      setIsStarting(false)
    }
  }

  return (
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
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
              />
              <button
                onClick={handleSelectDirectory}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                选择目录
              </button>
            </div>
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
                  <option value="sonnet">Claude Sonnet 4.5（推荐）</option>
                  <option value="opus">Claude Opus 4.5（最强）</option>
                  <option value="haiku">Claude Haiku 4.5（快速）</option>
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
                  <option value="auto">自动审批（推荐）</option>
                  <option value="manual">手动审批（所有操作）</option>
                  <option value="smart">智能审批（高风险操作）</option>
                </select>
              </div>

              {/* Timeout */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  超时时间（秒）
                </label>
                <input
                  type="number"
                  value={globalConfig.timeout ? globalConfig.timeout / 1000 : 300}
                  onChange={(e) =>
                    setGlobalConfig({
                      ...globalConfig,
                      timeout: parseInt(e.target.value) * 1000,
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
            disabled={!workingDir || isStarting}
            className={cn(
              'px-6 py-3 rounded-lg font-semibold transition-all flex items-center space-x-2',
              !workingDir || isStarting
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

        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>
            提示：Plan Mode 适合复杂任务，系统会自动规划并执行 4 个阶段的工作流
          </p>
        </div>
      </div>
    </div>
  )
}
