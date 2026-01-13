/**
 * ImportCodexSessionDialog - Import sessions from Codex CLI (~/.codex/sessions/)
 *
 * Allows users to browse, search, and import sessions from their local Codex CLI history.
 */
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Search, FolderOpen, GitBranch, Clock, FileText, Trash2, Download, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { codexImportApi, type CodexSessionSummary } from '../../lib/api'
import { useToast } from '../ui/Toast'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useDialogKeyboardShortcut } from '../../hooks/useDialogKeyboardShortcut'
import { logError } from '../../lib/errorUtils'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { clearCache } from '../../lib/apiCache'

interface ImportCodexSessionDialogProps {
  isOpen: boolean
  onClose: () => void
  onImport: (session: CodexSessionSummary) => void
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    // Less than 24 hours ago
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      if (hours > 0) return `${hours}h ${minutes}m ago`
      if (minutes > 0) return `${minutes}m ago`
      return 'Just now'
    }

    // Less than 7 days ago
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000)
      return `${days}d ago`
    }

    // Otherwise show date
    return date.toLocaleDateString()
  } catch {
    return timestamp
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ImportCodexSessionDialog({
  isOpen,
  onClose,
  onImport,
}: ImportCodexSessionDialogProps) {
  const { showToast } = useToast()
  const [sessions, setSessions] = useState<CodexSessionSummary[]>([])
  const [filteredSessions, setFilteredSessions] = useState<CodexSessionSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSession, setSelectedSession] = useState<CodexSessionSummary | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean
    session: CodexSessionSummary | null
  }>({ isOpen: false, session: null })

  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Use keyboard shortcut hook
  useDialogKeyboardShortcut({
    isOpen,
    onConfirm: () => {
      if (selectedSession) {
        onImport(selectedSession)
        onClose()
      }
    },
    onCancel: onClose,
    requireModifierKey: false,
  })

  // Load sessions when dialog opens
  const loadSessions = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await codexImportApi.listSessions()
      setSessions(data)
      setFilteredSessions(data)
    } catch (error) {
      logError(error, {
        context: 'ImportCodexSessionDialog',
        source: 'dialogs',
        details: 'Failed to load Codex CLI sessions',
      })
      showToast('Failed to load Codex CLI sessions', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (isOpen) {
      void loadSessions()
      // Focus search input on open
      setTimeout(() => searchInputRef.current?.focus(), 100)
    } else {
      // Reset state on close
      setSearchQuery('')
      setSelectedSession(null)
    }
  }, [isOpen, loadSessions])

  // Filter sessions based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSessions(sessions)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = sessions.filter(
      (s) =>
        s.projectName.toLowerCase().includes(query) ||
        s.cwd.toLowerCase().includes(query) ||
        s.firstMessage?.toLowerCase().includes(query) ||
        s.gitBranch?.toLowerCase().includes(query)
    )
    setFilteredSessions(filtered)
  }, [searchQuery, sessions])

  // Group sessions by project
  const groupedSessions = useMemo(() => {
    const groups: Record<string, CodexSessionSummary[]> = {}
    for (const session of filteredSessions) {
      const key = session.cwd
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(session)
    }
    return groups
  }, [filteredSessions])

  const handleRefresh = useCallback(() => {
    clearCache('codex_cli_sessions')
    void loadSessions()
  }, [loadSessions])

  const handleDeleteClick = (session: CodexSessionSummary, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete({ isOpen: true, session })
  }

  const handleDeleteConfirm = async () => {
    const session = confirmDelete.session
    if (!session) return

    setConfirmDelete({ isOpen: false, session: null })
    try {
      await codexImportApi.deleteSession(session.id)
      showToast('Session deleted successfully', 'success')
      // Remove from local state
      setSessions((prev) => prev.filter((s) => s.id !== session.id))
      setFilteredSessions((prev) => prev.filter((s) => s.id !== session.id))
      if (selectedSession?.id === session.id) {
        setSelectedSession(null)
      }
    } catch (error) {
      logError(error, {
        context: 'ImportCodexSessionDialog',
        source: 'dialogs',
        details: 'Failed to delete session',
      })
      showToast('Failed to delete session', 'error')
    }
  }

  const handleDeleteCancel = () => {
    setConfirmDelete({ isOpen: false, session: null })
  }

  const handleImport = () => {
    if (selectedSession) {
      onImport(selectedSession)
      onClose()
    }
  }

  if (!isOpen) return null

  const errorFallback = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-background p-6 text-center shadow-xl">
        <h2 className="text-lg font-semibold">Import unavailable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading Codex CLI sessions.
        </p>
        <button
          className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )

  return (
    <ErrorBoundary fallback={errorFallback}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-2xl rounded-lg bg-background shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Download size={20} className="text-primary" />
              <h2 className="text-lg font-semibold">Import Codex CLI Session</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/50 transition-colors"
                onClick={handleRefresh}
                title="Refresh"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={onClose}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="border-b border-border px-6 py-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search sessions by project, path, message, or branch..."
                className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                <RefreshCw size={16} className="animate-spin mr-2" />
                Loading sessions from ~/.codex/sessions/...
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center text-sm text-muted-foreground">
                <FileText size={32} className="mb-3 opacity-50" />
                {sessions.length === 0 ? (
                  <>
                    <p>No Codex CLI sessions found</p>
                    <p className="text-xs mt-1">Sessions are stored in ~/.codex/sessions/</p>
                  </>
                ) : (
                  <>
                    <p>No sessions match your search</p>
                    <p className="text-xs mt-1">Try a different search term</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedSessions).map(([cwd, projectSessions]) => (
                  <div key={cwd} className="space-y-2">
                    {/* Project header */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FolderOpen size={12} />
                      <span className="truncate">{cwd}</span>
                      <span className="text-muted-foreground/50">
                        ({projectSessions.length} session{projectSessions.length > 1 ? 's' : ''})
                      </span>
                    </div>

                    {/* Sessions */}
                    {projectSessions.map((session) => (
                      <div
                        key={session.id}
                        className={cn(
                          'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                          selectedSession?.id === session.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-secondary/30'
                        )}
                        onClick={() => setSelectedSession(session)}
                      >
                        <div className="flex-1 min-w-0">
                          {/* First message preview */}
                          <p className="text-sm font-medium truncate">
                            {session.firstMessage || 'No message preview'}
                          </p>

                          {/* Metadata row */}
                          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {formatTimestamp(session.timestamp)}
                            </span>
                            {session.gitBranch && (
                              <span className="flex items-center gap-1">
                                <GitBranch size={10} />
                                {session.gitBranch}
                              </span>
                            )}
                            <span>{session.messageCount} messages</span>
                            <span>{formatFileSize(session.fileSize)}</span>
                          </div>
                        </div>

                        {/* Delete button */}
                        <button
                          className="p-1.5 text-muted-foreground/50 hover:text-red-500 rounded transition-colors"
                          onClick={(e) => handleDeleteClick(session, e)}
                          title="Delete session"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <div className="text-xs text-muted-foreground">
              {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''} found
            </div>
            <div className="flex gap-2">
              <button
                ref={closeButtonRef}
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  selectedSession
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-primary/50 text-primary-foreground/50 cursor-not-allowed'
                )}
                onClick={handleImport}
                disabled={!selectedSession}
              >
                Import Session
              </button>
            </div>
          </div>

          {/* Delete Confirmation Dialog */}
          <ConfirmDialog
            isOpen={confirmDelete.isOpen}
            title="Delete Session"
            message={`Delete this Codex CLI session? This will remove the session file from ~/.codex/sessions/. This action cannot be undone.`}
            confirmText="Delete"
            cancelText="Cancel"
            variant="danger"
            onConfirm={handleDeleteConfirm}
            onCancel={handleDeleteCancel}
          />
        </div>
      </div>
    </ErrorBoundary>
  )
}
