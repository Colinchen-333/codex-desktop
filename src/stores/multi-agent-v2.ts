/**
 * Multi-Agent Store v2 - Protocol-native multi-agent system
 *
 * This is a complete rewrite of the multi-agent system that uses real Codex threads
 * instead of MCP tool simulation. Each agent is an independent thread that can truly
 * execute in parallel.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { WritableDraft } from 'immer'
import { getAgentSandboxPolicy } from '../lib/agent-types'
import { threadApi } from '../lib/api'
import { log } from '../lib/logger'
import { WorkflowEngine } from '../lib/workflows/workflow-engine'
import { generatePhaseAgentTasks } from '../lib/workflows/plan-mode'

// Import types from shared types file
import type {
  AgentStatus,
  AgentProgress,
  AgentError,
  AgentConfigOverrides,
  AgentDescriptor,
  WorkflowPhaseStatus,
  WorkflowPhase,
  Workflow,
  WorkflowExecutionContext,
} from '../lib/workflows/types'
import type { AgentType } from '../lib/workflows/types'

// Re-export types for backward compatibility
export type {
  AgentStatus,
  AgentProgress,
  AgentError,
  AgentConfigOverrides,
  AgentDescriptor,
  WorkflowPhaseStatus,
  WorkflowPhase,
  Workflow,
  WorkflowExecutionContext,
}
export type { AgentType }

/**
 * Multi-agent configuration
 */
export interface MultiAgentConfig {
  cwd: string
  model: string
  approvalPolicy: string
  maxConcurrentAgents: number
}

// ==================== State Definition ====================

export interface MultiAgentState {
  // Configuration
  config: MultiAgentConfig
  setConfig: (config: Partial<MultiAgentConfig>) => void
  workingDirectory: string
  setWorkingDirectory: (dir: string) => void

  // Agents
  agents: Record<string, AgentDescriptor>
  agentOrder: string[] // Ordered list of agent IDs for UI display

  // Agent mapping (threadId -> agentId)
  agentMapping: Record<string, string>

  // Workflow
  workflow: Workflow | null
  workflowEngine: WorkflowEngine | null
  previousPhaseOutput?: string

  // Actions - Agent Management
  spawnAgent: (
    type: AgentType,
    task: string,
    dependencies?: string[],
    config?: AgentConfigOverrides
  ) => Promise<string | null> // Returns agentId or null on error
  updateAgentStatus: (id: string, status: AgentStatus, error?: AgentError) => void
  updateAgentProgress: (id: string, progress: Partial<AgentProgress>) => void
  cancelAgent: (id: string) => Promise<void>
  pauseAgent: (id: string) => Promise<void>
  resumeAgent: (id: string) => Promise<void>
  removeAgent: (id: string) => void
  clearAgents: () => void

  // Actions - Workflow Management
  startWorkflow: (workflow: Workflow) => Promise<void>
  approvePhase: (phaseId: string) => Promise<void>
  rejectPhase: (phaseId: string, reason?: string) => void
  cancelWorkflow: () => Promise<void>
  clearWorkflow: () => void
  _executePhase: (phase: WorkflowPhase) => Promise<void>
  checkPhaseCompletion: () => Promise<void>

  // Getters
  getAgent: (id: string) => AgentDescriptor | undefined
  getAgentByThreadId: (threadId: string) => AgentDescriptor | undefined
  getAgentsByStatus: (status: AgentStatus) => AgentDescriptor[]
  getCurrentPhase: () => WorkflowPhase | undefined

  // Reset
  reset: () => void
}

// ==================== Default Values ====================

const defaultConfig: MultiAgentConfig = {
  cwd: '',
  model: 'claude-sonnet-4-20250514',
  approvalPolicy: 'auto',
  maxConcurrentAgents: 10,
}

// ==================== Store Implementation ====================

export const useMultiAgentStore = create<MultiAgentState>()(
  immer((set, get) => ({
    // ==================== Initial State ====================
    config: defaultConfig,
    workingDirectory: '',
    agents: {},
    agentOrder: [],
    agentMapping: {},
    workflow: null,
    workflowEngine: null,
    previousPhaseOutput: undefined,

    // ==================== Configuration ====================
    setConfig: (config: Partial<MultiAgentConfig>) => {
      set((state) => {
        state.config = { ...state.config, ...config }
      })
    },

    setWorkingDirectory: (dir: string) => {
      set((state) => {
        state.workingDirectory = dir
        state.config.cwd = dir
      })
    },

    // ==================== Agent Management ====================

    /**
     * Spawn a new agent - creates a real Codex thread
     */
    spawnAgent: async (
      type: AgentType,
      task: string,
      dependencies: string[] = [],
      config: AgentConfigOverrides = {}
    ): Promise<string | null> => {
      try {
        const state = get()
        const agentId = crypto.randomUUID()

        // Check concurrent agent limit
        const runningAgents = Object.values(state.agents).filter(
          (a) => a.status === 'running'
        ).length
        if (runningAgents >= state.config.maxConcurrentAgents) {
          log.warn(`[spawnAgent] Max concurrent agents (${state.config.maxConcurrentAgents}) reached`, 'multi-agent')
          // Don't fail, just queue as pending
        }

        // Create agent descriptor (initially pending)
        const agent: AgentDescriptor = {
          id: agentId,
          type,
          threadId: '', // Will be set after thread creation
          task,
          dependencies,
          status: 'pending',
          progress: {
            current: 0,
            total: 1,
            description: '等待启动',
          },
          threadStoreRef: '',
          createdAt: new Date(),
          config,
        }

        // Add to store
        set((state) => {
          state.agents[agentId] = agent as WritableDraft<AgentDescriptor>
          state.agentOrder.push(agentId)
        })

        // Start thread asynchronously
        void (async () => {
          try {
            // Check dependencies before starting
            if (dependencies.length > 0) {
              const allDepsCompleted = dependencies.every((depId) => {
                const dep = state.agents[depId]
                return dep && dep.status === 'completed'
              })

              if (!allDepsCompleted) {
                log.info(`[spawnAgent] Agent ${agentId} waiting for dependencies`, 'multi-agent')
                // Wait for dependencies (poll every 2 seconds)
                await new Promise<void>((resolve) => {
                  const checkInterval = setInterval(() => {
                    const currentState = get()
                    const allCompleted = dependencies.every((depId) => {
                      const dep = currentState.agents[depId]
                      return dep && dep.status === 'completed'
                    })

                    if (allCompleted) {
                      clearInterval(checkInterval)
                      resolve()
                    }
                  }, 2000)
                })
              }
            }

            // Get sandbox policy for agent type
            const sandboxPolicy = getAgentSandboxPolicy(type)

            // Map sandbox policy to approval policy
            const approvalPolicyMap: Record<string, string> = {
              'read-only': 'none',
              'workspace-write': 'auto',
              'workspace-write-with-approval': 'user',
            }
            const approvalPolicy = approvalPolicyMap[sandboxPolicy] || state.config.approvalPolicy

            // Start thread
            const response = await threadApi.start(
              '', // projectId - Will be set by backend
              state.config.cwd,
              config.model || state.config.model,
              sandboxPolicy,
              approvalPolicy
            )

            const threadId = response.thread.id

            // Update agent with threadId
            set((state) => {
              const agent = state.agents[agentId]
              if (agent) {
                agent.threadId = threadId
                agent.threadStoreRef = threadId
                agent.status = 'running'
                agent.startedAt = new Date()
                agent.progress.description = '正在执行任务'
              }
              // Add to agent mapping
              state.agentMapping[threadId] = agentId
            })

            // Send initial task message
            await threadApi.sendMessage(threadId, task, [], [])

            log.info(`[spawnAgent] Agent ${agentId} started with thread ${threadId}`, 'multi-agent')
          } catch (error) {
            log.error(`[spawnAgent] Failed to start thread for agent ${agentId}: ${error}`, 'multi-agent')
            set((state) => {
              const agent = state.agents[agentId]
              if (agent) {
                agent.status = 'error'
                agent.error = {
                  message: error instanceof Error ? error.message : String(error),
                  code: 'THREAD_START_FAILED',
                  recoverable: true,
                }
              }
            })
          }
        })()

        return agentId
      } catch (error) {
        log.error(`[spawnAgent] Failed to create agent: ${error}`, 'multi-agent')
        return null
      }
    },

    /**
     * Update agent status
     */
    updateAgentStatus: (id: string, status: AgentStatus, error?: AgentError) => {
      set((state) => {
        const agent = state.agents[id]
        if (!agent) return

        agent.status = status

        if (status === 'running' && !agent.startedAt) {
          agent.startedAt = new Date()
        }

        if (status === 'completed' || status === 'error' || status === 'cancelled') {
          agent.completedAt = new Date()
        }

        if (error) {
          agent.error = error as WritableDraft<AgentError>
        }
      })

      // Check if phase is complete when agent completes
      if (status === 'completed' || status === 'error' || status === 'cancelled') {
        // Use setTimeout to avoid calling checkPhaseCompletion during set()
        setTimeout(() => {
          get().checkPhaseCompletion().catch((err) => {
            log.error(`[updateAgentStatus] Failed to check phase completion: ${err}`, 'multi-agent')
          })
        }, 0)
      }
    },

    /**
     * Update agent progress
     */
    updateAgentProgress: (id: string, progress: Partial<AgentProgress>) => {
      set((state) => {
        const agent = state.agents[id]
        if (!agent) return

        agent.progress = { ...agent.progress, ...progress }
      })
    },

    /**
     * Cancel an agent
     */
    cancelAgent: async (id: string) => {
      const agent = get().agents[id]
      if (!agent) return

      try {
        if (agent.threadId) {
          await threadApi.interrupt(agent.threadId)
          // Note: No closeThread method in threadApi, thread cleanup is handled by backend
        }

        set((state) => {
          const agent = state.agents[id]
          if (agent) {
            agent.status = 'cancelled'
            agent.completedAt = new Date()
          }
        })

        log.info(`[cancelAgent] Agent ${id} cancelled`, 'multi-agent')
      } catch (error) {
        log.error(`[cancelAgent] Failed to cancel agent ${id}: ${error}`, 'multi-agent')
      }
    },

    /**
     * Pause an agent
     */
    pauseAgent: async (id: string) => {
      const agent = get().agents[id]
      if (!agent || !agent.threadId) return

      try {
        await threadApi.interrupt(agent.threadId)
        log.info(`[pauseAgent] Agent ${id} paused`, 'multi-agent')
      } catch (error) {
        log.error(`[pauseAgent] Failed to pause agent ${id}: ${error}`, 'multi-agent')
      }
    },

    /**
     * Resume an agent
     */
    resumeAgent: async (id: string) => {
      const agent = get().agents[id]
      if (!agent || !agent.threadId) return

      try {
        // Resume uses sendMessage with the resumed text
        await threadApi.sendMessage(agent.threadId, '请继续执行任务', [], [])
        log.info(`[resumeAgent] Agent ${id} resumed`, 'multi-agent')
      } catch (error) {
        log.error(`[resumeAgent] Failed to resume agent ${id}: ${error}`, 'multi-agent')
      }
    },

    /**
     * Remove an agent from the store
     */
    removeAgent: (id: string) => {
      set((state) => {
        const agent = state.agents[id]
        if (agent && agent.threadId) {
          delete state.agentMapping[agent.threadId]
        }
        delete state.agents[id]
        state.agentOrder = state.agentOrder.filter((aid) => aid !== id)
      })
    },

    /**
     * Clear all agents
     */
    clearAgents: () => {
      set((state) => {
        state.agents = {}
        state.agentOrder = []
        state.agentMapping = {}
      })
    },

    // ==================== Workflow Management ====================

    /**
     * Start a workflow
     */
    startWorkflow: async (workflow: Workflow) => {
      const state = get()
      
      // Set workflow
      set((s) => {
        s.workflow = workflow as WritableDraft<Workflow>
        s.workflow.status = 'running'
        s.workflow.startedAt = new Date()
      })

      // Create workflow engine
      const context: WorkflowExecutionContext = {
        workingDirectory: state.workingDirectory || state.config.cwd,
        userTask: workflow.description,
        globalConfig: { ...state.config },
      }

      const engine = new WorkflowEngine(workflow.phases, context, {
        onPhaseStarted: (phase) => {
          log.info(`[Workflow] Phase started: ${phase.name}`, 'multi-agent')
        },
        onPhaseCompleted: (phase) => {
          log.info(`[Workflow] Phase completed: ${phase.name}`, 'multi-agent')
        },
        onPhaseFailed: (phase, error) => {
          log.error(`[Workflow] Phase failed: ${phase.name}: ${error}`, 'multi-agent')
        },
        onApprovalRequired: (phase) => {
          log.info(`[Workflow] Approval required for phase: ${phase.name}`, 'multi-agent')
          // UI will show approval dialog
        },
        onAllPhasesCompleted: () => {
          log.info('[Workflow] All phases completed', 'multi-agent')
          set((s) => {
            if (s.workflow) {
              s.workflow.status = 'completed'
              s.workflow.completedAt = new Date()
            }
          })
        },
      })

      set((s) => {
        s.workflowEngine = engine as WritableDraft<WorkflowEngine>
      })

      // Start first phase
      await get()._executePhase(workflow.phases[0])
    },

    /**
     * Execute a workflow phase (internal method)
     */
    _executePhase: async (phase: WorkflowPhase) => {
      const state = get()
      
      log.info(`[_executePhase] Starting phase: ${phase.name}`, 'multi-agent')

      // Mark phase as running
      set((s) => {
        if (s.workflow) {
          const p = s.workflow.phases.find((wp) => wp.id === phase.id)
          if (p) {
            p.status = 'running'
            p.startedAt = new Date()
          }
        }
      })

      try {
        // Generate agent tasks for this phase
        const agentTasks = generatePhaseAgentTasks(phase, state.previousPhaseOutput)

        if (agentTasks.length === 0) {
          log.warn(`[_executePhase] No agent tasks generated for phase: ${phase.name}`, 'multi-agent')
          return
        }

        // Spawn agents for this phase
        const spawnedAgentIds: string[] = []
        for (const { type, task, config } of agentTasks) {
          const agentId = await state.spawnAgent(type, task, [], config)
          if (agentId) {
            spawnedAgentIds.push(agentId)
          }
        }

        // Update phase with agent IDs
        set((s) => {
          if (s.workflow) {
            const p = s.workflow.phases.find((wp) => wp.id === phase.id)
            if (p) {
              p.agentIds = spawnedAgentIds
            }
          }
        })

        log.info(`[_executePhase] Spawned ${spawnedAgentIds.length} agents for phase: ${phase.name}`, 'multi-agent')
      } catch (error) {
        log.error(`[_executePhase] Failed to execute phase: ${phase.name}: ${error}`, 'multi-agent')
        set((s) => {
          if (s.workflow) {
            const p = s.workflow.phases.find((wp) => wp.id === phase.id)
            if (p) {
              p.status = 'failed'
              p.completedAt = new Date()
            }
            s.workflow.status = 'failed'
          }
        })
      }
    },

    /**
     * Approve a workflow phase
     */
    approvePhase: async (phaseId: string) => {
      const state = get()
      const workflow = state.workflow
      const engine = state.workflowEngine

      if (!workflow) return

      const phaseIndex = workflow.phases.findIndex((p) => p.id === phaseId)
      if (phaseIndex === -1) return

      // Mark phase as completed
      set((s) => {
        if (!s.workflow) return
        const p = s.workflow.phases[phaseIndex]
        if (p) {
          p.status = 'completed'
          p.completedAt = new Date()
        }
      })

      // Move to next phase
      const nextPhase = workflow.phases[phaseIndex + 1]
      if (nextPhase) {
        set((s) => {
          if (s.workflow) {
            s.workflow.currentPhaseIndex = phaseIndex + 1
          }
        })
        
        // Execute next phase
        await get()._executePhase(nextPhase)
      } else {
        // Workflow completed
        set((s) => {
          if (s.workflow) {
            s.workflow.status = 'completed'
            s.workflow.completedAt = new Date()
          }
        })
      }

      // Notify workflow engine if it exists
      if (engine) {
        engine.approvePhase(phaseId)
      }
    },

    /**
     * Reject a workflow phase
     */
    rejectPhase: (phaseId: string, reason?: string) => {
      set((state) => {
        if (!state.workflow) return

        const phase = state.workflow.phases.find((p) => p.id === phaseId)
        if (phase) {
          phase.status = 'failed'
          phase.completedAt = new Date()
          if (reason) {
            phase.output = `Phase rejected: ${reason}`
          }
        }

        state.workflow.status = 'failed'
        state.workflow.completedAt = new Date()
      })
    },

    /**
     * Cancel the workflow
     */
    cancelWorkflow: async () => {
      const workflow = get().workflow
      if (!workflow) return

      // Cancel all running agents
      const agents = Object.values(get().agents)
      for (const agent of agents) {
        if (agent.status === 'running') {
          await get().cancelAgent(agent.id)
        }
      }

      set((state) => {
        if (state.workflow) {
          state.workflow.status = 'cancelled'
          state.workflow.completedAt = new Date()
        }
      })
    },

    /**
     * Clear the workflow
     */
    clearWorkflow: () => {
      set((state) => {
        state.workflow = null
      })
    },

    // ==================== Getters ====================

    /**
     * Get agent by ID
     */
    getAgent: (id: string) => {
      return get().agents[id]
    },

    /**
     * Get agent by thread ID
     */
    getAgentByThreadId: (threadId: string) => {
      const agentId = get().agentMapping[threadId]
      return agentId ? get().agents[agentId] : undefined
    },

    /**
     * Get agents by status
     */
    getAgentsByStatus: (status: AgentStatus) => {
      return Object.values(get().agents).filter((a) => a.status === status)
    },

    /**
     * Get current workflow phase
     */
    getCurrentPhase: () => {
      const workflow = get().workflow
      if (!workflow) return undefined
      return workflow.phases[workflow.currentPhaseIndex]
    },

    /**
     * Check if current phase is complete and move to next phase
     * This should be called when an agent completes
     */
    checkPhaseCompletion: async () => {
      const state = get()
      const workflow = state.workflow
      if (!workflow) return

      const currentPhase = workflow.phases[workflow.currentPhaseIndex]
      if (!currentPhase || currentPhase.agentIds.length === 0) return

      // Check if all agents in this phase have completed
      const phaseAgents = currentPhase.agentIds
        .map((id) => state.agents[id])
        .filter(Boolean)

      const allCompleted = phaseAgents.every(
        (a) => a.status === 'completed' || a.status === 'error' || a.status === 'cancelled'
      )

      if (!allCompleted) return

      const hasError = phaseAgents.some((a) => a.status === 'error')

      if (hasError) {
        // Phase failed
        set((s) => {
          if (!s.workflow) return
          const p = s.workflow.phases[s.workflow.currentPhaseIndex]
          if (p) {
            p.status = 'failed'
            p.completedAt = new Date()
          }
          s.workflow.status = 'failed'
        })
        return
      }

      // Phase completed successfully
      log.info(`[checkPhaseCompletion] Phase completed: ${currentPhase.name}`, 'multi-agent')

      // Check if approval is required
      if (currentPhase.requiresApproval) {
        log.info(`[checkPhaseCompletion] Approval required for phase: ${currentPhase.name}`, 'multi-agent')
        // UI will show approval dialog - don't auto-advance
        return
      }

      // Auto-advance to next phase
      await state.approvePhase(currentPhase.id)
    },

    // ==================== Reset ====================

    /**
     * Reset all state
     */
    reset: () => {
      // Interrupt all running agent threads
      const agents = Object.values(get().agents)
      for (const agent of agents) {
        if (agent.threadId && agent.status === 'running') {
          threadApi.interrupt(agent.threadId).catch((error) => {
            log.error(`[reset] Failed to interrupt thread ${agent.threadId}: ${error}`, 'multi-agent')
          })
        }
      }

      set((state) => {
        state.config = defaultConfig
        state.agents = {}
        state.agentOrder = []
        state.agentMapping = {}
        state.workflow = null
      })
    },
  }))
)
