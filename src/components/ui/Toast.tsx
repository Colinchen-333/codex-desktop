import { useEffect, useState, useContext, useCallback, type NonNullable } from 'react'
import { cn } from '../../lib/utils'
import { ToastContext, type Toast } from './ToastContext'

// Toast provider
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((prev) => [...prev, { ...toast, id }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

// Toast container
function ToastContainer() {
  const { toasts, removeToast } = useContext(ToastContext) as NonNullable<ToastContextValue>

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

// Individual toast item
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      const timer = setTimeout(onDismiss, duration)
      return () => clearTimeout(timer)
    }
  }, [toast.duration, onDismiss])

  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  }

  const colors = {
    info: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
    success: 'border-green-500 bg-green-50 dark:bg-green-950/30',
    warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30',
    error: 'border-red-500 bg-red-50 dark:bg-red-950/30',
  }

  return (
    <div
      className={cn(
        'flex min-w-[300px] max-w-[400px] items-start gap-3 rounded-lg border-l-4 p-4 shadow-lg',
        colors[toast.type],
        'animate-in slide-in-from-right duration-300'
      )}
    >
      <span className="text-lg">{icons[toast.type]}</span>
      <div className="flex-1">
        <p className="font-medium">{toast.title}</p>
        {toast.message && <p className="mt-1 text-sm text-muted-foreground">{toast.message}</p>}
      </div>
      <button
        className="text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  )
}
