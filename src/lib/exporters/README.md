# Session Exporter

Exports session/thread data to various formats (Markdown, JSON).

## Features

- **Markdown Export**: Formatted Markdown document suitable for documentation and sharing
- **JSON Export**: Structured JSON data for programmatic processing
- **Configurable Options**: Include/exclude metadata and timestamps
- **Browser Download**: Automatically triggers file download

## Usage

### Basic Usage

```typescript
import { exportSession } from './lib/exporters'

// Export as Markdown
await exportSession('session-id', 'markdown', {
  includeMetadata: true,
  includeTimestamps: true,
})

// Export as JSON
await exportSession('session-id', 'json', {
  includeMetadata: true,
  includeTimestamps: true,
})
```

### Using the ExportDialog Component

```tsx
import { ExportDialog } from './components/sessions'
import { useState } from 'react'

function MyComponent() {
  const [isExportOpen, setIsExportOpen] = useState(false)
  const threadId = useThreadStore(state => state.focusedThreadId)

  return (
    <>
      <button onClick={() => setIsExportOpen(true)}>
        Export Session
      </button>

      <ExportDialog
        isOpen={isExportOpen}
        threadId={threadId}
        onClose={() => setIsExportOpen(false)}
      />
    </>
  )
}
```

## API

### `exportSession(sessionId, format, options)`

Exports a session to the specified format.

**Parameters:**

- `sessionId` (string): The session/thread ID to export
- `format` (`'markdown' | 'json'`): The export format
- `options` (object): Export options
  - `includeMetadata` (boolean, default: true): Include session metadata
  - `includeTimestamps` (boolean, default: true): Include item timestamps

**Returns:** `Promise<void>`

### `ExportDialog` Component

A dialog UI for exporting sessions.

**Props:**

- `isOpen` (boolean): Whether the dialog is open
- `threadId` (string | null): The thread ID to export
- `onClose` (() => void): Called when the dialog is closed

## Export Formats

### Markdown Format

```markdown
# Codex Session: [Title]

---

**Project**: `/path/to/project`
**Model**: gpt-4
**Provider**: openai
**Date**: 2025-01-10 14:30

---

## User

Fix the login bug

## Agent

I'll help you fix the login bug...

### Command

```bash
npm test
```

**Output**:
```
✓ All tests passed
```
```

### JSON Format

```json
{
  "metadata": {
    "id": "thread-id",
    "cwd": "/path/to/project",
    "model": "gpt-4",
    "modelProvider": "openai",
    "preview": "Fix login bug",
    "createdAt": 1704904200000
  },
  "items": [
    {
      "id": "item-id",
      "type": "userMessage",
      "status": "completed",
      "createdAt": 1704904200000,
      "content": {
        "text": "Fix the login bug"
      }
    }
  ]
}
```

## File Naming

Exported files are named using the pattern:

```
codex_[session-title]_[date].[extension]
```

Example: `codex_fix_login_bug_2025-01-10.md`
