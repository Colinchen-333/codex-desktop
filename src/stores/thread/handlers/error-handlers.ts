/**
 * Error and Status Event Handlers
 *
 * Handlers for error events, rate limiting, token usage,
 * and server disconnection events.
 */

import type { WritableDraft } from 'immer'
import { log } from '../../../lib/logger'
import type {
  TokenUsageEvent,
  StreamErrorEvent,
  RateLimitExceededEvent,
} from '../../../lib/events'
import type {
  ThreadState,
  ErrorItem,
} from '../types'
import { performFullTurnCleanup } from '../delta-buffer'

// ==================== Token Usage Handler ====================

export function createHandleTokenUsage(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (event: TokenUsageEvent) => {
    const threadId = event.threadId

    // Immer-optimized: direct mutation
    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const totals = event.tokenUsage?.total
      const tokenUsage = threadState.tokenUsage

      tokenUsage.inputTokens = totals?.inputTokens ?? tokenUsage.inputTokens
      tokenUsage.cachedInputTokens = totals?.cachedInputTokens ?? tokenUsage.cachedInputTokens
      tokenUsage.outputTokens = totals?.outputTokens ?? tokenUsage.outputTokens
      tokenUsage.totalTokens = totals?.totalTokens ?? (tokenUsage.inputTokens + tokenUsage.outputTokens)
      tokenUsage.modelContextWindow = event.tokenUsage?.modelContextWindow ?? tokenUsage.modelContextWindow

      return state
    })
  }
}

// ==================== Stream Error Handler ====================

export function createHandleStreamError(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (event: StreamErrorEvent) => {
    const threadId = event.threadId

    const errorInfo =
      event.error.codexErrorInfo && typeof event.error.codexErrorInfo === 'object'
        ? (() => {
            try {
              return JSON.stringify(event.error.codexErrorInfo)
            } catch (e) {
              log.error(`[handleStreamError] Failed to serialize codexErrorInfo: ${e}`, 'error-handlers')
              return '[Serialization failed]'
            }
          })()
        : event.error.codexErrorInfo
    // P1 Fix: Use milliseconds timestamp consistently
    const errorItem: ErrorItem = {
      id: `error-${Date.now()}`,
      type: 'error',
      status: 'completed',
      content: {
        message: event.error.message,
        errorType: errorInfo ? String(errorInfo) : undefined,
        willRetry: event.willRetry,
      },
      createdAt: Date.now(),
    }

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      
      // P2: Immer optimization - direct mutation instead of spreading
      threadState.items[errorItem.id] = errorItem
      threadState.itemOrder.push(errorItem.id)
      threadState.error = event.error.message
      threadState.turnStatus = event.willRetry ? threadState.turnStatus : 'failed'
    })
  }
}

// ==================== Rate Limit Exceeded Handler ====================

export function createHandleRateLimitExceeded(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (event: RateLimitExceededEvent) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    log.warn(`[handleRateLimitExceeded] Rate limit exceeded: ${JSON.stringify(event)}`, 'error-handlers')

    performFullTurnCleanup(threadId)

    const errorMessage = event.retryAfterMs
      ? `Rate limit exceeded. Retry after ${Math.ceil(event.retryAfterMs / 1000)} seconds.`
      : 'Rate limit exceeded. Please wait before sending more messages.'

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      
      // P2: Immer optimization - direct mutation instead of spreading
      threadState.turnStatus = 'failed'
      threadState.error = errorMessage
      threadState.currentTurnId = null
      threadState.pendingApprovals = []
      threadState.turnTiming.completedAt = Date.now()
    })
  }
}

// ==================== Server Disconnected Handler ====================

export function createHandleServerDisconnected(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return () => {
    log.warn('[handleServerDisconnected] Server disconnected', 'error-handlers')

    // Clean up all threads
    const { threads } = get()
    Object.keys(threads).forEach((threadId) => {
      performFullTurnCleanup(threadId)
    })

    set((state) => {
      // P2: Immer optimization - direct mutation instead of spreading
      Object.keys(state.threads).forEach((threadId) => {
        const threadState = state.threads[threadId]
        if (threadState.turnStatus === 'running') {
          threadState.turnStatus = 'failed'
          threadState.error = 'Server disconnected. Please try again.'
          threadState.currentTurnId = null
          threadState.pendingApprovals = []
          threadState.turnTiming.completedAt = Date.now()
        } else {
          threadState.error = 'Server disconnected. Connection will be restored automatically.'
        }
      })
      state.globalError = 'Server disconnected. Connection will be restored automatically.'
    })
  }
}
