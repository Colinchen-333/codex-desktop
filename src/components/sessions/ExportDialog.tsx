import { useState, useRef } from 'react'
import { Download, FileJson, FileText, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useThreadStore } from '../../stores/thread'
import { useSessionsStore } from '../../stores/sessions'
import { useProjectsStore } from '../../stores/projects'
import { exportSession, type ExportFormat, type ExportOptions } from '../../lib/exporters/sessionExporter'
import { useToast } from '../ui/Toast'
import { useDialogKeyboardShortcut } from '../../hooks/useDialogKeyboardShortcut'
import { logError } from '../../lib/errorUtils'

interface ExportDialogProps {
  isOpen: boolean
  threadId: string | null
  onClose: () => void
}

export function ExportDialog({ isOpen, threadId, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [includeMetadata, setIncludeMetadata] = useState(true)
  const [includeTimestamps, setIncludeTimestamps] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const { showToast } = useToast()
  const exportButtonRef = useRef<HTMLButtonElement>(null)

  const threads = useThreadStore((state) => state.threads)
  const projects = useProjectsStore((state) => state.projects)
  const sessions = useSessionsStore((state) => state.sessions)

  // Use keyboard shortcut hook for Cmd+Enter (or Ctrl+Enter on Windows/Linux)
  useDialogKeyboardShortcut({
    isOpen,
    onConfirm: () => {
      if (!isExporting) {
        exportButtonRef.current?.click()
      }
    },
    onCancel: onClose,
    requireModifierKey: true, // Require Cmd/Ctrl key since there are checkboxes
  })

  // Get thread info
  const threadState = threadId ? threads[threadId] : null
  const thread = threadState?.thread

  // Get session/project info for display
  const sessionMeta = threadId ? sessions.find((s) => s.sessionId === threadId) : null
  const project = thread ? projects.find((p) => thread.cwd?.startsWith(p.path)) : null
  const sessionLabel = sessionMeta?.title || project?.displayName || thread?.cwd?.split('/').pop() || 'Session'

  const handleExport = async () => {
    if (!threadId) return

    setIsExporting(true)
    try {
      const options: ExportOptions = {
        includeMetadata,
        includeTimestamps,
      }

      await exportSession(threadId, format, options)
      showToast(`Session exported as ${format === 'markdown' ? 'Markdown' : 'JSON'}`, 'success')
      onClose()
    } catch (error) {
      logError(error, {
        context: 'ExportDialog',
        source: 'sessions',
        details: 'Export failed'
      })
      showToast(
        `Failed to export session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      )
    } finally {
      setIsExporting(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen || !threadId) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-card rounded-xl shadow-xl border border-border/50 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Export Session</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Session info */}
          <div className="bg-secondary/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Session:</span>
              <span className="font-medium text-foreground truncate">{sessionLabel}</span>
            </div>
            {thread?.cwd && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mt-1">
                <span className="truncate font-mono">{thread.cwd}</span>
              </div>
            )}
          </div>

          {/* Format selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Export Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat('markdown')}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                  format === 'markdown'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary/60 hover:bg-secondary text-foreground'
                )}
                disabled={isExporting}
              >
                <FileText size={16} />
                Markdown
              </button>
              <button
                onClick={() => setFormat('json')}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                  format === 'json'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary/60 hover:bg-secondary text-foreground'
                )}
                disabled={isExporting}
              >
                <FileJson size={16} />
                JSON
              </button>
            </div>
          </div>

          {/* Export options */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Options</label>

            <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/30 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={includeMetadata}
                onChange={(e) => setIncludeMetadata(e.target.checked)}
                disabled={isExporting}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-0"
              />
              <span className="text-sm text-foreground">Include metadata (model, project, date)</span>
            </label>

            <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/30 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={includeTimestamps}
                onChange={(e) => setIncludeTimestamps(e.target.checked)}
                disabled={isExporting}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-0"
              />
              <span className="text-sm text-foreground">Include timestamps</span>
            </label>
          </div>

          {/* Format description */}
          <div className="bg-secondary/30 rounded-lg p-3 text-xs text-muted-foreground">
            {format === 'markdown' ? (
              <p>
                Export as a formatted Markdown document. Suitable for documentation, sharing, or viewing in
                any Markdown editor.
              </p>
            ) : (
              <p>
                Export as structured JSON data. Suitable for programmatic processing, backups, or importing
                into other tools.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border/50 bg-secondary/20">
          <button
            onClick={onClose}
            disabled={isExporting}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-secondary/60 hover:bg-secondary text-foreground',
              'transition-colors duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Cancel
          </button>
          <button
            ref={exportButtonRef}
            onClick={handleExport}
            disabled={isExporting}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
              'bg-primary hover:bg-primary/90 text-primary-foreground',
              'transition-colors duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isExporting ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <Download size={16} />
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
