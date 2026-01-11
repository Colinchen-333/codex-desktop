/**
 * Message Event Handlers
 *
 * Handlers for message-related events including item started,
 * item completed, and message delta events.
 */

import type { WritableDraft } from 'immer'
import { handleAsyncError } from '../../../lib/errorUtils'
import { log } from '../../../lib/logger'
import { eventBus } from '../../../lib/eventBus'
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
import {
  getDeltaBuffer,
  scheduleFlush,
  closingThreads,
  setAgentMessage,
  setCommandOutput,
  setFileChangeOutput,
  addReasoningSummary,
  addReasoningContent,
  addMcpProgress,
  isOperationValid,
  getCurrentOperationSequence,
} from '../delta-buffer'

// ==================== Item Started Handler ====================

export function createHandleItemStarted(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (event: ItemStartedEvent) => {
    const threadId = event.threadId

    // Check if thread is being closed - ignore events for closing threads
    if (closingThreads.has(threadId)) {
      log.debug(`[handleItemStarted] Ignoring event for closing thread: ${threadId}`, 'message-handlers')
      return
    }

    // Verify thread still exists
    const { threads } = get()
    if (!threads[threadId]) {
      log.debug(`[handleItemStarted] Thread no longer exists: ${threadId}`, 'message-handlers')
      return
    }

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
        // P1 Fix: Use event bus instead of dynamic import
        try {
          // Check thread still exists to prevent race condition with closeThread
          if (get().threads[threadId]) {
            eventBus.emit('session:set-first-message', {
              sessionId: threadId,
              firstMessage: userMsg.content.text
            })
          }
        } catch (err) {
          handleAsyncError(err, 'handleItemStarted session sync', 'thread')
        }
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
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (event: ItemCompletedEvent) => {
    const threadId = event.threadId

    // Check if thread is being closed - ignore events for closing threads
    if (closingThreads.has(threadId)) {
      log.debug(`[handleItemCompleted] Ignoring event for closing thread: ${threadId}`, 'message-handlers')
      return
    }

    // Verify thread still exists
    const { threads } = get()
    if (!threads[threadId]) {
      log.debug(`[handleItemCompleted] Thread no longer exists: ${threadId}`, 'message-handlers')
      return
    }

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
        // P0.4 优化: 在 Immer draft 中直接赋值属性，避免不必要的 Object.assign
        // Immer 的 draft 已经是可变的，直接属性赋值比 Object.assign 更高效

        // 保存需要保留的字段（用于后续合并逻辑）
        const preservedFields: Record<string, unknown> = {}
        if (isCommandExecutionContent(existing.content)) {
          preservedFields.needsApproval = existing.content.needsApproval
          preservedFields.approved = existing.content.approved
          preservedFields.output = existing.content.output
        }
        if (isFileChangeContent(existing.content)) {
          preservedFields.needsApproval = existing.content.needsApproval
          preservedFields.approved = existing.content.approved
          preservedFields.applied = existing.content.applied
          preservedFields.snapshotId = existing.content.snapshotId
          preservedFields.output = existing.content.output
        }

        // 直接赋值顶层属性
        existing.type = nextItem.type
        existing.status = nextItem.status === 'inProgress' ? 'completed' : nextItem.status
        existing.createdAt = nextItem.createdAt
        existing.content = nextItem.content

        // 恢复需要保留的字段（使用 nullish coalescing 合并逻辑）
        if (isCommandExecutionContent(existing.content) && isCommandExecutionContent(nextItem.content)) {
          existing.content.needsApproval = (preservedFields.needsApproval as boolean | undefined) ?? nextItem.content.needsApproval
          existing.content.approved = (preservedFields.approved as boolean | undefined) ?? nextItem.content.approved
          existing.content.output = (preservedFields.output as string | undefined) ?? nextItem.content.output
        }
        if (isFileChangeContent(existing.content) && isFileChangeContent(nextItem.content)) {
          existing.content.needsApproval = (preservedFields.needsApproval as boolean | undefined) ?? nextItem.content.needsApproval
          existing.content.approved = (preservedFields.approved as boolean | undefined) ?? nextItem.content.approved
          existing.content.applied = (preservedFields.applied as boolean | undefined) ?? nextItem.content.applied
          existing.content.snapshotId = (preservedFields.snapshotId as string | undefined) ?? nextItem.content.snapshotId
          existing.content.output = (preservedFields.output as string | undefined) ?? nextItem.content.output
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

    // Check if thread is being closed - early exit before any processing
    if (closingThreads.has(threadId)) {
      log.debug(`[handleAgentMessageDelta] Ignoring event for closing thread: ${threadId}`, 'message-handlers')
      return
    }

    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    // P0 Enhancement: Validate operation sequence before processing delta
    if (!isOperationValid(buffer.operationSeq)) {
      log.debug(
        `[handleAgentMessageDelta] Stale operation (buffer: ${buffer.operationSeq}, current: ${getCurrentOperationSequence()}), discarding delta for item: ${event.itemId}`,
        'message-handlers'
      )
      return
    }

    const current = buffer.agentMessages.get(event.itemId) || ''
    const isFirstDelta = current === ''

    if (isFirstDelta) {
      log.debug(`[handleAgentMessageDelta] First delta for item: ${event.itemId}, threadId: ${threadId}`, 'message-handlers')
    }

    // Use helper function for incremental size tracking
    setAgentMessage(buffer, event.itemId, current + event.delta)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  }
}

// ==================== Command Execution Output Delta Handler ====================

export function createHandleCommandExecutionOutputDelta(get: () => ThreadState) {
  return (event: CommandExecutionOutputDeltaEvent) => {
    const threadId = event.threadId

    // Check if thread is being closed - early exit before any processing
    if (closingThreads.has(threadId)) {
      return
    }

    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    // P0 Enhancement: Validate operation sequence before processing delta
    if (!isOperationValid(buffer.operationSeq)) {
      log.debug(
        `[handleCommandExecutionOutputDelta] Stale operation, discarding delta for item: ${event.itemId}`,
        'message-handlers'
      )
      return
    }

    const current = buffer.commandOutputs.get(event.itemId) || ''
    const isFirstDelta = current === ''
    // Use helper function for incremental size tracking
    setCommandOutput(buffer, event.itemId, current + event.delta)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  }
}

// ==================== File Change Output Delta Handler ====================

export function createHandleFileChangeOutputDelta(get: () => ThreadState) {
  return (event: FileChangeOutputDeltaEvent) => {
    const threadId = event.threadId

    // Check if thread is being closed - early exit before any processing
    if (closingThreads.has(threadId)) {
      return
    }

    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    // P0 Enhancement: Validate operation sequence before processing delta
    if (!isOperationValid(buffer.operationSeq)) {
      log.debug(
        `[handleFileChangeOutputDelta] Stale operation, discarding delta for item: ${event.itemId}`,
        'message-handlers'
      )
      return
    }

    const current = buffer.fileChangeOutputs.get(event.itemId) || ''
    const isFirstDelta = current === ''
    // Use helper function for incremental size tracking
    setFileChangeOutput(buffer, event.itemId, current + event.delta)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  }
}

// ==================== Reasoning Summary Text Delta Handler ====================

export function createHandleReasoningSummaryTextDelta(get: () => ThreadState) {
  return (event: ReasoningSummaryTextDeltaEvent) => {
    const threadId = event.threadId

    // Check if thread is being closed - early exit before any processing
    if (closingThreads.has(threadId)) {
      return
    }

    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    // P0 Enhancement: Validate operation sequence before processing delta
    if (!isOperationValid(buffer.operationSeq)) {
      log.debug(
        `[handleReasoningSummaryTextDelta] Stale operation, discarding delta for item: ${event.itemId}`,
        'message-handlers'
      )
      return
    }

    const index = event.summaryIndex ?? 0
    const updates = buffer.reasoningSummaries.get(event.itemId) || []
    const isFirstDelta = updates.length === 0
    const existingIdx = updates.findIndex((u) => u.index === index)

    if (existingIdx >= 0) {
      // Use helper function for incremental size tracking
      const newText = updates[existingIdx].text + event.delta
      addReasoningSummary(buffer, event.itemId, { index, text: newText })
    } else {
      // Use helper function for incremental size tracking
      addReasoningSummary(buffer, event.itemId, { index, text: event.delta })
    }
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

    // Check if thread is being closed - early exit before any processing
    if (closingThreads.has(threadId)) {
      return
    }

    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    // P0 Enhancement: Validate operation sequence before processing delta
    if (!isOperationValid(buffer.operationSeq)) {
      log.debug(
        `[handleReasoningTextDelta] Stale operation, discarding delta for item: ${event.itemId}`,
        'message-handlers'
      )
      return
    }

    const index = event.contentIndex ?? 0
    const updates = buffer.reasoningContents.get(event.itemId) || []
    const isFirstDelta = updates.length === 0
    const existingIdx = updates.findIndex((u) => u.index === index)

    if (existingIdx >= 0) {
      // Use helper function for incremental size tracking
      const newText = updates[existingIdx].text + event.delta
      addReasoningContent(buffer, event.itemId, { index, text: newText })
    } else {
      // Use helper function for incremental size tracking
      addReasoningContent(buffer, event.itemId, { index, text: event.delta })
    }
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstDelta)
  }
}

// ==================== MCP Tool Call Progress Handler ====================

export function createHandleMcpToolCallProgress(get: () => ThreadState) {
  return (event: McpToolCallProgressEvent) => {
    const threadId = event.threadId

    // Check if thread is being closed - early exit before any processing
    if (closingThreads.has(threadId)) {
      return
    }

    const { threads } = get()
    if (!threads[threadId]) return

    const buffer = getDeltaBuffer(threadId)
    // Skip if thread is closing (buffer will be null)
    if (!buffer) return

    // P0 Enhancement: Validate operation sequence before processing delta
    if (!isOperationValid(buffer.operationSeq)) {
      log.debug(
        `[handleMcpToolCallProgress] Stale operation, discarding progress for item: ${event.itemId}`,
        'message-handlers'
      )
      return
    }

    const messages = buffer.mcpProgress.get(event.itemId) || []
    const isFirstMessage = messages.length === 0
    // Use helper function for incremental size tracking
    addMcpProgress(buffer, event.itemId, event.message)
    scheduleFlush(threadId, () => get().flushDeltaBuffer(threadId), isFirstMessage)
  }
}
