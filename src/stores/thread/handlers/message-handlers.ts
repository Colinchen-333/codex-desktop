/**
 * Message Event Handlers
 *
 * Handlers for message-related events including item started,
 * item completed, and message delta events.
 */

import type { WritableDraft } from 'immer'
import { handleAsyncError } from '../../../lib/errorUtils'
import { log } from '../../../lib/logger'
import {
  isCommandExecutionContent,
  isFileChangeContent,
  hasTextContent,
} from '../../../lib/typeGuards'
import type {
  ItemStartedEvent,
  ItemCompletedEvent,
  AgentMessageDeltaEvent,
  CommandExecutionOutputDeltaEvent,
  FileChangeOutputDeltaEvent,
  ReasoningSummaryTextDeltaEvent,
  ReasoningSummaryPartAddedEvent,
  ReasoningTextDeltaEvent,
  McpToolCallProgressEvent,
} from '../../../lib/events'
import type { ThreadState, AnyThreadItem } from '../types'
import { toThreadItem } from '../utils/helpers'
import { getDeltaBuffer, scheduleFlush } from '../delta-buffer'

// ==================== Item Started Handler ====================

export function createHandleItemStarted(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (event: ItemStartedEvent) => {
    const threadId = event.threadId
    const item = toThreadItem(event.item)
    const inProgressItem = {
      ...item,
      status: 'inProgress' as const,
    }

    // If this is a user message, try to set it as the session's first message
    if (inProgressItem.type === 'userMessage') {
      if (!hasTextContent(inProgressItem.content)) return
      const userMsg = inProgressItem
      if (userMsg.content.text) {
        void import('../../sessions').then(({ useSessionsStore }) => {
          // Check thread still exists to prevent race condition with closeThread
          if (!get().threads[threadId]) return
          const sessionsStore = useSessionsStore.getState()
          const session = sessionsStore.sessions.find((s) => s.sessionId === threadId)
          // Only set firstMessage if the session exists and doesn't already have one
          if (session && !session.firstMessage) {
            await sessionsStore.setSessionFirstMessage(threadId, userMsg.content.text)
          }
        }).catch((err) => handleAsyncError(err, 'handleItemStarted session sync', 'thread'))
      }
    }

    // Immer-optimized: direct mutation instead of spreading
    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const existing = threadState.items[item.id]
      if (existing) {
        if (!threadState.itemOrder.includes(item.id)) {
          threadState.itemOrder.push(item.id)
        }
        return state
      }

      let isDuplicateUserMessage = false
      if (inProgressItem.type === 'userMessage') {
        const recentUserIds = threadState.itemOrder
          .slice(-10)
          .filter((id) => threadState.items[id]?.type === 'userMessage')

        // Use type guard for safe access
        if (!hasTextContent(inProgressItem.content)) {
          // Skip if no text content
        } else {
          const nextUserText = inProgressItem.content.text
          const nextUserImages = inProgressItem.content.images?.length || 0

          for (const userId of recentUserIds) {
            const existingUser = threadState.items[userId]
            if (existingUser?.type === 'userMessage' && hasTextContent(existingUser.content)) {
              if (existingUser.content.text === nextUserText) {
                const existingImagesCount = existingUser.content.images?.length || 0
                if (existingImagesCount === nextUserImages) {
                  isDuplicateUserMessage = true
                  break
                }
              }
            }
          }
        }
      }

      if (!isDuplicateUserMessage) {
        threadState.items[item.id] = inProgressItem as AnyThreadItem
        threadState.itemOrder.push(item.id)
      }
      return state
    })
  }
}

// ==================== Item Completed Handler ====================

export function createHandleItemCompleted(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (event: ItemCompletedEvent) => {
    const threadId = event.threadId

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const nextItem = toThreadItem(event.item)
      const existing = threadState.items[nextItem.id]

      if (nextItem.type === 'userMessage') {
        const recentUserIds = [...threadState.itemOrder]
          .slice(-10)
          .filter((id) => threadState.items[id]?.type === 'userMessage')

        // Use type guard for safe access
        if (hasTextContent(nextItem.content)) {
          const nextUserText = nextItem.content.text
          const nextUserImages = nextItem.content.images?.length || 0

          for (const userId of recentUserIds) {
            const existingUser = threadState.items[userId]
            if (existingUser?.type === 'userMessage' && hasTextContent(existingUser.content)) {
              if (existingUser.content.text === nextUserText) {
                const existingImagesCount = existingUser.content.images?.length || 0
                if (existingImagesCount === nextUserImages) {
                  return state
                }
              }
            }
          }
        }
      }

      if (existing) {
        // Immer-optimized: direct mutation instead of creating new objects
        Object.assign(existing, nextItem)
        existing.status = nextItem.status === 'inProgress' ? 'completed' : nextItem.status
        Object.assign(existing.content, nextItem.content)

        // Use type guards to safely merge content fields
        if (isCommandExecutionContent(existing.content) && isCommandExecutionContent(nextItem.content)) {
          existing.content.needsApproval = existing.content.needsApproval ?? nextItem.content.needsApproval
          existing.content.approved = existing.content.approved ?? nextItem.content.approved
          existing.content.output = existing.content.output ?? nextItem.content.output
        }
        if (isFileChangeContent(existing.content) && isFileChangeContent(nextItem.content)) {
          existing.content.needsApproval = existing.content.needsApproval ?? nextItem.content.needsApproval
          existing.content.approved = existing.content.approved ?? nextItem.content.approved
          existing.content.applied = existing.content.applied ?? nextItem.content.applied
          existing.content.snapshotId = existing.content.snapshotId ?? nextItem.content.snapshotId
          existing.content.output = existing.content.output ?? nextItem.content.output
        }
      } else {
        threadState.items[nextItem.id] = nextItem
        if (!threadState.itemOrder.includes(nextItem.id)) {
          threadState.itemOrder.push(nextItem.id)
        }
      }
      return state
    })
  }
}

// ==================== Agent Message Delta Handler ====================

export function createHandleAgentMessageDelta(get: () => ThreadState) {
  return (event: AgentMessageDeltaEvent) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const current = buffer.agentMessages.get(event.itemId) || ''
    const isFirstDelta = current === ''

    if (isFirstDelta) {
      log.debug(`[handleAgentMessageDelta] First delta for item: ${event.itemId}, threadId: ${threadId}`, 'message-handlers')
    }

    buffer.agentMessages.set(event.itemId, current + event.delta)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  }
}

// ==================== Command Execution Output Delta Handler ====================

export function createHandleCommandExecutionOutputDelta(get: () => ThreadState) {
  return (event: CommandExecutionOutputDeltaEvent) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const current = buffer.commandOutputs.get(event.itemId) || ''
    const isFirstDelta = current === ''
    buffer.commandOutputs.set(event.itemId, current + event.delta)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  }
}

// ==================== File Change Output Delta Handler ====================

export function createHandleFileChangeOutputDelta(get: () => ThreadState) {
  return (event: FileChangeOutputDeltaEvent) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const current = buffer.fileChangeOutputs.get(event.itemId) || ''
    const isFirstDelta = current === ''
    buffer.fileChangeOutputs.set(event.itemId, current + event.delta)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  }
}

// ==================== Reasoning Summary Text Delta Handler ====================

export function createHandleReasoningSummaryTextDelta(get: () => ThreadState) {
  return (event: ReasoningSummaryTextDeltaEvent) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const index = event.summaryIndex ?? 0
    const updates = buffer.reasoningSummaries.get(event.itemId) || []
    const isFirstDelta = updates.length === 0
    const existingIdx = updates.findIndex((u) => u.index === index)
    if (existingIdx >= 0) {
      updates[existingIdx].text += event.delta
    } else {
      updates.push({ index, text: event.delta })
    }
    buffer.reasoningSummaries.set(event.itemId, updates)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  }
}

// ==================== Reasoning Summary Part Added Handler ====================

export function createHandleReasoningSummaryPartAdded() {
  return (_event: ReasoningSummaryPartAddedEvent) => {
    // This just initializes a slot, the actual text comes from TextDelta
  }
}

// ==================== Reasoning Text Delta Handler ====================

export function createHandleReasoningTextDelta(get: () => ThreadState) {
  return (event: ReasoningTextDeltaEvent) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const index = event.contentIndex ?? 0
    const updates = buffer.reasoningContents.get(event.itemId) || []
    const isFirstDelta = updates.length === 0
    const existingIdx = updates.findIndex((u) => u.index === index)
    if (existingIdx >= 0) {
      updates[existingIdx].text += event.delta
    } else {
      updates.push({ index, text: event.delta })
    }
    buffer.reasoningContents.set(event.itemId, updates)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  }
}

// ==================== MCP Tool Call Progress Handler ====================

export function createHandleMcpToolCallProgress(get: () => ThreadState) {
  return (event: McpToolCallProgressEvent) => {
    const threadId = event.threadId
    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    const messages = buffer.mcpProgress.get(event.itemId) || []
    const isFirstMessage = messages.length === 0
    messages.push(event.message)
    buffer.mcpProgress.set(event.itemId, messages)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstMessage)
  }
}
