/**
 * Turn Event Handlers
 *
 * Handlers for turn lifecycle events including turn started,
 * turn completed, and related events.
 */

import type { WritableDraft } from 'immer'
import { handleAsyncError } from '../../../lib/errorUtils'
import { log } from '../../../lib/logger'
import { isAgentMessageContent } from '../../../lib/typeGuards'
import { eventBus } from '../../../lib/eventBus'
import type {
  TurnStartedEvent,
  TurnCompletedEvent,
  TurnDiffUpdatedEvent,
  TurnPlanUpdatedEvent,
  ThreadCompactedEvent,
  ThreadStartedEvent,
} from '../../../lib/events'
import type {
  ThreadState,
  TurnStatus,
  InfoItem,
  PlanItem,
  PlanStep,
} from '../types'
import { TURN_TIMEOUT_MS } from '../constants'
import {
  clearTurnTimeout,
  turnTimeoutTimers,
  flushTimers,
  closingThreads,
  performFullTurnCleanup,
} from '../delta-buffer'

// ==================== Thread Started Handler ====================

export function createHandleThreadStarted(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (event: ThreadStartedEvent) => {
    const threadInfo = event.thread
    const threadId = threadInfo.id

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) {
        // Thread not in our store yet, will be added by startThread/resumeThread
        return state
      }

      // P2: Immer optimization - direct mutation instead of spreading
      threadState.thread.model = threadInfo.model ?? threadState.thread.model
      threadState.thread.modelProvider = threadInfo.modelProvider ?? threadState.thread.modelProvider
      threadState.thread.preview = threadInfo.preview ?? threadState.thread.preview
      threadState.thread.cliVersion = threadInfo.cliVersion ?? threadState.thread.cliVersion
      threadState.thread.gitInfo = threadInfo.gitInfo ?? threadState.thread.gitInfo
    })
  }
}

// ==================== Turn Started Handler ====================

export function createHandleTurnStarted(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  _get: () => ThreadState,
  getThreadStore: () => ThreadState
) {
  return (event: TurnStartedEvent) => {
    const threadId = event.threadId
    log.debug(`[handleTurnStarted] Turn started - threadId: ${threadId}, turnId: ${event.turn.id}`, 'turn-handlers')

    clearTurnTimeout(threadId)

    // P1 Fix: Use event bus instead of dynamic import to avoid circular dependencies
    try {
      // Check thread still exists to prevent race condition with closeThread
      if (getThreadStore().threads[threadId]) {
        eventBus.emit('session:status-update', { sessionId: threadId, status: 'running' })
      }
    } catch (err) {
      handleAsyncError(err, 'handleTurnStarted session sync', 'thread')
    }

    // Set turn timeout for this specific thread
    const turnId = event.turn.id
    const timeoutTimer = setTimeout(() => {
      const state = getThreadStore()
      const threadState = state.threads[threadId]
      if (threadState?.currentTurnId === turnId && threadState?.turnStatus === 'running') {
        log.error(`[handleTurnStarted] Turn timeout - no completion received for turnId: ${turnId}`, 'turn-handlers')
        performFullTurnCleanup(threadId)
        // P1 Fix: Use event bus instead of dynamic import to avoid circular dependencies
        try {
          // Check thread still exists and not being closed
          if (getThreadStore().threads[threadId] && !closingThreads.has(threadId)) {
            eventBus.emit('session:status-update', { sessionId: threadId, status: 'failed' })
          }
        } catch (err) {
          handleAsyncError(err, 'handleTurnStarted timeout session sync', 'thread')
        }
        set((state) => {
          const threadState = state.threads[threadId]
          if (!threadState) return state
          
          // P2: Immer optimization - direct mutation instead of spreading
          threadState.turnStatus = 'failed'
          threadState.error = 'Turn timed out - server may have disconnected'
          threadState.currentTurnId = null
          threadState.pendingApprovals = []
          threadState.turnTiming.completedAt = Date.now()
        })
      }
    }, TURN_TIMEOUT_MS)
    turnTimeoutTimers.set(threadId, timeoutTimer)

    // Immer-optimized: direct mutation
    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      threadState.turnStatus = 'running'
      threadState.currentTurnId = event.turn.id
      threadState.error = null
      threadState.turnTiming.startedAt = Date.now()
      threadState.turnTiming.completedAt = null
      return state
    })
  }
}

// ==================== Turn Completed Handler ====================

export function createHandleTurnCompleted(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState,
  getThreadStore: () => ThreadState,
  dispatchNextQueuedMessage: (threadId: string) => Promise<void>
) {
  return (event: TurnCompletedEvent) => {
    const threadId = event.threadId
    clearTurnTimeout(threadId)

    // Flush any pending deltas before completing the turn
    get().flushDeltaBuffer(threadId)
    const timer = flushTimers.get(threadId)
    if (timer) {
      clearTimeout(timer)
      flushTimers.delete(threadId)
    }

    const status = event.turn.status
    const validStatuses = ['completed', 'failed', 'interrupted']
    if (!validStatuses.includes(status)) {
      log.warn(`[handleTurnCompleted] Unexpected turn status: ${status}, treating as completed`, 'turn-handlers')
    }

    const nextTurnStatus: TurnStatus =
      status === 'failed'
        ? 'failed'
        : status === 'interrupted'
        ? 'interrupted'
        : 'completed'

    // P1 Fix: Use event bus instead of dynamic import to avoid circular dependencies
    try {
      // Check thread still exists to prevent race condition with closeThread
      if (getThreadStore().threads[threadId]) {
        const sessionStatus = nextTurnStatus === 'failed' ? 'failed'
          : nextTurnStatus === 'interrupted' ? 'interrupted'
          : 'completed'
        eventBus.emit('session:status-update', { sessionId: threadId, status: sessionStatus })
      }
    } catch (err) {
      handleAsyncError(err, 'handleTurnCompleted session sync', 'thread')
    }

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      // P2: Immer optimization - direct mutation instead of spreading
      Object.entries(threadState.items).forEach(([id, item]) => {
        // Type guard ensures content is AgentMessageContent
        if (item.type === 'agentMessage' && isAgentMessageContent(item.content) && item.content.isStreaming) {
          item.status = 'completed'
          item.content.isStreaming = false
        }
      })

      threadState.turnStatus = nextTurnStatus
      threadState.currentTurnId = null
      threadState.error = event.turn.error?.message || null
      threadState.pendingApprovals = []
      threadState.turnTiming.completedAt = Date.now()
    })

    if (nextTurnStatus === 'completed' || nextTurnStatus === 'interrupted') {
      queueMicrotask(() => {
        void dispatchNextQueuedMessage(threadId)
      })
    }
  }
}

// ==================== Turn Diff Updated Handler ====================

export function createHandleTurnDiffUpdated(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (event: TurnDiffUpdatedEvent) => {
    const threadId = event.threadId
    // P1 Fix: Use milliseconds timestamp consistently
    const infoItem: InfoItem = {
      id: `diff-${event.turnId}`,
      type: 'info',
      status: 'completed',
      content: {
        title: 'Turn diff updated',
        details: event.diff,
      },
      createdAt: Date.now(),
    }

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      
      // P2: Immer optimization - direct mutation instead of spreading
      threadState.items[infoItem.id] = infoItem
      if (!threadState.itemOrder.includes(infoItem.id)) {
        threadState.itemOrder.push(infoItem.id)
      }
    })
  }
}

// ==================== Turn Plan Updated Handler ====================

export function createHandleTurnPlanUpdated(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (event: TurnPlanUpdatedEvent) => {
    const threadId = event.threadId

    const mapStepStatus = (status: string): PlanStep['status'] => {
      switch (status.toLowerCase()) {
        case 'completed':
        case 'done':
          return 'completed'
        case 'in_progress':
        case 'inprogress':
        case 'running':
          return 'in_progress'
        case 'failed':
        case 'error':
          return 'failed'
        default:
          return 'pending'
      }
    }

    const steps: PlanStep[] = event.plan.map((step) => ({
      step: step.step,
      status: mapStepStatus(step.status),
    }))

    const isActive = steps.some((s) => s.status === 'in_progress' || s.status === 'pending')

    // P1 Fix: Use milliseconds timestamp consistently
    const planItem: PlanItem = {
      id: `plan-${event.turnId}`,
      type: 'plan',
      status: isActive ? 'inProgress' : 'completed',
      content: {
        explanation: event.explanation ?? undefined,
        steps,
        isActive,
      },
      createdAt: Date.now(),
    }

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      
      // P2: Immer optimization - direct mutation instead of spreading
      threadState.items[planItem.id] = planItem
      if (!threadState.itemOrder.includes(planItem.id)) {
        threadState.itemOrder.push(planItem.id)
      }
    })
  }
}

// ==================== Thread Compacted Handler ====================

export function createHandleThreadCompacted(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (event: ThreadCompactedEvent) => {
    const threadId = event.threadId
    // P1 Fix: Use milliseconds timestamp consistently
    const infoItem: InfoItem = {
      id: `compact-${event.turnId}`,
      type: 'info',
      status: 'completed',
      content: {
        title: 'Context compacted',
        details: 'Conversation context was compacted to stay within limits.',
      },
      createdAt: Date.now(),
    }

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      
      // P2: Immer optimization - direct mutation instead of spreading
      threadState.items[infoItem.id] = infoItem
      if (!threadState.itemOrder.includes(infoItem.id)) {
        threadState.itemOrder.push(infoItem.id)
      }
    })
  }
}
