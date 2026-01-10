import { useState, useEffect, useRef } from 'react'

interface RenameDialogProps {
  isOpen: boolean
  title: string
  currentName: string
  onConfirm: (newName: string) => void
  onCancel: () => void
}

export function RenameDialog({
  isOpen,
  title,
  currentName,
  onConfirm,
  onCancel,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset name when dialog opens - legitimate state initialization
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Initializing form state when dialog opens
  useEffect(() => {
    if (!isOpen) {
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initializing form state when dialog opens
    setName(currentName)
    // Focus and select text after dialog opens
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 50)
  }, [isOpen, currentName])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName && trimmedName !== currentName) {
      onConfirm(trimmedName)
    } else {
      onCancel()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-[2rem] bg-card p-8 shadow-2xl border border-border/50 animate-in zoom-in-95 duration-200">
        <h2 className="mb-6 text-xl font-bold tracking-tight">{title}</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="mb-6 w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            placeholder="Enter name..."
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
              disabled={!name.trim()}
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
