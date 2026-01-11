/**
 * Preloading utilities for lazy-loaded components
 * Separated from LazyComponents.tsx to comply with React Fast Refresh rules
 */

/**
 * Preload SettingsDialog component
 */
export function preloadSettingsDialog(): void {
  void import('../components/settings/SettingsDialog')
}

/**
 * Preload ProjectSettingsDialog component
 */
export function preloadProjectSettingsDialog(): void {
  void import('../components/dialogs/ProjectSettingsDialog')
}

/**
 * Preload ReviewSelectorDialog component
 */
export function preloadReviewSelectorDialog(): void {
  void import('../components/dialogs/ReviewSelectorDialog')
}

/**
 * Preload SnapshotListDialog component
 */
export function preloadSnapshotListDialog(): void {
  void import('../components/dialogs/SnapshotListDialog')
}

/**
 * Preload KeyboardShortcutsDialog component
 */
export function preloadKeyboardShortcutsDialog(): void {
  void import('../components/dialogs/KeyboardShortcutsDialog')
}

/**
 * Preload HelpDialog component
 */
export function preloadHelpDialog(): void {
  void import('../components/dialogs/HelpDialog')
}

/**
 * Preload AboutDialog component
 */
export function preloadAboutDialog(): void {
  void import('../components/dialogs/AboutDialog')
}

/**
 * Preload all dialogs (useful during idle time)
 */
export function preloadAllDialogs(): void {
  preloadSettingsDialog()
  preloadProjectSettingsDialog()
  preloadReviewSelectorDialog()
  preloadSnapshotListDialog()
  preloadKeyboardShortcutsDialog()
  preloadHelpDialog()
  preloadAboutDialog()
}
