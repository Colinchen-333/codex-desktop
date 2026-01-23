/**
 * Agent Integration - Bridge between Thread Store and Multi-Agent Store
 *
 * This module provides functions to notify the multi-agent store when
 * events occur on threads that belong to agents.
 *
 * Note: agentMapping is now maintained solely in multi-agent-v2 store as the single source of truth.
 *
 * P1 Fix: Uses lazy initialization with require() instead of dynamic import()
 * to avoid 10-50ms async delay while still preventing circular dependency issues.
 */

import { log } from '../../lib/logger'

export type AgentStoreEvent =
  | { type: 'turnStarted' }
  | { type: 'turnCompleted'; data: { status?: 'completed' | 'failed' | 'error' | 'interrupted' } }
  | { type: 'messageDelta'; data: { text?: string } }
  | { type: 'error'; data: { message?: string; code?: string; recoverable?: boolean } }

// P1 Fix: Lazy initialization to avoid circular dependency
// The module is loaded synchronously on first access, avoiding the async delay of dynamic import()
let multiAgentStoreModule: typeof import('../multi-agent-v2') | null = null

function getMultiAgentStore() {
  if (!multiAgentStoreModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    multiAgentStoreModule = require('../multi-agent-v2') as typeof import('../multi-agent-v2')
  }
  return multiAgentStoreModule.useMultiAgentStore.getState()
}

/**
 * P0-1 Fix: Per-thread event version tracking to prevent global race conditions
 * Previous implementation used a global counter which could cause version conflicts
 * when multiple agents have concurrent events (e.g., counter overflow, non-monotonic
 * versions within a thread due to interleaving).
 *
 * New implementation: Each thread has its own independent version counter.
 * This ensures:
 * 1. No interference between threads
 * 2. Version numbers are always monotonically increasing within a thread
 * 3. No risk of global counter overflow affecting event ordering
 */
interface ThreadEventState {
  counter: number       // Next event version to assign
  lastProcessed: number // Last processed event version
}

const threadEventStates = new Map<string, ThreadEventState>()

function getThreadEventState(threadId: string): ThreadEventState {
  let state = threadEventStates.get(threadId)
  if (!state) {
    state = { counter: 0, lastProcessed: 0 }
    threadEventStates.set(threadId, state)
  }
  return state
}

function getNextEventVersion(threadId: string): number {
  const state = getThreadEventState(threadId)
  return ++state.counter
}

function shouldProcessEvent(threadId: string, eventVersion: number): boolean {
  const state = getThreadEventState(threadId)
  if (eventVersion <= state.lastProcessed) {
    log.debug(
      `[notifyAgentStore] Ignoring stale event for thread ${threadId} (version ${eventVersion} <= ${state.lastProcessed})`,
      'agent-integration'
    )
    return false
  }
  state.lastProcessed = eventVersion
  return true
}

/**
 * Clean up event version tracking for a thread
 * Should be called when a thread is closed
 */
export function cleanupEventVersion(threadId: string): void {
  threadEventStates.delete(threadId)
}

/**
 * Notify multi-agent store about thread events
 * This function checks if a thread belongs to an agent and updates the agent accordingly
 *
 * Note: agentMapping is fetched directly from multi-agent store to maintain single source of truth
 *
 * P1 Fix: Now uses synchronous lazy initialization instead of async dynamic import
 * P1 Fix: Uses event versioning to handle concurrent turn completion ordering
 */
export function notifyAgentStore(threadId: string, eventType: 'turnStarted'): void
export function notifyAgentStore(threadId: string, eventType: 'turnCompleted', data?: { status?: string }): void
export function notifyAgentStore(threadId: string, eventType: 'messageDelta', data?: { text?: string }): void
export function notifyAgentStore(threadId: string, eventType: 'error', data?: { message?: string; code?: string; recoverable?: boolean }): void
export function notifyAgentStore(
  threadId: string,
  eventType: AgentStoreEvent['type'],
  data?: { status?: string } | { text?: string } | { message?: string; code?: string; recoverable?: boolean }
): void {
  // P0-1 Fix: Assign per-thread version at call time to preserve ordering intent
  const eventVersion = getNextEventVersion(threadId)

  try {
    const store = getMultiAgentStore()

    // Get agentId from multi-agent store's agentMapping (single source of truth)
    const agentId = store.agentMapping[threadId]
    if (!agentId) return // Not an agent thread
    const agent = store.getAgent(agentId)
    if (!agent) return

    // P1 Fix: Check event version to ignore stale events (except for messageDelta which is high-frequency)
    if (eventType !== 'messageDelta' && !shouldProcessEvent(threadId, eventVersion)) {
      return
    }

    switch (eventType) {
      case 'turnStarted':
        // Agent is actively running
        if (agent.status === 'cancelled' || agent.interruptReason === 'pause') {
          return
        }
        store.updateAgentStatus(agentId, 'running')
        log.debug(
          `[notifyAgentStore] Agent ${agentId} turn started (thread ${threadId})`,
          'agent-integration'
        )
        break

      case 'turnCompleted': {
        // Check if this is the final completion
        const turnData = data as { status?: string } | undefined
        const turnStatus = turnData?.status

        if (agent.status === 'cancelled') {
          return
        }

        if (turnStatus === 'failed' || turnStatus === 'error') {
          store.updateAgentStatus(agentId, 'error', {
            message: 'Turn completed with error',
            code: 'TURN_ERROR',
            recoverable: true,
          })
        } else if (turnStatus === 'interrupted') {
          if (agent.interruptReason === 'pause') {
            store.updateAgentStatus(agentId, 'pending')
            store.updateAgentProgress(agentId, { description: '已暂停' })
          } else {
            store.updateAgentStatus(agentId, 'cancelled')
          }
        } else {
          // Mark as completed
          store.updateAgentStatus(agentId, 'completed')
        }
        log.debug(
          `[notifyAgentStore] Agent ${agentId} turn completed (thread ${threadId})`,
          'agent-integration'
        )
        break
      }

      case 'messageDelta': {
        // Agent is actively working, update progress description
        const deltaData = data as { text?: string } | undefined
        if (deltaData?.text) {
          // Extract first line as progress description
          const firstLine = deltaData.text.split('\n')[0].slice(0, 50)
          store.updateAgentProgress(agentId, {
            description: firstLine,
          })
        }
        break
      }

      case 'error': {
        // Agent encountered an error
        const errorData = data as { message?: string; code?: string; recoverable?: boolean } | undefined
        store.updateAgentStatus(agentId, 'error', {
          message: errorData?.message || 'Unknown error',
          code: errorData?.code || 'UNKNOWN_ERROR',
          recoverable: errorData?.recoverable ?? true, // Default to recoverable if not specified
        })
        log.error(
          `[notifyAgentStore] Agent ${agentId} error (thread ${threadId}): ${JSON.stringify(errorData)}`,
          'agent-integration'
        )
        break
      }
    }
  } catch (err) {
    log.error(`[notifyAgentStore] Failed to notify multi-agent store: ${err}`, 'agent-integration')
  }
}

/**
 * Helper to check if a thread is an agent thread
 * P1 Fix: Now synchronous using lazy initialization
 */
export function isAgentThread(threadId: string): boolean {
  try {
    const store = getMultiAgentStore()
    return threadId in store.agentMapping
  } catch {
    return false
  }
}

/**
 * Async version for backward compatibility
 * @deprecated Use isAgentThread (now synchronous) instead
 */
export function isAgentThreadAsync(threadId: string): Promise<boolean> {
  return Promise.resolve(isAgentThread(threadId))
}

/**
 * Synchronous helper to check if a thread is an agent thread
 * Uses provided agentMapping for cases where async is not suitable
 * @deprecated Use isAgentThread (now synchronous) when possible
 */
export function isAgentThreadSync(agentMapping: Record<string, string>, threadId: string): boolean {
  return threadId in agentMapping
}
