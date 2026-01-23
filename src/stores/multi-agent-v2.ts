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
import { APPROVAL_TIMEOUT_MS } from './thread/constants'

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

  // Approval state tracking (WF-001 & WF-009 fixes)
  approvalInFlight: Record<string, boolean> // Track in-flight approval operations
  approvalTimeouts: Record<string, ReturnType<typeof setTimeout>> // Track approval timeout timers

  // WF-006: Pause operation atomicity tracking
  pauseInFlight: Record<string, boolean> // Track agents currently being paused (prevents event race conditions)

  // WF-008: Dependency timeout tracking
  dependencyWaitTimeouts: Record<string, ReturnType<typeof setTimeout>> // Track dependency wait timeout timers

  // Pause timeout tracking
  pauseTimeouts: Record<string, ReturnType<typeof setTimeout>> // Track pause timeout timers

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
  clearAgents: () => Promise<void>

  // Actions - Workflow Management
  startWorkflow: (workflow: Workflow) => Promise<void>
  approvePhase: (phaseId: string) => Promise<void>
  rejectPhase: (phaseId: string, reason?: string) => void
  recoverApprovalTimeout: (phaseId: string) => void
  cancelWorkflow: () => Promise<void>
  clearWorkflow: () => void
  _executePhase: (phase: WorkflowPhase) => Promise<void>
  checkPhaseCompletion: () => Promise<void>
  _startApprovalTimeout: (phaseId: string, timeoutMs?: number) => void
  _clearApprovalTimeout: (phaseId: string) => void

  // WF-006: Pause atomicity helpers
  _isPauseInFlight: (agentId: string) => boolean

  // WF-008: Dependency timeout helpers
  _clearDependencyWaitTimeout: (agentId: string) => void
  retryDependencyWait: (agentId: string) => Promise<void>

  // Pause timeout helpers
  _startPauseTimeout: (agentId: string, timeoutMs?: number) => void
  _clearPauseTimeout: (agentId: string) => void

  // Phase/Workflow retry methods (allows recovery from failed state)
  retryPhase: (phaseId: string) => Promise<void>
  retryWorkflow: () => Promise<void>
  recoverCancelledWorkflow: () => Promise<void>

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
// Use unified timeout from thread constants (10 minutes)
const DEFAULT_APPROVAL_TIMEOUT_MS = APPROVAL_TIMEOUT_MS
const DEFAULT_DEPENDENCY_WAIT_TIMEOUT_MS = 5 * 60 * 1000 // WF-008: 5 minutes default dependency wait timeout
const DEFAULT_PAUSE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes default pause timeout

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
    approvalInFlight: {},
    approvalTimeouts: {},
    pauseInFlight: {}, // WF-006: Track pause operations
    dependencyWaitTimeouts: {}, // WF-008: Track dependency wait timeouts
    pauseTimeouts: {}, // Track pause timeout timers

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
     * Returns a Promise that resolves with the agentId once the thread is created and running,
     * or null if the agent creation failed.
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

        // Promise resolver for notifying when threadId is set or spawn fails
        let resolveThreadReady: (success: boolean) => void
        const threadReadyPromise = new Promise<boolean>((resolve) => {
          resolveThreadReady = resolve
        })

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

        // WF-008: Use configurable timeout with fallback to default (5 minutes)
        const dependencyTimeoutMs = (() => {
          const timeoutSeconds = config.timeout ?? state.config.timeout
          if (timeoutSeconds && timeoutSeconds > 0) {
            return timeoutSeconds * 1000
          }
          return DEFAULT_DEPENDENCY_WAIT_TIMEOUT_MS
        })()

        const waitForDependencies = async () => {
          if (dependencies.length === 0) return true

          set((state) => {
            const agent = state.agents[agentId]
            if (agent) {
              agent.progress.description = '等待依赖完成'
            }
          })

          // WF-008: Enhanced dependency evaluation with detailed failure info
          const evaluateDependencies = (currentState: MultiAgentState) => {
            let hasFailed = false
            const failedDeps: string[] = []
            const allCompleted = dependencies.every((depId) => {
              const dep = currentState.agents[depId]
              if (!dep) {
                hasFailed = true
                failedDeps.push(depId)
                return false
              }
              if (dep.status === 'error' || dep.status === 'cancelled') {
                hasFailed = true
                failedDeps.push(depId)
                return false
              }
              return dep.status === 'completed'
            })
            return { allCompleted, hasFailed, failedDeps }
          }

          const initialStatus = evaluateDependencies(get())
          if (initialStatus.hasFailed) {
            set((state) => {
              const agent = state.agents[agentId]
              if (agent) {
                agent.status = 'error'
                agent.completedAt = new Date()
                agent.error = {
                  message: `依赖代理执行失败或被取消: ${initialStatus.failedDeps.join(', ')}`,
                  code: 'DEPENDENCY_FAILED',
                  recoverable: true, // WF-008: Allow retry when dependencies fail
                  details: { failedDependencies: initialStatus.failedDeps },
                }
              }
            })
            return false
          }

          if (initialStatus.allCompleted) return true

          log.info(`[spawnAgent] Agent ${agentId} waiting for dependencies (timeout: ${dependencyTimeoutMs}ms)`, 'multi-agent')

          return new Promise<boolean>((resolve) => {
            let activeTimeMs = 0
            let lastCheckTime = Date.now()
            let wasPaused = false
            let resolved = false

            // WF-008: Cleanup helper to ensure proper resource cleanup
            const cleanup = () => {
              if (checkInterval) clearInterval(checkInterval)
              // Clear the dependency wait timeout tracker
              get()._clearDependencyWaitTimeout(agentId)
            }

            // WF-008: Safe resolve to prevent multiple resolutions
            const safeResolve = (value: boolean) => {
              if (resolved) return
              resolved = true
              cleanup()
              resolve(value)
            }

            const checkInterval = setInterval(() => {
              const now = Date.now()
              const currentlyPaused = isPaused()

              // WF-006: Also check if pause is in flight - skip processing during pause
              const pauseInProgress = get().pauseInFlight[agentId]
              if (pauseInProgress) {
                return // Skip processing while pause is being applied
              }

              if (shouldAbortStart()) {
                safeResolve(false)
                return
              }

              // Track active (non-paused) time for timeout calculation
              if (!wasPaused && !currentlyPaused) {
                activeTimeMs += now - lastCheckTime
              }
              lastCheckTime = now
              wasPaused = currentlyPaused

              // Skip processing while paused, but continue the interval
              if (currentlyPaused) {
                return
              }

              // WF-008: Check timeout based on active time only with improved error message
              if (dependencyTimeoutMs > 0 && activeTimeMs >= dependencyTimeoutMs) {
                log.warn(`[spawnAgent] Agent ${agentId} dependency wait timed out after ${activeTimeMs}ms`, 'multi-agent')
                set((state) => {
                  const agent = state.agents[agentId]
                  if (agent) {
                    const pendingDeps = dependencies.filter((depId) => {
                      const dep = state.agents[depId]
                      return dep && dep.status !== 'completed'
                    })
                    agent.status = 'error'
                    agent.completedAt = new Date()
                    agent.error = {
                      message: `依赖等待超时 (${Math.round(activeTimeMs / 1000)}秒)，请检查依赖代理状态后重试`,
                      code: 'DEPENDENCY_TIMEOUT',
                      recoverable: true, // WF-008: Explicitly recoverable
                      details: {
                        waitedMs: activeTimeMs,
                        timeoutMs: dependencyTimeoutMs,
                        pendingDependencies: pendingDeps,
                      },
                    }
                  }
                })
                safeResolve(false)
                return
              }

              const currentState = get()
              const { allCompleted, hasFailed, failedDeps } = evaluateDependencies(currentState)

              if (hasFailed) {
                set((state) => {
                  const agent = state.agents[agentId]
                  if (agent) {
                    agent.status = 'error'
                    agent.completedAt = new Date()
                    agent.error = {
                      message: `依赖代理执行失败或被取消: ${failedDeps.join(', ')}`,
                      code: 'DEPENDENCY_FAILED',
                      recoverable: true, // WF-008: Allow retry when dependencies fail
                      details: { failedDependencies: failedDeps },
                    }
                  }
                })
                safeResolve(false)
                return
              }

              if (allCompleted) {
                safeResolve(true)
              }
            }, 2000)

            // WF-008: Register this wait operation for tracking/cleanup
            set((s) => {
              // Store a reference to track this wait is in progress
              s.dependencyWaitTimeouts[agentId] = setTimeout(() => {}, 0) as ReturnType<typeof setTimeout>
            })
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

            // Atomic slot reservation using Immer's transactional update
            // The check and reservation happen in a single synchronous set() call,
            // ensuring no race condition between concurrent agents
            let slotReserved = false
            set((state) => {
              const agent = state.agents[agentId]
              // Guard: agent must exist and not already be running/completed
              if (!agent || agent.status === 'running' || agent.status === 'completed' || agent.status === 'cancelled') {
                return
              }

              const runningAgents = Object.values(state.agents).filter(
                (a) => a.status === 'running'
              ).length

              if (runningAgents < state.config.maxConcurrentAgents) {
                agent.status = 'running'
                agent.startedAt = new Date()
                agent.progress.description = '正在启动'
                slotReserved = true
              }
            })

            if (slotReserved) {
              return true
            }

            // Check if agent was removed or cancelled while waiting
            const currentAgent = get().agents[agentId]
            if (!currentAgent || currentAgent.status === 'cancelled') {
              return false
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
                if (agent && agent.status === 'pending') {
                  agent.progress.description = '等待空闲代理位'
                }
              })
            }

            await sleep(START_SLOT_POLL_MS)
          }
        }

        // Start thread creation (runs asynchronously but we await threadReadyPromise)
        void (async () => {
          try {
            const depsReady = await waitForDependencies()
            if (!depsReady) {
              resolveThreadReady!(false)
              return
            }

            const slotReady = await waitForSlot()
            if (!slotReady) {
              resolveThreadReady!(false)
              return
            }

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

            // P0-2 Fix: Use transactional approach for registration
            // Step 1: Try to register with thread store first (external operation)
            // If this fails, we haven't modified any state yet
            try {
              useThreadStore.getState().registerAgentThread(response.thread, agentId, { focus: false })
            } catch (registrationError) {
              // Registration failed - don't update any state, just report error
              log.error(`[spawnAgent] Failed to register thread ${threadId} for agent ${agentId}: ${registrationError}`, 'multi-agent')
              set((state) => {
                const agent = state.agents[agentId]
                if (agent) {
                  agent.status = 'error'
                  agent.completedAt = new Date()
                  agent.error = {
                    message: `Thread registration failed: ${registrationError instanceof Error ? registrationError.message : String(registrationError)}`,
                    code: 'THREAD_REGISTRATION_FAILED',
                    recoverable: true,
                  }
                }
              })
              resolveThreadReady!(false)
              return
            }

            // Step 2: Update agent state and mapping atomically after successful registration
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

            // Step 3: Send initial task message
            const agentTaskMessage = buildAgentTaskMessage(task)
            try {
              await threadApi.sendMessage(threadId, agentTaskMessage, [], [], {
                model,
                approvalPolicy,
                sandboxPolicy,
              })
            } catch (sendError) {
              // Message send failed - rollback: unregister thread and update agent state
              log.error(`[spawnAgent] Failed to send initial message for agent ${agentId}: ${sendError}`, 'multi-agent')
              useThreadStore.getState().unregisterAgentThread(threadId)
              set((state) => {
                const agent = state.agents[agentId]
                if (agent) {
                  agent.status = 'error'
                  agent.completedAt = new Date()
                  agent.threadId = ''
                  agent.threadStoreRef = ''
                  agent.error = {
                    message: `Failed to send initial message: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
                    code: 'INITIAL_MESSAGE_FAILED',
                    recoverable: true,
                  }
                }
                delete state.agentMapping[threadId]
              })
              resolveThreadReady!(false)
              return
            }

            log.info(`[spawnAgent] Agent ${agentId} started with thread ${threadId}`, 'multi-agent')
            resolveThreadReady!(true)
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
            resolveThreadReady!(false)
          }
        })()

        // Wait for thread to be ready (or fail)
        const success = await threadReadyPromise
        return success ? agentId : null
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
        // Clear pause timeout if agent was paused
        get()._clearPauseTimeout(id)

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
     * WF-006 fix: Added atomic pause flag to prevent race conditions with incoming events
     */
    pauseAgent: async (id: string) => {
      const agent = get().agents[id]
      if (!agent) return

      // WF-006: Check if pause is already in flight (prevent duplicate pause operations)
      if (get().pauseInFlight[id]) {
        log.warn(`[pauseAgent] Pause already in flight for agent ${id}, ignoring duplicate call`, 'multi-agent')
        return
      }

      // WF-006: Atomically claim the pause lock and set pausing state
      // This ensures incoming events see the pausing state immediately
      let claimed = false
      const originalStatus = agent.status
      const originalInterruptReason = agent.interruptReason
      const originalProgressDescription = agent.progress.description

      set((state) => {
        if (state.pauseInFlight[id]) return
        state.pauseInFlight[id] = true
        claimed = true
        // Immediately mark as pausing to signal incoming events
        const current = state.agents[id]
        if (current) {
          current.progress.description = '正在暂停...'
        }
      })

      if (!claimed) {
        log.warn(`[pauseAgent] Failed to claim pause lock for agent ${id}`, 'multi-agent')
        return
      }

      try {
        // Interrupt the thread (if running) - this is the async operation
        if (agent.threadId && agent.status === 'running') {
          await threadApi.interrupt(agent.threadId)
        }

        // WF-006: Complete the pause operation atomically
        // Any events that arrived during the interrupt will see interruptReason='pause'
        set((state) => {
          const current = state.agents[id]
          if (current) {
            current.status = 'pending'
            current.interruptReason = 'pause'
            current.progress.description = '已暂停'
          }
        })

        // Start pause timeout timer
        get()._startPauseTimeout(id)

        log.info(`[pauseAgent] Agent ${id} paused`, 'multi-agent')
      } catch (error) {
        log.error(`[pauseAgent] Failed to pause agent ${id}: ${error}`, 'multi-agent')
        // Restore original state on failure
        set((state) => {
          const current = state.agents[id]
          if (current) {
            current.status = originalStatus
            current.interruptReason = originalInterruptReason
            current.progress.description = originalProgressDescription
          }
        })
      } finally {
        // WF-006: Always release the pause lock
        set((state) => {
          delete state.pauseInFlight[id]
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
        // Clear pause timeout before resuming
        get()._clearPauseTimeout(id)

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
          const newAgentId = await get().spawnAgent(agent.type, agent.task, agent.dependencies, agent.config)
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
     * P0-3 Fix: Correct cleanup order - first stop/cleanup resources, then delete mapping
     * Order: 1. Get agent info while mapping exists, 2. Unregister from thread store,
     *        3. Delete mapping and agent state atomically
     */
    removeAgent: (id: string) => {
      const agent = get().agents[id]
      if (!agent) return

      // Clear pause timeout if agent was paused
      get()._clearPauseTimeout(id)

      const threadId = agent.threadId

      // Step 1: Unregister from thread store first (cleans up eventVersions)
      // This must happen while agentMapping still exists so thread store can
      // properly identify this as an agent thread
      if (threadId) {
        useThreadStore.getState().unregisterAgentThread(threadId)
      }

      // Step 2: Delete mapping and agent state atomically after external cleanup
      set((state) => {
        if (threadId) {
          delete state.agentMapping[threadId]
        }
        delete state.agents[id]
        state.agentOrder = state.agentOrder.filter((aid) => aid !== id)
      })
    },

    /**
     * Clear all agents
     * P0-003 Fix: Ensure complete cleanup of all related resources including:
     * - Interrupt all agent threads
     * - Unregister from thread store (which also cleans up eventVersions)
     * - Clear agents, agentOrder, and agentMapping atomically
     * - Clean up any orphaned mappings that might exist
     */
    clearAgents: async () => {
      const state = get()
      const agents = Object.values(state.agents)

      // Collect all threadIds from agents
      const agentThreadIds = agents
        .map((agent) => agent.threadId)
        .filter((id): id is string => !!id)

      // Also include any orphaned mappings that might exist (defensive cleanup)
      const mappedThreadIds = Object.keys(state.agentMapping)
      const allThreadIds = [...new Set([...agentThreadIds, ...mappedThreadIds])]

      // Step 1: Interrupt all threads (stop running operations)
      for (const threadId of allThreadIds) {
        try {
          await threadApi.interrupt(threadId)
        } catch (error) {
          log.error(`[clearAgents] Failed to interrupt thread ${threadId}: ${error}`, 'multi-agent')
        }
      }

      // Step 2: Unregister all agent threads from thread store
      // This also cleans up eventVersions via cleanupEventVersion
      const threadStore = useThreadStore.getState()
      for (const threadId of allThreadIds) {
        threadStore.unregisterAgentThread(threadId)
      }

      // Step 3: Clear all state atomically
      set((s) => {
        s.agents = {}
        s.agentOrder = []
        s.agentMapping = {}
      })

      log.info(`[clearAgents] Cleared ${agents.length} agents and ${allThreadIds.length} threads`, 'multi-agent')
    },

    // ==================== Workflow Management ====================

    /**
     * Start a workflow
     */
    startWorkflow: async (workflow: Workflow) => {
      const state = get()

      // Clean up any existing workflow/agents before starting a new one
      if (state.workflow || Object.keys(state.agents).length > 0) {
        log.info('[startWorkflow] Cleaning up existing workflow/agents before starting new workflow', 'multi-agent')

        // Cancel any running agents
        const runningAgents = Object.values(state.agents).filter((a) => a.status === 'running')
        for (const agent of runningAgents) {
          try {
            if (agent.threadId) {
              await threadApi.interrupt(agent.threadId)
            }
          } catch (error) {
            log.error(`[startWorkflow] Failed to interrupt agent ${agent.id}: ${error}`, 'multi-agent')
          }
        }

        // Unregister all agent threads from thread store
        const threadStore = useThreadStore.getState()
        for (const agent of Object.values(state.agents)) {
          if (agent.threadId) {
            threadStore.unregisterAgentThread(agent.threadId)
          }
        }

        // Clear agents state
        set((s) => {
          s.agents = {}
          s.agentOrder = []
          s.agentMapping = {}
          s.workflow = null
          s.workflowEngine = null
          s.previousPhaseOutput = undefined
          s.phaseCompletionInFlight = null
        })
      }

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
     * WF-009 fix: Added re-entrancy protection to prevent double execution
     * WF-011 fix: Also allows approval from 'approval_timeout' state
     */
    approvePhase: async (phaseId: string) => {
      const state = get()
      const workflow = state.workflow

      if (!workflow) return

      // WF-009: Check if approval is already in flight (prevent double execution)
      if (state.approvalInFlight[phaseId]) {
        log.warn(`[approvePhase] Approval already in flight for phase ${phaseId}, ignoring duplicate call`, 'multi-agent')
        return
      }

      const phaseIndex = workflow.phases.findIndex((p) => p.id === phaseId)
      if (phaseIndex === -1) return

      const phase = workflow.phases[phaseIndex]
      if (phase.status !== 'awaiting_approval' && phase.status !== 'approval_timeout') {
        log.warn(`[approvePhase] Phase ${phaseId} is not in approvable state (current: ${phase.status})`, 'multi-agent')
        return
      }

      // WF-009: Mark approval as in-flight atomically
      let claimed = false
      set((s) => {
        if (s.approvalInFlight[phaseId]) return
        s.approvalInFlight[phaseId] = true
        claimed = true
      })

      if (!claimed) {
        log.warn(`[approvePhase] Failed to claim approval lock for phase ${phaseId}`, 'multi-agent')
        return
      }

      const nextPhase = workflow.phases[phaseIndex + 1]
      const hasNextPhase = !!nextPhase

      try {
        // WF-001: Clear approval timeout since user responded
        get()._clearApprovalTimeout(phaseId)

        set((s) => {
          if (!s.workflow) return

          const p = s.workflow.phases[phaseIndex]
          if (p) {
            p.status = 'completed'
            p.completedAt = p.completedAt ?? new Date()
            if (p.output) {
              s.previousPhaseOutput = p.output
            }
          }

          if (hasNextPhase) {
            s.workflow.currentPhaseIndex = phaseIndex + 1
          } else {
            s.workflow.status = 'completed'
            s.workflow.completedAt = new Date()
          }
        })

        // Execute next phase after atomic state update (if applicable)
        if (hasNextPhase) {
          await get()._executePhase(nextPhase)
        }

        // Note: WorkflowEngine is now a pure state container.
        // All execution logic is handled by this store.
        // The engine.approvePhase() method has been removed to avoid double-execution.
      } finally {
        // WF-009: Always release approval lock and reset phaseCompletionInFlight
        set((s) => {
          delete s.approvalInFlight[phaseId]
          s.phaseCompletionInFlight = null
        })
      }
    },

    /**
     * Reject a workflow phase
     * WF-009 fix: Added re-entrancy protection
     * WF-011 fix: Also allows rejection from 'approval_timeout' state
     */
    rejectPhase: (phaseId: string, reason?: string) => {
      const state = get()
      const workflow = state.workflow

      if (!workflow) return

      // WF-009: Check if approval is already in flight
      if (state.approvalInFlight[phaseId]) {
        log.warn(`[rejectPhase] Approval already in flight for phase ${phaseId}, ignoring duplicate call`, 'multi-agent')
        return
      }

      const phaseRef = workflow.phases.find((p) => p.id === phaseId)
      if (!phaseRef || (phaseRef.status !== 'awaiting_approval' && phaseRef.status !== 'approval_timeout')) {
        log.warn(`[rejectPhase] Phase ${phaseId} is not in rejectable state (current: ${phaseRef?.status})`, 'multi-agent')
        return
      }

      // WF-001: Clear approval timeout since user responded
      get()._clearApprovalTimeout(phaseId)

      set((s) => {
        if (!s.workflow) return

        // WF-009: Mark as in-flight during the operation
        s.approvalInFlight[phaseId] = true

        const phase = s.workflow.phases.find((p) => p.id === phaseId)
        if (phase) {
          phase.status = 'failed'
          phase.completedAt = new Date()
          if (reason) {
            phase.output = `Phase rejected: ${reason}`
          }
        }

        s.workflow.status = 'failed'
        s.workflow.completedAt = new Date()

        // Release lock immediately since this is synchronous
        delete s.approvalInFlight[phaseId]
      })
    },

    /**
     * Recover from approval timeout for a phase
     * WF-011 fix: Allows manual recovery from approval_timeout state
     * This method restarts the approval timeout timer and allows the user to approve/reject the phase
     */
    recoverApprovalTimeout: (phaseId: string) => {
      const state = get()
      const workflow = state.workflow

      if (!workflow) {
        log.warn(`[recoverApprovalTimeout] No workflow found`, 'multi-agent')
        return
      }

      const phase = workflow.phases.find((p) => p.id === phaseId)
      if (!phase) {
        log.warn(`[recoverApprovalTimeout] Phase ${phaseId} not found`, 'multi-agent')
        return
      }

      // Check phase status must be 'approval_timeout'
      if (phase.status !== 'approval_timeout') {
        log.warn(`[recoverApprovalTimeout] Phase ${phaseId} is not in approval_timeout state (current: ${phase.status})`, 'multi-agent')
        return
      }

      // Check workflow is still running
      if (workflow.status !== 'running') {
        log.warn(`[recoverApprovalTimeout] Workflow is not running (current: ${workflow.status})`, 'multi-agent')
        return
      }

      log.info(`[recoverApprovalTimeout] Recovering phase ${phaseId} from approval_timeout`, 'multi-agent')

      // Reset phase status to 'completed' (waiting for approval)
      set((s) => {
        if (!s.workflow) return

        const p = s.workflow.phases.find((wp) => wp.id === phaseId)
        if (p) {
          p.status = 'completed'
          p.output = p.output?.replace(/审批超时.*/, '审批已恢复，等待用户操作')
        }
      })

      // Restart approval timeout timer
      const approvalTimeoutMs = phase.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS
      if (approvalTimeoutMs > 0) {
        get()._startApprovalTimeout(phaseId, approvalTimeoutMs)
      }

      log.info(`[recoverApprovalTimeout] Phase ${phaseId} recovered, approval timeout restarted`, 'multi-agent')
    },

    /**
     * Cancel the workflow
     */
    cancelWorkflow: async () => {
      const state = get()
      const workflow = state.workflow
      if (!workflow) return

      // Clear all approval timeouts
      for (const phaseId of Object.keys(state.approvalTimeouts)) {
        get()._clearApprovalTimeout(phaseId)
      }

      // Cancel all running agents
      const agents = Object.values(state.agents)
      for (const agent of agents) {
        if (agent.status === 'running') {
          await get().cancelAgent(agent.id)
        }
      }

      set((s) => {
        if (s.workflow) {
          s.workflow.status = 'cancelled'
          s.workflow.completedAt = new Date()
        }
        // Reset phaseCompletionInFlight when workflow is cancelled
        s.phaseCompletionInFlight = null
        // Clear approval tracking state
        s.approvalInFlight = {}
        s.approvalTimeouts = {}
      })
    },

    /**
     * Clear the workflow
     */
    clearWorkflow: () => {
      // Clear all approval timeouts before clearing state
      const state = get()
      for (const phaseId of Object.keys(state.approvalTimeouts)) {
        get()._clearApprovalTimeout(phaseId)
      }

      set((s) => {
        s.workflow = null
        s.workflowEngine = null
        s.previousPhaseOutput = undefined
        s.phaseCompletionInFlight = null
        s.approvalInFlight = {}
        s.approvalTimeouts = {}
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
        // Re-check workflow state after claiming - it may have changed
        const latestState = get()
        const latestWorkflow = latestState.workflow

        // If workflow was cleared/changed, bail out
        if (!latestWorkflow || latestWorkflow.status !== 'running') {
          log.info('[checkPhaseCompletion] Workflow state changed during execution, aborting', 'multi-agent')
          return
        }

        const latestPhase = latestWorkflow.phases[latestWorkflow.currentPhaseIndex]
        if (!latestPhase || latestPhase.id !== phaseId || latestPhase.status !== 'running') {
          log.info('[checkPhaseCompletion] Phase state changed during execution, aborting', 'multi-agent')
          return
        }

        const missingAgentIds = latestPhase.agentIds.filter((id) => !latestState.agents[id])
        if (missingAgentIds.length > 0) {
          log.error(
            `[checkPhaseCompletion] Phase ${latestPhase.name} missing agents: ${missingAgentIds.join(', ')}`,
            'multi-agent'
          )
          set((s) => {
            if (!s.workflow) return
            // Double-check we're still on the same phase
            if (s.workflow.currentPhaseIndex !== phaseIndex) return
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
            // Double-check we're still on the same phase
            if (s.workflow.currentPhaseIndex !== phaseIndex) return
            const p = s.workflow.phases[s.workflow.currentPhaseIndex]
            if (p && p.id === phaseId) {
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
            // Double-check we're still on the same phase
            if (s.workflow.currentPhaseIndex !== phaseIndex) return
            const p = s.workflow.phases[s.workflow.currentPhaseIndex]
            if (p && p.id === phaseId) {
              p.status = 'awaiting_approval'
              if (!p.completedAt) {
                p.completedAt = new Date()
              }
              p.output = phaseOutput
            }
          })

          // WF-001: Start approval timeout timer
          const approvalTimeoutMs = latestPhase.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS
          if (approvalTimeoutMs > 0) {
            get()._startApprovalTimeout(phaseId, approvalTimeoutMs)
          }

          // UI will show approval dialog - don't auto-advance
          return
        }

        // Final state check before auto-advancing
        const finalState = get()
        if (!finalState.workflow || finalState.workflow.currentPhaseIndex !== phaseIndex) {
          log.info('[checkPhaseCompletion] Workflow state changed before auto-advance, aborting', 'multi-agent')
          return
        }

        // Auto-advance to next phase
        set((s) => {
          if (!s.workflow) return
          // Double-check we're still on the same phase
          if (s.workflow.currentPhaseIndex !== phaseIndex) return
          const p = s.workflow.phases[s.workflow.currentPhaseIndex]
          if (p && p.id === phaseId) {
            p.output = phaseOutput
          }
          s.previousPhaseOutput = phaseOutput
        })
        await finalState.approvePhase(latestPhase.id)
      } finally {
        // Always reset phaseCompletionInFlight if it still matches our phaseId
        // This ensures cleanup even if workflow state changed
        set((s) => {
          if (s.phaseCompletionInFlight === phaseId) {
            s.phaseCompletionInFlight = null
          }
        })
      }
    },

    /**
     * Start approval timeout timer for a phase
     * WF-001 fix: Prevents indefinite waiting for user approval
     */
    _startApprovalTimeout: (phaseId: string, timeoutMs: number = DEFAULT_APPROVAL_TIMEOUT_MS) => {
      // Clear any existing timeout for this phase
      get()._clearApprovalTimeout(phaseId)

      log.info(`[_startApprovalTimeout] Starting ${timeoutMs}ms timeout for phase ${phaseId}`, 'multi-agent')

      const timeoutId = setTimeout(() => {
        const state = get()
        const workflow = state.workflow

        // Validate state before timing out
        if (!workflow || workflow.status !== 'running') {
          log.info(`[_startApprovalTimeout] Timeout fired but workflow not running, ignoring`, 'multi-agent')
          return
        }

        const phase = workflow.phases.find((p) => p.id === phaseId)
        if (!phase) {
          log.info(`[_startApprovalTimeout] Timeout fired but phase ${phaseId} not found, ignoring`, 'multi-agent')
          return
        }

        // Only timeout if phase is still waiting for approval (completed but not yet advanced)
        const currentPhase = workflow.phases[workflow.currentPhaseIndex]
        if (!currentPhase || currentPhase.id !== phaseId) {
          log.info(`[_startApprovalTimeout] Timeout fired but phase ${phaseId} is no longer current, ignoring`, 'multi-agent')
          return
        }

        // Check if approval is already in flight
        if (state.approvalInFlight[phaseId]) {
          log.info(`[_startApprovalTimeout] Timeout fired but approval in flight for ${phaseId}, ignoring`, 'multi-agent')
          return
        }

        log.warn(`[_startApprovalTimeout] Approval timeout for phase ${phaseId}, marking as approval_timeout (recoverable)`, 'multi-agent')

        // WF-011: Mark phase as approval_timeout (recoverable state - workflow stays running)
        set((s) => {
          if (!s.workflow) return

          const p = s.workflow.phases.find((wp) => wp.id === phaseId)
          if (p) {
            p.status = 'approval_timeout'
            // Don't set completedAt since the phase can be recovered
            p.output = `审批超时：用户在 ${timeoutMs / 1000} 秒内未响应。可通过 recoverApprovalTimeout 恢复。`
          }

          // Keep workflow running - user can still recover
          // s.workflow.status stays 'running'

          // Clean up timeout reference
          delete s.approvalTimeouts[phaseId]
        })
      }, timeoutMs)

      // Store timeout reference
      set((s) => {
        s.approvalTimeouts[phaseId] = timeoutId
      })
    },

    /**
     * Clear approval timeout timer for a phase
     */
    _clearApprovalTimeout: (phaseId: string) => {
      const state = get()
      const timeoutId = state.approvalTimeouts[phaseId]

      if (timeoutId) {
        clearTimeout(timeoutId)
        log.info(`[_clearApprovalTimeout] Cleared timeout for phase ${phaseId}`, 'multi-agent')

        set((s) => {
          delete s.approvalTimeouts[phaseId]
        })
      }
    },

    // ==================== WF-006: Pause Atomicity Helpers ====================

    /**
     * Check if a pause operation is in flight for an agent
     * WF-006 fix: Prevents race conditions during pause operations
     */
    _isPauseInFlight: (agentId: string) => {
      return get().pauseInFlight[agentId] === true
    },

    // ==================== WF-008: Dependency Timeout Helpers ====================

    /**
     * Clear dependency wait timeout for an agent
     * WF-008 fix: Cleanup helper for dependency wait timeouts
     */
    _clearDependencyWaitTimeout: (agentId: string) => {
      const state = get()
      const timeoutId = state.dependencyWaitTimeouts[agentId]

      if (timeoutId) {
        clearTimeout(timeoutId)
        log.info(`[_clearDependencyWaitTimeout] Cleared timeout for agent ${agentId}`, 'multi-agent')

        set((s) => {
          delete s.dependencyWaitTimeouts[agentId]
        })
      }
    },

    /**
     * Retry dependency wait for an agent that timed out
     * WF-008 fix: Allows user to retry after dependency timeout
     */
    retryDependencyWait: async (agentId: string) => {
      const agent = get().agents[agentId]
      if (!agent) return

      // Only retry if agent failed due to dependency timeout
      if (agent.status !== 'error' || agent.error?.code !== 'DEPENDENCY_TIMEOUT') {
        log.warn(`[retryDependencyWait] Agent ${agentId} is not in dependency timeout state`, 'multi-agent')
        return
      }

      log.info(`[retryDependencyWait] Retrying dependency wait for agent ${agentId}`, 'multi-agent')

      // Reset agent state and re-spawn
      const newAgentId = await get().spawnAgent(agent.type, agent.task, agent.dependencies, agent.config)
      if (newAgentId) {
        // Remove the old timed out agent
        get().removeAgent(agentId)
        log.info(`[retryDependencyWait] Agent ${agentId} replaced with new agent ${newAgentId}`, 'multi-agent')
      } else {
        log.error(`[retryDependencyWait] Failed to respawn agent ${agentId}`, 'multi-agent')
      }
    },

    // ==================== Pause Timeout Helpers ====================

    /**
     * Start pause timeout timer for an agent
     * Prevents indefinite pausing - after timeout, agent is marked as error with PAUSE_TIMEOUT code
     */
    _startPauseTimeout: (agentId: string, timeoutMs: number = DEFAULT_PAUSE_TIMEOUT_MS) => {
      // Clear any existing timeout for this agent
      get()._clearPauseTimeout(agentId)

      log.info(`[_startPauseTimeout] Starting ${timeoutMs}ms timeout for agent ${agentId}`, 'multi-agent')

      const timeoutId = setTimeout(async () => {
        const state = get()
        const agent = state.agents[agentId]

        // Validate state before timing out
        if (!agent) {
          log.info(`[_startPauseTimeout] Timeout fired but agent ${agentId} not found, ignoring`, 'multi-agent')
          return
        }

        // Only timeout if agent is still paused (pending with interruptReason='pause')
        if (agent.status !== 'pending' || agent.interruptReason !== 'pause') {
          log.info(`[_startPauseTimeout] Timeout fired but agent ${agentId} is no longer paused, ignoring`, 'multi-agent')
          return
        }

        log.warn(`[_startPauseTimeout] Pause timeout for agent ${agentId}, marking as error`, 'multi-agent')

        // Interrupt the thread if it exists
        if (agent.threadId) {
          try {
            await threadApi.interrupt(agent.threadId)
          } catch (error) {
            log.error(`[_startPauseTimeout] Failed to interrupt thread ${agent.threadId}: ${error}`, 'multi-agent')
          }
        }

        // Mark agent as error with PAUSE_TIMEOUT code (recoverable)
        set((s) => {
          const a = s.agents[agentId]
          if (a) {
            a.status = 'error'
            a.completedAt = new Date()
            a.interruptReason = undefined
            a.error = {
              message: `暂停超时：Agent 在 ${timeoutMs / 1000 / 60} 分钟内未恢复`,
              code: 'PAUSE_TIMEOUT',
              recoverable: true,
            }
            a.progress.description = '暂停超时'
          }

          // Clean up timeout reference
          delete s.pauseTimeouts[agentId]
        })

        // Check if phase completion needs to be triggered
        get().checkPhaseCompletion().catch((err) => {
          log.error(`[_startPauseTimeout] Failed to check phase completion: ${err}`, 'multi-agent')
        })
      }, timeoutMs)

      // Store timeout reference
      set((s) => {
        s.pauseTimeouts[agentId] = timeoutId
      })
    },

    /**
     * Clear pause timeout timer for an agent
     */
    _clearPauseTimeout: (agentId: string) => {
      const state = get()
      const timeoutId = state.pauseTimeouts[agentId]

      if (timeoutId) {
        clearTimeout(timeoutId)
        log.info(`[_clearPauseTimeout] Cleared timeout for agent ${agentId}`, 'multi-agent')

        set((s) => {
          delete s.pauseTimeouts[agentId]
        })
      }
    },

    // ==================== Phase/Workflow Retry Methods ====================

    /**
     * Retry a failed workflow phase
     * Allows recovery from failed state by re-executing the phase with fresh agents.
     *
     * @param phaseId - The ID of the phase to retry
     * @throws Error if phase is not found or not in 'failed' status
     */
    retryPhase: async (phaseId: string) => {
      const state = get()
      const workflow = state.workflow

      if (!workflow) {
        log.error('[retryPhase] No active workflow', 'multi-agent')
        return
      }

      const phaseIndex = workflow.phases.findIndex((p) => p.id === phaseId)
      if (phaseIndex === -1) {
        log.error(`[retryPhase] Phase ${phaseId} not found`, 'multi-agent')
        return
      }

      const phase = workflow.phases[phaseIndex]

      // Check that phase is in 'failed' status
      if (phase.status !== 'failed') {
        log.error(`[retryPhase] Phase ${phaseId} is not in 'failed' status (current: ${phase.status})`, 'multi-agent')
        return
      }

      log.info(`[retryPhase] Retrying phase: ${phase.name} (${phaseId})`, 'multi-agent')

      // Step 1: Clean up old agents from the failed phase
      const oldAgentIds = phase.agentIds || []
      for (const agentId of oldAgentIds) {
        const agent = state.agents[agentId]
        if (agent) {
          // Cancel and remove the old agent
          if (agent.status === 'running' && agent.threadId) {
            try {
              await threadApi.interrupt(agent.threadId)
            } catch (error) {
              log.error(`[retryPhase] Failed to interrupt agent ${agentId}: ${error}`, 'multi-agent')
            }
          }
          get().removeAgent(agentId)
        }
      }

      // Step 2: Reset phase and workflow status (preserve rejection feedback in metadata)
      set((s) => {
        if (!s.workflow) return

        const p = s.workflow.phases.find((wp) => wp.id === phaseId)
        if (p) {
          if (p.output && p.output.startsWith('Phase rejected:')) {
            p.metadata = {
              ...p.metadata,
              lastRejectionReason: p.output.replace('Phase rejected: ', ''),
            }
          }
          p.status = 'pending'
          p.startedAt = undefined
          p.completedAt = undefined
          p.output = undefined
          p.agentIds = []
          if (p.metadata?.spawnFailedCount) {
            delete p.metadata.spawnFailedCount
          }
        }

        // Reset workflow status from 'failed' to 'running'
        s.workflow.status = 'running'
        s.workflow.completedAt = undefined

        // Set current phase index to the retried phase
        s.workflow.currentPhaseIndex = phaseIndex

        // Reset phaseCompletionInFlight if it was stuck on this phase
        if (s.phaseCompletionInFlight === phaseId) {
          s.phaseCompletionInFlight = null
        }
      })

      // Step 3: Re-execute the phase
      const updatedWorkflow = get().workflow
      if (updatedWorkflow) {
        const updatedPhase = updatedWorkflow.phases[phaseIndex]
        if (updatedPhase) {
          await get()._executePhase(updatedPhase)
        }
      }

      log.info(`[retryPhase] Phase ${phase.name} retry initiated`, 'multi-agent')
    },

    /**
     * Retry a failed workflow from the first failed phase
     * Automatically finds the first failed phase and retries it.
     *
     * @throws Error if workflow is not found or not in 'failed' status
     */
    retryWorkflow: async () => {
      const state = get()
      const workflow = state.workflow

      if (!workflow) {
        log.error('[retryWorkflow] No active workflow', 'multi-agent')
        return
      }

      // Check that workflow is in 'failed' status
      if (workflow.status !== 'failed') {
        log.error(`[retryWorkflow] Workflow is not in 'failed' status (current: ${workflow.status})`, 'multi-agent')
        return
      }

      // Find the first failed phase
      const failedPhase = workflow.phases.find((p) => p.status === 'failed')

      if (!failedPhase) {
        log.error('[retryWorkflow] No failed phase found in workflow', 'multi-agent')
        return
      }

      log.info(`[retryWorkflow] Found failed phase: ${failedPhase.name} (${failedPhase.id}), retrying...`, 'multi-agent')

      // Retry the failed phase
      await get().retryPhase(failedPhase.id)
    },


    /**
     * Recover a cancelled workflow from where it left off
     * Allows resuming a workflow that was cancelled, continuing from the current phase.
     *
     * @throws Error if workflow is not found or not in 'cancelled' status
     */
    recoverCancelledWorkflow: async () => {
      const state = get()
      const workflow = state.workflow

      if (!workflow) {
        log.error('[recoverCancelledWorkflow] No active workflow', 'multi-agent')
        return
      }

      // Check that workflow is in 'cancelled' status
      if (workflow.status !== 'cancelled') {
        log.error(`[recoverCancelledWorkflow] Workflow is not in 'cancelled' status (current: ${workflow.status})`, 'multi-agent')
        return
      }

      log.info('[recoverCancelledWorkflow] Recovering cancelled workflow', 'multi-agent')

      // Step 1: Reset workflow status
      set((s) => {
        if (!s.workflow) return
        s.workflow.status = 'running'
        s.workflow.completedAt = undefined
      })

      // Step 2: Get current phase
      const currentPhaseIndex = workflow.currentPhaseIndex
      const currentPhase = workflow.phases[currentPhaseIndex]

      if (!currentPhase) {
        log.error('[recoverCancelledWorkflow] No current phase found', 'multi-agent')
        set((s) => {
          if (s.workflow) {
            s.workflow.status = 'failed'
            s.workflow.completedAt = new Date()
          }
        })
        return
      }

      log.info(`[recoverCancelledWorkflow] Current phase: ${currentPhase.name} (${currentPhase.id}), status: ${currentPhase.status}`, 'multi-agent')

      // Step 3: Handle recovery based on phase status
      if (currentPhase.status === 'completed') {
        // Phase was completed before cancellation, approve to move to next
        log.info(`[recoverCancelledWorkflow] Phase ${currentPhase.name} already completed, approving to continue`, 'multi-agent')
        await get().approvePhase(currentPhase.id)
      } else if (currentPhase.status === 'failed') {
        // Phase failed before cancellation, retry it
        log.info(`[recoverCancelledWorkflow] Phase ${currentPhase.name} failed, retrying`, 'multi-agent')
        await get().retryPhase(currentPhase.id)
      } else {
        // Phase is pending, running, or other status - re-execute it
        log.info(`[recoverCancelledWorkflow] Re-executing phase ${currentPhase.name}`, 'multi-agent')
        
        // Clean up any cancelled agents from this phase
        const phaseAgentIds = currentPhase.agentIds || []
        for (const agentId of phaseAgentIds) {
          const agent = state.agents[agentId]
          if (agent && agent.status === 'cancelled') {
            get().removeAgent(agentId)
          }
        }

        // Reset phase state before re-execution
        set((s) => {
          if (!s.workflow) return
          const p = s.workflow.phases.find((wp) => wp.id === currentPhase.id)
          if (p) {
            p.status = 'pending'
            p.startedAt = undefined
            p.completedAt = undefined
            p.agentIds = []
          }
        })

        // Re-execute the phase
        const updatedWorkflow = get().workflow
        if (updatedWorkflow) {
          const updatedPhase = updatedWorkflow.phases[currentPhaseIndex]
          if (updatedPhase) {
            await get()._executePhase(updatedPhase)
          }
        }
      }

      log.info('[recoverCancelledWorkflow] Workflow recovery initiated', 'multi-agent')
    },
    // ==================== Reset ====================

    /**
     * Reset all state
     */
    reset: () => {
      const state = get()

      // Clear all approval timeouts before resetting
      for (const phaseId of Object.keys(state.approvalTimeouts)) {
        get()._clearApprovalTimeout(phaseId)
      }

      // Clear all dependency wait timeouts before resetting
      for (const agentId of Object.keys(state.dependencyWaitTimeouts)) {
        get()._clearDependencyWaitTimeout(agentId)
      }

      // Clear all pause timeouts before resetting
      for (const agentId of Object.keys(state.pauseTimeouts)) {
        get()._clearPauseTimeout(agentId)
      }

      // Interrupt all running agent threads
      const agents = Object.values(state.agents)
      const threadIds: string[] = []

      for (const agent of agents) {
        if (agent.threadId) {
          threadIds.push(agent.threadId)
          if (agent.status === 'running') {
            threadApi.interrupt(agent.threadId).catch((error) => {
              log.error(`[reset] Failed to interrupt thread ${agent.threadId}: ${error}`, 'multi-agent')
            })
          }
        }
      }

      // Unregister all agent threads from thread store
      const threadStore = useThreadStore.getState()
      for (const threadId of threadIds) {
        threadStore.unregisterAgentThread(threadId)
      }

      set((s) => {
        s.config = defaultConfig
        s.workingDirectory = ''
        s.agents = {}
        s.agentOrder = []
        s.agentMapping = {}
        s.workflow = null
        s.workflowEngine = null
        s.previousPhaseOutput = undefined
        s.phaseCompletionInFlight = null
        // Clear all approval and timeout tracking state
        s.approvalInFlight = {}
        s.approvalTimeouts = {}
        s.pauseInFlight = {}
        s.dependencyWaitTimeouts = {}
        s.pauseTimeouts = {}
      })
    },
  }))
)
