/**
 * Multi-Agent Store v2 - Protocol-native multi-agent system
 *
 * Modular architecture with separate concerns:
 * - types.ts: State and config type definitions
 * - constants.ts: Timeout values, policies, defaults
 * - helpers.ts: Pure utility functions
 * - persistence.ts: localStorage serialization
 * - index.ts: Main store implementation (this file)
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { WritableDraft } from 'immer'
import { getAgentSandboxPolicy } from '../../lib/agent-types'
import { threadApi } from '../../lib/api'
import { log } from '../../lib/logger'
import { normalizeApprovalPolicy } from '../../lib/normalize'
import { generatePhaseAgentTasks } from '../../lib/workflows/plan-mode'
import { createWorkflowFromTemplate } from '../../lib/workflows/template-engine'
import type { WorkflowTemplate, WorkflowPhase, AgentDescriptor, AgentType, AgentConfigOverrides, AgentStatus, AgentError, AgentProgress, Workflow } from '../../lib/workflows/types'
import { useThreadStore } from '../thread'

import type { MultiAgentState, MultiAgentConfig } from './types'
import {
  DEFAULT_CONFIG,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  DEFAULT_DEPENDENCY_WAIT_TIMEOUT_MS,
  DEFAULT_PAUSE_TIMEOUT_MS,
  START_SLOT_POLL_MS,
} from './constants'
import {
  sleep,
  resolveApprovalPolicy,
  resolveSandboxPolicy,
  buildAgentDeveloperInstructions,
  buildAgentTaskMessage,
  buildPhaseOutput,
} from './helpers'
import {
  STORAGE_NAME,
  STORAGE_VERSION,
  createMultiAgentStorage,
  partializeState,
  createOnRehydrateHandler,
} from './persistence'

// Re-export types for backward compatibility
export type {
  MultiAgentState,
  MultiAgentConfig,
} from './types'

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
  AgentType,
} from '../../lib/workflows/types'

export const useMultiAgentStore = create<MultiAgentState>()(
  persist(
    immer((set, get) => ({
      // ==================== Initial State ====================
      config: DEFAULT_CONFIG,
      workingDirectory: '',
      agents: {},
      agentOrder: [],
      agentMapping: {},
      workflow: null,
      previousPhaseOutput: undefined,
      phaseCompletionInFlight: null,
      approvalInFlight: {},
      approvalTimeouts: {},
      pauseInFlight: {},
      dependencyWaitTimeouts: {},
      pauseTimeouts: {},
      restartRecoveryInFlight: false,

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

      spawnAgent: async (
        type: AgentType,
        task: string,
        dependencies: string[] = [],
        config: AgentConfigOverrides = {}
      ): Promise<string | null> => {
        try {
          const state = get()
          const agentId = crypto.randomUUID()

          let resolveThreadReady: (success: boolean) => void
          const threadReadyPromise = new Promise<boolean>((resolve) => {
            resolveThreadReady = resolve
          })

          const agent: AgentDescriptor = {
            id: agentId,
            type,
            threadId: '',
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
                    recoverable: true,
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

              const cleanup = () => {
                if (checkInterval) clearInterval(checkInterval)
                get()._clearDependencyWaitTimeout(agentId)
              }

              const safeResolve = (value: boolean) => {
                if (resolved) return
                resolved = true
                cleanup()
                resolve(value)
              }

              const checkInterval = setInterval(() => {
                const now = Date.now()
                const currentlyPaused = isPaused()

                const pauseInProgress = get().pauseInFlight[agentId]
                if (pauseInProgress) {
                  return
                }

                if (shouldAbortStart()) {
                  safeResolve(false)
                  return
                }

                if (!wasPaused && !currentlyPaused) {
                  activeTimeMs += now - lastCheckTime
                }
                lastCheckTime = now
                wasPaused = currentlyPaused

                if (currentlyPaused) {
                  return
                }

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
                        recoverable: true,
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
                        recoverable: true,
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

              set((s) => {
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

              let slotReserved = false
              set((state) => {
                const agent = state.agents[agentId]
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

              const sandboxPolicyRaw = getAgentSandboxPolicy(type)
              const sandboxPolicy = resolveSandboxPolicy(sandboxPolicyRaw)

              const approvalPolicy = resolveApprovalPolicy(
                sandboxPolicyRaw,
                config.approvalPolicy,
                state.config.approvalPolicy
              )

              const model = config.model || state.config.model || undefined

              const developerInstructions = buildAgentDeveloperInstructions(type)

              const response = await threadApi.start(
                state.config.projectId || '',
                state.config.cwd,
                model,
                sandboxPolicy,
                approvalPolicy,
                developerInstructions
                  ? { developerInstructions }
                  : undefined
              )

              const threadId = response.thread.id

              try {
                useThreadStore.getState().registerAgentThread(response.thread, agentId, { focus: false })
              } catch (registrationError) {
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

              set((state) => {
                const agent = state.agents[agentId]
                if (agent) {
                  agent.threadId = threadId
                  agent.threadStoreRef = threadId
                  agent.status = 'running'
                  agent.progress.description = '正在执行任务'
                  agent.interruptReason = undefined
                }
                state.agentMapping[threadId] = agentId
              })

              const agentTaskMessage = buildAgentTaskMessage(task)
              try {
                await threadApi.sendMessage(threadId, agentTaskMessage, [], [], {
                  model,
                  approvalPolicy,
                  sandboxPolicy,
                })
              } catch (sendError) {
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

          const success = await threadReadyPromise
          return success ? agentId : null
        } catch (error) {
          log.error(`[spawnAgent] Failed to create agent: ${error}`, 'multi-agent')
          return null
        }
      },

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

        if (status === 'completed' || status === 'error' || status === 'cancelled') {
          setTimeout(() => {
            get().checkPhaseCompletion().catch((err) => {
              log.error(`[updateAgentStatus] Failed to check phase completion: ${err}`, 'multi-agent')
            })
          }, 0)
        }
      },

      updateAgentProgress: (id: string, progress: Partial<AgentProgress>) => {
        set((state) => {
          const agent = state.agents[id]
          if (!agent) return

          agent.progress = { ...agent.progress, ...progress }
        })
      },

      cancelAgent: async (id: string) => {
        const agent = get().agents[id]
        if (!agent) return

        try {
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
          }

          log.info(`[cancelAgent] Agent ${id} cancelled`, 'multi-agent')
        } catch (error) {
          log.error(`[cancelAgent] Failed to cancel agent ${id}: ${error}`, 'multi-agent')
        }
      },

      pauseAgent: async (id: string) => {
        const agent = get().agents[id]
        if (!agent) return

        if (get().pauseInFlight[id]) {
          log.warn(`[pauseAgent] Pause already in flight for agent ${id}, ignoring duplicate call`, 'multi-agent')
          return
        }

        let claimed = false
        const originalStatus = agent.status
        const originalInterruptReason = agent.interruptReason
        const originalProgressDescription = agent.progress.description

        set((state) => {
          if (state.pauseInFlight[id]) return
          state.pauseInFlight[id] = true
          claimed = true
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
          if (agent.threadId && agent.status === 'running') {
            await threadApi.interrupt(agent.threadId)
          }

          set((state) => {
            const current = state.agents[id]
            if (current) {
              current.status = 'pending'
              current.interruptReason = 'pause'
              current.progress.description = '已暂停'
            }
          })

          get()._startPauseTimeout(id)

          log.info(`[pauseAgent] Agent ${id} paused`, 'multi-agent')
        } catch (error) {
          log.error(`[pauseAgent] Failed to pause agent ${id}: ${error}`, 'multi-agent')
          set((state) => {
            const current = state.agents[id]
            if (current) {
              current.status = originalStatus
              current.interruptReason = originalInterruptReason
              current.progress.description = originalProgressDescription
            }
          })
        } finally {
          set((state) => {
            delete state.pauseInFlight[id]
          })
        }
      },

      resumeAgent: async (id: string) => {
        const agent = get().agents[id]
        if (!agent) return

        try {
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
            await threadApi.sendMessage(agent.threadId, '请继续执行任务', [], [])
          }

          log.info(`[resumeAgent] Agent ${id} resumed`, 'multi-agent')
        } catch (error) {
          log.error(`[resumeAgent] Failed to resume agent ${id}: ${error}`, 'multi-agent')
        }
      },

      retryAgent: async (id: string) => {
        const agent = get().agents[id]
        if (!agent || agent.status !== 'error') return

        try {
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
            const newAgentId = await get().spawnAgent(agent.type, agent.task, agent.dependencies, agent.config)
            if (newAgentId) {
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

      removeAgent: (id: string) => {
        const agent = get().agents[id]
        if (!agent) return

        get()._clearPauseTimeout(id)

        const threadId = agent.threadId

        if (threadId) {
          useThreadStore.getState().unregisterAgentThread(threadId)
        }

        set((state) => {
          if (threadId) {
            delete state.agentMapping[threadId]
          }
          delete state.agents[id]
          state.agentOrder = state.agentOrder.filter((aid) => aid !== id)
        })
      },

      clearAgents: async () => {
        const state = get()
        const agents = Object.values(state.agents)

        const agentThreadIds = agents
          .map((agent) => agent.threadId)
          .filter((id): id is string => !!id)

        const mappedThreadIds = Object.keys(state.agentMapping)
        const allThreadIds = [...new Set([...agentThreadIds, ...mappedThreadIds])]

        for (const threadId of allThreadIds) {
          try {
            await threadApi.interrupt(threadId)
          } catch (error) {
            log.error(`[clearAgents] Failed to interrupt thread ${threadId}: ${error}`, 'multi-agent')
          }
        }

        const threadStore = useThreadStore.getState()
        for (const threadId of allThreadIds) {
          threadStore.unregisterAgentThread(threadId)
        }

        set((s) => {
          s.agents = {}
          s.agentOrder = []
          s.agentMapping = {}
        })

        log.info(`[clearAgents] Cleared ${agents.length} agents and ${allThreadIds.length} threads`, 'multi-agent')
      },

      // ==================== Workflow Management ====================

      startWorkflow: async (workflow: Workflow) => {
        const state = get()

        if (state.workflow || Object.keys(state.agents).length > 0) {
          log.info('[startWorkflow] Cleaning up existing workflow/agents before starting new workflow', 'multi-agent')

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

          const threadStore = useThreadStore.getState()
          for (const agent of Object.values(state.agents)) {
            if (agent.threadId) {
              threadStore.unregisterAgentThread(agent.threadId)
            }
          }

          set((s) => {
            s.agents = {}
            s.agentOrder = []
            s.agentMapping = {}
            s.workflow = null
            s.previousPhaseOutput = undefined
            s.phaseCompletionInFlight = null
          })
        }

        set((s) => {
          s.workflow = workflow as WritableDraft<Workflow>
          s.workflow.status = 'running'
          s.workflow.startedAt = new Date()
          s.previousPhaseOutput = undefined
          s.phaseCompletionInFlight = null
        })

        await get()._executePhase(workflow.phases[0])
      },

      startWorkflowFromTemplate: async (template: WorkflowTemplate, userTask: string) => {
        const state = get()
        const context = {
          workingDirectory: state.config.cwd || state.workingDirectory,
          userTask,
        }
        const workflow = createWorkflowFromTemplate(template, userTask, context)
        await get().startWorkflow(workflow)
      },

      _executePhase: async (phase: WorkflowPhase) => {
        const state = get()
        
        log.info(`[_executePhase] Starting phase: ${phase.name}`, 'multi-agent')

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

      approvePhase: async (phaseId: string) => {
        const state = get()
        const workflow = state.workflow

        if (!workflow) return

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

          if (hasNextPhase) {
            await get()._executePhase(nextPhase)
          }
        } finally {
          set((s) => {
            delete s.approvalInFlight[phaseId]
            s.phaseCompletionInFlight = null
          })
        }
      },

      rejectPhase: (phaseId: string, reason?: string) => {
        const state = get()
        const workflow = state.workflow

        if (!workflow) return

        if (state.approvalInFlight[phaseId]) {
          log.warn(`[rejectPhase] Approval already in flight for phase ${phaseId}, ignoring duplicate call`, 'multi-agent')
          return
        }

        const phaseRef = workflow.phases.find((p) => p.id === phaseId)
        if (!phaseRef || (phaseRef.status !== 'awaiting_approval' && phaseRef.status !== 'approval_timeout')) {
          log.warn(`[rejectPhase] Phase ${phaseId} is not in rejectable state (current: ${phaseRef?.status})`, 'multi-agent')
          return
        }

        get()._clearApprovalTimeout(phaseId)

        set((s) => {
          if (!s.workflow) return

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

          delete s.approvalInFlight[phaseId]
        })
      },

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

        if (phase.status !== 'approval_timeout') {
          log.warn(`[recoverApprovalTimeout] Phase ${phaseId} is not in approval_timeout state (current: ${phase.status})`, 'multi-agent')
          return
        }

        if (workflow.status !== 'running') {
          log.warn(`[recoverApprovalTimeout] Workflow is not running (current: ${workflow.status})`, 'multi-agent')
          return
        }

        log.info(`[recoverApprovalTimeout] Recovering phase ${phaseId} from approval_timeout`, 'multi-agent')

        set((s) => {
          if (!s.workflow) return

          const p = s.workflow.phases.find((wp) => wp.id === phaseId)
          if (p) {
            p.status = 'awaiting_approval'
          }
        })

        const approvalTimeoutMs = phase.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS
        if (approvalTimeoutMs > 0) {
          get()._startApprovalTimeout(phaseId, approvalTimeoutMs)
        }

        log.info(`[recoverApprovalTimeout] Phase ${phaseId} recovered, approval timeout restarted`, 'multi-agent')
      },

      cancelWorkflow: async () => {
        const state = get()
        const workflow = state.workflow
        if (!workflow) return

        for (const phaseId of Object.keys(state.approvalTimeouts)) {
          get()._clearApprovalTimeout(phaseId)
        }

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
          s.phaseCompletionInFlight = null
          s.approvalInFlight = {}
          s.approvalTimeouts = {}
        })
      },

      clearWorkflow: () => {
        const state = get()
        for (const phaseId of Object.keys(state.approvalTimeouts)) {
          get()._clearApprovalTimeout(phaseId)
        }

        set((s) => {
          s.workflow = null
          s.previousPhaseOutput = undefined
          s.phaseCompletionInFlight = null
          s.approvalInFlight = {}
          s.approvalTimeouts = {}
        })
      },

      // ==================== Getters ====================

      getAgent: (id: string) => {
        return get().agents[id]
      },

      getAgentByThreadId: (threadId: string) => {
        const agentId = get().agentMapping[threadId]
        return agentId ? get().agents[agentId] : undefined
      },

      getAgentsByStatus: (status: AgentStatus) => {
        return Object.values(get().agents).filter((a) => a.status === status)
      },

      getCurrentPhase: () => {
        const workflow = get().workflow
        if (!workflow) return undefined
        return workflow.phases[workflow.currentPhaseIndex]
      },

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

          if (hasError && !latestPhase.requiresApproval) {
            set((s) => {
              if (!s.workflow) return
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

          log.info(`[checkPhaseCompletion] Phase completed: ${latestPhase.name}${hasError ? ' (with errors)' : ''}`, 'multi-agent')

          if (latestPhase.requiresApproval) {
            log.info(
              `[checkPhaseCompletion] Approval required for phase: ${latestPhase.name}`,
              'multi-agent'
            )
            set((s) => {
              if (!s.workflow) return
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

            const approvalTimeoutMs = latestPhase.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS
            if (approvalTimeoutMs > 0) {
              get()._startApprovalTimeout(phaseId, approvalTimeoutMs)
            }

            return
          }

          const finalState = get()
          if (!finalState.workflow || finalState.workflow.currentPhaseIndex !== phaseIndex) {
            log.info('[checkPhaseCompletion] Workflow state changed before auto-advance, aborting', 'multi-agent')
            return
          }

          set((s) => {
            if (!s.workflow) return
            if (s.workflow.currentPhaseIndex !== phaseIndex) return
            const p = s.workflow.phases[s.workflow.currentPhaseIndex]
            if (p && p.id === phaseId) {
              p.output = phaseOutput
            }
            s.previousPhaseOutput = phaseOutput
          })
          await finalState.approvePhase(latestPhase.id)
        } finally {
          set((s) => {
            if (s.phaseCompletionInFlight === phaseId) {
              s.phaseCompletionInFlight = null
            }
          })
        }
      },

      _startApprovalTimeout: (phaseId: string, timeoutMs: number = DEFAULT_APPROVAL_TIMEOUT_MS) => {
        get()._clearApprovalTimeout(phaseId)

        log.info(`[_startApprovalTimeout] Starting ${timeoutMs}ms timeout for phase ${phaseId}`, 'multi-agent')

        const timeoutId = setTimeout(() => {
          const state = get()
          const workflow = state.workflow

          if (!workflow || workflow.status !== 'running') {
            log.info(`[_startApprovalTimeout] Timeout fired but workflow not running, ignoring`, 'multi-agent')
            return
          }

          const phase = workflow.phases.find((p) => p.id === phaseId)
          if (!phase) {
            log.info(`[_startApprovalTimeout] Timeout fired but phase ${phaseId} not found, ignoring`, 'multi-agent')
            return
          }

          const currentPhase = workflow.phases[workflow.currentPhaseIndex]
          if (!currentPhase || currentPhase.id !== phaseId) {
            log.info(`[_startApprovalTimeout] Timeout fired but phase ${phaseId} is no longer current, ignoring`, 'multi-agent')
            return
          }

          if (state.approvalInFlight[phaseId]) {
            log.info(`[_startApprovalTimeout] Timeout fired but approval in flight for ${phaseId}, ignoring`, 'multi-agent')
            return
          }

          log.warn(`[_startApprovalTimeout] Approval timeout for phase ${phaseId}, marking as approval_timeout (recoverable)`, 'multi-agent')

          set((s) => {
            if (!s.workflow) return

            const p = s.workflow.phases.find((wp) => wp.id === phaseId)
            if (p) {
              p.status = 'approval_timeout'
              p.output = `审批超时：用户在 ${timeoutMs / 1000} 秒内未响应。可通过 recoverApprovalTimeout 恢复。`
            }

            delete s.approvalTimeouts[phaseId]
          })
        }, timeoutMs)

        set((s) => {
          s.approvalTimeouts[phaseId] = timeoutId
        })
      },

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

      _isPauseInFlight: (agentId: string) => {
        return get().pauseInFlight[agentId] === true
      },

      // ==================== WF-008: Dependency Timeout Helpers ====================

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

      retryDependencyWait: async (agentId: string) => {
        const agent = get().agents[agentId]
        if (!agent) return

        if (agent.status !== 'error' || agent.error?.code !== 'DEPENDENCY_TIMEOUT') {
          log.warn(`[retryDependencyWait] Agent ${agentId} is not in dependency timeout state`, 'multi-agent')
          return
        }

        log.info(`[retryDependencyWait] Retrying dependency wait for agent ${agentId}`, 'multi-agent')

        const newAgentId = await get().spawnAgent(agent.type, agent.task, agent.dependencies, agent.config)
        if (newAgentId) {
          get().removeAgent(agentId)
          log.info(`[retryDependencyWait] Agent ${agentId} replaced with new agent ${newAgentId}`, 'multi-agent')
        } else {
          log.error(`[retryDependencyWait] Failed to respawn agent ${agentId}`, 'multi-agent')
        }
      },

      // ==================== Pause Timeout Helpers ====================

      _startPauseTimeout: (agentId: string, timeoutMs: number = DEFAULT_PAUSE_TIMEOUT_MS) => {
        get()._clearPauseTimeout(agentId)

        log.info(`[_startPauseTimeout] Starting ${timeoutMs}ms timeout for agent ${agentId}`, 'multi-agent')

        const timeoutId = setTimeout(async () => {
          const state = get()
          const agent = state.agents[agentId]

          if (!agent) {
            log.info(`[_startPauseTimeout] Timeout fired but agent ${agentId} not found, ignoring`, 'multi-agent')
            return
          }

          if (agent.status !== 'pending' || agent.interruptReason !== 'pause') {
            log.info(`[_startPauseTimeout] Timeout fired but agent ${agentId} is no longer paused, ignoring`, 'multi-agent')
            return
          }

          log.warn(`[_startPauseTimeout] Pause timeout for agent ${agentId}, marking as error`, 'multi-agent')

          if (agent.threadId) {
            try {
              await threadApi.interrupt(agent.threadId)
            } catch (error) {
              log.error(`[_startPauseTimeout] Failed to interrupt thread ${agent.threadId}: ${error}`, 'multi-agent')
            }
          }

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

            delete s.pauseTimeouts[agentId]
          })

          get().checkPhaseCompletion().catch((err) => {
            log.error(`[_startPauseTimeout] Failed to check phase completion: ${err}`, 'multi-agent')
          })
        }, timeoutMs)

        set((s) => {
          s.pauseTimeouts[agentId] = timeoutId
        })
      },

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

      _autoResumeAfterRestart: async () => {
        const state = get()
        if (state.restartRecoveryInFlight) return

        const candidates = Object.values(state.agents).filter(
          (agent) => agent.threadId && agent.error?.code === 'APP_RESTART_LOST_CONNECTION'
        )
        if (candidates.length === 0) return

        set((s) => {
          s.restartRecoveryInFlight = true
        })

        try {
          for (const agent of candidates) {
            try {
              if (!agent.threadId) continue
              await useThreadStore.getState().resumeThread(agent.threadId)
              set((s) => {
                const current = s.agents[agent.id]
                if (current) {
                  current.status = 'pending'
                  current.error = undefined
                  current.completedAt = undefined
                  current.progress = { ...current.progress, description: '正在恢复连接' }
                }
              })
              await get().resumeAgent(agent.id)
            } catch (error) {
              log.warn(`[autoResumeAfterRestart] Failed to resume agent ${agent.id}: ${error}`, 'multi-agent')
            }
          }
        } finally {
          set((s) => {
            s.restartRecoveryInFlight = false
          })
        }
      },

      // ==================== Phase/Workflow Retry Methods ====================

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

        if (phase.status !== 'failed') {
          log.error(`[retryPhase] Phase ${phaseId} is not in 'failed' status (current: ${phase.status})`, 'multi-agent')
          return
        }

        log.info(`[retryPhase] Retrying phase: ${phase.name} (${phaseId})`, 'multi-agent')

        const oldAgentIds = phase.agentIds || []
        for (const agentId of oldAgentIds) {
          const agent = state.agents[agentId]
          if (agent) {
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

          s.workflow.status = 'running'
          s.workflow.completedAt = undefined

          s.workflow.currentPhaseIndex = phaseIndex

          if (s.phaseCompletionInFlight === phaseId) {
            s.phaseCompletionInFlight = null
          }
        })

        const updatedWorkflow = get().workflow
        if (updatedWorkflow) {
          const updatedPhase = updatedWorkflow.phases[phaseIndex]
          if (updatedPhase) {
            await get()._executePhase(updatedPhase)
          }
        }

        log.info(`[retryPhase] Phase ${phase.name} retry initiated`, 'multi-agent')
      },

      retryWorkflow: async () => {
        const state = get()
        const workflow = state.workflow

        if (!workflow) {
          log.error('[retryWorkflow] No active workflow', 'multi-agent')
          return
        }

        if (workflow.status !== 'failed') {
          log.error(`[retryWorkflow] Workflow is not in 'failed' status (current: ${workflow.status})`, 'multi-agent')
          return
        }

        const failedPhase = workflow.phases.find((p) => p.status === 'failed')

        if (!failedPhase) {
          log.error('[retryWorkflow] No failed phase found in workflow', 'multi-agent')
          return
        }

        log.info(`[retryWorkflow] Found failed phase: ${failedPhase.name} (${failedPhase.id}), retrying...`, 'multi-agent')

        await get().retryPhase(failedPhase.id)
      },

      recoverCancelledWorkflow: async () => {
        const state = get()
        const workflow = state.workflow

        if (!workflow) {
          log.error('[recoverCancelledWorkflow] No active workflow', 'multi-agent')
          return
        }

        if (workflow.status !== 'cancelled') {
          log.error(`[recoverCancelledWorkflow] Workflow is not in 'cancelled' status (current: ${workflow.status})`, 'multi-agent')
          return
        }

        log.info('[recoverCancelledWorkflow] Recovering cancelled workflow', 'multi-agent')

        set((s) => {
          if (!s.workflow) return
          s.workflow.status = 'running'
          s.workflow.completedAt = undefined
        })

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

        if (currentPhase.status === 'completed') {
          log.info(`[recoverCancelledWorkflow] Phase ${currentPhase.name} already completed, approving to continue`, 'multi-agent')
          await get().approvePhase(currentPhase.id)
        } else if (currentPhase.status === 'failed') {
          log.info(`[recoverCancelledWorkflow] Phase ${currentPhase.name} failed, retrying`, 'multi-agent')
          await get().retryPhase(currentPhase.id)
        } else {
          log.info(`[recoverCancelledWorkflow] Re-executing phase ${currentPhase.name}`, 'multi-agent')
          
          const phaseAgentIds = currentPhase.agentIds || []
          for (const agentId of phaseAgentIds) {
            const agent = state.agents[agentId]
            if (agent && agent.status === 'cancelled') {
              get().removeAgent(agentId)
            }
          }

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

      reset: () => {
        const state = get()

        for (const phaseId of Object.keys(state.approvalTimeouts)) {
          get()._clearApprovalTimeout(phaseId)
        }

        for (const agentId of Object.keys(state.dependencyWaitTimeouts)) {
          get()._clearDependencyWaitTimeout(agentId)
        }

        for (const agentId of Object.keys(state.pauseTimeouts)) {
          get()._clearPauseTimeout(agentId)
        }

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

        const threadStore = useThreadStore.getState()
        for (const threadId of threadIds) {
          threadStore.unregisterAgentThread(threadId)
        }

        set((s) => {
          s.config = DEFAULT_CONFIG
          s.workingDirectory = ''
          s.agents = {}
          s.agentOrder = []
          s.agentMapping = {}
          s.workflow = null
          s.previousPhaseOutput = undefined
          s.phaseCompletionInFlight = null
          s.approvalInFlight = {}
          s.approvalTimeouts = {}
          s.pauseInFlight = {}
          s.dependencyWaitTimeouts = {}
          s.pauseTimeouts = {}
          s.restartRecoveryInFlight = false
        })
      },
    })),
    {
      name: STORAGE_NAME,
      version: STORAGE_VERSION,
      storage: createMultiAgentStorage(),
      partialize: partializeState,
      onRehydrateStorage: (): ((state: MultiAgentState | undefined) => void) => createOnRehydrateHandler(() => useMultiAgentStore.getState()),
    }
  )
)
