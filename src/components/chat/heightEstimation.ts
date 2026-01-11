/**
 * Height estimation utilities for virtualized message list
 *
 * Separated from ChatMessageList.tsx for:
 * - React Fast Refresh compatibility
 * - Reusability in hooks and components
 * - Better testability
 */
import { type AnyThreadItem } from '../../stores/thread'
import {
  isUserMessageContent,
  isAgentMessageContent,
  isCommandExecutionContent,
  isFileChangeContent,
  isReasoningContent,
  isMcpToolContent,
  isWebSearchContent,
  isInfoContent,
  isPlanContent,
} from '../../lib/typeGuards'
import { DEFAULT_ITEM_HEIGHT, MAX_OUTPUT_LINES } from './types'

// Height estimation constants for better accuracy
const LINE_HEIGHT_TEXT = 24
const LINE_HEIGHT_CODE = 18
const CHARS_PER_LINE = 80

/**
 * Memoized height estimation factory
 * Returns a function that estimates item height based on content type
 */
function createHeightEstimator() {
  // Cache for computed heights within a render cycle
  const renderCache = new Map<string, number>()

  return function estimateHeight(item: AnyThreadItem | undefined): number {
    if (!item) return DEFAULT_ITEM_HEIGHT

    // Check render cache first
    const cacheKey = `${item.id}-${item.type}-${item.status}`
    const cached = renderCache.get(cacheKey)
    if (cached !== undefined) return cached

    const height = computeItemHeight(item)

    // Cache for this render cycle (limited size)
    if (renderCache.size < 100) {
      renderCache.set(cacheKey, height)
    }

    return height
  }
}

/**
 * Compute item height based on content type and structure
 */
function computeItemHeight(item: AnyThreadItem): number {
  const content = item.content

  switch (item.type) {
    case 'userMessage':
      if (isUserMessageContent(content)) {
        const baseHeight = 80
        const imageHeight = (content.images?.length || 0) * 140
        const textLines = Math.ceil((content.text?.length || 0) / CHARS_PER_LINE)
        const textHeight = Math.min(textLines, 10) * LINE_HEIGHT_TEXT
        return baseHeight + imageHeight + textHeight
      }
      return DEFAULT_ITEM_HEIGHT

    case 'agentMessage':
      if (isAgentMessageContent(content)) {
        const textLength = content.text?.length || 0
        // More accurate line estimation considering word wrap
        const estimatedLines = Math.ceil(textLength / CHARS_PER_LINE)
        const clampedLines = Math.min(estimatedLines, 30)
        // Account for markdown rendering overhead
        const markdownOverhead = content.text?.includes('```') ? 40 : 0
        return 80 + clampedLines * LINE_HEIGHT_TEXT + markdownOverhead
      }
      return DEFAULT_ITEM_HEIGHT

    case 'commandExecution':
      if (isCommandExecutionContent(content)) {
        const baseHeight = 120
        const outputLines = content.output?.split('\n').length || 0
        const truncatedLines = Math.min(outputLines, MAX_OUTPUT_LINES)
        const approvalHeight = content.needsApproval ? 100 : 0
        return baseHeight + truncatedLines * LINE_HEIGHT_CODE + approvalHeight
      }
      return DEFAULT_ITEM_HEIGHT

    case 'fileChange':
      if (isFileChangeContent(content)) {
        const baseHeight = 100
        // Estimate based on diff complexity
        const changes = content.changes || []
        let totalDiffLines = 0
        for (const change of changes) {
          const diffLines = change.diff?.split('\n').length || 0
          totalDiffLines += Math.min(diffLines, 50) // Cap per-file lines
        }
        const fileHeight = changes.length * 60 + totalDiffLines * LINE_HEIGHT_CODE
        return baseHeight + Math.min(fileHeight, 800) // Cap total height
      }
      return DEFAULT_ITEM_HEIGHT

    case 'reasoning':
      if (isReasoningContent(content)) {
        const baseHeight = 80
        const summaryCount = content.summary?.length || 0
        const summaryHeight = summaryCount * 30
        return baseHeight + summaryHeight
      }
      return DEFAULT_ITEM_HEIGHT

    case 'mcpTool':
      if (isMcpToolContent(content)) {
        const baseHeight = 100
        const argsHeight = content.arguments ? 80 : 0
        const resultHeight = content.result ? 100 : 0
        const progressHeight = (content.progress?.length || 0) * 20
        return baseHeight + argsHeight + resultHeight + progressHeight
      }
      return DEFAULT_ITEM_HEIGHT

    case 'webSearch':
      if (isWebSearchContent(content)) {
        const baseHeight = 80
        const resultCount = content.results?.length || 0
        const resultHeight = Math.min(resultCount, 5) * 120
        return baseHeight + resultHeight
      }
      return DEFAULT_ITEM_HEIGHT

    case 'info':
      if (isInfoContent(content)) {
        const baseHeight = 80
        const detailsLines = content.details?.split('\n').length || 0
        const detailsHeight = Math.min(detailsLines, 10) * LINE_HEIGHT_CODE
        return baseHeight + detailsHeight
      }
      return DEFAULT_ITEM_HEIGHT

    case 'error':
      return 120

    case 'plan':
      if (isPlanContent(content)) {
        const baseHeight = 100
        const stepCount = content.steps?.length || 0
        const stepHeight = stepCount * 40
        const explanationHeight = content.explanation ? 50 : 0
        return baseHeight + stepHeight + explanationHeight
      }
      return DEFAULT_ITEM_HEIGHT

    default:
      return DEFAULT_ITEM_HEIGHT
  }
}

// Create singleton estimator
const heightEstimator = createHeightEstimator()

/**
 * Estimate item height for virtualized list based on content type
 *
 * Uses a render-cycle cache to avoid redundant calculations
 * for the same item within a single render pass.
 */
export function estimateItemHeight(item: AnyThreadItem | undefined): number {
  return heightEstimator(item)
}

/**
 * Clear the render cache (useful for testing)
 */
export function clearHeightCache(): void {
  // Note: This is a no-op since the cache is internal to the estimator
  // The cache is automatically bounded to 100 entries
}
