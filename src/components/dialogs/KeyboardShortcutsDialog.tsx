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
      { keys: ['Esc'], description: 'Stop generation / Close dialogs' },
      { keys: ['?'], description: 'Show this help' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', '1'], description: 'Switch to Projects tab' },
      { keys: ['⌘', '2'], description: 'Switch to Sessions tab' },
      { keys: ['↑', '↓'], description: 'Navigate through history' },
    ],
  },
  {
    title: 'Chat Input',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line' },
      { keys: ['/'], description: 'Show slash commands' },
      { keys: ['@'], description: 'Mention file' },
      { keys: ['⌘', 'V'], description: 'Paste image' },
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
          {SHORTCUT_GROUPS.map((group) => (
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
