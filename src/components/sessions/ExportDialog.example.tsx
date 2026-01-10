/**
 * Example: How to use the ExportDialog component
 *
 * This file demonstrates how to integrate the ExportDialog into your application.
 */

import { useState } from 'react'
import { Download } from 'lucide-react'
import { ExportDialog } from './ExportDialog'
import { useThreadStore } from '../../stores/thread'

export function ExportButtonExample() {
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const focusedThreadId = useThreadStore((state) => state.focusedThreadId)

  const handleExportClick = () => {
    if (focusedThreadId) {
      setIsExportDialogOpen(true)
    }
  }

  return (
    <>
      <button
        onClick={handleExportClick}
        disabled={!focusedThreadId}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary/60 hover:bg-secondary text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Export session"
      >
        <Download size={14} />
        Export
      </button>

      <ExportDialog
        isOpen={isExportDialogOpen}
        threadId={focusedThreadId}
        onClose={() => setIsExportDialogOpen(false)}
      />
    </>
  )
}

/**
 * Integration Example: Adding export to SessionTabs component
 *
 * To add export functionality to SessionTabs, you can add an export button
 * next to each session tab or in the tab header area:
 */

/*
// In SessionTabs.tsx, add:

import { Download } from 'lucide-react'
import { ExportDialog } from './ExportDialog'
import { useState } from 'react'

// In the SessionTabs component:
const [exportDialogOpen, setExportDialogOpen] = useState(false)
const [threadToExport, setThreadToExport] = useState<string | null>(null)

// Add export handler:
const handleExportClick = (e: React.MouseEvent, threadId: string) => {
  e.stopPropagation()
  setThreadToExport(threadId)
  setExportDialogOpen(true)
}

// In the SessionTab component, add an export button:
<button
  onClick={(e) => handleExportClick(e, threadId)}
  className="p-0.5 rounded hover:bg-primary/20 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
  title="Export session"
>
  <Download size={12} />
</button>

// Add the dialog at the end:
<ExportDialog
  isOpen={exportDialogOpen}
  threadId={threadToExport}
  onClose={() => {
    setExportDialogOpen(false)
    setThreadToExport(null)
  }}
/>
*/
