import { useState, useEffect, useRef, useId } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useDialogKeyboardShortcut } from '../../hooks/useDialogKeyboardShortcut'

interface RenameDialogProps {
  isOpen: boolean
  title: string
  currentName: string
  onConfirm: (newName: string) => void
  onCancel: () => void
  /**
   * Placeholder text for the input field
   * @default 'Enter name...'
   */
  placeholder?: string
  /**
   * Label for the rename button
   * @default 'Rename'
   */
  confirmText?: string
  /**
   * Label for the cancel button
   * @default 'Cancel'
   */
  cancelText?: string
}

export function RenameDialog({
  isOpen,
  title,
  currentName,
  onConfirm,
  onCancel,
  placeholder = 'Enter name...',
  confirmText = 'Rename',
  cancelText = 'Cancel',
}: RenameDialogProps) {
  const [name, setName] = useState(currentName)
  const inputRef = useRef<HTMLInputElement>(null)

  // Generate unique IDs for ARIA attributes
  const titleId = useId()
  const inputId = useId()
  const descriptionId = useId()

  // Use focus trap hook for keyboard navigation
  const containerRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onCancel,
    initialFocusRef: inputRef,
    restoreFocus: true,
  })

  // Detect reduced motion preference
  const prefersReducedMotion = useReducedMotion()

  // Use keyboard shortcut hook for Cmd+Enter (or Ctrl+Enter on Windows/Linux)
  // When input is focused, plain Enter submits the form, Cmd+Enter also submits
  useDialogKeyboardShortcut({
    isOpen,
    onConfirm: () => {
      const trimmedName = name.trim()
      if (trimmedName && trimmedName !== currentName) {
        onConfirm(trimmedName)
      }
    },
    onCancel,
    requireModifierKey: false,
    inputRef,
  })

  // Reset name when dialog opens - legitimate state initialization
  useEffect(() => {
    if (!isOpen) {
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initializing form state when dialog opens
    setName(currentName)
    // Select text after dialog opens (focus is handled by useFocusTrap)
    const timeoutId = setTimeout(() => {
      inputRef.current?.select()
    }, 50)

    return () => clearTimeout(timeoutId)
  }, [isOpen, currentName, onCancel, onConfirm])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName && trimmedName !== currentName) {
      onConfirm(trimmedName)
    } else {
      onCancel()
    }
  }

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  if (!isOpen) return null

  const isNameValid = name.trim().length > 0
  const hasChanged = name.trim() !== currentName

  // Animation classes based on motion preference
  const animationClass = prefersReducedMotion
    ? '' // No animation for reduced motion
    : 'animate-in zoom-in-95 duration-200'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="presentation"
      aria-hidden="false"
    >
      <div
        ref={containerRef}
        className={`w-full max-w-sm rounded-[2rem] bg-card p-8 shadow-2xl border border-border/50 ${animationClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <h2
          id={titleId}
          className="mb-2 text-xl font-bold tracking-tight"
        >
          {title}
        </h2>

        <p
          id={descriptionId}
          className="mb-4 text-sm text-muted-foreground"
        >
          Enter a new name below. Press Enter to confirm or Escape to cancel.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-6">
            <label htmlFor={inputId} className="sr-only">
              New name
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              placeholder={placeholder}
              aria-invalid={!isNameValid}
              aria-describedby={!isNameValid ? `${inputId}-error` : undefined}
              autoComplete="off"
              spellCheck="false"
            />
            {!isNameValid && name.length > 0 && (
              <p
                id={`${inputId}-error`}
                className="mt-2 text-sm text-destructive"
                role="alert"
              >
                Name cannot be empty or contain only spaces
              </p>
            )}
          </div>

          <div
            className="flex justify-end gap-3"
            role="group"
            aria-label="Dialog actions"
          >
            <button
              type="button"
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              onClick={onCancel}
              aria-label={`${cancelText}, close dialog without saving`}
            >
              {cancelText}
            </button>
            <button
              type="submit"
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              disabled={!isNameValid || !hasChanged}
              aria-label={
                !isNameValid
                  ? 'Cannot rename: name is invalid'
                  : !hasChanged
                    ? 'Cannot rename: name has not changed'
                    : `${confirmText} to "${name.trim()}"`
              }
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
