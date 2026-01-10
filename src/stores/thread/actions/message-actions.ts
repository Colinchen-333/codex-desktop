/**
 * Message Actions
 *
 * Actions for sending messages, responding to approvals,
 * and managing session overrides.
 */

import type { WritableDraft } from 'immer'
import { threadApi, type SkillInput } from '../../../lib/api'
import { parseError } from '../../../lib/errorUtils'
import { log } from '../../../lib/logger'
import {
  normalizeReasoningEffort,
  normalizeReasoningSummary,
} from '../../../lib/normalize'
import {
  isCommandExecutionContent,
  isFileChangeContent,
} from '../../../lib/typeGuards'
import { useSettingsStore } from '../../settings'
import type {
  ThreadState,
  UserMessageItem,
  InfoItem,
  QueuedMessage,
  SessionOverrides,
} from '../types'
import { clearTurnTimeout } from '../delta-buffer'

// ==================== Queue Message Helpers ====================

export function createEnqueueQueuedMessage(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (threadId: string, message: QueuedMessage) => {
    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      threadState.queuedMessages.push(message)
      return state
    })
  }
}

export function createDequeueQueuedMessage(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (threadId: string): QueuedMessage | null => {
    const threadState = get().threads[threadId]
    if (!threadState || threadState.queuedMessages.length === 0) return null
    const nextMessage = threadState.queuedMessages[0]

    set((state) => {
      const currentThread = state.threads[threadId]
      if (!currentThread) return state
      if (currentThread.queuedMessages[0]?.id !== nextMessage.id) return state
      currentThread.queuedMessages = currentThread.queuedMessages.slice(1)
      return state
    })

    return nextMessage
  }
}

export function createRequeueMessageFront(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (threadId: string, message: QueuedMessage) => {
    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state
      threadState.queuedMessages = [message, ...threadState.queuedMessages]
      return state
    })
  }
}

export function createDispatchNextQueuedMessage(
  get: () => ThreadState,
  dequeueQueuedMessage: (threadId: string) => QueuedMessage | null,
  requeueMessageFront: (threadId: string, message: QueuedMessage) => void
) {
  return async (threadId: string) => {
    const threadState = get().threads[threadId]
    if (!threadState || threadState.turnStatus === 'running') return

    const nextMessage = dequeueQueuedMessage(threadId)
    if (!nextMessage) return

    try {
      await get().sendMessage(nextMessage.text, nextMessage.images, nextMessage.skills, threadId)
    } catch (error) {
      requeueMessageFront(threadId, nextMessage)
      throw error
    }
  }
}

// ==================== Send Message Action ====================

export function createSendMessage(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState,
  enqueueQueuedMessage: (threadId: string, message: QueuedMessage) => void,
  dispatchNextQueuedMessage: (threadId: string) => Promise<void>
) {
  return async (text: string, images?: string[], skills?: SkillInput[], threadIdOverride?: string) => {
    const { focusedThreadId, threads } = get()
    const threadId = threadIdOverride ?? focusedThreadId
    if (!threadId || !threads[threadId]) {
      throw new Error('No active thread')
    }

    const threadState = threads[threadId]

    // Queue messages if a turn is running or if backlog exists
    if (threadState.turnStatus === 'running' || threadState.queuedMessages.length > 0) {
      log.debug('[sendMessage] Turn already running or backlog exists, queueing message', 'message-actions')
      const queuedMsg: QueuedMessage = {
        id: `queued-${Date.now()}`,
        text,
        images,
        skills,
        queuedAt: Date.now(),
      }
      enqueueQueuedMessage(threadId, queuedMsg)
      if (threadState.turnStatus !== 'running') {
        queueMicrotask(() => {
          void dispatchNextQueuedMessage(threadId)
        })
      }
      return
    }

    log.debug(`[sendMessage] Sending message to thread: ${threadId}`, 'message-actions')

    // Add user message to items
    const userMessageId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const userMessage: UserMessageItem = {
      id: userMessageId,
      type: 'userMessage',
      status: 'completed',
      content: { text, images },
      createdAt: Date.now(),
    }

    // Immer-optimized: direct mutation
    set((state) => {
      const ts = state.threads[threadId]
      if (!ts) return state
      ts.items[userMessageId] = userMessage
      ts.itemOrder.push(userMessageId)
      ts.turnStatus = 'running'
      return state
    })

    try {
      const { settings } = useSettingsStore.getState()
      const currentThreadState = get().threads[threadId]
      if (!currentThreadState) throw new Error('Thread not found')

      const effort = normalizeReasoningEffort(settings.reasoningEffort)
      const summary = normalizeReasoningSummary(settings.reasoningSummary)
      const options: {
        effort?: string
        summary?: string
        model?: string
        approvalPolicy?: string
        sandboxPolicy?: string
      } = {}
      if (effort) options.effort = effort
      if (summary) options.summary = summary
      if (currentThreadState.sessionOverrides.model) options.model = currentThreadState.sessionOverrides.model
      if (currentThreadState.sessionOverrides.approvalPolicy)
        options.approvalPolicy = currentThreadState.sessionOverrides.approvalPolicy
      if (currentThreadState.sessionOverrides.sandboxPolicy)
        options.sandboxPolicy = currentThreadState.sessionOverrides.sandboxPolicy

      const response = await threadApi.sendMessage(
        threadId,
        text,
        images,
        skills,
        Object.keys(options).length ? options : undefined
      )

      // Verify thread still exists
      const { threads: currentThreads } = get()
      if (!currentThreads[threadId]) {
        console.warn('[sendMessage] Thread closed during send, discarding result')
        return
      }

      set((state) => {
        const ts = state.threads[threadId]
        if (!ts) return state
        ts.currentTurnId = response.turn.id
        return state
      })
    } catch (error) {
      clearTurnTimeout(threadId)

      const { threads: currentThreads } = get()
      if (currentThreads[threadId]) {
        set((state) => {
          const ts = state.threads[threadId]
          if (!ts) return state
          delete ts.items[userMessageId]
          ts.itemOrder = ts.itemOrder.filter((id) => id !== userMessageId)
          ts.turnStatus = 'failed'
          ts.error = parseError(error)
          return state
        })
      }
      throw error
    }
  }
}

// ==================== Respond to Approval Action ====================

export function createRespondToApproval(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return async (
    itemId: string,
    decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline' | 'cancel',
    options?: { snapshotId?: string; execpolicyAmendment?: { command: string[] } | null }
  ) => {
    const { focusedThreadId, threads } = get()
    if (!focusedThreadId || !threads[focusedThreadId]) return

    const threadState = threads[focusedThreadId]
    const threadId = focusedThreadId

    const pendingApproval = threadState.pendingApprovals.find((p) => p.itemId === itemId)
    if (!pendingApproval) {
      console.error('No pending approval found for itemId:', itemId)
      return
    }

    if (pendingApproval.threadId !== threadId) {
      console.error(
        '[respondToApproval] Thread mismatch - approval.threadId:',
        pendingApproval.threadId,
        'threadId:',
        threadId
      )
      set((state) => {
        const ts = state.threads[threadId]
        if (!ts) return state
        ts.pendingApprovals = ts.pendingApprovals.filter((p) => p.itemId !== itemId)
        return state
      })
      return
    }

    try {
      await threadApi.respondToApproval(
        threadId,
        itemId,
        decision,
        pendingApproval.requestId,
        options?.execpolicyAmendment
      )

      const { threads: currentThreads } = get()
      if (!currentThreads[threadId]) {
        console.warn('[respondToApproval] Thread closed, discarding state update')
        return
      }

      set((state) => {
        const ts = state.threads[threadId]
        if (!ts) return state

        const item = ts.items[itemId]
        const isApproved =
          decision === 'accept' ||
          decision === 'acceptForSession' ||
          decision === 'acceptWithExecpolicyAmendment'

        // Use type guards for runtime type safety
        if (isCommandExecutionContent(item?.content)) {
          item.content.needsApproval = false
          item.content.approved = isApproved
        } else if (isFileChangeContent(item?.content)) {
          item.content.needsApproval = false
          item.content.approved = isApproved
          if (isApproved) {
            item.content.applied = true
            item.content.snapshotId = options?.snapshotId
          }
        }

        ts.pendingApprovals = ts.pendingApprovals.filter((p) => p.itemId !== itemId)
        return state
      })
    } catch (error) {
      const { threads: currentThreads } = get()
      if (currentThreads[threadId]) {
        set((state) => {
          const ts = state.threads[threadId]
          if (!ts) return state
          ts.error = parseError(error)
          return state
        })
      }
      throw error
    }
  }
}

// ==================== Add Info Item Action ====================

export function createAddInfoItem(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (title: string, details?: string) => {
    const { focusedThreadId } = get()
    if (!focusedThreadId) return

    const infoItem: InfoItem = {
      id: `info-${Date.now()}`,
      type: 'info',
      status: 'completed',
      content: { title, details },
      createdAt: Date.now(),
    }

    // Immer-optimized: direct mutation
    set((state) => {
      const ts = state.threads[focusedThreadId]
      if (!ts) return state
      ts.items[infoItem.id] = infoItem
      ts.itemOrder.push(infoItem.id)
      return state
    })
  }
}

// ==================== Session Override Actions ====================

export function createSetSessionOverride(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (key: keyof SessionOverrides, value: string | undefined) => {
    const { focusedThreadId } = get()
    if (!focusedThreadId) return

    // Immer-optimized: direct mutation
    set((state) => {
      const ts = state.threads[focusedThreadId]
      if (!ts) return state
      ts.sessionOverrides[key] = value
      return state
    })
  }
}

export function createClearSessionOverrides(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return () => {
    const { focusedThreadId } = get()
    if (!focusedThreadId) return

    set((state) => {
      const ts = state.threads[focusedThreadId]
      if (!ts) return state
      ts.sessionOverrides = {}
      return state
    })
  }
}
