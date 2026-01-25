/**
 * Workflow State Machine
 * 
 * Defines valid state transitions for agents, phases, and workflows.
 * Provides guards and transition functions for safe state changes.
 */

import type { AgentStatus, WorkflowPhaseStatus, WorkflowStatus } from '../../lib/workflows/types'

// ==================== Agent State Machine ====================

const AGENT_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  pending: ['running', 'cancelled', 'error'],
  running: ['completed', 'error', 'cancelled', 'pending'],
  completed: [],
  error: ['pending'],
  cancelled: ['pending'],
}

export function canAgentTransition(from: AgentStatus, to: AgentStatus): boolean {
  return AGENT_TRANSITIONS[from]?.includes(to) ?? false
}

export function validateAgentTransition(from: AgentStatus, to: AgentStatus): void {
  if (!canAgentTransition(from, to)) {
    throw new Error(`Invalid agent transition: ${from} → ${to}`)
  }
}

// ==================== Phase State Machine ====================

const PHASE_TRANSITIONS: Record<WorkflowPhaseStatus, WorkflowPhaseStatus[]> = {
  pending: ['running'],
  running: ['awaiting_approval', 'completed', 'failed'],
  awaiting_approval: ['completed', 'failed', 'approval_timeout'],
  approval_timeout: ['awaiting_approval', 'completed', 'failed'],
  completed: [],
  failed: ['pending'],
}

export function canPhaseTransition(from: WorkflowPhaseStatus, to: WorkflowPhaseStatus): boolean {
  return PHASE_TRANSITIONS[from]?.includes(to) ?? false
}

export function validatePhaseTransition(from: WorkflowPhaseStatus, to: WorkflowPhaseStatus): void {
  if (!canPhaseTransition(from, to)) {
    throw new Error(`Invalid phase transition: ${from} → ${to}`)
  }
}

export function isPhaseTerminal(status: WorkflowPhaseStatus): boolean {
  return status === 'completed' || status === 'failed'
}

export function isPhaseAwaitingAction(status: WorkflowPhaseStatus): boolean {
  return status === 'awaiting_approval' || status === 'approval_timeout'
}

// ==================== Workflow State Machine ====================

const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  pending: ['running'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['running'],
  cancelled: ['running'],
}

export function canWorkflowTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return WORKFLOW_TRANSITIONS[from]?.includes(to) ?? false
}

export function validateWorkflowTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  if (!canWorkflowTransition(from, to)) {
    throw new Error(`Invalid workflow transition: ${from} → ${to}`)
  }
}

export function isWorkflowTerminal(status: WorkflowStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function isWorkflowRecoverable(status: WorkflowStatus): boolean {
  return status === 'failed' || status === 'cancelled'
}

// ==================== Error Classification ====================

export type ErrorDomain = 'agent' | 'phase' | 'workflow' | 'system'
export type ErrorSeverity = 'recoverable' | 'terminal' | 'transient'

export interface ClassifiedError {
  domain: ErrorDomain
  severity: ErrorSeverity
  code: string
  message: string
  canRetry: boolean
  canRecover: boolean
}

const RECOVERABLE_ERROR_CODES = new Set([
  'DEPENDENCY_TIMEOUT',
  'DEPENDENCY_FAILED',
  'PAUSE_TIMEOUT',
  'APP_RESTART_LOST_CONNECTION',
  'SPAWN_FAILED',
])

const TRANSIENT_ERROR_CODES = new Set([
  'NETWORK_ERROR',
  'TIMEOUT',
  'RATE_LIMITED',
])

export function classifyError(code: string, message: string, context?: { agentId?: string; phaseId?: string }): ClassifiedError {
  const isRecoverable = RECOVERABLE_ERROR_CODES.has(code)
  const isTransient = TRANSIENT_ERROR_CODES.has(code)

  let domain: ErrorDomain = 'system'
  if (context?.agentId && !context?.phaseId) {
    domain = 'agent'
  } else if (context?.phaseId) {
    domain = 'phase'
  } else if (code.startsWith('WORKFLOW_')) {
    domain = 'workflow'
  }

  let severity: ErrorSeverity = 'terminal'
  if (isTransient) {
    severity = 'transient'
  } else if (isRecoverable) {
    severity = 'recoverable'
  }

  return {
    domain,
    severity,
    code,
    message,
    canRetry: isRecoverable || isTransient,
    canRecover: isRecoverable,
  }
}

// ==================== Decision Priority ====================

export type DecisionType = 'phase_approval' | 'safety_approval' | 'error_recovery' | 'timeout_recovery'

export interface PendingDecision {
  type: DecisionType
  priority: number
  id: string
  label: string
  description: string
  actions: string[]
}

export function getDecisionPriority(type: DecisionType): number {
  switch (type) {
    case 'safety_approval':
      return 1
    case 'phase_approval':
      return 2
    case 'timeout_recovery':
      return 3
    case 'error_recovery':
      return 4
    default:
      return 99
  }
}

export function sortDecisionsByPriority(decisions: PendingDecision[]): PendingDecision[] {
  return [...decisions].sort((a, b) => a.priority - b.priority)
}
