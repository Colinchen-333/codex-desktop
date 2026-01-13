import { useMemo, useState } from 'react'

interface KeyboardShortcutsDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutGroup {
  title: string
  shortcuts: Array<{
    keys: string[]
    description: string
  }>
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: ['⌘', ','], description: 'Open settings' },
      { keys: ['⌘', 'K'], description: 'Focus message input' },
      { keys: ['⌘', 'N'], description: 'New session' },
      { keys: ['Esc'], description: 'Stop generation (double-tap) / Close dialogs' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', '1'], description: 'Switch to Projects tab' },
      { keys: ['⌘', '2'], description: 'Switch to Sessions tab' },
      { keys: ['↑', '↓'], description: 'Navigate message history (input)' },
    ],
  },
  {
    title: 'Chat Input',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message (input)' },
      { keys: ['Shift', 'Enter'], description: 'New line (input)' },
      { keys: ['/'], description: 'Show slash commands (input)' },
      { keys: ['@'], description: 'Mention file (input)' },
      { keys: ['⌘', 'V'], description: 'Paste image (input)' },
    ],
  },
  {
    title: 'Approval Actions',
    shortcuts: [
      { keys: ['Y'], description: 'Accept action' },
      { keys: ['N'], description: 'Decline action' },
      { keys: ['A'], description: 'Accept all for session' },
    ],
  },
]

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  if (!isOpen) return null

  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return SHORTCUT_GROUPS
    return SHORTCUT_GROUPS.map((group) => {
      const shortcuts = group.shortcuts.filter((shortcut) => {
        const haystack = `${shortcut.description} ${shortcut.keys.join(' ')}`.toLowerCase()
        return haystack.includes(normalizedQuery)
      })
      if (shortcuts.length === 0) return null
      return { ...group, shortcuts }
    }).filter(Boolean) as ShortcutGroup[]
  }, [normalizedQuery])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-background shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="shortcut-search">
              Search shortcuts
            </label>
            <input
              id="shortcut-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter by key or action"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {filteredGroups.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No shortcuts match your search.
            </div>
          )}

          {filteredGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <span key={j}>
                          <kbd className="min-w-[24px] h-6 px-1.5 inline-flex items-center justify-center rounded bg-secondary text-xs font-mono font-medium">
                            {key}
                          </kbd>
                          {j < shortcut.keys.length - 1 && (
                            <span className="text-muted-foreground mx-0.5">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1 py-0.5 bg-secondary rounded text-[10px]">Esc</kbd> or click outside to close
          </p>
        </div>
      </div>
    </div>
  )
}
