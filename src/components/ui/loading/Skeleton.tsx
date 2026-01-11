import { cn } from '../../lib/utils'

/**
 * Base Skeleton component for loading states
 * Provides a shimmer animation effect for placeholder content
 */
interface SkeletonProps {
  className?: string
  animate?: boolean
}

export function Skeleton({ className, animate = true }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-secondary/50',
        animate && 'animate-pulse',
        className
      )}
    />
  )
}

/**
 * Text line skeleton for simulating text content
 */
interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            // Last line is shorter for visual variety
            i === lines - 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  )
}

/**
 * Dialog skeleton for lazy-loaded dialog components
 * Provides a consistent loading state while dialogs are being loaded
 */
interface DialogSkeletonProps {
  title?: string
  className?: string
}

export function DialogSkeleton({ title = 'Loading...', className }: DialogSkeletonProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={cn(
          'w-full max-w-md rounded-lg bg-background shadow-xl animate-in zoom-in-95 duration-200',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-muted-foreground">{title}</h2>
          <Skeleton className="h-6 w-6 rounded" />
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Title skeleton */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>

          {/* Content skeleton */}
          <div className="space-y-3 pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
          </div>

          {/* Action area skeleton */}
          <div className="space-y-2 pt-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/**
 * Settings dialog skeleton with sidebar layout
 */
export function SettingsDialogSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-8">
      <div className="flex h-[600px] w-full max-w-4xl overflow-hidden rounded-[2rem] bg-card shadow-2xl border border-border/50 animate-in zoom-in-95 duration-200">
        {/* Sidebar skeleton */}
        <div className="w-60 bg-secondary/30 p-6 border-r border-border/50 flex flex-col gap-1">
          <div className="mb-6 px-2 py-2">
            <Skeleton className="h-7 w-24" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>

        {/* Content skeleton */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto space-y-6">
              <Skeleton className="h-8 w-32" />
              <div className="space-y-4">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-border/50 bg-background/50 px-6 py-4">
            <Skeleton className="h-10 w-20 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * List dialog skeleton for dialogs with scrollable lists
 */
export function ListDialogSkeleton({ title = 'Loading...' }: { title?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-muted-foreground">{title}</h2>
          <Skeleton className="h-6 w-6 rounded" />
        </div>

        {/* List content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <Skeleton className="h-8 w-8 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-6 py-4">
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/**
 * Form dialog skeleton for dialogs with form inputs
 */
export function FormDialogSkeleton({ title = 'Loading...' }: { title?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-muted-foreground">{title}</h2>
            <Skeleton className="h-4 w-48 mt-1" />
          </div>
          <Skeleton className="h-6 w-6 rounded" />
        </div>

        {/* Form content */}
        <div className="p-6 space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Skeleton className="h-10 w-20 rounded-lg" />
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
