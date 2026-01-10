/**
 * Approval Event Handlers
 *
 * Handlers for approval-related events including command and file change
 * approval requests, and approval cleanup.
 */

import type { WritableDraft } from 'immer'
import { threadApi } from '../../../lib/api'
import {
  isRecord,
  isCommandExecutionContent,
  isFileChangeContent,
} from '../../../lib/typeGuards'
import type {
  CommandApprovalRequestedEvent,
  FileChangeApprovalRequestedEvent,
} from '../../../lib/events'
import type { ThreadState } from '../types'
import { APPROVAL_TIMEOUT_MS } from '../constants'

// ==================== Command Approval Requested Handler ====================

export function createHandleCommandApprovalRequested(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (event: CommandApprovalRequestedEvent) => {
    const threadId = event.threadId

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const existing = threadState.items[event.itemId]
      const updatedItem = {
        ...(existing || {
          id: event.itemId,
          type: 'commandExecution',
          status: 'inProgress',
          content: {
            callId: event.itemId,
            command: '',
            cwd: '',
          },
          createdAt: Date.now(),
        }),
        content: {
          ...(isRecord(existing?.content) ? existing.content : {}),
          needsApproval: true,
          reason: event.reason,
          proposedExecpolicyAmendment: event.proposedExecpolicyAmendment,
        },
      }
      return {
        ...state,
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [event.itemId]: updatedItem },
            itemOrder: threadState.itemOrder.includes(event.itemId)
              ? threadState.itemOrder
              : [...threadState.itemOrder, event.itemId],
            pendingApprovals: [
              ...threadState.pendingApprovals,
              {
                itemId: event.itemId,
                threadId: event.threadId,
                type: 'command',
                data: event,
                requestId: event._requestId,
                createdAt: Date.now(),
              },
            ],
          },
        },
      }
    })
  }
}

// ==================== File Change Approval Requested Handler ====================

export function createHandleFileChangeApprovalRequested(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
) {
  return (event: FileChangeApprovalRequestedEvent) => {
    const threadId = event.threadId

    set((state) => {
      const threadState = state.threads[threadId]
      if (!threadState) return state

      const existing = threadState.items[event.itemId]
      const updatedItem = {
        ...(existing || {
          id: event.itemId,
          type: 'fileChange',
          status: 'inProgress',
          content: {
            changes: [],
          },
          createdAt: Date.now(),
        }),
        content: {
          ...(isRecord(existing?.content) ? existing.content : {}),
          needsApproval: true,
          reason: event.reason,
        },
      }
      return {
        ...state,
        threads: {
          ...state.threads,
          [threadId]: {
            ...threadState,
            items: { ...threadState.items, [event.itemId]: updatedItem },
            itemOrder: threadState.itemOrder.includes(event.itemId)
              ? threadState.itemOrder
              : [...threadState.itemOrder, event.itemId],
            pendingApprovals: [
              ...threadState.pendingApprovals,
              {
                itemId: event.itemId,
                threadId: event.threadId,
                type: 'fileChange',
                data: event,
                requestId: event._requestId,
                createdAt: Date.now(),
              },
            ],
          },
        },
      }
    })
  }
}

// ==================== Stale Approvals Cleanup ====================

/**
 * Create the cleanup function for stale pending approvals.
 * Returns a function that cleans up approvals that have exceeded the timeout.
 */
export function createCleanupStaleApprovals(
  getThreadStore: () => ThreadState,
  setThreadStore: (
    fn: (state: WritableDraft<ThreadState>) => ThreadState | void
  ) => void
) {
  return async () => {
    const now = Date.now()
    const state = getThreadStore()
    const { threads } = state

    // Process each thread's approvals
    Object.entries(threads).forEach(([threadId, threadState]) => {
      const staleApprovals = threadState.pendingApprovals.filter(
        (approval) => now - approval.createdAt > APPROVAL_TIMEOUT_MS
      )

      // Send cancel responses to backend for stale approvals
      if (staleApprovals.length > 0) {
        console.warn(
          '[cleanupStaleApprovals] Cancelling',
          staleApprovals.length,
          'timed-out approvals for thread:',
          threadId,
          staleApprovals.map((a) => a.itemId)
        )

        staleApprovals.forEach((approval) => {
          threadApi
            .respondToApproval(threadId, approval.itemId, 'cancel', approval.requestId)
            .catch((err) => {
              console.warn('[cleanupStaleApprovals] Failed to cancel approval:', approval.itemId, err)
            })
        })
      }
    })

    // Update state to remove stale approvals - Using Immer for efficient nested updates
    setThreadStore((state) => {
      let hasChanges = false

      Object.entries(state.threads).forEach(([_threadId, threadState]) => {
        // Find stale approvals first
        const staleApprovals = threadState.pendingApprovals.filter(
          (approval) => now - approval.createdAt > APPROVAL_TIMEOUT_MS
        )

        if (staleApprovals.length > 0) {
          hasChanges = true

          // Immer allows direct mutation of draft state
          // Filter out stale approvals
          threadState.pendingApprovals = threadState.pendingApprovals.filter(
            (approval) => now - approval.createdAt <= APPROVAL_TIMEOUT_MS
          )

          // Update items for stale approvals using type guards
          staleApprovals.forEach((approval) => {
            const item = threadState.items[approval.itemId]
            // Use type guards for runtime type safety
            if (isCommandExecutionContent(item?.content)) {
              // Direct mutation with Immer - no need to spread
              item.status = 'failed'
              item.content.needsApproval = false
              item.content.approved = false
              item.content.reason = 'Approval request timed out'
            } else if (isFileChangeContent(item?.content)) {
              // Direct mutation with Immer - no need to spread
              item.status = 'failed'
              item.content.needsApproval = false
              item.content.approved = false
              item.content.reason = 'Approval request timed out'
            }
          })
        }
      })

      // If no changes, return original state (Immer optimization)
      return hasChanges ? state : { ...state, threads: state.threads }
    })
  }
}
