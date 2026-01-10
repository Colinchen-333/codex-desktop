/**
 * Buffer Actions
 *
 * Actions for flushing delta buffers and applying streaming updates.
 */

import type { WritableDraft } from 'immer'
import type {
  ThreadState,
  AgentMessageItem,
  ReasoningItem,
} from '../types'
import {
  deltaBuffers,
  clearDeltaBuffer,
} from '../delta-buffer'

// ==================== Flush Delta Buffer Action ====================

export function createFlushDeltaBuffer(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return (threadId?: string) => {
    const targetThreadId = threadId ?? get().focusedThreadId
    if (!targetThreadId) return

    const { threads } = get()
    const threadState = threads[targetThreadId]
    if (!threadState) {
      clearDeltaBuffer(targetThreadId)
      return
    }

    const buffer = deltaBuffers.get(targetThreadId)
    if (!buffer) return

    const hasAgentMessages = buffer.agentMessages.size > 0
    const hasCommandOutputs = buffer.commandOutputs.size > 0
    const hasFileChangeOutputs = buffer.fileChangeOutputs.size > 0
    const hasReasoningSummaries = buffer.reasoningSummaries.size > 0
    const hasReasoningContents = buffer.reasoningContents.size > 0
    const hasMcpProgress = buffer.mcpProgress.size > 0

    if (
      !hasAgentMessages &&
      !hasCommandOutputs &&
      !hasFileChangeOutputs &&
      !hasReasoningSummaries &&
      !hasReasoningContents &&
      !hasMcpProgress
    ) {
      return
    }

    set((state) => {
      const ts = state.threads[targetThreadId]
      if (!ts) return state

      // Apply agent message deltas
      buffer.agentMessages.forEach((text, itemId) => {
        const existing = ts.items[itemId]
        if (existing && existing.type === 'agentMessage') {
          (existing as AgentMessageItem).content.text += text
          ;(existing as AgentMessageItem).content.isStreaming = true
        } else {
          const newItem: AgentMessageItem = {
            id: itemId,
            type: 'agentMessage',
            status: 'inProgress',
            content: { text, isStreaming: true },
            createdAt: Date.now(),
          }
          ts.items[itemId] = newItem
          if (!ts.itemOrder.includes(itemId)) {
            ts.itemOrder.push(itemId)
          }
        }
      })

      // Apply command output deltas
      buffer.commandOutputs.forEach((output, itemId) => {
        const existing = ts.items[itemId]
        if (existing && existing.type === 'commandExecution') {
          existing.content.output = (existing.content.output || '') + output
          existing.content.isRunning = true
        }
      })

      // Apply file change output deltas
      buffer.fileChangeOutputs.forEach((output, itemId) => {
        const existing = ts.items[itemId]
        if (existing && existing.type === 'fileChange') {
          existing.content.output = (existing.content.output || '') + output
        }
      })

      // Apply reasoning summary deltas
      buffer.reasoningSummaries.forEach((updates, itemId) => {
        const existing = ts.items[itemId]
        if (existing && existing.type === 'reasoning') {
          const summary = [...(existing as ReasoningItem).content.summary]
          updates.forEach(({ index, text }) => {
            while (summary.length <= index) {
              summary.push('')
            }
            summary[index] = summary[index] + text
          })
          ;(existing as ReasoningItem).content.summary = summary
          ;(existing as ReasoningItem).content.isStreaming = true
        } else {
          const summary: string[] = []
          updates.forEach(({ index, text }) => {
            while (summary.length <= index) {
              summary.push('')
            }
            summary[index] = summary[index] + text
          })
          const newItem: ReasoningItem = {
            id: itemId,
            type: 'reasoning',
            status: 'inProgress',
            content: { summary, isStreaming: true },
            createdAt: Date.now(),
          }
          ts.items[itemId] = newItem
          if (!ts.itemOrder.includes(itemId)) {
            ts.itemOrder.push(itemId)
          }
        }
      })

      // Apply reasoning content deltas
      buffer.reasoningContents.forEach((updates, itemId) => {
        const existing = ts.items[itemId]
        if (existing && existing.type === 'reasoning') {
          const fullContent = (existing as ReasoningItem).content.fullContent
            ? [...(existing as ReasoningItem).content.fullContent!]
            : []
          updates.forEach(({ index, text }) => {
            while (fullContent.length <= index) {
              fullContent.push('')
            }
            fullContent[index] = fullContent[index] + text
          })
          ;(existing as ReasoningItem).content.fullContent = fullContent
          ;(existing as ReasoningItem).content.isStreaming = true
        }
      })

      // Apply MCP progress
      buffer.mcpProgress.forEach((messages, itemId) => {
        const existing = ts.items[itemId]
        if (existing && existing.type === 'mcpTool') {
          existing.content.progress = [...(existing.content.progress || []), ...messages]
          existing.content.isRunning = true
        }
      })

      // Clear buffers after applying
      buffer.agentMessages.clear()
      buffer.commandOutputs.clear()
      buffer.fileChangeOutputs.clear()
      buffer.reasoningSummaries.clear()
      buffer.reasoningContents.clear()
      buffer.mcpProgress.clear()

      return state
    })
  }
}
