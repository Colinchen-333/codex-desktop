/**
 * MultiAgentView - Main view for multi-agent mode
 *
 * Features:
 * - Workflow progress header (4 phases)
 * - Agent grid view (grouped by status)
 * - Agent detail panel (right side drawer)
 * - Real-time state updates from multi-agent store
 * - Dark mode support
 * - Quick start dialogs for workflow/agent creation
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { X, Plus, Play, Bot, Search, FileCode, Terminal, FileText, TestTube, AlertTriangle, Loader2 } from 'lucide-react'
import { WorkflowStageHeader } from './WorkflowStageHeader'
import { AgentGridView } from './AgentGridView'
import { AgentDetailPanel } from './AgentDetailPanel'
import { ApprovalDialog } from './ApprovalDialog'
import { useMultiAgentStore, type AgentType } from '../../stores/multi-agent-v2'
import { createPlanModeWorkflow } from '../../lib/workflows/plan-mode'
import { cn } from '../../lib/utils'

// Agent type options for quick creation
const AGENT_TYPE_OPTIONS: { type: AgentType; icon: React.ReactNode; name: string; description: string }[] = [
  { type: 'explore', icon: <Search className="w-5 h-5" />, name: '探索代理', description: '快速探索和分析代码库' },
  { type: 'plan', icon: <FileText className="w-5 h-5" />, name: '计划代理', description: '设计架构和实施方案' },
  { type: 'code-writer', icon: <FileCode className="w-5 h-5" />, name: '编码代理', description: '编写和修改代码' },
  { type: 'bash', icon: <Terminal className="w-5 h-5" />, name: '命令代理', description: '执行 Shell 命令' },
  { type: 'tester', icon: <TestTube className="w-5 h-5" />, name: '测试代理', description: '编写和运行测试' },
]

export function MultiAgentView() {
  const agents = useMultiAgentStore((state) => Object.values(state.agents))
  const config = useMultiAgentStore((state) => state.config)
  const {
    workflow,
    approvePhase,
    rejectPhase,
    cancelAgent,
    pauseAgent,
    resumeAgent,
    startWorkflow,
    spawnAgent,
    retryAgent,
    clearAgents,
    clearWorkflow,
  } = useMultiAgentStore()

  // Track selected agent for detail panel
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Track agent operation state (for cancel/pause/resume feedback)
  const [operatingAgentId, setOperatingAgentId] = useState<string | null>(null)
  const [confirmCancelAgentId, setConfirmCancelAgentId] = useState<string | null>(null)

  // Ref to track if an operation is in flight (for debounce protection)
  const operationInFlightRef = useRef<boolean>(false)

  // Track approval dialog - dismissed phase IDs to prevent re-showing
  const [dismissedApprovalPhaseIds, setDismissedApprovalPhaseIds] = useState<Set<string>>(new Set())

  // Confirmation dialog for starting new workflow when one is already running
  const [showConfirmRestartDialog, setShowConfirmRestartDialog] = useState(false)

  // Quick start dialogs
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false)
  const [showAgentDialog, setShowAgentDialog] = useState(false)
  const [workflowTask, setWorkflowTask] = useState('')
  const [agentTask, setAgentTask] = useState('')
  const [selectedAgentType, setSelectedAgentType] = useState<AgentType>('explore')

  const workflowInputRef = useRef<HTMLTextAreaElement>(null)
  const agentInputRef = useRef<HTMLTextAreaElement>(null)

  const selectedAgent = selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId)
    : null

  // P0-002: Clean up selectedAgentId when the selected agent is deleted
  useEffect(() => {
    if (selectedAgentId && !agents.find((a) => a.id === selectedAgentId)) {
      setSelectedAgentId(null)
    }
  }, [selectedAgentId, agents])

  // Check if there's a running workflow
  const hasRunningWorkflow = workflow && workflow.status === 'running'

  // Compute pending approval phase using useMemo to avoid race conditions
  const pendingApprovalPhase = useMemo(() => {
    if (!workflow) return null

    const currentPhase = workflow.phases[workflow.currentPhaseIndex]
    if (!currentPhase) return null

    // Check if phase requires approval, is completed, and not already dismissed
    if (
      currentPhase.requiresApproval &&
      currentPhase.status === 'completed' &&
      currentPhase.agentIds.length > 0 &&
      !dismissedApprovalPhaseIds.has(currentPhase.id)
    ) {
      const phaseAgents = currentPhase.agentIds
        .map((id) => agents.find((a) => a.id === id))
        .filter(Boolean)

      const allCompleted = phaseAgents.every(
        (a) => a!.status === 'completed' || a!.status === 'error' || a!.status === 'cancelled'
      )

      if (allCompleted) {
        return currentPhase
      }
    }
    return null
  }, [workflow, agents, dismissedApprovalPhaseIds])

  const handleViewDetails = (agentId: string) => {
    setSelectedAgentId(agentId)
  }

  const handleCloseDetail = () => {
    setSelectedAgentId(null)
  }

  // Show confirmation dialog before cancel
  const handleRequestCancel = (agentId: string) => {
    setConfirmCancelAgentId(agentId)
  }

  // Actually cancel the agent after confirmation
  // P0-008: Added debounce protection using operationInFlightRef
  const handleConfirmCancel = useCallback(async () => {
    if (!confirmCancelAgentId) return
    // Debounce protection: prevent double-click
    if (operationInFlightRef.current) return
    operationInFlightRef.current = true

    setOperatingAgentId(confirmCancelAgentId)
    try {
      await cancelAgent(confirmCancelAgentId)
    } finally {
      setOperatingAgentId(null)
      setConfirmCancelAgentId(null)
      operationInFlightRef.current = false
    }
  }, [confirmCancelAgentId, cancelAgent])

  const handleCancelCancelDialog = () => {
    setConfirmCancelAgentId(null)
  }

  // P0-008: Added debounce protection using operationInFlightRef
  const handlePause = useCallback(async (agentId: string) => {
    // Debounce protection: prevent double-click
    if (operationInFlightRef.current) return
    operationInFlightRef.current = true

    setOperatingAgentId(agentId)
    try {
      await pauseAgent(agentId)
    } finally {
      setOperatingAgentId(null)
      operationInFlightRef.current = false
    }
  }, [pauseAgent])

  // P0-008: Added debounce protection using operationInFlightRef
  const handleResume = useCallback(async (agentId: string) => {
    // Debounce protection: prevent double-click
    if (operationInFlightRef.current) return
    operationInFlightRef.current = true

    setOperatingAgentId(agentId)
    try {
      await resumeAgent(agentId)
    } finally {
      setOperatingAgentId(null)
      operationInFlightRef.current = false
    }
  }, [resumeAgent])

  const handleApproval = () => {
    if (pendingApprovalPhase) {
      void approvePhase(pendingApprovalPhase.id)
      // Mark as dismissed to prevent re-showing
      setDismissedApprovalPhaseIds((prev) => new Set([...prev, pendingApprovalPhase.id]))
    }
  }

  const handleRejection = (reason: string) => {
    if (pendingApprovalPhase) {
      rejectPhase(pendingApprovalPhase.id, reason)
      // Mark as dismissed to prevent re-showing
      setDismissedApprovalPhaseIds((prev) => new Set([...prev, pendingApprovalPhase.id]))
    }
  }

  // P0-008: Added debounce protection using operationInFlightRef
  const handleRetry = useCallback(async (agentId: string) => {
    // Debounce protection: prevent double-click
    if (operationInFlightRef.current) return
    operationInFlightRef.current = true

    setOperatingAgentId(agentId)
    try {
      await retryAgent(agentId)
    } finally {
      setOperatingAgentId(null)
      operationInFlightRef.current = false
    }
  }, [retryAgent])

  // Workflow dialog handlers
  const handleOpenWorkflowDialog = () => {
    // Check if there's already a running workflow
    if (hasRunningWorkflow) {
      setShowConfirmRestartDialog(true)
      return
    }
    openWorkflowDialogDirectly()
  }

  const openWorkflowDialogDirectly = () => {
    setShowWorkflowDialog(true)
    setWorkflowTask('')
    setTimeout(() => workflowInputRef.current?.focus(), 100)
  }

  const handleConfirmRestart = async () => {
    // Clear existing workflow and agents before starting new one
    await clearAgents()
    clearWorkflow()
    setShowConfirmRestartDialog(false)
    openWorkflowDialogDirectly()
  }

  const handleCancelRestart = () => {
    setShowConfirmRestartDialog(false)
  }

  const handleCloseWorkflowDialog = () => {
    setShowWorkflowDialog(false)
    setWorkflowTask('')
  }

  const handleStartWorkflow = async () => {
    if (!workflowTask.trim()) return

    // Clean up any existing agents before starting new workflow
    // This ensures a fresh state even if there are leftover agents from previous workflows
    if (agents.length > 0) {
      await clearAgents()
    }
    if (workflow) {
      clearWorkflow()
    }

    const workflowInstance = createPlanModeWorkflow(workflowTask.trim(), {
      workingDirectory: config.cwd,
      userTask: workflowTask.trim(),
    })
    void startWorkflow(workflowInstance)
    handleCloseWorkflowDialog()
  }

  // Agent dialog handlers
  const handleOpenAgentDialog = () => {
    setShowAgentDialog(true)
    setAgentTask('')
    setSelectedAgentType('explore')
    setTimeout(() => agentInputRef.current?.focus(), 100)
  }

  const handleCloseAgentDialog = () => {
    setShowAgentDialog(false)
    setAgentTask('')
  }

  const handleCreateAgent = () => {
    if (!agentTask.trim()) return
    void spawnAgent(selectedAgentType, agentTask.trim())
    handleCloseAgentDialog()
  }

  return (
    <>
      {/* Approval Dialog */}
      {pendingApprovalPhase && (
        <ApprovalDialog
          phase={pendingApprovalPhase}
          agents={agents.filter((a) => pendingApprovalPhase.agentIds.includes(a.id))}
          onApprove={handleApproval}
          onReject={handleRejection}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      {confirmCancelAgentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 bg-gradient-to-r from-red-500 to-orange-500">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">确认取消代理</h3>
              </div>
              <button
                onClick={handleCancelCancelDialog}
                className="p-1 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                确定要取消此代理吗？取消后：
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1 mb-4">
                <li>当前正在执行的任务将被中断</li>
                <li>已完成的工作将被保留</li>
                <li>此操作无法撤销</li>
              </ul>
              {(() => {
                const agent = agents.find((a) => a.id === confirmCancelAgentId)
                return agent ? (
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      代理：{AGENT_TYPE_OPTIONS.find(opt => opt.type === agent.type)?.name ?? agent.type}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {agent.task}
                    </p>
                  </div>
                ) : null
              })()}
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <button
                onClick={handleCancelCancelDialog}
                disabled={operatingAgentId === confirmCancelAgentId}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                返回
              </button>
              <button
                onClick={() => void handleConfirmCancel()}
                disabled={operatingAgentId === confirmCancelAgentId}
                className="px-6 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center space-x-2"
              >
                {operatingAgentId === confirmCancelAgentId ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>取消中...</span>
                  </>
                ) : (
                  <span>确认取消</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Restart Dialog - shown when trying to start new workflow while one is running */}
      {showConfirmRestartDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 bg-gradient-to-r from-amber-500 to-orange-500">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">工作流正在运行</h3>
              </div>
              <button
                onClick={handleCancelRestart}
                className="p-1 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                当前已有一个工作流正在运行。启动新工作流将会：
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1 mb-4">
                <li>停止当前所有运行中的代理</li>
                <li>清除当前工作流的状态</li>
                <li>开始一个全新的工作流</li>
              </ul>
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                确定要继续吗？
              </p>
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <button
                onClick={handleCancelRestart}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => void handleConfirmRestart()}
                className="px-6 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 shadow-md hover:shadow-lg transition-all"
              >
                确认重启
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflow Quick Start Dialog */}
      {showWorkflowDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 bg-gradient-to-r from-blue-500 to-indigo-500">
              <div className="flex items-center space-x-3">
                <Play className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">启动 Plan Mode 工作流</h3>
              </div>
              <button
                onClick={handleCloseWorkflowDialog}
                className="p-1 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Plan Mode 工作流将自动执行 4 个阶段：探索 → 设计 → 审查 → 实施
              </p>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                描述您要完成的任务
              </label>
              <textarea
                ref={workflowInputRef}
                value={workflowTask}
                onChange={(e) => setWorkflowTask(e.target.value)}
                placeholder="例如：为项目添加暗色模式支持..."
                className="w-full h-32 px-4 py-3 border dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) {
                    void handleStartWorkflow()
                  }
                }}
              />
              <p className="text-xs text-gray-400 mt-2">按 ⌘ + Enter 快速启动</p>
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <button
                onClick={handleCloseWorkflowDialog}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => void handleStartWorkflow()}
                disabled={!workflowTask.trim()}
                className={cn(
                  "px-6 py-2 rounded-lg font-medium transition-all",
                  workflowTask.trim()
                    ? "bg-blue-500 text-white hover:bg-blue-600 shadow-md hover:shadow-lg"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                )}
              >
                启动工作流
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Quick Create Dialog */}
      {showAgentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 bg-gradient-to-r from-purple-500 to-pink-500">
              <div className="flex items-center space-x-3">
                <Plus className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">创建代理</h3>
              </div>
              <button
                onClick={handleCloseAgentDialog}
                className="p-1 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="p-6 space-y-4">
              {/* Agent Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  选择代理类型
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AGENT_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.type}
                      onClick={() => setSelectedAgentType(option.type)}
                      className={cn(
                        "flex items-center space-x-3 p-3 rounded-xl border-2 transition-all text-left",
                        selectedAgentType === option.type
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                          : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-lg",
                        selectedAgentType === option.type
                          ? "bg-purple-100 dark:bg-purple-800/40 text-purple-600 dark:text-purple-400"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                      )}>
                        {option.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{option.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{option.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Task Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  任务描述
                </label>
                <textarea
                  ref={agentInputRef}
                  value={agentTask}
                  onChange={(e) => setAgentTask(e.target.value)}
                  placeholder="描述代理需要执行的任务..."
                  className="w-full h-24 px-4 py-3 border dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      handleCreateAgent()
                    }
                  }}
                />
                <p className="text-xs text-gray-400 mt-2">按 ⌘ + Enter 快速创建</p>
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <button
                onClick={handleCloseAgentDialog}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateAgent}
                disabled={!agentTask.trim()}
                className={cn(
                  "px-6 py-2 rounded-lg font-medium transition-all",
                  agentTask.trim()
                    ? "bg-purple-500 text-white hover:bg-purple-600 shadow-md hover:shadow-lg"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                )}
              >
                创建代理
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main View */}
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
        {/* Workflow Header */}
        {workflow && (
          <WorkflowStageHeader workflow={workflow} />
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Agent Grid - Main Area */}
          <div
            className={cn(
              'flex-1 overflow-auto transition-all duration-300',
              selectedAgent ? 'mr-0' : ''
            )}
          >
            <div className="p-6">
              {agents.length === 0 && !workflow ? (
                // Empty state - no agents and no workflow
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                      <Bot className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      欢迎使用多智能体模式
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
                      创建代理或启动工作流，让多个专门化的 AI 代理协同完成复杂任务
                    </p>
                    <div className="flex items-center justify-center space-x-4">
                      <button
                        className="flex items-center space-x-2 px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all shadow-md hover:shadow-lg"
                        onClick={handleOpenWorkflowDialog}
                      >
                        <Play className="w-5 h-5" />
                        <span>启动工作流</span>
                      </button>
                      <button
                        className="flex items-center space-x-2 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        onClick={handleOpenAgentDialog}
                      >
                        <Plus className="w-5 h-5" />
                        <span>手动创建代理</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <AgentGridView
                  agents={agents}
                  onViewDetails={handleViewDetails}
                  onCancel={handleRequestCancel}
                  onPause={(id) => void handlePause(id)}
                  onResume={(id) => void handleResume(id)}
                  onRetry={(id) => void handleRetry(id)}
                  operatingAgentId={operatingAgentId}
                />
              )}
            </div>
          </div>

          {/* Agent Detail Panel - Right Side Drawer */}
          {selectedAgent && (
            <div className="w-[600px] flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
              <AgentDetailPanel agent={selectedAgent} onClose={handleCloseDetail} />
            </div>
          )}
        </div>

        {/* Bottom Status Bar (Optional) */}
        {agents.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-2">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center space-x-6">
                <span>
                  总计代理:{' '}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{agents.length}</span>
                </span>
                <span>
                  运行中:{' '}
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {agents.filter((a) => a.status === 'running').length}
                  </span>
                </span>
                <span>
                  已完成:{' '}
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {agents.filter((a) => a.status === 'completed').length}
                  </span>
                </span>
                <span>
                  错误:{' '}
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    {agents.filter((a) => a.status === 'error').length}
                  </span>
                </span>
              </div>

              {workflow && (
                <div className="text-gray-500 dark:text-gray-400">
                  工作流:{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{workflow.name}</span>
                </div>
              )}

              {/* Quick Add Button */}
              <button
                onClick={handleOpenAgentDialog}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>添加代理</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
