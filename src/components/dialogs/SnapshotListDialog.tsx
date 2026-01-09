import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'
import { useThreadStore } from '../../stores/thread'
import { useProjectsStore } from '../../stores/projects'
import { useToast } from '../ui/Toast'
import type { Snapshot } from '../../lib/api'

interface SnapshotListDialogProps {
  isOpen: boolean
  onClose: () => void
}

function formatSnapshotTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 24 hours ago, show relative time
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    if (hours > 0) return `${hours}h ${minutes}m ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  // Otherwise show full date/time
  return date.toLocaleString()
}

function getSnapshotTypeLabel(type: string): string {
  switch (type) {
    case 'pre_change':
      return 'Pre-change'
    case 'manual':
      return 'Manual'
    case 'auto':
      return 'Auto'
    default:
      return type
  }
}

export function SnapshotListDialog({ isOpen, onClose }: SnapshotListDialogProps) {
  const { snapshots, activeThread } = useThreadStore()
  // fetchSnapshots, revertToSnapshot are called via getState() to avoid dependency issues
  const { projects, selectedProjectId } = useProjectsStore()
  const { showToast } = useToast()
  const [isReverting, setIsReverting] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const project = projects.find((p) => p.id === selectedProjectId)

  useEffect(() => {
    if (isOpen && activeThread) {
      setIsLoading(true)
      useThreadStore.getState().fetchSnapshots().finally(() => setIsLoading(false))
    }
  }, [isOpen, activeThread]) // Remove fetchSnapshots dependency

  const handleRevert = async (snapshot: Snapshot) => {
    if (!project) {
      showToast('No project selected', 'error')
      return
    }

    setIsReverting(snapshot.id)
    try {
      await useThreadStore.getState().revertToSnapshot(snapshot.id, project.path)
      showToast('Reverted to snapshot successfully', 'success')
    } catch (error) {
      console.error('Failed to revert:', error)
      showToast('Failed to revert to snapshot', 'error')
    } finally {
      setIsReverting(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Snapshots</h2>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto p-4">
          {!activeThread ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No active session. Start a session to create snapshots.
            </div>
          ) : isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <div className="animate-spin mr-2">⏳</div>
              Loading snapshots...
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-sm text-muted-foreground">
              <div className="text-3xl mb-3">📸</div>
              <p>No snapshots yet</p>
              <p className="text-xs mt-1">Snapshots are created automatically before changes are applied</p>
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snapshot) => {
                const metadata = snapshot.metadataJson ? JSON.parse(snapshot.metadataJson) : {}

                return (
                  <div
                    key={snapshot.id}
                    className={cn(
                      'flex items-center justify-between rounded-lg border border-border p-3 transition-colors',
                      'hover:bg-secondary/30'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {formatSnapshotTime(snapshot.createdAt)}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          {getSnapshotTypeLabel(snapshot.snapshotType)}
                        </span>
                      </div>
                      {metadata.description && (
                        <p className="mt-1 text-xs text-muted-foreground truncate">
                          {metadata.description}
                        </p>
                      )}
                      {metadata.filesChanged && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {metadata.filesChanged} file(s) backed up
                        </p>
                      )}
                    </div>
                    <button
                      className={cn(
                        'ml-3 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                        'disabled:opacity-50'
                      )}
                      onClick={() => handleRevert(snapshot)}
                      disabled={isReverting === snapshot.id}
                    >
                      {isReverting === snapshot.id ? 'Reverting...' : 'Revert'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-6 py-4">
          <button
            className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
