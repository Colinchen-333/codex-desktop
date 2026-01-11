/**
 * FileChangeCard - Shows proposed file changes with diff view and approval UI
 *
 * Performance optimization: Wrapped with React.memo and custom comparison function
 * to prevent unnecessary re-renders in message lists. Only re-renders when:
 * - item.id changes (different message)
 * - item.status changes (status update)
 * - item.content changes meaningfully (shallow comparison)
 */
import { memo, useState, useRef, useCallback } from 'react'
import { FileCode } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useThreadStore } from '../../../stores/thread'
import { useProjectsStore } from '../../../stores/projects'
import { useToast } from '../../ui/Toast'
import { DiffView, parseDiff, type FileDiff } from '../../ui/DiffView'
import { log } from '../../../lib/logger'
import { formatTimestamp, shallowContentEqual } from '../utils'
import { useOptimisticUpdate } from '../../../hooks/useOptimisticUpdate'
import type { MessageItemProps, FileChangeContentType } from '../types'

/**
 * 乐观更新状态类型
 */
interface ApplyChangesOptimisticState {
  snapshotId?: string
  previousApprovalState: boolean
}

/**
 * FileChangeCard Component
 *
 * Memoized to prevent re-renders when parent components update but this
 * specific message item hasn't changed. Custom comparison checks:
 * - item.id: Skip if different message entirely
 * - item.status: Re-render on status changes (pending -> completed, etc.)
 * - item.content: Shallow compare to catch content updates
 */
export const FileChangeCard = memo(
  function FileChangeCard({ item }: MessageItemProps) {
  const content = item.content as FileChangeContentType
  const { respondToApproval, activeThread, createSnapshot, revertToSnapshot } = useThreadStore()
  const projects = useProjectsStore((state) => state.projects)
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const { showToast } = useToast()
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set())
  const [isReverting, setIsReverting] = useState(false)
  const [, setIsDeclining] = useState(false)

  // Refs for double-click protection (state updates are async, refs are synchronous)
  const isRevertingRef = useRef(false)
  const isDecliningRef = useRef(false)

  // 保存决定类型的 ref，供乐观更新使用
  const currentDecisionRef = useRef<'accept' | 'acceptForSession'>('accept')
  // 保存 snapshotId 的 ref，供回滚使用
  const pendingSnapshotIdRef = useRef<string | undefined>(undefined)

  const project = projects.find((p) => p.id === selectedProjectId)

  /**
   * 乐观更新回滚函数
   * 当 approval 失败时，恢复到之前的状态
   */
  const rollbackApplyChanges = useCallback(
    (previousState: ApplyChangesOptimisticState) => {
      log.info(
        `Rolling back apply changes, snapshotId: ${previousState.snapshotId}`,
        'FileChangeCard'
      )

      // 如果之前创建了 snapshot 且需要回滚，可以尝试 revert
      // 注意：这里只是恢复 UI 状态，实际的文件回滚需要通过 revertToSnapshot
      const snapshotIdToRevert = previousState.snapshotId ?? pendingSnapshotIdRef.current
      if (snapshotIdToRevert && project) {
        revertToSnapshot(snapshotIdToRevert, project.path).catch((err) => {
          log.error(`Failed to revert snapshot during rollback: ${err}`, 'FileChangeCard')
        })
      }
    },
    [project, revertToSnapshot]
  )

  /**
   * 使用乐观更新 Hook 管理应用更改的状态
   */
  const {
    execute: executeApplyChanges,
    isLoading: isApplying,
    rollback: manualRollback,
  } = useOptimisticUpdate<ApplyChangesOptimisticState, void>({
    execute: async () => {
      if (!activeThread || !project) {
        throw new Error('No active thread or project')
      }

      // Capture thread ID at start to detect if it changes during async operations
      const threadIdAtStart = activeThread.id

      // Try to create snapshot before applying changes
      let snapshotId: string | undefined
      try {
        const snapshot = await createSnapshot(project.path)
        snapshotId = snapshot.id
        pendingSnapshotIdRef.current = snapshotId
      } catch (snapshotError) {
        log.warn(
          `Failed to create snapshot, proceeding without: ${snapshotError}`,
          'FileChangeCard'
        )
        showToast('Could not create snapshot (changes will still be applied)', 'warning')
      }

      // CRITICAL: Validate thread hasn't changed during snapshot creation
      const currentThread = useThreadStore.getState().activeThread
      if (!currentThread || currentThread.id !== threadIdAtStart) {
        log.error(
          `Thread changed during apply - threadIdAtStart: ${threadIdAtStart}, currentThread: ${currentThread?.id}`,
          'FileChangeCard'
        )
        throw new Error('Thread changed during apply operation')
      }

      // Approve the changes (with or without snapshot ID)
      await respondToApproval(item.id, currentDecisionRef.current, { snapshotId })
    },
    optimisticUpdate: () => {
      // 保存之前的状态用于回滚
      const previousState: ApplyChangesOptimisticState = {
        snapshotId: pendingSnapshotIdRef.current,
        previousApprovalState: content.needsApproval ?? true,
      }
      return previousState
    },
    rollbackFn: rollbackApplyChanges,
    onSuccess: () => {
      log.info('Changes applied successfully', 'FileChangeCard')
    },
    onError: (error, rollback) => {
      log.error(`Failed to apply changes: ${error}`, 'FileChangeCard')
      showToast('Failed to apply changes, rolling back...', 'error')
      // 如果自动回滚失败，可以手动触发
      rollback()
    },
    autoRollback: true,
    operationId: `apply-changes-${item.id}`,
  })

  /**
   * 处理应用更改
   */
  const handleApplyChanges = useCallback(
    async (decision: 'accept' | 'acceptForSession' = 'accept') => {
      if (isApplying || !activeThread || !project) return

      // 保存决定类型
      currentDecisionRef.current = decision
      pendingSnapshotIdRef.current = undefined

      await executeApplyChanges()
    },
    [isApplying, activeThread, project, executeApplyChanges]
  )

  // Manual rollback handler - exposed for external use via manualRollback from useApplyChanges
  const handleManualRollback = useCallback(() => {
    manualRollback()
    showToast('Changes rolled back', 'info')
  }, [manualRollback, showToast])

  // Prevent unused variable warning - this is intentionally exposed for external access
  void handleManualRollback

  const handleRevert = async () => {
    if (isRevertingRef.current || !content.snapshotId || !project) return
    isRevertingRef.current = true
    setIsReverting(true)
    try {
      await revertToSnapshot(content.snapshotId, project.path)
      showToast('Changes reverted successfully', 'success')
    } catch (error) {
      log.error(`Failed to revert changes: ${error}`, 'FileChangeCard')
      showToast('Failed to revert changes', 'error')
    } finally {
      isRevertingRef.current = false
      setIsReverting(false)
    }
  }

  const handleDecline = async () => {
    if (isDecliningRef.current || !activeThread) return
    isDecliningRef.current = true
    setIsDeclining(true)
    try {
      await respondToApproval(item.id, 'decline')
    } finally {
      isDecliningRef.current = false
      setIsDeclining(false)
    }
  }

  const toggleFile = (index: number) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const addCount = content.changes.filter((c) => c.kind === 'add').length
  const modifyCount = content.changes.filter(
    (c) => c.kind === 'modify' || c.kind === 'rename'
  ).length
  const deleteCount = content.changes.filter((c) => c.kind === 'delete').length

  // Convert changes to FileDiff format
  const fileDiffs: FileDiff[] = content.changes.map((change) => ({
    path: change.path,
    kind: change.kind as 'add' | 'modify' | 'delete' | 'rename',
    oldPath: change.oldPath,
    hunks: change.diff ? parseDiff(change.diff) : [],
    raw: change.diff,
  }))

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
      <div
        className={cn(
          'w-full max-w-3xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.needsApproval
            ? 'border-l-4 border-l-blue-500 border-y-border/50 border-r-border/50'
            : 'border-border/50'
        )}
      >
        <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-background p-1 text-muted-foreground shadow-sm">
              <FileCode size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">Proposed Changes</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-medium">
            {addCount > 0 && (
              <span className="text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">
                +{addCount} added
              </span>
            )}
            {modifyCount > 0 && (
              <span className="text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded">
                ~{modifyCount} modified
              </span>
            )}
            {deleteCount > 0 && (
              <span className="text-red-600 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">
                -{deleteCount} deleted
              </span>
            )}
            {/* Timestamp */}
            <span className="text-muted-foreground/60 font-normal">
              {formatTimestamp(item.createdAt)}
            </span>
          </div>
        </div>

        <div className="p-0">
          <div className="divide-y divide-border/30">
            {fileDiffs.map((diff, i) => (
              <DiffView
                key={i}
                diff={diff}
                collapsed={!expandedFiles.has(i)}
                onToggleCollapse={() => toggleFile(i)}
              />
            ))}
          </div>
        </div>

        {content.needsApproval && (
          <div className="bg-secondary/10 p-4 border-t border-border/40">
            {content.reason && (
              <div className="mb-3 text-xs text-muted-foreground">Reason: {content.reason}</div>
            )}
            {/* Primary Actions */}
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                onClick={() => handleApplyChanges('accept')}
                disabled={isApplying}
              >
                {isApplying ? 'Applying...' : 'Apply Changes'}
              </button>
              <button
                className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
                onClick={() => handleApplyChanges('acceptForSession')}
                disabled={isApplying}
              >
                Allow for Session
              </button>
              <button
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                onClick={handleDecline}
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {content.applied && (
          <div className="bg-green-50/50 dark:bg-green-900/10 p-3 border-t border-green-100 dark:border-green-900/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-400">
                <div className="h-4 w-4 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                  <span className="text-[10px]">✓</span>
                </div>
                <span>Changes applied</span>
              </div>
              {content.snapshotId && (
                <button
                  className="rounded-md bg-background/50 px-3 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors border border-transparent hover:border-destructive/20 disabled:opacity-50"
                  onClick={handleRevert}
                  disabled={isReverting}
                >
                  {isReverting ? 'Reverting...' : 'Revert Changes'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
  },
  // Custom comparison function for React.memo
  // Returns true if props are equal (skip re-render), false if different (trigger re-render)
  (prev, next) => {
    // Different message entirely - must re-render
    if (prev.item.id !== next.item.id) return false
    // Status changed (e.g., pending -> completed) - must re-render
    if (prev.item.status !== next.item.status) return false
    // Shallow compare content for meaningful changes
    return shallowContentEqual(prev.item.content, next.item.content)
  }
)
