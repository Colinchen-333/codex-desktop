/**
 * Multi-Agent Store v2 - Re-export from modular implementation
 *
 * This file maintains backward compatibility with existing imports.
 * The actual implementation is now in ./multi-agent-store/
 */

export {
  useMultiAgentStore,
} from './multi-agent-store'

export type {
  MultiAgentState,
  MultiAgentConfig,
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
} from './multi-agent-store'
