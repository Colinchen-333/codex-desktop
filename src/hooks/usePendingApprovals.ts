import { useMemo } from 'react'
import { useMultiAgentStore } from '../stores/multi-agent-v2'
import { useThreadStore } from '../stores/thread'
import type { WorkflowPhase, AgentDescriptor } from '../lib/workflows/types'

export interface SafetyApprovalItem {
  agentId: string
  agentName: string
  agentType: string
  threadId: string
  count: number
}

export interface PendingApprovalsState {
  phaseApproval: WorkflowPhase | null
  safetyApprovals: SafetyApprovalItem[]
  
  approvalTimeoutPhase: WorkflowPhase | null
  cancelledWorkflow: boolean
  failedAgents: AgentDescriptor[]
  
  totalCount: number
  hasRecoveryItems: boolean
}

const AGENT_TYPE_NAMES: Record<string, string> = {
  explore: '探索代理',
  plan: '计划代理',
  'code-writer': '编码代理',
  bash: '命令代理',
  tester: '测试代理',
  reviewer: '审查代理',
  documenter: '文档代理',
}

function getAgentTypeName(type: string): string {
  return AGENT_TYPE_NAMES[type] ?? type
}

export function usePendingApprovals(): PendingApprovalsState {
  const agents = useMultiAgentStore((state) => Object.values(state.agents))
  const workflow = useMultiAgentStore((state) => state.workflow)
  const threadStoreState = useThreadStore((state) => state.threads)

  const phaseApproval = useMemo(() => {
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

  const approvalTimeoutPhase = useMemo(() => {
    if (!workflow) return null
    return workflow.phases.find(p => p.status === 'approval_timeout') ?? null
  }, [workflow])

  const cancelledWorkflow = useMemo(() => {
    return workflow?.status === 'cancelled' || false
  }, [workflow])

  const failedAgents = useMemo(() => {
    return agents.filter(a => a.status === 'error' && a.error?.recoverable)
  }, [agents])

  const hasRecoveryItems = !!approvalTimeoutPhase || cancelledWorkflow || failedAgents.length > 0
  const totalCount = (phaseApproval ? 1 : 0) + safetyApprovals.reduce((sum, item) => sum + item.count, 0)

  return {
    phaseApproval,
    safetyApprovals,
    approvalTimeoutPhase,
    cancelledWorkflow,
    failedAgents,
    totalCount,
    hasRecoveryItems,
  }
}
