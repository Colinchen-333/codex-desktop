/**
 * useMultiAgent Hook - React hook for multi-agent system
 *
 * Provides convenient access to multi-agent store state and actions
 */

import { useMemo } from 'react'
import { useMultiAgentStore } from '../stores/multi-agent-v2'
import type { AgentStatus, AgentDescriptor } from '../stores/multi-agent-v2'
import { sortAgentsByStatus, groupAgentsByStatus } from '../lib/agent-utils'

/**
 * Get all agents
 */
export function useAgents(): AgentDescriptor[] {
  return useMultiAgentStore((state) => {
    return state.agentOrder.map((id) => state.agents[id]).filter((a) => a !== undefined)
  })
}

/**
 * Get agents sorted by status priority
 */
export function useSortedAgents(): AgentDescriptor[] {
  const agents = useAgents()
  return useMemo(() => sortAgentsByStatus(agents), [agents])
}

/**
 * Get agents grouped by status
 */
export function useAgentsByStatus(): Record<AgentStatus, AgentDescriptor[]> {
  const agents = useAgents()
  return useMemo(() => groupAgentsByStatus(agents), [agents])
}

/**
 * Get a single agent by ID
 */
export function useAgent(id: string): AgentDescriptor | undefined {
  return useMultiAgentStore((state) => state.agents[id])
}

/**
 * Get agent by thread ID
 */
export function useAgentByThreadId(threadId: string): AgentDescriptor | undefined {
  return useMultiAgentStore((state) => {
    const agentId = state.agentMapping[threadId]
    return agentId ? state.agents[agentId] : undefined
  })
}

/**
 * Get agents by status
 */
export function useAgentsWithStatus(status: AgentStatus): AgentDescriptor[] {
  return useMultiAgentStore((state) => state.getAgentsByStatus(status))
}

/**
 * Get running agents count
 */
export function useRunningAgentsCount(): number {
  return useMultiAgentStore((state) => state.getAgentsByStatus('running').length)
}

/**
 * Get completed agents count
 */
export function useCompletedAgentsCount(): number {
  return useMultiAgentStore((state) => state.getAgentsByStatus('completed').length)
}

/**
 * Get failed agents count
 */
export function useFailedAgentsCount(): number {
  return useMultiAgentStore((state) => state.getAgentsByStatus('error').length)
}

/**
 * Get current workflow
 */
export function useWorkflow() {
  return useMultiAgentStore((state) => state.workflow)
}

/**
 * Get current workflow phase
 */
export function useCurrentPhase() {
  return useMultiAgentStore((state) => state.getCurrentPhase())
}

/**
 * Get multi-agent config
 */
export function useMultiAgentConfig() {
  return useMultiAgentStore((state) => state.config)
}

/**
 * Get spawn agent action
 */
export function useSpawnAgent() {
  return useMultiAgentStore((state) => state.spawnAgent)
}

/**
 * Get cancel agent action
 */
export function useCancelAgent() {
  return useMultiAgentStore((state) => state.cancelAgent)
}

/**
 * Get pause agent action
 */
export function usePauseAgent() {
  return useMultiAgentStore((state) => state.pauseAgent)
}

/**
 * Get resume agent action
 */
export function useResumeAgent() {
  return useMultiAgentStore((state) => state.resumeAgent)
}

/**
 * Get all multi-agent actions
 */
export function useMultiAgentActions() {
  return {
    spawnAgent: useMultiAgentStore((state) => state.spawnAgent),
    cancelAgent: useMultiAgentStore((state) => state.cancelAgent),
    pauseAgent: useMultiAgentStore((state) => state.pauseAgent),
    resumeAgent: useMultiAgentStore((state) => state.resumeAgent),
    updateAgentStatus: useMultiAgentStore((state) => state.updateAgentStatus),
    updateAgentProgress: useMultiAgentStore((state) => state.updateAgentProgress),
    startWorkflow: useMultiAgentStore((state) => state.startWorkflow),
    approvePhase: useMultiAgentStore((state) => state.approvePhase),
    rejectPhase: useMultiAgentStore((state) => state.rejectPhase),
    cancelWorkflow: useMultiAgentStore((state) => state.cancelWorkflow),
  }
}

/**
 * Check if any agent is running
 */
export function useHasRunningAgents(): boolean {
  return useMultiAgentStore((state) => state.getAgentsByStatus('running').length > 0)
}

/**
 * Check if all agents are completed
 */
export function useAllAgentsCompleted(): boolean {
  const agents = useAgents()
  if (agents.length === 0) return false
  return agents.every((a) => a.status === 'completed')
}

/**
 * Get agent statistics
 */
export function useAgentStats() {
  return useMultiAgentStore((state) => {
    const agents = Object.values(state.agents)
    return {
      total: agents.length,
      running: agents.filter((a) => a.status === 'running').length,
      pending: agents.filter((a) => a.status === 'pending').length,
      completed: agents.filter((a) => a.status === 'completed').length,
      error: agents.filter((a) => a.status === 'error').length,
      cancelled: agents.filter((a) => a.status === 'cancelled').length,
    }
  })
}
