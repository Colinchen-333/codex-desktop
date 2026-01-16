/**
 * WorkflowEngine - Core workflow execution engine
 *
 * Features:
 * - Phase-based execution
 * - Approval gates
 * - Agent dependency management
 * - Event emission
 */

import type {
  WorkflowPhase,
  AgentDescriptor,
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

export class WorkflowEngine {
  private phases: WorkflowPhase[]
  private currentPhaseIndex: number = 0
  private events: WorkflowEngineEvents
  private context: WorkflowExecutionContext
  private isRunning: boolean = false
  private isPaused: boolean = false

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
   * Start workflow execution
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Workflow is already running')
    }

    log.info('[WorkflowEngine] Starting workflow execution')
    this.isRunning = true
    this.currentPhaseIndex = 0

    try {
      await this.executeNextPhase()
    } catch (error) {
      log.error('[WorkflowEngine] Workflow execution failed:', error instanceof Error ? error.message : String(error))
      this.isRunning = false
      throw error
    }
  }

  /**
   * Execute the next phase in the workflow
   */
  private async executeNextPhase(): Promise<void> {
    if (this.currentPhaseIndex >= this.phases.length) {
      log.info('[WorkflowEngine] All phases completed')
      this.isRunning = false
      this.events.onAllPhasesCompleted?.()
      return
    }

    const phase = this.phases[this.currentPhaseIndex]
    log.info(`[WorkflowEngine] Starting phase ${this.currentPhaseIndex + 1}: ${phase.name}`)

    try {
      // Update phase status
      phase.status = 'running'
      this.events.onPhaseStarted?.(phase)

      // Execute phase (agents will be spawned by the multi-agent store)
      await this.executePhase(phase)

      // Wait for phase completion
      await this.waitForPhaseCompletion(phase)

      // Check if approval is required
      if (phase.requiresApproval) {
        log.info(`[WorkflowEngine] Phase ${phase.name} requires approval`)
        this.isPaused = true
        this.events.onApprovalRequired?.(phase)
        // Execution will resume when approvePhase() is called
        return
      }

      // Phase completed, move to next
      await this.completePhase(phase)
    } catch (error) {
      log.error(`[WorkflowEngine] Phase ${phase.name} failed:`, error instanceof Error ? error.message : String(error))
      phase.status = 'failed'
      this.events.onPhaseFailed?.(phase, error as Error)
      this.isRunning = false
      throw error
    }
  }

  /**
   * Execute a single phase
   */
  private async executePhase(phase: WorkflowPhase): Promise<void> {
    // Note: Actual agent spawning is handled by the multi-agent store
    // This method is a placeholder for phase-specific logic
    log.debug(`[WorkflowEngine] Executing phase: ${phase.name}`)
    
    // Phase execution happens through agent spawning in the store
    // The store will create agents for this phase using phase.agentIds
  }

  /**
   * Wait for all agents in a phase to complete
   */
  private async waitForPhaseCompletion(phase: WorkflowPhase): Promise<void> {
    return new Promise((resolve) => {
      // This will be triggered by the multi-agent store when all agents complete
      // For now, we'll resolve immediately and let the store handle completion
      // In a real implementation, this would poll or listen to agent status changes
      
      log.debug(`[WorkflowEngine] Waiting for phase completion: ${phase.name}`)
      
      // The multi-agent store will call checkPhaseCompletion() which will
      // eventually call completePhase() when all agents are done
      resolve()
    })
  }

  /**
   * Check if a phase is complete (all agents finished)
   */
  checkPhaseCompletion(agents: AgentDescriptor[]): boolean {
    const currentPhase = this.phases[this.currentPhaseIndex]
    if (!currentPhase) return false

    const phaseAgents = agents.filter((a) => currentPhase.agentIds.includes(a.id))
    if (phaseAgents.length === 0) return false

    const allCompleted = phaseAgents.every(
      (a) => a.status === 'completed' || a.status === 'error' || a.status === 'cancelled'
    )

    const hasError = phaseAgents.some((a) => a.status === 'error')

    if (allCompleted) {
      if (hasError) {
        currentPhase.status = 'failed'
        this.events.onPhaseFailed?.(currentPhase, new Error('Some agents failed'))
        this.isRunning = false
        return true
      }

      // Phase completed successfully
      if (!this.isPaused) {
        void this.completePhase(currentPhase)
      }
      return true
    }

    return false
  }

  /**
   * Complete a phase and move to the next
   */
  private async completePhase(phase: WorkflowPhase): Promise<void> {
    log.info(`[WorkflowEngine] Phase completed: ${phase.name}`)
    phase.status = 'completed'
    this.events.onPhaseCompleted?.(phase)

    // Store phase output for next phase context
    // TODO: Collect and aggregate agent outputs
    this.context.previousPhaseOutput = `Phase ${phase.name} completed successfully`

    // Move to next phase
    this.currentPhaseIndex++
    await this.executeNextPhase()
  }

  /**
   * Approve a phase (resume execution)
   */
  approvePhase(phaseId: string): void {
    const phase = this.phases.find((p) => p.id === phaseId)
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found`)
    }

    if (!this.isPaused) {
      throw new Error('Workflow is not paused')
    }

    log.info(`[WorkflowEngine] Phase approved: ${phase.name}`)
    this.isPaused = false

    // Complete the current phase and move to next
    void this.completePhase(phase)
  }

  /**
   * Reject a phase (stop workflow)
   */
  rejectPhase(phaseId: string, reason?: string): void {
    const phase = this.phases.find((p) => p.id === phaseId)
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found`)
    }

    log.info(`[WorkflowEngine] Phase rejected: ${phase.name}, reason: ${reason}`)
    phase.status = 'failed'
    this.isRunning = false
    this.isPaused = false
    this.events.onPhaseFailed?.(phase, new Error(reason || 'Phase rejected by user'))
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
    isRunning: boolean
    isPaused: boolean
    currentPhaseIndex: number
    totalPhases: number
  } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentPhaseIndex: this.currentPhaseIndex,
      totalPhases: this.phases.length,
    }
  }

  /**
   * Stop workflow execution
   */
  stop(): void {
    log.info('[WorkflowEngine] Stopping workflow')
    this.isRunning = false
    this.isPaused = false
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
