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

      return {
        ...state,
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            thread: {
              ...threadState.thread,
              model: threadInfo.model ?? threadState.thread.model,
              modelProvider: threadInfo.modelProvider ?? threadState.thread.modelProvider,
              preview: threadInfo.preview ?? threadState.thread.preview,
              cliVersion: threadInfo.cliVersion ?? threadState.thread.cliVersion,
              gitInfo: threadInfo.gitInfo ?? threadState.thread.gitInfo,
            },
          },
        },
      }
    })
  }
}

// ==================== Turn Started Handler ====================

export function createHandleTurnStarted(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState,
  getThreadStore: () => ThreadState
) {
  return (event: TurnStartedEvent) => {
    const threadId = event.threadId
    log.debug(`[handleTurnStarted] Turn started - threadId: ${threadId}, turnId: ${event.turn.id}`, 'turn-handlers')

    clearTurnTimeout(threadId)

    // Sync session status to 'running'
    void import('../../sessions').then(async ({ useSessionsStore }) => {
      // Check thread still exists to prevent race condition with closeThread
      if (!getThreadStore().threads[threadId]) return
      await useSessionsStore.getState().updateSessionStatus(threadId, 'running')
    }).catch((err) => handleAsyncError(err, 'handleTurnStarted session sync', 'thread'))

    // Set turn timeout for this specific thread
    const turnId = event.turn.id
    const timeoutTimer = setTimeout(() => {
      const state = getThreadStore()
      const threadState = state.threads[threadId]
      if (threadState?.currentTurnId === turnId && threadState?.turnStatus === 'running') {
        console.error('[handleTurnStarted] Turn timeout - no completion received for turnId:', turnId)
        performFullTurnCleanup(threadId)
        // Sync session status to 'failed' on timeout
        void import('../../sessions').then(async ({ useSessionsStore }) => {
          // Check thread still exists and not being closed
          if (!getThreadStore().threads[threadId] || closingThreads.has(threadId)) return
          await useSessionsStore.getState().updateSessionStatus(threadId, 'failed')
        }).catch((err) => handleAsyncError(err, 'handleTurnStarted timeout session sync', 'thread'))
        set((state) => {
          const threadState = state.threads[threadId]
          if (!threadState) return state
          return {
            ...state,
            threads: {
              ...state.threads,
              [threadId]: {
                ...threadState,
                turnStatus: 'failed',
                error: 'Turn timed out - server may have disconnected',
                currentTurnId: null,
                pendingApprovals: [],
                turnTiming: {
                  ...threadState.turnTiming,
                  completedAt: Date.now(),
                },
              },
            },
          }
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
      console.warn(`[handleTurnCompleted] Unexpected turn status: ${status}, treating as completed`)
    }

    const nextTurnStatus: TurnStatus =
      status === 'failed'
        ? 'failed'
        : status === 'interrupted'
        ? 'interrupted'
        : 'completed'

    // Sync session status based on turn result
    void import('../../sessions').then(async ({ useSessionsStore }) => {
      // Check thread still exists to prevent race condition with closeThread
      if (!getThreadStore().threads[threadId]) return
      const sessionStatus = nextTurnStatus === 'failed' ? 'failed'
        : nextTurnStatus === 'interrupted' ? 'interrupted'
        : 'completed'
      await useSessionsStore.getState().updateSessionStatus(threadId, sessionStatus)
    }).catch((err) => handleAsyncError(err, 'handleTurnCompleted session sync', 'thread'))

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const updatedItems = { ...threadState.items }
      Object.entries(updatedItems).forEach(([id, item]) => {
        // Type guard ensures content is AgentMessageContent
        if (item.type === 'agentMessage' && isAgentMessageContent(item.content) && item.content.isStreaming) {
          updatedItems[id] = {
            ...item,
            status: 'completed',
            content: {
              ...item.content,
              isStreaming: false,
            },
          }
        }
      })

      return {
        ...state,
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: updatedItems,
            turnStatus: nextTurnStatus,
            currentTurnId: null,
            error: event.turn.error?.message || null,
            pendingApprovals: [],
            turnTiming: {
              ...threadState.turnTiming,
              completedAt: Date.now(),
            },
          },
        },
      }
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
      return {
        ...state,
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [infoItem.id]: infoItem },
            itemOrder: threadState.itemOrder.includes(infoItem.id)
              ? threadState.itemOrder
              : [...threadState.itemOrder, infoItem.id],
          },
        },
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
      return {
        ...state,
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [planItem.id]: planItem },
            itemOrder: threadState.itemOrder.includes(planItem.id)
              ? threadState.itemOrder
              : [...threadState.itemOrder, planItem.id],
          },
        },
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
      return {
        ...state,
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [infoItem.id]: infoItem },
            itemOrder: threadState.itemOrder.includes(infoItem.id)
              ? threadState.itemOrder
              : [...threadState.itemOrder, infoItem.id],
          },
        },
      }
    })
  }
}
