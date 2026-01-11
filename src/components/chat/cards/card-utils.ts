/**
 * Card utilities and constants
 *
 * Shared utilities for card components including status configuration,
 * formatting functions, and style utilities.
 */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type CardStatus = 'pending' | 'running' | 'completed' | 'failed' | 'warning'

// -----------------------------------------------------------------------------
// Status Configuration
// -----------------------------------------------------------------------------

interface StatusConfig {
  borderColor: string
  dotColor: string
  textColor: string
  badgeBg: string
}

export const STATUS_CONFIG: Record<CardStatus, StatusConfig> = {
  pending: {
    borderColor: 'border-l-yellow-500',
    dotColor: 'bg-yellow-500',
    textColor: 'text-yellow-600 dark:text-yellow-400',
    badgeBg: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  running: {
    borderColor: 'border-l-blue-500',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-600 dark:text-blue-400',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  completed: {
    borderColor: 'border-l-green-500',
    dotColor: 'bg-green-500',
    textColor: 'text-green-600 dark:text-green-400',
    badgeBg: 'bg-green-100 dark:bg-green-900/30',
  },
  failed: {
    borderColor: 'border-l-red-500',
    dotColor: 'bg-red-500',
    textColor: 'text-red-600 dark:text-red-400',
    badgeBg: 'bg-red-100 dark:bg-red-900/30',
  },
  warning: {
    borderColor: 'border-l-orange-500',
    dotColor: 'bg-orange-500',
    textColor: 'text-orange-600 dark:text-orange-400',
    badgeBg: 'bg-orange-100 dark:bg-orange-900/30',
  },
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Get border color based on status or custom color
 */
export function getBorderClass(status?: CardStatus, customColor?: string): string {
  if (customColor) return customColor
  if (status && STATUS_CONFIG[status]) {
    return `border-l-4 ${STATUS_CONFIG[status].borderColor} border-y-border/50 border-r-border/50`
  }
  return 'border-border/50'
}

/**
 * Format duration in ms to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Get status config for a given status
 */
export function getStatusConfig(status: CardStatus): StatusConfig | undefined {
  return STATUS_CONFIG[status]
}
