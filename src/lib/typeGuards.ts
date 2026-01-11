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

// ==================== Error Type Guards ====================

/**
 * Check if value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error
}

/**
 * Check if value is an error-like object with a message
 */
export function isErrorLike(value: unknown): value is { message: string } {
  return isRecord(value) && typeof value.message === 'string'
}

/**
 * Check if value is a Tauri error with optional errorInfo
 */
export interface TauriErrorShape {
  message: string
  errorInfo?: {
    type?: string
    httpStatusCode?: number
  }
}

export function isTauriError(value: unknown): value is TauriErrorShape {
  if (!isRecord(value)) return false
  if (typeof value.message !== 'string') return false
  if (value.errorInfo !== undefined) {
    if (!isRecord(value.errorInfo)) return false
  }
  return true
}

// ==================== API Response Type Guards ====================

/**
 * Check if value is a valid API response with data array
 */
export function isDataArrayResponse<T>(
  value: unknown,
  itemGuard: (item: unknown) => item is T
): value is { data: T[] } {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.data)) return false
  return value.data.every(itemGuard)
}

/**
 * Check if value has a nextCursor for pagination
 */
export function hasPaginationCursor(value: unknown): value is { nextCursor: string | null } {
  if (!isRecord(value)) return false
  return value.nextCursor === null || typeof value.nextCursor === 'string'
}

// ==================== Number Type Guards ====================

/**
 * Check if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * Check if value is a positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0
}

/**
 * Check if value is a non-negative number
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0
}

/**
 * Check if value is an integer
 */
export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value)
}

// ==================== String Type Guards ====================

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Check if value is a valid UUID v4
 */
export function isUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

// ==================== Object Type Guards ====================

/**
 * Check if value is a non-null object (but not an array)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && value.constructor === Object
}

/**
 * Check if object has a specific property
 */
export function hasProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, unknown> {
  return isRecord(value) && key in value
}

/**
 * Check if object has a specific property with a specific type
 */
export function hasStringProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, string> {
  return isRecord(value) && typeof value[key] === 'string'
}

/**
 * Check if object has a specific property with number type
 */
export function hasNumberProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, number> {
  return isRecord(value) && typeof value[key] === 'number'
}

/**
 * Check if object has a specific property with boolean type
 */
export function hasBooleanProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, boolean> {
  return isRecord(value) && typeof value[key] === 'boolean'
}

// ==================== Function Type Guards ====================

/**
 * Check if value is a function
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

// ==================== Date Type Guards ====================

/**
 * Check if value is a valid Date object
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/**
 * Check if value is a valid timestamp (number of milliseconds since epoch)
 */
export function isTimestamp(value: unknown): value is number {
  if (!isNumber(value)) return false
  // Valid timestamp range: 1970-01-01 to ~2100-01-01
  return value >= 0 && value < 4102444800000
}

// ==================== Nullable Type Guards ====================

/**
 * Check if value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

/**
 * Check if value is not null or undefined
 */
export function isNotNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

// ==================== Safe Extraction Utilities ====================

/**
 * Safely extract a string property from an unknown object
 */
export function extractString(value: unknown, key: string, defaultValue = ''): string {
  if (isRecord(value) && typeof value[key] === 'string') {
    return value[key] as string
  }
  return defaultValue
}

/**
 * Safely extract a number property from an unknown object
 */
export function extractNumber(value: unknown, key: string, defaultValue = 0): number {
  if (isRecord(value) && typeof value[key] === 'number') {
    return value[key] as number
  }
  return defaultValue
}

/**
 * Safely extract a boolean property from an unknown object
 */
export function extractBoolean(value: unknown, key: string, defaultValue = false): boolean {
  if (isRecord(value) && typeof value[key] === 'boolean') {
    return value[key] as boolean
  }
  return defaultValue
}

/**
 * Safely extract an array property from an unknown object
 */
export function extractArray<T>(
  value: unknown,
  key: string,
  itemGuard: (item: unknown) => item is T,
  defaultValue: T[] = []
): T[] {
  if (isRecord(value) && Array.isArray(value[key])) {
    return (value[key] as unknown[]).filter(itemGuard)
  }
  return defaultValue
}
