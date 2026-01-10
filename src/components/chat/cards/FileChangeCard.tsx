/**
 * FileChangeCard - Shows proposed file changes with diff view and approval UI
 */
import { useState, useRef } from 'react'
import { FileCode } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useThreadStore } from '../../../stores/thread'
import { useProjectsStore } from '../../../stores/projects'
import { useToast } from '../../ui/Toast'
import { DiffView, parseDiff, type FileDiff } from '../../ui/DiffView'
import { log } from '../../../lib/logger'
import { formatTimestamp } from '../utils'
import type { MessageItemProps, FileChangeContentType } from '../types'

export function FileChangeCard({ item }: MessageItemProps) {
  const content = item.content as FileChangeContentType
  const { respondToApproval, activeThread, createSnapshot, revertToSnapshot } = useThreadStore()
  const projects = useProjectsStore((state) => state.projects)
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId)
  const { showToast } = useToast()
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  const [isReverting, setIsReverting] = useState(false)
  const [, setIsDeclining] = useState(false)

  // Refs for double-click protection (state updates are async, refs are synchronous)
  const isApplyingRef = useRef(false)
  const isRevertingRef = useRef(false)
  const isDecliningRef = useRef(false)

  const project = projects.find((p) => p.id === selectedProjectId)

  const handleApplyChanges = async (decision: 'accept' | 'acceptForSession' = 'accept') => {
    if (isApplyingRef.current || !activeThread || !project) return
    isApplyingRef.current = true
    setIsApplying(true)

    // Capture thread ID at start to detect if it changes during async operations
    const threadIdAtStart = activeThread.id

    try {
      // Try to create snapshot before applying changes
      let snapshotId: string | undefined
      try {
        const snapshot = await createSnapshot(project.path)
        snapshotId = snapshot.id
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
        return
      }

      // Approve the changes (with or without snapshot ID)
      await respondToApproval(item.id, decision, { snapshotId })
    } catch (error) {
      log.error(`Failed to apply changes: ${error}`, 'FileChangeCard')
      showToast('Failed to apply changes', 'error')
    } finally {
      isApplyingRef.current = false
      setIsApplying(false)
    }
  }

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
}
