import { useRef } from 'react'
import { useDialogKeyboardShortcut } from '../../hooks/useDialogKeyboardShortcut'

interface HelpDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface HelpSection {
  title: string
  items: Array<{
    icon: string
    label: string
    description: string
  }>
}

const helpSections: HelpSection[] = [
  {
    title: 'Getting Started',
    items: [
      {
        icon: '📁',
        label: 'Add a Project',
        description: 'Click "Add Project" in the sidebar to select a folder containing your code.',
      },
      {
        icon: '💬',
        label: 'Start a Session',
        description: 'Select a project and click "New Session" to begin chatting with Codex.',
      },
      {
        icon: '📝',
        label: 'Review Changes',
        description: 'Codex will show you proposed changes in a diff view. Review and apply them safely.',
      },
    ],
  },
  {
    title: 'Keyboard Shortcuts',
    items: [
      {
        icon: '⌨️',
        label: '⌘ + Enter',
        description: 'Send message / Submit input',
      },
      {
        icon: '⌨️',
        label: '⌘ + K',
        description: 'Focus on the input field',
      },
      {
        icon: '⌨️',
        label: '⌘ + ,',
        description: 'Open Settings',
      },
      {
        icon: '⌨️',
        label: '⌘ + N',
        description: 'Start a new session',
      },
      {
        icon: '⌨️',
        label: 'Escape',
        description: 'Close dialogs / Cancel action',
      },
    ],
  },
  {
    title: 'Working with Files',
    items: [
      {
        icon: '📸',
        label: 'Snapshots',
        description: 'Snapshots are automatically created before changes are applied. Use them to revert if needed.',
      },
      {
        icon: '🔄',
        label: 'Revert Changes',
        description: 'Click the "Revert" button on any applied change or use the Snapshots panel.',
      },
      {
        icon: '📋',
        label: 'Paste Images',
        description: 'Paste or drag images into the chat input to include them in your message.',
      },
    ],
  },
  {
    title: 'Safety & Approval',
    items: [
      {
        icon: '🛡️',
        label: 'Sandbox Mode',
        description: 'Controls file system access. Use "Strict" for maximum safety.',
      },
      {
        icon: '✅',
        label: 'Approval Mode',
        description: 'Choose whether Codex asks for approval before running commands.',
      },
      {
        icon: '⚠️',
        label: 'Review Commands',
        description: 'Always review commands before approving. Click "Decline" if unsure.',
      },
    ],
  },
]

export function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Use keyboard shortcut hook for Escape to close
  useDialogKeyboardShortcut({
    isOpen,
    onConfirm: () => closeButtonRef.current?.click(),
    onCancel: onClose,
    requireModifierKey: false,
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Help & Documentation</h2>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[500px] overflow-y-auto p-6">
          <div className="space-y-6">
            {helpSections.map((section) => (
              <div key={section.title}>
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  {section.title}
                </h3>
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <span className="text-lg">{item.icon}</span>
                      <div>
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Additional Resources */}
          <div className="mt-6 rounded-lg border border-border bg-secondary/30 p-4">
            <h3 className="mb-2 text-sm font-semibold">Need More Help?</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <a
                  href="https://github.com/Colinchen-333/codex-desktop/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Report an Issue
                </a>
                {' - '}Found a bug? Let us know!
              </p>
              <p>
                <a
                  href="https://github.com/Colinchen-333/codex-desktop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View Documentation
                </a>
                {' - '}Full documentation on GitHub.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-6 py-4">
          <button
            ref={closeButtonRef}
            className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={onClose}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}
