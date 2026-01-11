import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { ErrorBoundary } from './ui/ErrorBoundary'
import {
  DialogSkeleton,
  SettingsDialogSkeleton,
  ListDialogSkeleton,
  FormDialogSkeleton,
} from './ui/Skeleton'
import type { ReviewTarget } from '../lib/api'

/**
 * Lazy-loaded dialog components
 * Using React.lazy for code splitting to improve initial load time
 */

// ============================================================================
// Lazy Component Definitions
// ============================================================================

/**
 * SettingsDialog - Main application settings with tabbed interface
 * Estimated size: ~15KB (includes multiple tabs and form controls)
 */
export const LazySettingsDialog = lazy(
  () => import('./settings/SettingsDialog').then((m) => ({ default: m.SettingsDialog }))
)

/**
 * ProjectSettingsDialog - Per-project settings (model, sandbox, env vars)
 * Estimated size: ~8KB
 */
export const LazyProjectSettingsDialog = lazy(
  () => import('./dialogs/ProjectSettingsDialog').then((m) => ({ default: m.ProjectSettingsDialog }))
)

/**
 * ReviewSelectorDialog - Git review target selection
 * Estimated size: ~6KB
 */
export const LazyReviewSelectorDialog = lazy(
  () => import('./dialogs/ReviewSelectorDialog').then((m) => ({ default: m.ReviewSelectorDialog }))
)

/**
 * SnapshotListDialog - List and manage snapshots
 * Estimated size: ~5KB
 */
export const LazySnapshotListDialog = lazy(
  () => import('./dialogs/SnapshotListDialog').then((m) => ({ default: m.SnapshotListDialog }))
)

/**
 * KeyboardShortcutsDialog - Display keyboard shortcuts
 * Estimated size: ~3KB
 */
export const LazyKeyboardShortcutsDialog = lazy(
  () => import('./dialogs/KeyboardShortcutsDialog').then((m) => ({ default: m.KeyboardShortcutsDialog }))
)

/**
 * HelpDialog - Help and documentation
 * Estimated size: ~4KB
 */
export const LazyHelpDialog = lazy(
  () => import('./dialogs/HelpDialog').then((m) => ({ default: m.HelpDialog }))
)

/**
 * AboutDialog - Application information
 * Estimated size: ~3KB
 */
export const LazyAboutDialog = lazy(
  () => import('./dialogs/AboutDialog').then((m) => ({ default: m.AboutDialog }))
)

// ============================================================================
// Wrapper Components with Suspense and Error Boundaries
// ============================================================================

/**
 * Generic error fallback for lazy-loaded components
 */
function LazyErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-background shadow-xl p-6 text-center">
        <div className="text-4xl mb-4">!</div>
        <h3 className="text-lg font-semibold mb-2">Failed to load component</h3>
        <p className="text-sm text-muted-foreground mb-4">
          There was an error loading this dialog. Please try again.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Props type helper for lazy dialog components
 */
interface DialogProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Higher-order component that wraps a lazy component with Suspense and ErrorBoundary
 */
function withLazyLoading<P extends DialogProps>(
  LazyComponent: ComponentType<P>,
  fallback: ReactNode
) {
  return function LazyWrapper(props: P) {
    // Don't render anything if dialog is closed
    if (!props.isOpen) return null

    return (
      <ErrorBoundary fallback={<LazyErrorFallback onRetry={props.onClose} />}>
        <Suspense fallback={fallback}>
          <LazyComponent {...props} />
        </Suspense>
      </ErrorBoundary>
    )
  }
}

// ============================================================================
// Export Wrapped Components for Direct Use
// ============================================================================

/**
 * SettingsDialog with loading skeleton
 */
interface SettingsDialogLazyProps extends DialogProps {}

export const SettingsDialog = withLazyLoading<SettingsDialogLazyProps>(
  LazySettingsDialog as ComponentType<SettingsDialogLazyProps>,
  <SettingsDialogSkeleton />
)

/**
 * ProjectSettingsDialog with loading skeleton
 */
interface ProjectSettingsDialogProps extends DialogProps {
  projectId: string | null
}

export const ProjectSettingsDialog = withLazyLoading<ProjectSettingsDialogProps>(
  LazyProjectSettingsDialog as ComponentType<ProjectSettingsDialogProps>,
  <FormDialogSkeleton title="Project Settings" />
)

/**
 * ReviewSelectorDialog with loading skeleton
 */
interface ReviewSelectorDialogProps extends DialogProps {
  onSelect: (target: ReviewTarget) => void | Promise<void>
  projectPath: string
}

export const ReviewSelectorDialog = withLazyLoading<ReviewSelectorDialogProps>(
  LazyReviewSelectorDialog as ComponentType<ReviewSelectorDialogProps>,
  <ListDialogSkeleton title="Review Target" />
)

/**
 * SnapshotListDialog with loading skeleton
 */
interface SnapshotListDialogLazyProps extends DialogProps {}

export const SnapshotListDialog = withLazyLoading<SnapshotListDialogLazyProps>(
  LazySnapshotListDialog as ComponentType<SnapshotListDialogLazyProps>,
  <ListDialogSkeleton title="Snapshots" />
)

/**
 * KeyboardShortcutsDialog with loading skeleton
 */
interface KeyboardShortcutsDialogLazyProps extends DialogProps {}

export const KeyboardShortcutsDialog = withLazyLoading<KeyboardShortcutsDialogLazyProps>(
  LazyKeyboardShortcutsDialog as ComponentType<KeyboardShortcutsDialogLazyProps>,
  <ListDialogSkeleton title="Keyboard Shortcuts" />
)

/**
 * HelpDialog with loading skeleton
 */
interface HelpDialogLazyProps extends DialogProps {}

export const HelpDialog = withLazyLoading<HelpDialogLazyProps>(
  LazyHelpDialog as ComponentType<HelpDialogLazyProps>,
  <DialogSkeleton title="Help & Documentation" />
)

/**
 * AboutDialog with loading skeleton
 */
interface AboutDialogLazyProps extends DialogProps {}

export const AboutDialog = withLazyLoading<AboutDialogLazyProps>(
  LazyAboutDialog as ComponentType<AboutDialogLazyProps>,
  <DialogSkeleton title="About Codex Desktop" />
)

// ============================================================================
// Preloading utilities are exported from a separate file to comply with
// React Fast Refresh rules. Import from '../lib/lazyPreload' instead.
// ============================================================================
