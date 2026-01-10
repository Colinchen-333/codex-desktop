// ==================== Type Guards for Thread Items ====================
// Runtime validation for thread item types

import type {
  UserMessageContent,
  AgentMessageContent,
  CommandExecutionContent,
  FileChangeContent,
  ReasoningContent,
  McpToolContent,
  WebSearchContent,
  ReviewContent,
  InfoContent,
  ErrorContent,
  PlanContent,
  AnyThreadItem,
} from './types/thread'

/**
 * Check if value is a valid user message content
 */
export function isUserMessageContent(value: unknown): value is UserMessageContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return typeof content.text === 'string'
}

/**
 * Check if value is a valid agent message content
 */
export function isAgentMessageContent(value: unknown): value is AgentMessageContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return typeof content.text === 'string' && typeof content.isStreaming === 'boolean'
}

/**
 * Check if value is a valid command execution content
 */
export function isCommandExecutionContent(value: unknown): value is CommandExecutionContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return (
    typeof content.callId === 'string' &&
    (typeof content.command === 'string' || Array.isArray(content.command)) &&
    typeof content.cwd === 'string'
  )
}

/**
 * Check if value is a valid file change content
 */
export function isFileChangeContent(value: unknown): value is FileChangeContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return (
    Array.isArray(content.changes) &&
    typeof content.needsApproval === 'boolean'
  )
}

/**
 * Check if value is a valid reasoning content
 */
export function isReasoningContent(value: unknown): value is ReasoningContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return (
    Array.isArray(content.summary) &&
    typeof content.isStreaming === 'boolean'
  )
}

/**
 * Check if value is a valid MCP tool content
 */
export function isMcpToolContent(value: unknown): value is McpToolContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return (
    typeof content.callId === 'string' &&
    typeof content.server === 'string' &&
    typeof content.tool === 'string' &&
    typeof content.isRunning === 'boolean'
  )
}

/**
 * Check if value is a valid web search content
 */
export function isWebSearchContent(value: unknown): value is WebSearchContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return (
    typeof content.query === 'string' &&
    typeof content.isSearching === 'boolean'
  )
}

/**
 * Check if value is a valid review content
 */
export function isReviewContent(value: unknown): value is ReviewContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return (
    (content.phase === 'started' || content.phase === 'completed') &&
    typeof content.text === 'string'
  )
}

/**
 * Check if value is a valid info content
 */
export function isInfoContent(value: unknown): value is InfoContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return typeof content.title === 'string'
}

/**
 * Check if value is a valid error content
 */
export function isErrorContent(value: unknown): value is ErrorContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return typeof content.message === 'string'
}

/**
 * Check if value is a valid plan content
 */
export function isPlanContent(value: unknown): value is PlanContent {
  if (typeof value !== 'object' || value === null) return false
  const content = value as Record<string, unknown>
  return (
    Array.isArray(content.steps) &&
    typeof content.isActive === 'boolean'
  )
}

/**
 * Check if item is a thread item
 */
export function isThreadItem(item: unknown): item is AnyThreadItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'id' in item &&
    'type' in item &&
    'status' in item &&
    'content' in item &&
    'createdAt' in item
  )
}

/**
 * Check if content has a text field
 */
export function hasTextContent(content: unknown): content is { text: string } {
  return (
    typeof content === 'object' &&
    content !== null &&
    'text' in content &&
    typeof (content as { text: unknown }).text === 'string'
  )
}

/**
 * Check if content has an images field
 */
export function hasImagesContent(content: unknown): content is { images: string[] } {
  return (
    typeof content === 'object' &&
    content !== null &&
    'images' in content &&
    Array.isArray((content as { images: unknown }).images)
  )
}

/**
 * Safely get text from content
 */
export function getTextFromContent(content: unknown): string | null {
  if (hasTextContent(content)) {
    return content.text
  }
  return null
}

/**
 * Safely get images from content
 */
export function getImagesFromContent(content: unknown): string[] | null {
  if (hasImagesContent(content)) {
    return content.images
  }
  return null
}

/**
 * Type guard for Record<string, unknown>
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Type guard for arrays
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

/**
 * Type guard for string arrays
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}
