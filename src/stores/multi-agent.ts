/**
 * Multi-Agent Store - State management for multi-agent orchestration mode
 *
 * Manages the orchestrator thread and child agents spawned during multi-agent sessions.
 */

import { create } from 'zustand'

// Child agent status
export type ChildAgentStatus = 'pending' | 'running' | 'completed' | 'error'

// Child agent state
export interface ChildAgent {
  id: string
  task: string
  persona: string
  status: ChildAgentStatus
  output: string[]
  createdAt: Date
  completedAt?: Date
  error?: string
}

// Multi-agent configuration
export interface MultiAgentConfig {
  cwd: string
  maxAgents: number
  timeout: number // in minutes
  model: string
}

// Multi-agent phase
export type MultiAgentPhase = 'setup' | 'running'

export interface MultiAgentState {
  // Current phase
  phase: MultiAgentPhase
  setPhase: (phase: MultiAgentPhase) => void

  // Configuration
  config: MultiAgentConfig
  setConfig: (config: Partial<MultiAgentConfig>) => void

  // Orchestrator session
  orchestratorThreadId: string | null
  setOrchestratorThreadId: (threadId: string | null) => void

  // Child agents
  childAgents: Record<string, ChildAgent>
  addChildAgent: (agent: ChildAgent) => void
  updateChildAgent: (id: string, update: Partial<ChildAgent>) => void
  removeChildAgent: (id: string) => void
  clearChildAgents: () => void

  // Reset all state
  reset: () => void
}

const defaultConfig: MultiAgentConfig = {
  cwd: '',
  maxAgents: 3,
  timeout: 5,
  model: 'claude-sonnet-4-20250514',
}

export const useMultiAgentStore = create<MultiAgentState>((set) => ({
  // Current phase
  phase: 'setup',
  setPhase: (phase) => set({ phase }),

  // Configuration
  config: defaultConfig,
  setConfig: (config) =>
    set((state) => ({
      config: { ...state.config, ...config },
    })),

  // Orchestrator session
  orchestratorThreadId: null,
  setOrchestratorThreadId: (threadId) => set({ orchestratorThreadId: threadId }),

  // Child agents
  childAgents: {},
  addChildAgent: (agent) =>
    set((state) => ({
      childAgents: { ...state.childAgents, [agent.id]: agent },
    })),
  updateChildAgent: (id, update) =>
    set((state) => {
      // 防守编程：如果 agent 不存在，直接返回原状态，避免创建 undefined 值
      if (!state.childAgents[id]) {
        return state
      }
      return {
        childAgents: {
          ...state.childAgents,
          [id]: { ...state.childAgents[id], ...update },
        },
      }
    }),
  removeChildAgent: (id) =>
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _, ...rest } = state.childAgents
      return { childAgents: rest }
    }),
  clearChildAgents: () => set({ childAgents: {} }),

  // Reset all state (only resets state, does NOT close threads)
  // Callers are responsible for closing the orchestrator thread before calling reset()
  // See: StatusBarActions.handleMultiAgentToggle, OrchestratorView.handleEndSession
  reset: () => {
    set({
      phase: 'setup',
      config: defaultConfig,
      orchestratorThreadId: null,
      childAgents: {},
    })
  },
}))
