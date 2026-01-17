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
import { getAgentSandboxPolicy, getAgentSystemPrompt, getAgentToolWhitelist } from '../lib/agent-types'
import { threadApi } from '../lib/api'
import { log } from '../lib/logger'
import { normalizeApprovalPolicy, normalizeSandboxMode } from '../lib/normalize'
import { WorkflowEngine } from '../lib/workflows/workflow-engine'
import { extractPhaseSummary, generatePhaseAgentTasks } from '../lib/workflows/plan-mode'
import { useThreadStore } from './thread'
import type { SingleThreadState } from './thread/types'

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
  projectId?: string
  cwd: string
  model: string
  approvalPolicy: string
  timeout: number
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
  phaseCompletionInFlight: string | null

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
  retryAgent: (id: string) => Promise<void>
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
  projectId: undefined,
  cwd: '',
  model: '',
  approvalPolicy: 'on-request',
  timeout: 300,
  maxConcurrentAgents: 10,
}

const APPROVAL_POLICY_ORDER: Record<string, number> = {
  never: 0,
  'on-failure': 1,
  untrusted: 2,
  'on-request': 3,
}

const MAX_AGENT_OUTPUT_CHARS = 4000
const START_SLOT_POLL_MS = 500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function getRequiredApprovalPolicy(sandboxPolicy: string): string | undefined {
  const approvalPolicyMap: Record<string, string> = {
    'read-only': 'never',
    'workspace-write': 'on-failure',
    'workspace-write-with-approval': 'on-request',
  }
  return approvalPolicyMap[sandboxPolicy]
}

function resolveApprovalPolicy(
  sandboxPolicy: string,
  requested?: string,
  fallback?: string
): string | undefined {
  const required = normalizeApprovalPolicy(getRequiredApprovalPolicy(sandboxPolicy))
  const normalizedRequested = normalizeApprovalPolicy(requested)
  const normalizedFallback = normalizeApprovalPolicy(fallback)
  const candidate = normalizedRequested ?? normalizedFallback ?? required

  if (!required || !candidate) return candidate ?? required
  const candidatePriority = APPROVAL_POLICY_ORDER[candidate] ?? 0
  const requiredPriority = APPROVAL_POLICY_ORDER[required] ?? 0
  return candidatePriority >= requiredPriority ? candidate : required
}

function resolveSandboxPolicy(policy: string): string {
  const normalized = normalizeSandboxMode(policy)
  if (normalized) return normalized
  if (policy === 'workspace-write-with-approval') {
    return 'workspace-write'
  }
  log.warn(`[resolveSandboxPolicy] Unknown sandbox policy "${policy}", defaulting to workspace-write`, 'multi-agent')
  return 'workspace-write'
}

function extractLatestAgentMessage(threadState?: SingleThreadState): string | undefined {
  if (!threadState) return undefined

  for (let index = threadState.itemOrder.length - 1; index >= 0; index -= 1) {
    const itemId = threadState.itemOrder[index]
    const item = threadState.items[itemId]
    if (item?.type === 'agentMessage') {
      const content = item.content as { text?: string }
      if (content.text) {
        return content.text
      }
    }
  }

  return undefined
}

function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...`
}

function buildAgentDeveloperInstructions(type: AgentType): string | undefined {
  const systemPrompt = getAgentSystemPrompt(type)
  const toolWhitelist = getAgentToolWhitelist(type)

  const sections: string[] = []

  if (systemPrompt) {
    sections.push(`## 角色指引\n${systemPrompt}`)
  }

  if (toolWhitelist.length > 0) {
    sections.push(`## 可用工具\n${toolWhitelist.join(', ')}`)
  }
  if (sections.length === 0) return undefined

  return sections.join('\n\n')
}

function buildAgentTaskMessage(task: string): string {
  return task
}

function buildPhaseOutput(phase: WorkflowPhase, agents: AgentDescriptor[]): string {
  const threads = useThreadStore.getState().threads
  const outputs = agents.map((agent) => {
    const threadState = agent.threadId ? threads[agent.threadId] : undefined
    const latest = extractLatestAgentMessage(threadState) ?? '无输出'
    return {
      id: agent.id,
      output: truncateOutput(latest, MAX_AGENT_OUTPUT_CHARS),
    }
  })

  return extractPhaseSummary(phase, outputs)
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
    phaseCompletionInFlight: null,

    // ==================== Configuration ====================
    setConfig: (config: Partial<MultiAgentConfig>) => {
      set((state) => {
        const nextConfig = { ...state.config, ...config }
        if (config.approvalPolicy) {
          const normalized = normalizeApprovalPolicy(config.approvalPolicy)
          if (normalized) {
            nextConfig.approvalPolicy = normalized
          }
        }
        if (config.timeout !== undefined && config.timeout < 0) {
          nextConfig.timeout = state.config.timeout
        }
        state.config = nextConfig
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

        const shouldAbortStart = () => {
          const current = get().agents[agentId]
          return !current || current.status === 'cancelled' || current.interruptReason === 'cancel'
        }

        const isPaused = () => {
          const current = get().agents[agentId]
          return current?.interruptReason === 'pause'
        }

        const dependencyTimeoutMs = (() => {
          const timeoutSeconds = config.timeout ?? state.config.timeout
          if (!timeoutSeconds || timeoutSeconds <= 0) return 0
          return timeoutSeconds * 1000
        })()

        const waitForDependencies = async () => {
          if (dependencies.length === 0) return true

          set((state) => {
            const agent = state.agents[agentId]
            if (agent) {
              agent.progress.description = '等待依赖完成'
            }
          })

          const evaluateDependencies = (currentState: MultiAgentState) => {
            let hasFailed = false
            const allCompleted = dependencies.every((depId) => {
              const dep = currentState.agents[depId]
              if (!dep) {
                hasFailed = true
                return false
              }
              if (dep.status === 'error' || dep.status === 'cancelled') {
                hasFailed = true
                return false
              }
              return dep.status === 'completed'
            })
            return { allCompleted, hasFailed }
          }

          const initialStatus = evaluateDependencies(get())
          if (initialStatus.hasFailed) {
            set((state) => {
              const agent = state.agents[agentId]
              if (agent) {
                agent.status = 'error'
                agent.completedAt = new Date()
                agent.error = {
                  message: '依赖代理执行失败或被取消',
                  code: 'DEPENDENCY_FAILED',
                  recoverable: false,
                }
              }
            })
            return false
          }

          if (initialStatus.allCompleted) return true

          log.info(`[spawnAgent] Agent ${agentId} waiting for dependencies`, 'multi-agent')
          return new Promise<boolean>((resolve) => {
            const startTime = Date.now()
            const checkInterval = setInterval(() => {
              if (shouldAbortStart()) {
                clearInterval(checkInterval)
                resolve(false)
                return
              }

              if (isPaused()) {
                return
              }

              if (dependencyTimeoutMs > 0 && Date.now() - startTime >= dependencyTimeoutMs) {
                clearInterval(checkInterval)
                set((state) => {
                  const agent = state.agents[agentId]
                  if (agent) {
                    agent.status = 'error'
                    agent.completedAt = new Date()
                    agent.error = {
                      message: 'Dependency wait timed out',
                      code: 'DEPENDENCY_TIMEOUT',
                      recoverable: true,
                    }
                  }
                })
                resolve(false)
                return
              }

              const currentState = get()
              const { allCompleted, hasFailed } = evaluateDependencies(currentState)

              if (hasFailed) {
                clearInterval(checkInterval)
                set((state) => {
                  const agent = state.agents[agentId]
                  if (agent) {
                    agent.status = 'error'
                    agent.completedAt = new Date()
                    agent.error = {
                      message: '依赖代理执行失败或被取消',
                      code: 'DEPENDENCY_FAILED',
                      recoverable: false,
                    }
                  }
                })
                resolve(false)
                return
              }

              if (allCompleted) {
                clearInterval(checkInterval)
                resolve(true)
              }
            }, 2000)
          })
        }

        const waitForSlot = async () => {
          if (state.config.maxConcurrentAgents <= 0) {
            set((state) => {
              const agent = state.agents[agentId]
              if (agent) {
                agent.status = 'running'
                agent.startedAt = new Date()
                agent.progress.description = '正在启动'
              }
            })
            return true
          }

          let logged = false
          while (true) {
            if (shouldAbortStart()) return false

            if (isPaused()) {
              await sleep(START_SLOT_POLL_MS)
              continue
            }

            let slotReserved = false
            set((state) => {
              const runningAgents = Object.values(state.agents).filter(
                (a) => a.status === 'running'
              ).length
              if (runningAgents < state.config.maxConcurrentAgents) {
                const agent = state.agents[agentId]
                if (agent) {
                  agent.status = 'running'
                  agent.startedAt = new Date()
                  agent.progress.description = '正在启动'
                  slotReserved = true
                }
              }
            })

            if (slotReserved) {
              return true
            }

            if (!logged) {
              logged = true
              const currentState = get()
              log.warn(
                `[spawnAgent] Max concurrent agents (${currentState.config.maxConcurrentAgents}) reached`,
                'multi-agent'
              )
              set((state) => {
                const agent = state.agents[agentId]
                if (agent) {
                  agent.progress.description = '等待空闲代理位'
                }
              })
            }

            await sleep(START_SLOT_POLL_MS)
          }
        }

        // Start thread asynchronously
        void (async () => {
          try {
            const depsReady = await waitForDependencies()
            if (!depsReady) return

            const slotReady = await waitForSlot()
            if (!slotReady) return

            // Get sandbox policy for agent type (normalize for Codex CLI)
            const sandboxPolicyRaw = getAgentSandboxPolicy(type)
            const sandboxPolicy = resolveSandboxPolicy(sandboxPolicyRaw)

            const approvalPolicy = resolveApprovalPolicy(
              sandboxPolicyRaw,
              config.approvalPolicy,
              state.config.approvalPolicy
            )

            const model = config.model || state.config.model || undefined

            const developerInstructions = buildAgentDeveloperInstructions(type)

            // Start thread
            const response = await threadApi.start(
              state.config.projectId || '', // projectId - optional for multi-agent mode
              state.config.cwd,
              model,
              sandboxPolicy,
              approvalPolicy,
              developerInstructions
                ? { developerInstructions }
                : undefined
            )

            const threadId = response.thread.id

            // Update agent with threadId
            set((state) => {
              const agent = state.agents[agentId]
              if (agent) {
                agent.threadId = threadId
                agent.threadStoreRef = threadId
                agent.status = 'running'
                agent.progress.description = '正在执行任务'
                agent.interruptReason = undefined
              }
              // Add to agent mapping
              state.agentMapping[threadId] = agentId
            })

            useThreadStore.getState().registerAgentThread(response.thread, agentId, { focus: false })

            // Send initial task message
            const agentTaskMessage = buildAgentTaskMessage(task)
            await threadApi.sendMessage(threadId, agentTaskMessage, [], [], {
              model,
              approvalPolicy,
              sandboxPolicy,
            })

            log.info(`[spawnAgent] Agent ${agentId} started with thread ${threadId}`, 'multi-agent')
          } catch (error) {
            log.error(`[spawnAgent] Failed to start thread for agent ${agentId}: ${error}`, 'multi-agent')
            set((state) => {
              const agent = state.agents[agentId]
              if (agent) {
                agent.status = 'error'
                agent.completedAt = new Date()
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

        if (status === 'running' || status === 'completed' || status === 'error') {
          agent.interruptReason = undefined
        }

        if (status === 'cancelled') {
          agent.interruptReason = agent.interruptReason || 'cancel'
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
        set((state) => {
          const current = state.agents[id]
          if (current) {
            current.status = 'cancelled'
            current.completedAt = new Date()
            current.interruptReason = 'cancel'
            current.progress.description = '已取消'
          }
        })

        if (agent.threadId) {
          await threadApi.interrupt(agent.threadId)
          // Note: No closeThread method in threadApi, thread cleanup is handled by backend
        }

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
      if (!agent) return

      try {
        set((state) => {
          const current = state.agents[id]
          if (current) {
            current.status = 'pending'
            current.interruptReason = 'pause'
            current.progress.description = '已暂停'
          }
        })

        if (agent.threadId) {
          await threadApi.interrupt(agent.threadId)
        }

        log.info(`[pauseAgent] Agent ${id} paused`, 'multi-agent')
      } catch (error) {
        log.error(`[pauseAgent] Failed to pause agent ${id}: ${error}`, 'multi-agent')
        set((state) => {
          const current = state.agents[id]
          if (current) {
            current.status = 'running'
            current.interruptReason = undefined
            current.progress.description = '正在执行任务'
          }
        })
      }
    },

    /**
     * Resume an agent
     */
    resumeAgent: async (id: string) => {
      const agent = get().agents[id]
      if (!agent) return

      try {
        set((state) => {
          const current = state.agents[id]
          if (current) {
            current.interruptReason = undefined
            if (current.status === 'pending') {
              if (current.threadId) {
                current.status = 'running'
                current.startedAt = current.startedAt ?? new Date()
                current.progress.description = '正在执行任务'
              } else {
                current.progress.description = '等待启动'
              }
            }
          }
        })

        if (agent.threadId) {
          // Resume uses sendMessage with the resumed text
          await threadApi.sendMessage(agent.threadId, '请继续执行任务', [], [])
        }

        log.info(`[resumeAgent] Agent ${id} resumed`, 'multi-agent')
      } catch (error) {
        log.error(`[resumeAgent] Failed to resume agent ${id}: ${error}`, 'multi-agent')
      }
    },

    /**
     * Retry a failed agent
     */
    retryAgent: async (id: string) => {
      const agent = get().agents[id]
      if (!agent || agent.status !== 'error') return

      try {
        // Reset agent state
        set((state) => {
          const current = state.agents[id]
          if (current) {
            current.status = 'pending'
            current.error = undefined
            current.progress = {
              current: 0,
              total: 100,
              description: '正在重试...',
            }
          }
        })

        // If agent has a thread, send retry message
        if (agent.threadId) {
          await threadApi.sendMessage(agent.threadId, '请重新执行任务', [], [])
          set((state) => {
            const current = state.agents[id]
            if (current) {
              current.status = 'running'
              current.startedAt = new Date()
            }
          })
        } else {
          // Re-spawn the agent if no thread exists
          const newAgentId = await get().spawnAgent(agent.type, agent.task, agent.config)
          if (newAgentId) {
            // Remove the old failed agent
            get().removeAgent(id)
          }
        }

        log.info(`[retryAgent] Agent ${id} retried`, 'multi-agent')
      } catch (error) {
        log.error(`[retryAgent] Failed to retry agent ${id}: ${error}`, 'multi-agent')
        set((state) => {
          const current = state.agents[id]
          if (current) {
            current.status = 'error'
            current.error = {
              message: `重试失败: ${error}`,
              code: 'RETRY_FAILED',
              recoverable: true,
            }
          }
        })
      }
    },

    /**
     * Remove an agent from the store
     */
    removeAgent: (id: string) => {
      const agent = get().agents[id]
      if (agent?.threadId) {
        useThreadStore.getState().unregisterAgentThread(agent.threadId)
      }

      set((state) => {
        if (agent?.threadId) {
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
      const agents = Object.values(get().agents)
      for (const agent of agents) {
        if (agent.threadId) {
          useThreadStore.getState().unregisterAgentThread(agent.threadId)
        }
      }

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
        s.previousPhaseOutput = undefined
        s.phaseCompletionInFlight = null
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
          set((s) => {
            if (!s.workflow) return
            const p = s.workflow.phases.find((wp) => wp.id === phase.id)
            if (p) {
              p.status = 'completed'
              p.completedAt = new Date()
              p.output = `阶段 ${phase.name} 未生成代理任务。`
            }
            s.previousPhaseOutput = p?.output
          })

          if (!phase.requiresApproval) {
            await get().approvePhase(phase.id)
          }
          return
        }

        // Spawn agents for this phase
        const spawnedAgentIds: string[] = []
        let failedSpawnCount = 0
        for (const { type, task, config } of agentTasks) {
          const mergedConfig: AgentConfigOverrides = {
            model: state.config.model,
            approvalPolicy: state.config.approvalPolicy,
            timeout: state.config.timeout,
            ...config,
          }
          const agentId = await state.spawnAgent(type, task, [], mergedConfig)
          if (agentId) {
            spawnedAgentIds.push(agentId)
          } else {
            failedSpawnCount += 1
          }
        }

        // Update phase with agent IDs
        set((s) => {
          if (s.workflow) {
            const p = s.workflow.phases.find((wp) => wp.id === phase.id)
            if (p) {
              p.agentIds = spawnedAgentIds
              if (failedSpawnCount > 0) {
                p.metadata = { ...p.metadata, spawnFailedCount: failedSpawnCount }
              }
            }
          }
        })

        if (failedSpawnCount > 0) {
          log.error(
            `[_executePhase] Failed to spawn ${failedSpawnCount} agents for phase: ${phase.name}`,
            'multi-agent'
          )
        }

        if (spawnedAgentIds.length === 0) {
          log.error(`[_executePhase] No agents spawned for phase: ${phase.name}`, 'multi-agent')
          set((s) => {
            if (!s.workflow) return
            const p = s.workflow.phases.find((wp) => wp.id === phase.id)
            if (p) {
              p.status = 'failed'
              p.completedAt = new Date()
              p.output = 'Failed to spawn any agents for this phase.'
            }
            s.workflow.status = 'failed'
          })
          return
        }

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
          p.completedAt = p.completedAt ?? new Date()
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
        const status = engine.getStatus()
        if (status.isPaused) {
          engine.approvePhase(phaseId)
        }
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
        state.workflowEngine = null
        state.previousPhaseOutput = undefined
        state.phaseCompletionInFlight = null
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
      if (workflow.status !== 'running') return

      const currentPhase = workflow.phases[workflow.currentPhaseIndex]
      if (!currentPhase || currentPhase.status !== 'running') return
      if (currentPhase.agentIds.length === 0) return

      const phaseId = currentPhase.id
      const phaseIndex = workflow.currentPhaseIndex
      let claimed = false
      set((s) => {
        if (!s.workflow) return
        if (s.workflow.currentPhaseIndex !== phaseIndex) return
        if (s.phaseCompletionInFlight === phaseId) return
        s.phaseCompletionInFlight = phaseId
        claimed = true
      })

      if (!claimed) return

      try {
        const latestState = get()
        const latestWorkflow = latestState.workflow
        if (!latestWorkflow) return

        const latestPhase = latestWorkflow.phases[latestWorkflow.currentPhaseIndex]
        if (!latestPhase || latestPhase.id !== phaseId || latestPhase.status !== 'running') return

        const missingAgentIds = latestPhase.agentIds.filter((id) => !latestState.agents[id])
        if (missingAgentIds.length > 0) {
          log.error(
            `[checkPhaseCompletion] Phase ${latestPhase.name} missing agents: ${missingAgentIds.join(', ')}`,
            'multi-agent'
          )
          set((s) => {
            if (!s.workflow) return
            const p = s.workflow.phases[s.workflow.currentPhaseIndex]
            if (p && p.id === phaseId) {
              p.status = 'failed'
              p.completedAt = new Date()
              p.output = `Missing agents: ${missingAgentIds.join(', ')}`
            }
            s.workflow.status = 'failed'
          })
          return
        }

        // Check if all agents in this phase have completed
        const phaseAgents = latestPhase.agentIds
          .map((id) => latestState.agents[id])
          .filter(Boolean) as AgentDescriptor[]

        if (phaseAgents.length === 0) return

        const allCompleted = phaseAgents.every(
          (a) => a.status === 'completed' || a.status === 'error' || a.status === 'cancelled'
        )

        if (!allCompleted) return

        const hasError = phaseAgents.some((a) => a.status === 'error')
        const phaseOutput = buildPhaseOutput(latestPhase, phaseAgents)

        if (hasError) {
          // Phase failed
          set((s) => {
            if (!s.workflow) return
            const p = s.workflow.phases[s.workflow.currentPhaseIndex]
            if (p) {
              p.status = 'failed'
              p.completedAt = new Date()
              p.output = phaseOutput
            }
            s.workflow.status = 'failed'
          })
          return
        }

        // Phase completed successfully
        log.info(`[checkPhaseCompletion] Phase completed: ${latestPhase.name}`, 'multi-agent')

        // Check if approval is required
        if (latestPhase.requiresApproval) {
          log.info(
            `[checkPhaseCompletion] Approval required for phase: ${latestPhase.name}`,
            'multi-agent'
          )
          set((s) => {
            if (!s.workflow) return
            const p = s.workflow.phases[s.workflow.currentPhaseIndex]
            if (p) {
              p.status = 'completed'
              if (!p.completedAt) {
                p.completedAt = new Date()
              }
              p.output = phaseOutput
            }
            s.previousPhaseOutput = phaseOutput
          })
          // UI will show approval dialog - don't auto-advance
          return
        }

        // Auto-advance to next phase
        set((s) => {
          if (!s.workflow) return
          const p = s.workflow.phases[s.workflow.currentPhaseIndex]
          if (p) {
            p.output = phaseOutput
          }
          s.previousPhaseOutput = phaseOutput
        })
        await latestState.approvePhase(latestPhase.id)
      } finally {
        set((s) => {
          if (s.phaseCompletionInFlight === phaseId) {
            s.phaseCompletionInFlight = null
          }
        })
      }
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

      for (const agent of agents) {
        if (agent.threadId) {
          useThreadStore.getState().unregisterAgentThread(agent.threadId)
        }
      }

      set((state) => {
        state.config = defaultConfig
        state.workingDirectory = ''
        state.agents = {}
        state.agentOrder = []
        state.agentMapping = {}
        state.workflow = null
        state.workflowEngine = null
        state.previousPhaseOutput = undefined
        state.phaseCompletionInFlight = null
      })
    },
  }))
)
