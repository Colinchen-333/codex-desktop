import { useState } from 'react'
import { X, CheckSquare, FileCode, ChevronRight, Clock, RotateCcw, AlertTriangle, ChevronDown, ChevronUp, SkipForward, XCircle, Info } from 'lucide-react'
import { useMultiAgentStore } from '../../stores/multi-agent-v2'
import { useDecisionQueue } from '../../hooks/useDecisionQueue'
import { usePendingApprovals } from '../../hooks/usePendingApprovals'
import { getErrorGuidance } from '../../stores/multi-agent-store/state-machine'
import { cn } from '../../lib/utils'

interface ReviewInboxProps {
  isOpen: boolean
  onClose: () => void
  onSelectAgent: (agentId: string) => void
  onOpenPhaseApproval: () => void
}

export function ReviewInbox({ isOpen, onClose, onSelectAgent, onOpenPhaseApproval }: ReviewInboxProps) {
  const recoverApprovalTimeout = useMultiAgentStore((state) => state.recoverApprovalTimeout)
  const recoverCancelledWorkflow = useMultiAgentStore((state) => state.recoverCancelledWorkflow)
  const retryAgent = useMultiAgentStore((state) => state.retryAgent)
  const skipAgent = useMultiAgentStore((state) => state.skipAgent)
  const cancelWorkflow = useMultiAgentStore((state) => state.cancelWorkflow)

  const { counts } = useDecisionQueue()

  const {
    phaseApproval: pendingApprovalPhase,
    safetyApprovals,
    approvalTimeoutPhase,
    cancelledWorkflow,
    failedAgents,
    totalCount,
    hasRecoveryItems,
  } = usePendingApprovals()

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-80 bg-card border-l border-border shadow-2xl transition-transform duration-300 ease-out flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">审批收件箱</h3>
            {totalCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full">
                {totalCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-4 py-2 bg-muted/20 border-b border-border">
          <p className="text-xs text-muted-foreground mb-1.5">
            按优先级排序：安全审批 → 阶段审批 → 恢复操作
          </p>
          {counts.total > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {counts.safetyApprovals > 0 && (
                <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
                  {counts.safetyApprovals} 安全
                </span>
              )}
              {counts.phaseApprovals > 0 && (
                <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                  {counts.phaseApprovals} 阶段
                </span>
              )}
              {counts.timeoutRecoveries > 0 && (
                <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                  {counts.timeoutRecoveries} 超时
                </span>
              )}
              {counts.errorRecoveries > 0 && (
                <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                  {counts.errorRecoveries} 错误
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {totalCount === 0 && !hasRecoveryItems ? (
            <div className="p-6 text-center text-muted-foreground">
              <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">没有待处理的审批</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pendingApprovalPhase && (
                <button
                  onClick={() => {
                    onOpenPhaseApproval()
                    onClose()
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className={cn(
                    "p-1.5 rounded-lg flex-shrink-0",
                    pendingApprovalPhase.status === 'approval_timeout'
                      ? "bg-red-500/10"
                      : "bg-amber-500/10"
                  )}>
                    {pendingApprovalPhase.status === 'approval_timeout' ? (
                      <Clock className="w-4 h-4 text-red-500" />
                    ) : (
                      <CheckSquare className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {pendingApprovalPhase.status === 'approval_timeout' ? '阶段审批超时' : '阶段审批'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {pendingApprovalPhase.name} · {pendingApprovalPhase.agentIds.length} 代理
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              )}

              {safetyApprovals.map((item) => (
                <button
                  key={item.agentId}
                  onClick={() => {
                    onSelectAgent(item.agentId)
                    onClose()
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="p-1.5 rounded-lg bg-blue-500/10 flex-shrink-0">
                    <FileCode className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">变更审批</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.agentName} · {item.count} 待处理
                    </p>
                  </div>
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full flex-shrink-0">
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {hasRecoveryItems && (
            <div className="mt-2 border-t border-border">
              <div className="px-4 py-2 bg-muted/30 flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                <h4 className="text-xs font-medium text-muted-foreground">恢复中心</h4>
              </div>
              <div className="divide-y divide-border">
                {approvalTimeoutPhase && (
                  <div className="w-full px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-orange-500/10 flex-shrink-0">
                        <Clock className="w-4 h-4 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          审批超时：{approvalTimeoutPhase.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          工作流已暂停，等待您的决策
                        </p>
                      </div>
                      <button
                        onClick={() => recoverApprovalTimeout(approvalTimeoutPhase.id)}
                        className="px-2.5 py-1.5 text-xs font-medium bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                      >
                        继续审批
                      </button>
                    </div>
                    <p className="mt-2 ml-9 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                      → 点击后将重置计时器，您可以继续审批或拒绝此阶段
                    </p>
                  </div>
                )}

                {cancelledWorkflow && (
                  <div className="w-full px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 flex-shrink-0">
                        <RotateCcw className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">工作流已取消</p>
                        <p className="text-xs text-muted-foreground">
                          可从当前阶段恢复执行
                        </p>
                      </div>
                      <button
                        onClick={() => recoverCancelledWorkflow()}
                        className="px-2.5 py-1.5 text-xs font-medium bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
                      >
                        恢复工作流
                      </button>
                    </div>
                    <p className="mt-2 ml-9 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                      → 将从取消点继续执行，已完成的阶段不会重新运行
                    </p>
                  </div>
                )}

                {failedAgents.map(agent => (
                  <FailedAgentCard
                    key={agent.id}
                    agent={agent}
                    onRetry={() => retryAgent(agent.id)}
                    onSkip={() => skipAgent(agent.id)}
                    onCancelWorkflow={cancelWorkflow}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            点击跳转到审批详情
          </p>
        </div>
      </div>
    </>
  )
}

interface FailedAgentCardProps {
  agent: {
    id: string
    type?: string
    error?: {
      message?: string
      code?: string
      recoverable?: boolean
    }
  }
  onRetry: () => void
  onSkip: () => void
  onCancelWorkflow: () => void
}

function FailedAgentCard({ agent, onRetry, onSkip, onCancelWorkflow }: FailedAgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [completedAction, setCompletedAction] = useState<string | null>(null)
  
  const errorCode = agent.error?.code || 'UNKNOWN'
  const guidance = getErrorGuidance(errorCode)
  const isRecoverable = agent.error?.recoverable !== false

  const handleAction = async (actionType: string, handler: () => void | Promise<void>) => {
    setLoadingAction(actionType)
    try {
      await handler()
      setCompletedAction(actionType)
    } finally {
      setLoadingAction(null)
    }
  }

  if (completedAction) {
    const actionLabels: Record<string, string> = {
      retry: '正在重试...',
      skip: '已跳过，推进中...',
      cancel: '正在取消...',
    }
    return (
      <div className="w-full px-4 py-3 bg-green-50 dark:bg-green-900/10 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-green-500/10 flex-shrink-0">
            <RotateCcw className="w-4 h-4 text-green-500 animate-spin" />
          </div>
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            {actionLabels[completedAction] || '处理中...'}
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="w-full px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-red-500/10 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {guidance.title}
            </p>
            <span className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium rounded",
              isRecoverable
                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
            )}>
              {isRecoverable ? '可恢复' : '需手动处理'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {agent.type}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-muted-foreground hover:bg-muted rounded transition-colors"
            title={isExpanded ? '收起详情' : '展开详情'}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {isRecoverable && (
            <button
              onClick={() => handleAction('retry', onRetry)}
              disabled={loadingAction !== null}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors",
                loadingAction === 'retry' && "opacity-70"
              )}
            >
              {loadingAction === 'retry' ? '处理中...' : '重试'}
            </button>
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="mt-3 ml-9 space-y-2">
          <div className="p-2.5 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <p className="text-xs text-foreground">
                  {guidance.description}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {guidance.suggestion}
                </p>
              </div>
            </div>
          </div>
          
          {agent.error?.message && (
            <div className="p-2 bg-red-50 dark:bg-red-900/10 rounded border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-700 dark:text-red-300 font-mono break-all">
                {agent.error.message}
              </p>
            </div>
          )}
          
          <div className="flex items-center gap-2 flex-wrap">
            {guidance.actions.map((action, idx) => {
              const isLoading = loadingAction === action.action
              const isDisabled = loadingAction !== null
              
              const handleClick = () => {
                if (action.action === 'retry') {
                  handleAction('retry', onRetry)
                } else if (action.action === 'skip') {
                  handleAction('skip', onSkip)
                } else if (action.action === 'cancel') {
                  handleAction('cancel', onCancelWorkflow)
                }
              }
              
              return (
                <button
                  key={idx}
                  onClick={handleClick}
                  disabled={isDisabled}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors",
                    action.type === 'primary' && "bg-blue-500 text-white hover:bg-blue-600",
                    action.type === 'secondary' && "bg-muted text-foreground hover:bg-muted/80 border border-border",
                    action.type === 'danger' && "bg-red-500 text-white hover:bg-red-600",
                    isDisabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <RotateCcw className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      {action.action === 'retry' && <RotateCcw className="w-3 h-3" />}
                      {action.action === 'skip' && <SkipForward className="w-3 h-3" />}
                      {action.action === 'cancel' && <XCircle className="w-3 h-3" />}
                    </>
                  )}
                  {isLoading ? '处理中...' : action.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
      
      {!isExpanded && (
        <p className="mt-2 ml-9 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          → {guidance.suggestion}
        </p>
      )}
    </div>
  )
}
