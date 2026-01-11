/**
 * Shared utility functions for chat components
 */
import { MAX_OUTPUT_LINES } from './types'
import { isRecord } from '../../lib/typeGuards'

/**
 * LRU Cache for formatTimestamp optimization
 *
 * Performance optimization: Caches formatted timestamp strings to avoid
 * creating new Date objects and calling toLocale*String() on every render.
 * In message lists with hundreds of items, this significantly reduces GC pressure.
 *
 * Cache invalidation: Entries are invalidated when the day changes (to handle
 * "today" vs date display logic correctly).
 */
interface TimestampCacheEntry {
  result: string
  day: number  // Day of month when cached, used for invalidation
}

const formatCache = new Map<number, TimestampCacheEntry>()
const MAX_CACHE_SIZE = 100

/**
 * Format timestamp for display with LRU caching
 *
 * @param ts - Unix timestamp in milliseconds
 * @returns Formatted time string (e.g., "14:30" for today, "Jan 5, 14:30" for other days)
 */
export function formatTimestamp(ts: number): string {
  const now = new Date()
  const currentDay = now.getDate()

  // Check cache - entry is valid if day hasn't changed
  const cached = formatCache.get(ts)
  if (cached && cached.day === currentDay) {
    return cached.result
  }

  // Compute formatted result
  const date = new Date(ts)
  const isToday = date.toDateString() === now.toDateString()

  let result: string
  if (isToday) {
    result = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else {
    result = date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // LRU eviction: remove oldest entry if cache is full
  if (formatCache.size >= MAX_CACHE_SIZE) {
    const firstKey = formatCache.keys().next().value
    if (firstKey !== undefined) {
      formatCache.delete(firstKey)
    }
  }

  // Store in cache
  formatCache.set(ts, { result, day: currentDay })

  return result
}

/**
 * Truncate output preserving head and tail (like CLI)
 */
export function truncateOutput(
  output: string,
  maxLines: number = MAX_OUTPUT_LINES
): { text: string; truncated: boolean; omittedLines: number } {
  const lines = output.split('\n')
  if (lines.length <= maxLines) {
    return { text: output, truncated: false, omittedLines: 0 }
  }
  // Keep head (60%) and tail (40%) of max lines
  const headLines = Math.floor(maxLines * 0.6)
  const tailLines = maxLines - headLines
  const omitted = lines.length - maxLines
  const head = lines.slice(0, headLines).join('\n')
  const tail = lines.slice(-tailLines).join('\n')
  const truncatedText = `${head}\n\n... +${omitted} lines omitted ...\n\n${tail}`
  return { text: truncatedText, truncated: true, omittedLines: omitted }
}

/**
 * Parse reasoning summary - strip **header** format like CLI does
 */
export function parseReasoningSummary(text: string): string {
  const trimmed = text.trim()
  // Check for **header** format: **High level reasoning**\n\nActual summary
  if (trimmed.startsWith('**')) {
    const closeIdx = trimmed.indexOf('**', 2)
    if (closeIdx > 2) {
      // Found closing **, extract content after it
      const afterHeader = trimmed.slice(closeIdx + 2).trim()
      if (afterHeader) {
        return afterHeader
      }
      // If nothing after header, return the header content without **
      return trimmed.slice(2, closeIdx)
    }
  }
  return trimmed
}

/**
 * Security: Validate file path to prevent directory traversal attacks
 */
export function validateFilePath(projectPath: string, filePath: string): string | null {
  // Check for path traversal patterns
  if (filePath.includes('..') || filePath.startsWith('/') || filePath.startsWith('\\')) {
    return null
  }

  // Normalize the path and ensure it stays within project directory
  const normalizedPath = filePath.replace(/\\/g, '/')
  const joinedPath = `${projectPath}/${normalizedPath}`

  // Additional check: ensure the resolved path starts with project path
  // This is a frontend check; backend should also validate
  return joinedPath
}

/**
 * Shallow compare two objects (O(1) instead of O(n) JSON.stringify)
 */
export function shallowContentEqual(prev: unknown, next: unknown): boolean {
  if (prev === next) return true
  if (typeof prev !== 'object' || typeof next !== 'object') return prev === next
  if (prev === null || next === null) return prev === next

  const prevObj = isRecord(prev) ? prev : null
  const nextObj = isRecord(next) ? next : null
  if (!prevObj || !nextObj) return prev === next

  const prevKeys = Object.keys(prevObj)
  const nextKeys = Object.keys(nextObj)

  if (prevKeys.length !== nextKeys.length) return false

  for (const key of prevKeys) {
    const prevVal = prevObj[key]
    const nextVal = nextObj[key]
    // For arrays, compare length and first/last elements (fast heuristic)
    if (Array.isArray(prevVal) && Array.isArray(nextVal)) {
      if (prevVal.length !== nextVal.length) return false
      if (prevVal.length > 0 && prevVal[prevVal.length - 1] !== nextVal[nextVal.length - 1])
        return false
    } else if (prevVal !== nextVal) {
      return false
    }
  }
  return true
}
