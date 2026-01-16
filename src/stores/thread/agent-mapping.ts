/**
 * Agent Mapping - Extension for Thread Store
 *
 * Provides utilities to link threads to multi-agent system agents.
 * This allows the thread store to route events to the multi-agent store
 * for threads that belong to agents.
 */

/**
 * Agent mapping type
 * Maps threadId to agentId
 */
export type AgentMapping = Record<string, string>

/**
 * Check if a thread is an agent thread
 */
export function isAgentThread(agentMapping: AgentMapping, threadId: string): boolean {
  return threadId in agentMapping
}

/**
 * Get agent ID by thread ID
 */
export function getAgentIdByThreadId(agentMapping: AgentMapping, threadId: string): string | null {
  return agentMapping[threadId] || null
}

/**
 * Mark a thread as an agent thread
 */
export function markThreadAsAgent(
  agentMapping: AgentMapping,
  threadId: string,
  agentId: string
): AgentMapping {
  return {
    ...agentMapping,
    [threadId]: agentId,
  }
}

/**
 * Unmark a thread as an agent thread
 */
export function unmarkThreadAsAgent(agentMapping: AgentMapping, threadId: string): AgentMapping {
  const { [threadId]: _, ...rest } = agentMapping
  return rest
}

/**
 * Get all agent thread IDs
 */
export function getAllAgentThreadIds(agentMapping: AgentMapping): string[] {
  return Object.keys(agentMapping)
}

/**
 * Get all agent IDs
 */
export function getAllAgentIds(agentMapping: AgentMapping): string[] {
  return Object.values(agentMapping)
}

/**
 * Clear all agent mappings
 */
export function clearAgentMapping(): AgentMapping {
  return {}
}
