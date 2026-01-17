/**
 * Workflow Types - Shared type definitions for workflow system
 *
 * This file contains all shared types used by workflow-engine, plan-mode,
 * and multi-agent-v2 to avoid circular dependencies.
 */

import type { AgentType } from '../agent-types'

// Re-export AgentType for convenience
export type { AgentType }

// ==================== Agent Types ====================

/**
 * Agent status
 */
export type AgentStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled'

/**
 * Agent progress information
 */
export interface AgentProgress {
  current: number
  total: number
  description: string
}

/**
 * Agent error information
 */
export interface AgentError {
  message: string
  code: string
  recoverable: boolean
  stackTrace?: string
  details?: Record<string, unknown> // Additional error details (e.g., failed dependencies)
}

/**
 * Agent configuration overrides
 */
export interface AgentConfigOverrides {
  model?: string
  approvalPolicy?: string
  timeout?: number // in seconds
}

/**
 * Agent descriptor - represents a specialized agent
 */
export interface AgentDescriptor {
  // Identity
  id: string // UUID
  type: AgentType
  threadId: string // Real Codex thread ID

  // Task
  task: string // Task description
  dependencies: string[] // IDs of agents this depends on

  // Status
  status: AgentStatus
  progress: AgentProgress

  // Output (reference to thread store)
  threadStoreRef: string // threadId (same as threadId above)

  // Metadata
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  error?: AgentError
  interruptReason?: 'pause' | 'cancel'

  // Configuration
  config: AgentConfigOverrides
}

// ==================== Workflow Types ====================

/**
 * Workflow phase status
 * - pending: Phase has not started yet
 * - running: Phase is currently executing
 * - completed: Phase completed successfully
 * - failed: Phase failed due to error
 * - approval_timeout: Phase completed but approval timed out (recoverable)
 */
export type WorkflowPhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'approval_timeout'

/**
 * Workflow phase - represents a stage in a multi-agent workflow
 */
export interface WorkflowPhase {
  id: string
  name: string
  description: string
  agentIds: string[] // IDs of agents in this phase
  status: WorkflowPhaseStatus
  requiresApproval: boolean
  approvalTimeoutMs?: number // Approval timeout in milliseconds (default: 5 minutes)
  output?: string // Phase summary output
  metadata?: Record<string, unknown> // Phase metadata (agent types, tasks, etc.)
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

/**
 * Workflow status
 */
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * Workflow definition
 */
export interface Workflow {
  id: string
  name: string
  description: string
  phases: WorkflowPhase[]
  currentPhaseIndex: number
  status: WorkflowStatus
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

/**
 * Workflow execution context
 */
export interface WorkflowExecutionContext {
  workingDirectory: string
  userTask: string
  previousPhaseOutput?: string
  globalConfig?: Record<string, unknown>
}
