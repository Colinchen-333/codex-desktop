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
import { X, Plus, Play, Search, FileCode, Terminal, FileText, TestTube, AlertTriangle, Loader2, Box, User, ChevronDown, ChevronUp, Sparkles, Bot, Clock } from 'lucide-react'
import { WorkflowStageHeader } from './WorkflowStageHeader'
import { AgentGridView } from './AgentGridView'
import { AgentDetailPanel } from './AgentDetailPanel'
import { ApprovalPanel } from './ApprovalPanel'
import { ReviewInbox } from './ReviewInbox'
import { PrimaryDecision } from './PrimaryDecision'
import { useMultiAgentStore, type AgentType } from '../../stores/multi-agent-v2'
import { useWorkflowTemplatesStore } from '../../stores/workflowTemplates'
import { useAgents, useWorkflow } from '../../hooks/useMultiAgent'
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
  // Use granular selectors to prevent re-renders on unrelated state changes
  const agents = useAgents()
  const workflow = useWorkflow()
  
  // Get actions individually (stable references)
  const approvePhase = useMultiAgentStore((state) => state.approvePhase)
  const rejectPhase = useMultiAgentStore((state) => state.rejectPhase)
  const cancelAgent = useMultiAgentStore((state) => state.cancelAgent)
  const pauseAgent = useMultiAgentStore((state) => state.pauseAgent)
  const resumeAgent = useMultiAgentStore((state) => state.resumeAgent)
  const spawnAgent = useMultiAgentStore((state) => state.spawnAgent)
  const retryAgent = useMultiAgentStore((state) => state.retryAgent)
  const retryWorkflow = useMultiAgentStore((state) => state.retryWorkflow)
  const retryPhase = useMultiAgentStore((state) => state.retryPhase)
  const recoverApprovalTimeout = useMultiAgentStore((state) => state.recoverApprovalTimeout)
  const restartRecoveryInFlight = useMultiAgentStore((state) => state.restartRecoveryInFlight)
  const clearAgents = useMultiAgentStore((state) => state.clearAgents)
  const clearWorkflow = useMultiAgentStore((state) => state.clearWorkflow)
  const startWorkflowFromTemplate = useMultiAgentStore((state) => state.startWorkflowFromTemplate)
  
  const templates = useWorkflowTemplatesStore((state) => state.getAllTemplates())

  // Track selected agent for detail panel
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(600)
  const resizingRef = useRef(false)
  const minPanelWidth = 400
  const maxPanelWidth = 900

  const [operatingAgentIds, setOperatingAgentIds] = useState<Set<string>>(new Set())
  const [confirmCancelAgentId, setConfirmCancelAgentId] = useState<string | null>(null)

  // Track approval dialog - dismissed phase IDs to prevent re-showing
  const [dismissedApprovalPhaseIds, setDismissedApprovalPhaseIds] = useState<Set<string>>(new Set())

  // Confirmation dialog for starting new workflow when one is already running
  const [showConfirmRestartDialog, setShowConfirmRestartDialog] = useState(false)

  // Quick start dialogs
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false)
  const [showAgentDialog, setShowAgentDialog] = useState(false)
  const [showReviewInbox, setShowReviewInbox] = useState(false)
  const [workflowTask, setWorkflowTask] = useState('')
  const [agentTask, setAgentTask] = useState('')
  const [selectedAgentType, setSelectedAgentType] = useState<AgentType>('explore')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  
  // Structured Intent State
  const [showStructuredIntent, setShowStructuredIntent] = useState(false)
  const [intentConstraints, setIntentConstraints] = useState('')
  const [intentScope, setIntentScope] = useState('')

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

  const pendingApprovalPhase = useMemo(() => {
    if (!workflow) return null

    const currentPhase = workflow.phases[workflow.currentPhaseIndex]
    if (!currentPhase) return null

    if (
      currentPhase.requiresApproval &&
      (currentPhase.status === 'awaiting_approval' || currentPhase.status === 'approval_timeout') &&
      currentPhase.agentIds.length > 0 &&
      !dismissedApprovalPhaseIds.has(currentPhase.id)
    ) {
      return currentPhase
    }
    return null
  }, [workflow, dismissedApprovalPhaseIds])



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

  const handleConfirmCancel = useCallback(async () => {
    if (!confirmCancelAgentId) return
    if (operatingAgentIds.has(confirmCancelAgentId)) return

    setOperatingAgentIds((prev) => new Set([...prev, confirmCancelAgentId]))
    try {
      await cancelAgent(confirmCancelAgentId)
    } finally {
      setOperatingAgentIds((prev) => {
        const next = new Set(prev)
        next.delete(confirmCancelAgentId)
        return next
      })
      setConfirmCancelAgentId(null)
    }
  }, [confirmCancelAgentId, cancelAgent, operatingAgentIds])

  const handleCancelCancelDialog = () => {
    setConfirmCancelAgentId(null)
  }

  const handlePause = useCallback(async (agentId: string) => {
    if (operatingAgentIds.has(agentId)) return

    setOperatingAgentIds((prev) => new Set([...prev, agentId]))
    try {
      await pauseAgent(agentId)
    } finally {
      setOperatingAgentIds((prev) => {
        const next = new Set(prev)
        next.delete(agentId)
        return next
      })
    }
  }, [pauseAgent, operatingAgentIds])

  const handleResume = useCallback(async (agentId: string) => {
    if (operatingAgentIds.has(agentId)) return

    setOperatingAgentIds((prev) => new Set([...prev, agentId]))
    try {
      await resumeAgent(agentId)
    } finally {
      setOperatingAgentIds((prev) => {
        const next = new Set(prev)
        next.delete(agentId)
        return next
      })
    }
  }, [resumeAgent, operatingAgentIds])

  const handleApproval = () => {
    if (pendingApprovalPhase) {
      void approvePhase(pendingApprovalPhase.id)
      // Mark as dismissed to prevent re-showing
      setDismissedApprovalPhaseIds((prev) => new Set([...prev, pendingApprovalPhase.id]))
    }
  }

  const handleRejection = async (reason: string) => {
    if (pendingApprovalPhase) {
      await rejectPhase(pendingApprovalPhase.id, reason)
      setDismissedApprovalPhaseIds((prev) => new Set([...prev, pendingApprovalPhase.id]))
    }
  }

  const handleRejectAndRetry = useCallback(async (reason: string) => {
    if (!pendingApprovalPhase) return
    
    await rejectPhase(pendingApprovalPhase.id, reason)
    await retryPhase(pendingApprovalPhase.id)
  }, [pendingApprovalPhase, rejectPhase, retryPhase])

  const handleRetry = useCallback(async (agentId: string) => {
    if (operatingAgentIds.has(agentId)) return

    setOperatingAgentIds((prev) => new Set([...prev, agentId]))
    try {
      await retryAgent(agentId)
    } finally {
      setOperatingAgentIds((prev) => {
        const next = new Set(prev)
        next.delete(agentId)
        return next
      })
    }
  }, [retryAgent, operatingAgentIds])

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
    setIntentConstraints('')
    setIntentScope('')
    setShowStructuredIntent(false)
    setShowAdvancedOptions(false)
    if (templates.length > 0) {
      setSelectedTemplateId(templates[0].id)
    }
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
    setIntentConstraints('')
    setIntentScope('')
    setShowStructuredIntent(false)
  }

  const handleStartWorkflow = async () => {
    if (!workflowTask.trim()) return

    const templateId = selectedTemplateId || templates[0]?.id
    if (!templateId) return

    const template = templates.find(t => t.id === templateId)
    if (!template) return

    if (agents.length > 0) {
      await clearAgents()
    }
    if (workflow) {
      clearWorkflow()
    }

    // Build enhanced task with structured intent
    let enhancedTask = workflowTask.trim()
    if (intentConstraints.trim()) {
      enhancedTask += `\n\n约束条件: ${intentConstraints.trim()}`
    }
    if (intentScope.trim()) {
      enhancedTask += `\n范围: ${intentScope.trim()}`
    }

    void startWorkflowFromTemplate(template, enhancedTask)
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
      {/* Review Inbox Dialog */}
      <ReviewInbox
        isOpen={showReviewInbox}
        onClose={() => setShowReviewInbox(false)}
        onSelectAgent={(agentId) => setSelectedAgentId(agentId)}
        onOpenPhaseApproval={() => {
          if (pendingApprovalPhase) {
            setDismissedApprovalPhaseIds((prev) => {
              const next = new Set(prev)
              next.delete(pendingApprovalPhase.id)
              return next
            })
          }
        }}
      />

      {/* Cancel Confirmation Dialog */}
      {confirmCancelAgentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 bg-gray-900 dark:bg-gray-800">
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
                disabled={!!confirmCancelAgentId && operatingAgentIds.has(confirmCancelAgentId)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                返回
              </button>
              <button
                onClick={() => void handleConfirmCancel()}
                disabled={!!confirmCancelAgentId && operatingAgentIds.has(confirmCancelAgentId)}
                className="px-6 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center space-x-2"
              >
                {confirmCancelAgentId && operatingAgentIds.has(confirmCancelAgentId) ? (
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
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 bg-gray-900 dark:bg-gray-800">
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

      {/* Workflow Quick Start Dialog - Standard Mode */}
      {showWorkflowDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 bg-gray-900 dark:bg-gray-800 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <Sparkles className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">开始任务</h3>
              </div>
              <button
                onClick={handleCloseWorkflowDialog}
                className="p-1 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="p-6 overflow-y-auto flex-1">
              {/* Task Input - Primary Focus */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  描述您的需求
                </label>
                <textarea
                  ref={workflowInputRef}
                  value={workflowTask}
                  onChange={(e) => setWorkflowTask(e.target.value)}
                  placeholder="例如：为用户设置页面添加头像上传功能..."
                  className="w-full h-28 px-4 py-3 border dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      void handleStartWorkflow()
                    }
                  }}
                />
                
                <button
                  type="button"
                  onClick={() => setShowStructuredIntent(!showStructuredIntent)}
                  className="mt-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showStructuredIntent ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  结构化意图 (可选)
                </button>

                {showStructuredIntent && (
                  <div className="mt-3 space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                        约束条件 (不要做什么)
                      </label>
                      <input
                        type="text"
                        value={intentConstraints}
                        onChange={(e) => setIntentConstraints(e.target.value)}
                        placeholder="例如：不修改现有API、保持向后兼容..."
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                        范围限制 (影响哪些模块)
                      </label>
                      <input
                        type="text"
                        value={intentScope}
                        onChange={(e) => setIntentScope(e.target.value)}
                        placeholder="例如：仅 src/components/、排除测试文件..."
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      💡 结构化意图帮助 AI 更准确理解您的需求边界
                    </p>
                  </div>
                )}
              </div>

              {/* Safety Promise */}
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-xs text-green-700 dark:text-green-300">
                  <span className="font-medium">安全承诺：</span>所有代码变更都需要您的审批，您可以随时查看 Diff 并决定是否应用。
                </p>
              </div>

              {/* Advanced Options Toggle */}
              <button
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                {showAdvancedOptions ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                高级选项
              </button>

              {/* Advanced Options - Template Picker */}
              {showAdvancedOptions && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
                    选择工作流模板
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={cn(
                          "flex flex-col text-left p-2.5 rounded-lg border transition-all",
                          selectedTemplateId === template.id
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        )}
                      >
                        <div className="flex items-center justify-between w-full mb-0.5">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {template.name}
                          </span>
                          {template.source === 'builtin' ? (
                            <Box className="w-3.5 h-3.5 text-blue-500" />
                          ) : (
                            <User className="w-3.5 h-3.5 text-amber-500" />
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">
                          {template.phases.length} 阶段 · {template.description.split('：')[0]}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
              <p className="text-xs text-gray-400">⌘ + Enter 快速启动</p>
              <div className="flex items-center space-x-3">
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
                    "px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
                    workflowTask.trim()
                      ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                  )}
                >
                  <Play className="w-4 h-4" />
                  开始执行
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent Quick Create Dialog */}
      {showAgentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700 bg-gray-900 dark:bg-gray-800">
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
                          ? "border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800"
                          : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-lg",
                        selectedAgentType === option.type
                          ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                  className="w-full h-24 px-4 py-3 border dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
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
                    ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 shadow-md hover:shadow-lg"
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
      <div className="flex flex-col h-full bg-background">
        {/* Mode Identity Banner */}
        <div className="flex items-center gap-2 px-4 py-1.5 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800">
          <Bot className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
            多智能体编排
          </span>
          <span className="text-xs text-violet-600/70 dark:text-violet-400/70">
            · 并行Agent探索 · 阶段门控审批 · 指点江山
          </span>
        </div>

        {/* Workflow Header */}
        {workflow && (
          <WorkflowStageHeader
            workflow={workflow}
            onRetryWorkflow={() => void retryWorkflow()}
            onRecoverTimeout={(phaseId) => {
              recoverApprovalTimeout(phaseId)
              setDismissedApprovalPhaseIds((prev) => {
                const next = new Set(prev)
                next.delete(phaseId)
                return next
              })
            }}
          />
        )}

        {/* Approval Timeout Alert Banner */}
        {workflow?.phases[workflow.currentPhaseIndex]?.status === 'approval_timeout' && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 px-4 py-3 flex items-center justify-between animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-orange-600 dark:text-orange-500" />
              <div>
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                  审批超时 - 请尽快处理
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  「{workflow.phases[workflow.currentPhaseIndex].name}」阶段等待审批已超时，您仍可操作
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const phase = workflow.phases[workflow.currentPhaseIndex]
                  if (phase) {
                    recoverApprovalTimeout(phase.id)
                    setDismissedApprovalPhaseIds((prev) => {
                      const next = new Set(prev)
                      next.delete(phase.id)
                      return next
                    })
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-700 transition-colors"
              >
                恢复计时
              </button>
              <button
                onClick={() => setShowReviewInbox(true)}
                className="px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                立即审批
              </button>
            </div>
          </div>
        )}

        {(() => {
          const restartErrorAgents = agents.filter(a => a.error?.code === 'APP_RESTART_LOST_CONNECTION')
          if (restartErrorAgents.length === 0 && !restartRecoveryInFlight) return null

          return (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    检测到应用重启，部分代理已断开
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {restartRecoveryInFlight
                      ? '正在自动恢复…如果失败请手动恢复'
                      : `${restartErrorAgents.length} 个代理需要恢复。请在审批收件箱中进行操作。`}
                  </p>
                </div>
              </div>
              {!restartRecoveryInFlight && restartErrorAgents.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowReviewInbox(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-700 transition-colors"
                  >
                    去恢复
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        {/* Primary Decision Block - Shows the most important pending action */}
        <PrimaryDecision
          pendingPhase={pendingApprovalPhase}
          agents={agents}
          onApprovePhase={handleApproval}
          onRejectPhase={() => {
            if (pendingApprovalPhase) {
              setDismissedApprovalPhaseIds((prev) => {
                const next = new Set(prev)
                next.delete(pendingApprovalPhase.id)
                return next
              })
            }
            setShowReviewInbox(true)
          }}
          onOpenReviewInbox={() => setShowReviewInbox(true)}
          onRecoverTimeout={() => {
            if (pendingApprovalPhase) {
              recoverApprovalTimeout(pendingApprovalPhase.id)
            }
          }}
        />

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
                <div className="flex items-center justify-center min-h-[500px]">
                  <div className="text-center max-w-xl">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      您决策，代理执行
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">
                      描述您的需求，多个 AI 代理将自动协作完成。所有变更都需要您的审批。
                    </p>

                    <button
                      className="flex items-center justify-center gap-2 w-full max-w-sm mx-auto px-6 py-3.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl mb-6"
                      onClick={handleOpenWorkflowDialog}
                    >
                      <Sparkles className="w-5 h-5" />
                      <span className="font-medium">开始新任务</span>
                    </button>

                    <div className="mb-6">
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">或点击示例快速开始</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {[
                          '修复失败的测试用例',
                          '为这个模块添加单元测试',
                          '重构这段代码提高可读性',
                        ].map((example) => (
                          <button
                            key={example}
                            onClick={() => {
                              setWorkflowTask(example)
                              openWorkflowDialogDirectly()
                            }}
                            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-6 text-xs text-gray-400 dark:text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        变更需审批
                      </span>
                      <span className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        可查看 Diff
                      </span>
                      <span className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        随时可取消
                      </span>
                    </div>

                    <button
                      className="mt-6 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      onClick={handleOpenAgentDialog}
                    >
                      或手动创建单个代理 →
                    </button>
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
                  operatingAgentIds={operatingAgentIds}
                />
              )}
            </div>
          </div>

          {(pendingApprovalPhase || selectedAgent) && (
            <div
              className="flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl relative"
              style={{ width: panelWidth }}
            >
              {/* Resize Handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500/70 z-10"
                onMouseDown={(e) => {
                  e.preventDefault()
                  resizingRef.current = true
                  const startX = e.clientX
                  const startWidth = panelWidth

                  const onMouseMove = (moveEvent: MouseEvent) => {
                    if (!resizingRef.current) return
                    const delta = startX - moveEvent.clientX
                    const newWidth = Math.min(maxPanelWidth, Math.max(minPanelWidth, startWidth + delta))
                    setPanelWidth(newWidth)
                  }

                  const onMouseUp = () => {
                    resizingRef.current = false
                    document.removeEventListener('mousemove', onMouseMove)
                    document.removeEventListener('mouseup', onMouseUp)
                  }

                  document.addEventListener('mousemove', onMouseMove)
                  document.addEventListener('mouseup', onMouseUp)
                }}
              />
              
              {pendingApprovalPhase ? (
                <ApprovalPanel
                  phase={pendingApprovalPhase}
                  agents={agents.filter((a) => pendingApprovalPhase.agentIds.includes(a.id))}
                  onApprove={handleApproval}
                  onReject={handleRejection}
                  onRejectAndRetry={(reason) => void handleRejectAndRetry(reason)}
                  onClose={() => {
                    setDismissedApprovalPhaseIds((prev) => new Set([...prev, pendingApprovalPhase.id]))
                  }}
                />
              ) : selectedAgent ? (
                <AgentDetailPanel agent={selectedAgent} onClose={handleCloseDetail} />
              ) : null}
            </div>
          )}
        </div>


      </div>
    </>
  )
}
