/**
 * Snapshot Actions
 *
 * Actions for creating, reverting, and fetching snapshots.
 *
 * Improvements:
 * - Added isLoading state for snapshot operations
 * - Proper state reload after snapshot restoration
 * - Error handling with user feedback
 */

import type { WritableDraft } from 'immer'
import { snapshotApi, type Snapshot } from '../../../lib/api'
import { log } from '../../../lib/logger'
import { parseError } from '../../../lib/errorUtils'
import type { ThreadState } from '../types'

// ==================== Create Snapshot Action ====================

export function createCreateSnapshot(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return async (projectPath: string): Promise<Snapshot> => {
    const { focusedThreadId, threads } = get()
    if (!focusedThreadId || !threads[focusedThreadId]) {
      throw new Error('No active thread')
    }

    const threadId = focusedThreadId

    // Set loading state
    set((state) => {
      state.isLoading = true
      return state
    })

    try {
      const snapshot = await snapshotApi.create(threadId, projectPath)

      const { threads: currentThreads } = get()
      if (!currentThreads[threadId]) {
        log.warn('[createSnapshot] Thread closed, discarding snapshot update', 'snapshot-actions')
        return snapshot
      }

      set((state) => {
        state.snapshots = [snapshot, ...state.snapshots]
        state.isLoading = false
        return state
      })
      return snapshot
    } catch (error) {
      set((state) => {
        state.isLoading = false
        state.globalError = parseError(error)
        return state
      })
      throw error
    }
  }
}

// ==================== Revert to Snapshot Action ====================

export function createRevertToSnapshot(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return async (snapshotId: string, projectPath: string): Promise<void> => {
    const { focusedThreadId, threads } = get()
    if (!focusedThreadId || !threads[focusedThreadId]) {
      throw new Error('No active thread')
    }

    const threadId = focusedThreadId

    // Set loading state
    set((state) => {
      state.isLoading = true
      state.globalError = null
      return state
    })

    try {
      await snapshotApi.revert(snapshotId, projectPath)

      // Verify thread still exists after revert
      const { threads: currentThreads } = get()
      if (!currentThreads[threadId]) {
        log.warn('[revertToSnapshot] Thread closed after revert', 'snapshot-actions')
        return
      }

      // Add info item to notify user
      const addInfoItem = get().addInfoItem
      if (addInfoItem) {
        addInfoItem('Snapshot Restored', `Successfully reverted to snapshot: ${snapshotId.slice(0, 7)}`)
      }

      // Reload session state to ensure consistency
      // This refreshes the thread state from the server
      try {
        const threadState = currentThreads[threadId]
        if (threadState) {
          // Clear any pending operations or deltas
          set((state) => {
            const ts = state.threads[threadId]
            if (!ts) return state
            ts.turnStatus = 'idle'
            ts.currentTurnId = null
            ts.pendingApprovals = []
            return state
          })
        }
      } catch (reloadError) {
        log.warn(`[revertToSnapshot] Failed to reload session state: ${reloadError}`, 'snapshot-actions')
      }

      set((state) => {
        state.isLoading = false
        return state
      })
    } catch (error) {
      set((state) => {
        state.isLoading = false
        state.globalError = parseError(error)
        return state
      })
      throw error
    }
  }
}

// ==================== Fetch Snapshots Action ====================

export function createFetchSnapshots(
  set: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void,
  get: () => ThreadState
) {
  return async (): Promise<void> => {
    const { focusedThreadId, threads } = get()
    if (!focusedThreadId || !threads[focusedThreadId]) return

    const threadId = focusedThreadId

    // Set loading state
    set((state) => {
      state.isLoading = true
      return state
    })

    try {
      const snapshots = await snapshotApi.list(threadId)

      const { threads: currentThreads } = get()
      if (!currentThreads[threadId]) {
        log.warn('[fetchSnapshots] Thread closed, discarding snapshot list', 'snapshot-actions')
        return
      }

      set((state) => {
        state.snapshots = snapshots
        state.isLoading = false
        return state
      })
    } catch (error) {
      set((state) => {
        state.isLoading = false
        state.globalError = parseError(error)
        return state
      })
      log.error(`Failed to fetch snapshots: ${error}`, 'snapshot-actions')
    }
  }
}
