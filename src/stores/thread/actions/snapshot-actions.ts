/**
 * Snapshot Actions
 *
 * Actions for creating, reverting, and fetching snapshots.
 */

import type { WritableDraft } from 'immer'
import { snapshotApi, type Snapshot } from '../../../lib/api'
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
    const snapshot = await snapshotApi.create(threadId, projectPath)

    const { threads: currentThreads } = get()
    if (!currentThreads[threadId]) {
      console.warn('[createSnapshot] Thread closed, discarding snapshot update')
      return snapshot
    }

    set((state) => {
      state.snapshots = [snapshot, ...state.snapshots]
      return state
    })
    return snapshot
  }
}

// ==================== Revert to Snapshot Action ====================

export function createRevertToSnapshot() {
  return async (snapshotId: string, projectPath: string): Promise<void> => {
    await snapshotApi.revert(snapshotId, projectPath)
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
    try {
      const snapshots = await snapshotApi.list(threadId)

      const { threads: currentThreads } = get()
      if (!currentThreads[threadId]) {
        console.warn('[fetchSnapshots] Thread closed, discarding snapshot list')
        return
      }

      set((state) => {
        state.snapshots = snapshots
        return state
      })
    } catch (error) {
      console.error('Failed to fetch snapshots:', error)
    }
  }
}
