/**
 * WorkflowEngine - Simplified workflow state container
 *
 * NOTE: This class has been simplified to be a pure state container.
 * The actual workflow execution logic is in multi-agent-v2.ts store.
 * This class only provides:
 * - Event callbacks for logging/UI updates
 * - Status queries
 *
 * The previous execution methods (start, executePhase, waitForPhaseCompletion,
 * approvePhase, rejectPhase, completePhase) have been removed because:
 * 1. start() was never called - dead code
 * 2. The store handles all execution logic via _executePhase, checkPhaseCompletion, approvePhase
 * 3. Having two control paths caused potential double-execution issues
 */

import type {
  WorkflowPhase,
  AgentType,
  WorkflowExecutionContext,
} from './types'
import { log } from '../logger'

// Re-export WorkflowExecutionContext for backward compatibility
export type { WorkflowExecutionContext }

export interface WorkflowEngineEvents {
  onPhaseStarted?: (phase: WorkflowPhase) => void
  onPhaseCompleted?: (phase: WorkflowPhase) => void
  onPhaseFailed?: (phase: WorkflowPhase, error: Error) => void
  onApprovalRequired?: (phase: WorkflowPhase) => void
  onAllPhasesCompleted?: () => void
}

/**
 * Simplified WorkflowEngine - pure state container and event emitter
 *
 * Execution is handled by multi-agent-v2.ts store, not this class.
 */
export class WorkflowEngine {
  private phases: WorkflowPhase[]
  private currentPhaseIndex: number = 0
  private events: WorkflowEngineEvents
  private context: WorkflowExecutionContext

  constructor(
    phases: WorkflowPhase[],
    context: WorkflowExecutionContext,
    events: WorkflowEngineEvents = {}
  ) {
    this.phases = phases
    this.context = context
    this.events = events
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): WorkflowPhase | null {
    return this.phases[this.currentPhaseIndex] || null
  }

  /**
   * Get workflow status
   */
  getStatus(): {
    currentPhaseIndex: number
    totalPhases: number
  } {
    return {
      currentPhaseIndex: this.currentPhaseIndex,
      totalPhases: this.phases.length,
    }
  }

  /**
   * Get workflow context
   */
  getContext(): WorkflowExecutionContext {
    return this.context
  }

  /**
   * Get all phases
   */
  getPhases(): WorkflowPhase[] {
    return this.phases
  }

  /**
   * Emit phase started event (called by store)
   */
  emitPhaseStarted(phase: WorkflowPhase): void {
    log.info(`[WorkflowEngine] Phase started: ${phase.name}`)
    this.events.onPhaseStarted?.(phase)
  }

  /**
   * Emit phase completed event (called by store)
   */
  emitPhaseCompleted(phase: WorkflowPhase): void {
    log.info(`[WorkflowEngine] Phase completed: ${phase.name}`)
    this.events.onPhaseCompleted?.(phase)
  }

  /**
   * Emit phase failed event (called by store)
   */
  emitPhaseFailed(phase: WorkflowPhase, error: Error): void {
    log.error(`[WorkflowEngine] Phase failed: ${phase.name}: ${error.message}`)
    this.events.onPhaseFailed?.(phase, error)
  }

  /**
   * Emit approval required event (called by store)
   */
  emitApprovalRequired(phase: WorkflowPhase): void {
    log.info(`[WorkflowEngine] Approval required for phase: ${phase.name}`)
    this.events.onApprovalRequired?.(phase)
  }

  /**
   * Emit all phases completed event (called by store)
   */
  emitAllPhasesCompleted(): void {
    log.info('[WorkflowEngine] All phases completed')
    this.events.onAllPhasesCompleted?.()
  }

  /**
   * Update current phase index (called by store)
   */
  setCurrentPhaseIndex(index: number): void {
    this.currentPhaseIndex = index
  }
}

/**
 * Helper: Generate agent configuration for a phase
 */
export function generatePhaseAgents(
  _phase: WorkflowPhase
): Array<{ type: AgentType; task: string }> {
  // This will be overridden by specific workflow implementations
  // Default implementation returns empty array
  return []
}
