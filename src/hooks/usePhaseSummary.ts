import { useMemo, useRef } from 'react'
import { useThreadStore } from '../stores/thread'
import type { WorkflowPhase } from '../stores/multi-agent-v2'

export interface PhaseSummary {
  fileChanges: number
  commands: number
  errors: number
  completedAgents: number
  failedAgents: number
  totalAgents: number
}

interface AgentInfo {
  id: string
  threadId: string
  status: string
}

interface ThreadSummary {
  fileChanges: number
  commands: number
  errors: number
  itemCount: number
}

function computeThreadSummary(
  threadId: string,
  threads: Record<string, { items: Record<string, { type: string; content?: unknown }>; itemOrder: string[] }>
): ThreadSummary {
  const thread = threads[threadId]
  if (!thread) return { fileChanges: 0, commands: 0, errors: 0, itemCount: 0 }

  let fileChanges = 0
  let commands = 0
  let errors = 0

  for (const itemId of thread.itemOrder) {
    const item = thread.items[itemId]
    if (!item) continue

    if (item.type === 'fileChange') {
      const content = item.content as { changes?: unknown[] } | undefined
      fileChanges += content?.changes?.length || 1
    } else if (item.type === 'commandExecution') {
      commands++
    } else if (item.type === 'error') {
      errors++
    }
  }

  return { fileChanges, commands, errors, itemCount: thread.itemOrder.length }
}

export function usePhaseSummary(
  pendingPhase: WorkflowPhase | null,
  agents: AgentInfo[]
): PhaseSummary | null {
  const prevSummaryRef = useRef<PhaseSummary | null>(null)
  const prevDepsRef = useRef<{ phaseId: string | null; agentStatuses: string; itemCounts: string }>({
    phaseId: null,
    agentStatuses: '',
    itemCounts: '',
  })

  const threads = useThreadStore((state) => state.threads)

  return useMemo(() => {
    if (!pendingPhase) {
      prevSummaryRef.current = null
      return null
    }

    const phaseAgentIds = pendingPhase.agentIds || []
    if (phaseAgentIds.length === 0) {
      prevSummaryRef.current = null
      return null
    }

    const phaseAgents = phaseAgentIds
      .map((id) => agents.find((a) => a.id === id))
      .filter((a): a is AgentInfo => !!a)

    const sortedAgents = [...phaseAgents].sort((a, b) => a.id.localeCompare(b.id))
    const agentStatuses = sortedAgents.map((a) => `${a.id}|${a.status}`).join(';')
    const itemCounts = sortedAgents
      .map((a) => {
        const thread = threads[a.threadId]
        return `${a.id}|${thread?.itemOrder?.length ?? 0}`
      })
      .join(';')

    const depsKey = {
      phaseId: pendingPhase.id,
      agentStatuses,
      itemCounts,
    }

    if (
      prevDepsRef.current.phaseId === depsKey.phaseId &&
      prevDepsRef.current.agentStatuses === depsKey.agentStatuses &&
      prevDepsRef.current.itemCounts === depsKey.itemCounts &&
      prevSummaryRef.current
    ) {
      return prevSummaryRef.current
    }

    prevDepsRef.current = depsKey

    let fileChanges = 0
    let commands = 0
    let errors = 0

    for (const agent of phaseAgents) {
      if (!agent.threadId) continue
      const summary = computeThreadSummary(agent.threadId, threads)
      fileChanges += summary.fileChanges
      commands += summary.commands
      errors += summary.errors
    }

    const completedAgents = phaseAgents.filter((a) => a.status === 'completed').length
    const failedAgents = phaseAgents.filter((a) => a.status === 'error').length

    const result: PhaseSummary = {
      fileChanges,
      commands,
      errors,
      completedAgents,
      failedAgents,
      totalAgents: phaseAgentIds.length,
    }

    prevSummaryRef.current = result
    return result
  }, [pendingPhase, agents, threads])
}
