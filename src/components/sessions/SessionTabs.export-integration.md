# Export Dialog Integration Guide

This guide shows how to integrate the Export functionality into the SessionTabs component.

## Step 1: Import the ExportDialog

Add this import to `SessionTabs.tsx`:

```typescript
import { ExportDialog } from './ExportDialog'
```

## Step 2: Add State for Export Dialog

Add these state variables in the SessionTabs component:

```typescript
const [exportDialogOpen, setExportDialogOpen] = useState(false)
const [threadToExport, setThreadToExport] = useState<string | null>(null)
```

## Step 3: Add Export Handler

Add this handler function in the SessionTabs component:

```typescript
const handleExportClick = (e: React.MouseEvent, threadId: string) => {
  e.stopPropagation()
  setThreadToExport(threadId)
  setExportDialogOpen(true)
}
```

## Step 4: Update SessionTab Component

Add an export button to the SessionTab component (inside the `<div>`):

```tsx
{/* Export button */}
<button
  onClick={(e) => {
    e.stopPropagation()
    handleExportClick(e, threadId)
  }}
  className={cn(
    'flex-shrink-0 p-0.5 rounded hover:bg-primary/20 hover:text-primary',
    'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
    isActive && 'opacity-60'
  )}
  title="Export session"
>
  <Download size={12} />
</button>
```

Also add the Download import at the top:

```typescript
import { X, Plus, MessageSquare, Loader2, Download } from 'lucide-react'
```

## Step 5: Add the ExportDialog Component

Add the ExportDialog component at the end of the SessionTabs return statement, before the closing fragment:

```tsx
<ExportDialog
  isOpen={exportDialogOpen}
  threadId={threadToExport}
  onClose={() => {
    setExportDialogOpen(false)
    setThreadToExport(null)
  }}
/>
```

## Full Example

Here's how the updated SessionTab component should look:

```tsx
const SessionTab = memo(function SessionTab({ threadId, threadState, isActive, onClick, onClose }: SessionTabProps) {
  const { thread, turnStatus, pendingApprovals } = threadState

  // ... existing code ...

  const handleExport = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // This would need to be passed from parent
    onExport?.(threadId)
  }, [threadId, onExport])

  return (
    <div
      onClick={handleClick}
      className={cn(/* existing classes */)}
    >
      {/* Status icon */}
      {/* ... existing code ... */}

      {/* Label */}
      {/* ... existing code ... */}

      {/* Task progress indicator */}
      {/* ... existing code ... */}

      {/* Export button - NEW */}
      <button
        onClick={handleExport}
        className={cn(
          'flex-shrink-0 p-0.5 rounded hover:bg-primary/20 hover:text-primary',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          isActive && 'opacity-60'
        )}
        title="Export session"
      >
        <Download size={12} />
      </button>

      {/* Close button */}
      {/* ... existing code ... */}
    </div>
  )
})
```

## Alternative: Add Export to Tab Header Area

If you prefer to have export in the tab header area (like the "New Session" button), add it there:

```tsx
{/* Export current session button */}
{focusedThreadId && (
  <button
    onClick={() => {
      setThreadToExport(focusedThreadId)
      setExportDialogOpen(true)
    }}
    className={cn(
      'flex items-center gap-1 px-2 py-1 rounded-md text-xs',
      'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
      'transition-colors duration-150'
    )}
    title="Export current session"
  >
    <Download size={14} />
  </button>
)}
```

## Testing

1. Open the application with multiple sessions
2. Hover over a session tab
3. Click the download icon that appears
4. Select export format (Markdown or JSON)
5. Choose export options
6. Click "Export"
7. Verify the file downloads correctly
