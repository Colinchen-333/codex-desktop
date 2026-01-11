/**
 * StatusIndicator Component
 * Displays session/agent status with visual indicators
 */

import { cn } from '../../lib/utils'
import type { SessionStatus } from '../../lib/api'

interface StatusIndicatorProps {
  status: SessionStatus
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

// Status configuration with colors and labels
const statusConfig: Record<SessionStatus, {
  label: string
  labelCn: string
  dotColor: string
  bgColor: string
  textColor: string
  icon: string
}> = {
  idle: {
    label: 'Idle',
    labelCn: '空闲',
    dotColor: 'bg-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800/50',
    textColor: 'text-gray-600 dark:text-gray-400',
    icon: '',
  },
  running: {
    label: 'Running',
    labelCn: '运行中',
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/50',
    textColor: 'text-blue-600 dark:text-blue-400',
    icon: '',
  },
  completed: {
    label: 'Completed',
    labelCn: '任务完成',
    dotColor: 'bg-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/50',
    textColor: 'text-green-600 dark:text-green-400',
    icon: '',
  },
  failed: {
    label: 'Failed',
    labelCn: '失败',
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/50',
    textColor: 'text-red-600 dark:text-red-400',
    icon: '',
  },
  interrupted: {
    label: 'Interrupted',
    labelCn: '已中断',
    dotColor: 'bg-yellow-500',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/50',
    textColor: 'text-yellow-600 dark:text-yellow-400',
    icon: '',
  },
}

// Size configuration
const sizeConfig = {
  sm: {
    dot: 'w-1.5 h-1.5',
    text: 'text-xs',
    padding: 'px-1.5 py-0.5',
    gap: 'gap-1',
  },
  md: {
    dot: 'w-2 h-2',
    text: 'text-sm',
    padding: 'px-2 py-1',
    gap: 'gap-1.5',
  },
  lg: {
    dot: 'w-2.5 h-2.5',
    text: 'text-base',
    padding: 'px-3 py-1.5',
    gap: 'gap-2',
  },
}

export function StatusIndicator({
  status,
  size = 'sm',
  showLabel = false,
  className
}: StatusIndicatorProps) {
  const config = statusConfig[status] || statusConfig.idle
  const sizes = sizeConfig[size]

  // Pulsing animation for running status
  const isPulsing = status === 'running'

  return (
    <span
      className={cn(
        'inline-flex items-center',
        sizes.gap,
        showLabel && [sizes.padding, 'rounded-full', config.bgColor],
        className
      )}
    >
      <span
        className={cn(
          'rounded-full',
          sizes.dot,
          config.dotColor,
          isPulsing && 'animate-pulse'
        )}
      />
      {showLabel && (
        <span className={cn(sizes.text, config.textColor)}>
          {config.labelCn}
        </span>
      )}
    </span>
  )
}

// Icon size configuration
const iconSizeConfig = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

// Compact status icon component (for sidebar list items)
interface StatusIconProps {
  status: SessionStatus
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function StatusIcon({ status, size = 'md', className }: StatusIconProps) {
  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'
  const isRunning = status === 'running'
  const isInterrupted = status === 'interrupted'
  const sizeClass = iconSizeConfig[size]

  if (isCompleted) {
    return (
      <span className={cn('text-green-500 flex-shrink-0', className)} title="Completed">
        <svg className={sizeClass} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </span>
    )
  }

  if (isFailed) {
    return (
      <span className={cn('text-red-500 flex-shrink-0', className)} title="Failed">
        <svg className={sizeClass} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </span>
    )
  }

  if (isRunning) {
    return (
      <span className={cn('text-blue-500 flex-shrink-0', className)} title="Running">
        <svg className={cn(sizeClass, 'animate-spin')} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </span>
    )
  }

  if (isInterrupted) {
    return (
      <span className={cn('text-yellow-500 flex-shrink-0', className)} title="Interrupted">
        <svg className={sizeClass} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </span>
    )
  }

  // Idle status - no icon
  return null
}

export function getStatusLabel(status: SessionStatus): string {
  const config = statusConfig[status]
  return config ? config.labelCn : '未知'
}

export default StatusIndicator
