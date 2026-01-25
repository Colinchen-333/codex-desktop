import { memo, useMemo } from 'react'
import { CheckCircle, XCircle, Clock, Shield, AlertTriangle, ChevronRight } from 'lucide-react'
import type { WorkflowPhase } from '../../stores/multi-agent-v2'
import { useThreadStore } from '../../stores/thread'
import { cn } from '../../lib/utils'

interface PrimaryDecisionProps {
  pendingPhase: WorkflowPhase | null
  agents: { id: string; threadId: string }[]
  onApprovePhase: () => void
  onRejectPhase: () => void
  onOpenReviewInbox: () => void
  onRecoverTimeout?: () => void
}

function PrimaryDecisionComponent({
  pendingPhase,
  agents,
  onApprovePhase,
  onRejectPhase,
  onOpenReviewInbox,
  onRecoverTimeout,
}: PrimaryDecisionProps) {
  const threadStoreState = useThreadStore((state) => state.threads)

  const safetyApprovalInfo = useMemo(() => {
    let count = 0
    let firstAgentId: string | null = null

    for (const agent of agents) {
      const thread = threadStoreState[agent.threadId]
      if (thread?.pendingApprovals && thread.pendingApprovals.length > 0) {
        count += thread.pendingApprovals.length
        if (!firstAgentId) {
          firstAgentId = agent.id
        }
      }
    }

    return { count, firstAgentId }
  }, [agents, threadStoreState])

  const hasSafetyApproval = safetyApprovalInfo.count > 0
  const hasPhaseApproval = pendingPhase !== null
  const isTimeout = pendingPhase?.status === 'approval_timeout'

  if (!hasSafetyApproval && !hasPhaseApproval) {
    return null
  }

  if (hasSafetyApproval) {
    return (
      <div className="mx-4 my-3">
        <div className={cn(
          "rounded-xl border-2 p-4 transition-all",
          "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20",
          "border-amber-300 dark:border-amber-700",
          "shadow-lg shadow-amber-100 dark:shadow-amber-900/30"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-800 rounded-lg">
                <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                  安全审批需要您的关注
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {safetyApprovalInfo.count} 个待处理的文件变更或命令执行请求
                </p>
              </div>
            </div>
            <button
              onClick={onOpenReviewInbox}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                "bg-amber-600 hover:bg-amber-700 text-white",
                "shadow-md hover:shadow-lg"
              )}
            >
              立即处理
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (hasPhaseApproval && pendingPhase) {
    return (
      <div className="mx-4 my-3">
        <div className={cn(
          "rounded-xl border-2 p-4 transition-all",
          isTimeout
            ? "bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-orange-300 dark:border-orange-700"
            : "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-300 dark:border-blue-700",
          "shadow-lg",
          isTimeout ? "shadow-orange-100 dark:shadow-orange-900/30" : "shadow-blue-100 dark:shadow-blue-900/30"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                isTimeout ? "bg-orange-100 dark:bg-orange-800" : "bg-blue-100 dark:bg-blue-800"
              )}>
                {isTimeout ? (
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                ) : (
                  <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                )}
              </div>
              <div>
                <h3 className={cn(
                  "font-semibold",
                  isTimeout ? "text-orange-900 dark:text-orange-100" : "text-blue-900 dark:text-blue-100"
                )}>
                  {isTimeout ? '审批已超时' : '阶段审批'}：{pendingPhase.name}
                </h3>
                <p className={cn(
                  "text-sm",
                  isTimeout ? "text-orange-700 dark:text-orange-300" : "text-blue-700 dark:text-blue-300"
                )}>
                  {isTimeout
                    ? '请尽快审批以继续工作流'
                    : '请审查工作成果并决定是否继续'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isTimeout && onRecoverTimeout && (
                <button
                  onClick={onRecoverTimeout}
                  className="px-3 py-2 text-sm font-medium text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-800 rounded-lg transition-colors"
                >
                  恢复计时
                </button>
              )}
              <button
                onClick={onRejectPhase}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              >
                <XCircle className="w-4 h-4" />
                拒绝
              </button>
              <button
                onClick={onApprovePhase}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium transition-all",
                  "bg-green-600 hover:bg-green-700 text-white",
                  "shadow-md hover:shadow-lg"
                )}
              >
                <CheckCircle className="w-4 h-4" />
                批准继续
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export const PrimaryDecision = memo(PrimaryDecisionComponent)
