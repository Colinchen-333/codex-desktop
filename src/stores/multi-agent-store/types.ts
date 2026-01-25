/**
 * Multi-Agent Store Types
 *
 * State types and interfaces for the multi-agent orchestration system.
 * Separated from the main store for better maintainability.
 */

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
  AgentType,
} from '../../lib/workflows/types'

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
  AgentType,
}

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

/**
 * Multi-agent store state interface
 */
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
  startWorkflowFromTemplate: (template: import('../../lib/workflows/types').WorkflowTemplate, userTask: string) => Promise<void>
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

  restartRecoveryInFlight: boolean
  _autoResumeAfterRestart: () => Promise<void>

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

/**
 * Persisted state subset (what gets saved to localStorage)
 */
export interface PersistedMultiAgentState {
  config: MultiAgentConfig
  workingDirectory: string
  agents: Record<string, AgentDescriptor>
  agentOrder: string[]
  agentMapping: Record<string, string>
  workflow: Workflow | null
  previousPhaseOutput?: string
}
