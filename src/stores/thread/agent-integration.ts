/**
 * Agent Integration - Bridge between Thread Store and Multi-Agent Store
 *
 * This module provides functions to notify the multi-agent store when
 * events occur on threads that belong to agents.
 */

import { log } from '../../lib/logger'
import type { AgentMapping } from './agent-mapping'
import { getAgentIdByThreadId } from './agent-mapping'

/**
 * Notify multi-agent store about thread events
 * This function checks if a thread belongs to an agent and updates the agent accordingly
 */
export function notifyAgentStore(
  agentMapping: AgentMapping,
  threadId: string,
  eventType: 'turnStarted' | 'turnCompleted' | 'messageDelta' | 'error',
  data?: unknown
): void {
  const agentId = getAgentIdByThreadId(agentMapping, threadId)
  if (!agentId) return // Not an agent thread

  // Dynamically import to avoid circular dependency
  import('../multi-agent-v2').then(({ useMultiAgentStore }) => {
    const store = useMultiAgentStore.getState()
    const agent = store.getAgent(agentId)
    if (!agent) return

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
        const errorData = data as { message?: string; code?: string } | undefined
        store.updateAgentStatus(agentId, 'error', {
          message: errorData?.message || 'Unknown error',
          code: errorData?.code || 'UNKNOWN_ERROR',
          recoverable: true,
        })
        log.error(
          `[notifyAgentStore] Agent ${agentId} error (thread ${threadId}): ${JSON.stringify(errorData)}`,
          'agent-integration'
        )
        break
      }
    }
  }).catch((err) => {
    log.error(`[notifyAgentStore] Failed to import multi-agent store: ${err}`, 'agent-integration')
  })
}

/**
 * Helper to check if a thread is an agent thread
 */
export function isAgentThread(agentMapping: AgentMapping, threadId: string): boolean {
  return threadId in agentMapping
}
