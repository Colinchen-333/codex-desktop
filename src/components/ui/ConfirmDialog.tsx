import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (!isOpen) return

    // Small delay to ensure dialog is rendered
    const timeoutId = setTimeout(() => {
      confirmButtonRef.current?.focus()
    }, 50)

    return () => clearTimeout(timeoutId)
  }, [isOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  if (!isOpen) return null

  const isDanger = variant === 'danger'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div
        className="w-full max-w-md rounded-[2rem] bg-card p-8 shadow-2xl border border-border/50 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="document"
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full ${
              isDanger
                ? 'bg-destructive/10 text-destructive'
                : 'bg-warning/10 text-warning'
            }`}
          >
            <AlertTriangle size={32} className={isDanger ? 'text-destructive' : 'text-warning'} />
          </div>
        </div>

        {/* Title */}
        <h2
          id="confirm-dialog-title"
          className="mb-3 text-xl font-bold tracking-tight text-center"
        >
          {title}
        </h2>

        {/* Message */}
        <p
          id="confirm-dialog-message"
          className="mb-6 text-center text-muted-foreground leading-relaxed"
        >
          {message}
        </p>

        {/* Buttons */}
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="rounded-xl px-6 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors min-w-[100px]"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-all min-w-[100px] shadow-lg ${
              isDanger
                ? 'bg-destructive hover:bg-destructive/90 shadow-destructive/20'
                : 'bg-warning hover:bg-warning/90 shadow-warning/20'
            }`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
