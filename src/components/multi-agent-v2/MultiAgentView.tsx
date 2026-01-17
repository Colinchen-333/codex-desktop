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

import { useState, useEffect, useRef } from 'react'
import { X, Plus, Play, Bot, Search, FileCode, Terminal, FileText, TestTube } from 'lucide-react'
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
  const { workflow, approvePhase, rejectPhase, cancelAgent, pauseAgent, resumeAgent, startWorkflow, spawnAgent, retryAgent } =
    useMultiAgentStore()

  // Track selected agent for detail panel
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Track approval dialog
  const [pendingApprovalPhaseId, setPendingApprovalPhaseId] = useState<string | null>(null)

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

  // Monitor workflow phases for approval requirement
  useEffect(() => {
    if (!workflow) return

    const currentPhase = workflow.phases[workflow.currentPhaseIndex]
    if (!currentPhase) return

    // Check if phase requires approval and all agents are complete
    if (
      currentPhase.requiresApproval &&
      currentPhase.status === 'completed' &&
      currentPhase.agentIds.length > 0
    ) {
      const phaseAgents = currentPhase.agentIds
        .map((id) => agents.find((a) => a.id === id))
        .filter(Boolean)

      const allCompleted = phaseAgents.every(
        (a) => a!.status === 'completed' || a!.status === 'error' || a!.status === 'cancelled'
      )

      if (allCompleted && !pendingApprovalPhaseId) {
        // Use setTimeout to avoid setState during effect
        setTimeout(() => {
          setPendingApprovalPhaseId(currentPhase.id)
        }, 0)
      }
    }
  }, [workflow, agents, pendingApprovalPhaseId])

  const currentPhase = workflow && pendingApprovalPhaseId
    ? workflow.phases.find((p) => p.id === pendingApprovalPhaseId)
    : null

  const handleViewDetails = (agentId: string) => {
    setSelectedAgentId(agentId)
  }

  const handleCloseDetail = () => {
    setSelectedAgentId(null)
  }

  const handleCancel = (agentId: string) => {
    void cancelAgent(agentId)
  }

  const handlePause = (agentId: string) => {
    void pauseAgent(agentId)
  }

  const handleResume = (agentId: string) => {
    void resumeAgent(agentId)
  }

  const handleApprovePhase = (phaseId: string) => {
    void approvePhase(phaseId)
  }

  const handleApproval = () => {
    if (pendingApprovalPhaseId) {
      void approvePhase(pendingApprovalPhaseId)
      setPendingApprovalPhaseId(null)
    }
  }

  const handleRejection = (reason: string) => {
    if (pendingApprovalPhaseId) {
      rejectPhase(pendingApprovalPhaseId, reason)
      setPendingApprovalPhaseId(null)
    }
  }

  const handleRetry = (agentId: string) => {
    void retryAgent(agentId)
  }

  // Workflow dialog handlers
  const handleOpenWorkflowDialog = () => {
    setShowWorkflowDialog(true)
    setWorkflowTask('')
    setTimeout(() => workflowInputRef.current?.focus(), 100)
  }

  const handleCloseWorkflowDialog = () => {
    setShowWorkflowDialog(false)
    setWorkflowTask('')
  }

  const handleStartWorkflow = () => {
    if (!workflowTask.trim()) return
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
      {pendingApprovalPhaseId && currentPhase && (
        <ApprovalDialog
          phase={currentPhase}
          agents={agents.filter((a) => currentPhase.agentIds.includes(a.id))}
          onApprove={handleApproval}
          onReject={handleRejection}
        />
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
                    handleStartWorkflow()
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
                onClick={handleStartWorkflow}
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
          <WorkflowStageHeader workflow={workflow} onApprovePhase={handleApprovePhase} />
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
                  onCancel={handleCancel}
                  onPause={handlePause}
                  onResume={handleResume}
                  onRetry={handleRetry}
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
