/**
 * Custom Hooks Index
 *
 * Central export point for all custom React hooks.
 */

// Async operation management
export {
  useAsyncOperation,
  useAsyncCallback,
  type UseAsyncOperationOptions,
  type UseAsyncOperationReturn,
} from './useAsyncOperation'

// Optimistic update with rollback support
export {
  useOptimisticUpdate,
  useOptimisticStateUpdate,
  useBatchOptimisticUpdate,
  type UseOptimisticUpdateOptions,
  type UseOptimisticUpdateReturn,
  type UseOptimisticStateUpdateOptions,
  type BatchOptimisticOperation,
  type UseBatchOptimisticUpdateReturn,
} from './useOptimisticUpdate'

// Card expansion state management
export {
  useCardExpansion,
  useSingleCardExpansion,
  type UseCardExpansionOptions,
  type UseCardExpansionReturn,
} from './useCardExpansion'

// Focus trap for dialogs and modals
export {
  useFocusTrap,
  type UseFocusTrapOptions,
  type InitialFocusTarget,
} from './useFocusTrap'

// Keyboard shortcuts
export {
  useKeyboardShortcuts,
  formatShortcut,
  defaultShortcuts,
  type KeyboardShortcut,
} from './useKeyboardShortcuts'

// Popup navigation (for dropdowns, command palettes, etc.)
export {
  usePopupNavigation,
  type UsePopupNavigationOptions,
  type UsePopupNavigationReturn,
} from './usePopupNavigation'

// Reduced motion detection for accessibility
export {
  useReducedMotion,
  useAnimationDuration,
  useAnimationConfig,
  type AnimationConfig,
} from './useReducedMotion'

// Theme management
export { useTheme } from './useTheme'

// Command history for input navigation
export {
  useCommandHistory,
  type UseCommandHistoryOptions,
  type UseCommandHistoryReturn,
} from './useCommandHistory'

// Undo/Redo functionality
export {
  useUndoRedo,
  createMessageOperationState,
  createSnapshotOperationState,
  createClearThreadOperationState,
} from './useUndoRedo'

export {
  useUndoRedoShortcuts,
  getUndoRedoShortcutDisplay,
} from './useUndoRedoShortcuts'
