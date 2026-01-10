/**
 * Thread Store - Legacy Re-export
 *
 * This file re-exports all thread store functionality from the
 * refactored modular structure in ./thread/ directory.
 *
 * For new code, consider importing directly from './thread' instead.
 *
 * Module Structure:
 * - ./thread/types.ts: All type definitions
 * - ./thread/constants.ts: Configuration constants
 * - ./thread/lru-cache.ts: LRU cache implementation
 * - ./thread/delta-buffer.ts: Delta buffering logic
 * - ./thread/handlers/: Event handlers
 * - ./thread/actions/: Store actions
 * - ./thread/utils/: Utility functions
 * - ./thread/index.ts: Main store composition
 */

// Re-export the main store
export { useThreadStore } from './thread'

// Re-export all types
export type {
  ThreadItemType,
  ThreadItem,
  UserMessageItem,
  AgentMessageItem,
  CommandExecutionItem,
  FileChangeItem,
  ReasoningItem,
  McpToolItem,
  WebSearchItem,
  ReviewItem,
  InfoItem,
  ErrorItem,
  PlanStep,
  PlanItem,
  AnyThreadItem,
  TurnStatus,
  PendingApproval,
  TokenUsage,
  TurnTiming,
  SessionOverrides,
  QueuedMessage,
  SingleThreadState,
  ThreadState,
  DeltaBuffer,
  LRUCacheNode,
} from './thread'

// Re-export utilities
export { clearThreadTimers, getTimerStats, cleanupThreadResources } from './thread'
