import { useMemo } from 'react'
import { X, CheckSquare, FileCode, ChevronRight, Clock } from 'lucide-react'
import { useMultiAgentStore } from '../../stores/multi-agent-v2'
import { useThreadStore } from '../../stores/thread'
import { cn } from '../../lib/utils'

interface ReviewInboxProps {
  isOpen: boolean
  onClose: () => void
  onSelectAgent: (agentId: string) => void
  onOpenPhaseApproval: () => void
}

interface SafetyApprovalItem {
  agentId: string
  agentName: string
  agentType: string
  threadId: string
  count: number
}

export function ReviewInbox({ isOpen, onClose, onSelectAgent, onOpenPhaseApproval }: ReviewInboxProps) {
  const agents = useMultiAgentStore((state) => Object.values(state.agents))
  const workflow = useMultiAgentStore((state) => state.workflow)
  const threadStoreState = useThreadStore((state) => state.threads)

  const pendingApprovalPhase = useMemo(() => {
    if (!workflow) return null
    const currentPhase = workflow.phases[workflow.currentPhaseIndex]
    if (!currentPhase) return null
    if (
      currentPhase.requiresApproval &&
      (currentPhase.status === 'awaiting_approval' || currentPhase.status === 'approval_timeout')
    ) {
      return currentPhase
    }
    return null
  }, [workflow])

  const safetyApprovals = useMemo((): SafetyApprovalItem[] => {
    const items: SafetyApprovalItem[] = []
    for (const agent of agents) {
      if (!agent.threadId) continue
      const thread = threadStoreState[agent.threadId]
      if (thread?.pendingApprovals && thread.pendingApprovals.length > 0) {
        items.push({
          agentId: agent.id,
          agentName: getAgentTypeName(agent.type),
          agentType: agent.type,
          threadId: agent.threadId,
          count: thread.pendingApprovals.length,
        })
      }
    }
    return items
  }, [agents, threadStoreState])

  const totalCount = (pendingApprovalPhase ? 1 : 0) + safetyApprovals.reduce((sum, item) => sum + item.count, 0)

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

        <div className="flex-1 overflow-y-auto">
          {totalCount === 0 ? (
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

function getAgentTypeName(type: string): string {
  const names: Record<string, string> = {
    explore: '探索代理',
    plan: '计划代理',
    'code-writer': '编码代理',
    bash: '命令代理',
    tester: '测试代理',
  }
  return names[type] ?? type
}
