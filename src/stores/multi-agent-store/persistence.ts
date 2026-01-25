import { createJSONStorage, type PersistStorage } from 'zustand/middleware'
import { log } from '../../lib/logger'
import type { AgentDescriptor } from '../../lib/workflows/types'
import type { MultiAgentState, PersistedMultiAgentState } from './types'
import { MAX_PHASE_OUTPUT_LENGTH, MAX_AGENT_TASK_LENGTH } from './constants'

export const STORAGE_NAME = 'codex-multi-agent-state'
export const STORAGE_VERSION = 2

export function createMultiAgentStorage(): PersistStorage<PersistedMultiAgentState> | undefined {
  return createJSONStorage(() => localStorage)
}

export function partializeState(state: MultiAgentState): PersistedMultiAgentState {
  const truncatedPreviousPhaseOutput = state.previousPhaseOutput
    ? state.previousPhaseOutput.slice(0, MAX_PHASE_OUTPUT_LENGTH)
    : undefined

  const compactAgents: Record<string, Partial<AgentDescriptor>> = {}
  for (const [id, agent] of Object.entries(state.agents)) {
    compactAgents[id] = {
      id: agent.id,
      type: agent.type,
      threadId: agent.threadId,
      task: agent.task.slice(0, MAX_AGENT_TASK_LENGTH),
      dependencies: agent.dependencies,
      status: agent.status,
      progress: agent.progress,
      threadStoreRef: agent.threadStoreRef,
      createdAt: agent.createdAt,
      startedAt: agent.startedAt,
      completedAt: agent.completedAt,
      error: agent.error,
      interruptReason: agent.interruptReason,
      config: agent.config,
    }
  }

  const compactWorkflow = state.workflow ? {
    ...state.workflow,
    phases: state.workflow.phases.map((phase) => ({
      ...phase,
      output: phase.output?.slice(0, MAX_PHASE_OUTPUT_LENGTH),
    })),
  } : null

  return {
    config: state.config,
    workingDirectory: state.workingDirectory,
    agents: compactAgents as Record<string, AgentDescriptor>,
    agentOrder: state.agentOrder,
    agentMapping: state.agentMapping,
    workflow: compactWorkflow,
    previousPhaseOutput: truncatedPreviousPhaseOutput,
  }
}

function restoreDates(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(restoreDates)
  
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      result[key] = new Date(value)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = restoreDates(value)
    } else {
      result[key] = value
    }
  }
  return result
}

export function createOnRehydrateHandler(
  getStore: () => MultiAgentState
): (state: MultiAgentState | undefined) => void {
  return (state) => {
    if (!state) return
    
    if (state.workflow) {
      state.workflow = restoreDates(state.workflow) as typeof state.workflow
    }
    if (state.agents) {
      state.agents = restoreDates(state.agents) as typeof state.agents
    }
    
    if (state.agents) {
      for (const agentId of Object.keys(state.agents)) {
        const agent = state.agents[agentId]
        if (agent && agent.status === 'running') {
          log.warn(`[onRehydrateStorage] Agent ${agentId} was running before restart, marking as error`, 'multi-agent')
          agent.status = 'error'
          agent.completedAt = new Date()
          agent.error = {
            message: '应用重启后连接丢失。点击"重试"继续执行。',
            code: 'APP_RESTART_LOST_CONNECTION',
            recoverable: true,
          }
          agent.progress.description = '连接丢失'
        }
      }
    }
    
    if (state.workflow) {
      let hasAwaitingApproval = false
      let awaitingApprovalPhaseId: string | null = null
      
      for (const phase of state.workflow.phases) {
        if (phase.status === 'running') {
          log.warn(`[onRehydrateStorage] Phase ${phase.id} was running before restart, marking as error`, 'multi-agent')
          phase.status = 'failed'
          phase.completedAt = new Date()
          phase.output = '应用重启后连接丢失。请重试此阶段。'
        } else if (phase.status === 'awaiting_approval') {
          hasAwaitingApproval = true
          awaitingApprovalPhaseId = phase.id
        }
      }
      
      if (state.workflow.status === 'running') {
        const hasFailedPhase = state.workflow.phases.some((p) => p.status === 'failed')
        if (hasFailedPhase) {
          state.workflow.status = 'failed'
        }
      }
      
      if (hasAwaitingApproval && awaitingApprovalPhaseId && state.workflow.status === 'running') {
        log.info(`[onRehydrateStorage] Restarting approval timeout for phase ${awaitingApprovalPhaseId}`, 'multi-agent')
        const phaseId = awaitingApprovalPhaseId
        setTimeout(() => {
          getStore()._startApprovalTimeout(phaseId)
        }, 100)
      }
    }

    const restartRecoveryCandidates = Object.values(state.agents || {}).filter(
      (agent) => agent.threadId && agent.error?.code === 'APP_RESTART_LOST_CONNECTION'
    )
    if (restartRecoveryCandidates.length > 0) {
      setTimeout(() => {
        void getStore()._autoResumeAfterRestart()
      }, 200)
    }
  }
}
