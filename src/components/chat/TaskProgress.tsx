/**
 * TaskProgress Component
 * Displays task progress with animated progress bar, percentage, and step information
 */

import { useMemo, useState, useRef, useLayoutEffect } from 'react'
import { Loader2, X, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { SessionStatus } from '../../lib/types/thread'

// Task item interface from the data model
export interface TaskItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
}

interface TaskProgressProps {
  tasksJson: string | null
  status: SessionStatus
  size?: 'sm' | 'md' | 'lg'
  showCancel?: boolean
  onCancel?: () => void
  onRetry?: () => void
  className?: string
}

// Size configurations
const sizeConfig = {
  sm: {
    container: 'h-5',
    bar: 'h-1',
    text: 'text-xs',
    icon: 'w-3 h-3',
    button: 'p-0.5',
  },
  md: {
    container: 'h-6',
    bar: 'h-1.5',
    text: 'text-sm',
    icon: 'w-4 h-4',
    button: 'p-1',
  },
  lg: {
    container: 'h-8',
    bar: 'h-2',
    text: 'text-base',
    icon: 'w-5 h-5',
    button: 'p-1.5',
  },
}

// Parse tasks JSON safely
function parseTasks(tasksJson: string | null): TaskItem[] {
  if (!tasksJson) return []
  try {
    const parsed = JSON.parse(tasksJson)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('[TaskProgress] Failed to parse tasks JSON:', error)
    return []
  }
}

// Calculate progress percentage from tasks
function calculateProgress(tasks: TaskItem[]): {
  percentage: number
  currentStep: number
  totalSteps: number
  currentTask: TaskItem | null
} {
  const totalSteps = tasks.length
  if (totalSteps === 0) {
    return { percentage: 0, currentStep: 0, totalSteps: 0, currentTask: null }
  }

  const completedTasks = tasks.filter((t) => t.status === 'completed').length
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress')

  // Calculate percentage with partial progress for in-progress tasks
  let percentage = (completedTasks / totalSteps) * 100
  if (inProgressTasks.length > 0) {
    percentage += (50 / totalSteps) * inProgressTasks.length // Add 50% for each in-progress task
  }

  // Find current task
  const currentTask = inProgressTasks.length > 0 ? inProgressTasks[0] : null

  return {
    percentage: Math.min(Math.round(percentage), 100),
    currentStep: completedTasks + (inProgressTasks.length > 0 ? 1 : 0),
    totalSteps,
    currentTask,
  }
}

export function TaskProgress({
  tasksJson,
  status,
  size = 'md',
  showCancel = false,
  onCancel,
  onRetry,
  className,
}: TaskProgressProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const prevPercentageRef = useRef<number>(0)
  const sizes = sizeConfig[size]

  // Parse and calculate progress
  const { percentage, currentStep, totalSteps, currentTask } = useMemo(() => {
    const tasks = parseTasks(tasksJson)
    return calculateProgress(tasks)
  }, [tasksJson])

  // Determine if progress should be shown
  const shouldShow = status === 'running' && totalSteps > 0

  // Trigger animation on percentage change using useLayoutEffect to avoid flicker
  useLayoutEffect(() => {
    if (shouldShow && percentage > 0 && percentage !== prevPercentageRef.current) {
      prevPercentageRef.current = percentage
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Animation state requires synchronous update
      setIsAnimating(true)
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false)
        animationTimeoutRef.current = null
      }, 300)
    }
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
    }
  }, [percentage, shouldShow])

  if (!shouldShow) {
    return null
  }

  const canCancel = showCancel && onCancel
  const canRetry = false // No retry button in progress mode (only shown when running)

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg bg-secondary/30 px-2 py-1 transition-all duration-200',
        sizes.container,
        className
      )}
    >
      {/* Loading icon for running status */}
      {status === 'running' && (
        <Loader2 className={cn(sizes.icon, 'animate-spin text-blue-500 flex-shrink-0')} />
      )}

      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div className="relative w-full bg-muted rounded-full overflow-hidden" style={{ height: sizes.bar }}>
          <div
            className={cn(
              'absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-300 ease-out',
              isAnimating && 'transition-all duration-150'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Progress text */}
      <div className={cn('flex-shrink-0 tabular-nums', sizes.text, 'text-muted-foreground')}>
        {percentage}%
      </div>

      {/* Step information */}
      {currentTask && (
        <div
          className={cn(
            'flex-shrink-0 truncate max-w-[150px]',
            sizes.text,
            'text-muted-foreground'
          )}
          title={currentTask.content}
        >
          {currentStep}/{totalSteps}: {currentTask.content}
        </div>
      )}

      {/* Cancel button */}
      {canCancel && (
        <button
          onClick={onCancel}
          className={cn(
            'flex-shrink-0 rounded hover:bg-destructive/20 hover:text-destructive transition-colors',
            sizes.button
          )}
          title="Cancel task"
          aria-label="Cancel task"
        >
          <X className={sizes.icon} />
        </button>
      )}

      {/* Retry button for failed/interrupted status */}
      {canRetry && onRetry && (
        <button
          onClick={onRetry}
          className={cn(
            'flex-shrink-0 rounded hover:bg-primary/20 hover:text-primary transition-colors',
            sizes.button
          )}
          title="Retry task"
          aria-label="Retry task"
        >
          <RotateCcw className={sizes.icon} />
        </button>
      )}
    </div>
  )
}

// Compact version for inline display (e.g., in session tabs)
interface TaskProgressCompactProps {
  tasksJson: string | null
  status: SessionStatus
  className?: string
}

export function TaskProgressCompact({
  tasksJson,
  status,
  className,
}: TaskProgressCompactProps) {
  const { percentage, currentStep, totalSteps } = useMemo(() => {
    const tasks = parseTasks(tasksJson)
    return calculateProgress(tasks)
  }, [tasksJson])

  const shouldShow = status === 'running' && totalSteps > 0

  if (!shouldShow) {
    return null
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Mini progress bar */}
      <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Percentage */}
      <span className="text-xs text-muted-foreground tabular-nums">{percentage}%</span>

      {/* Step info */}
      {totalSteps > 0 && (
        <span className="text-xs text-muted-foreground/70">
          ({currentStep}/{totalSteps})
        </span>
      )}
    </div>
  )
}

// Mini indicator for session list items
interface TaskProgressIndicatorProps {
  tasksJson: string | null
  status: SessionStatus
  className?: string
}

export function TaskProgressIndicator({
  tasksJson,
  status,
  className,
}: TaskProgressIndicatorProps) {
  const { percentage } = useMemo(() => {
    const tasks = parseTasks(tasksJson)
    return calculateProgress(tasks)
  }, [tasksJson])

  const shouldShow = status === 'running' && percentage > 0

  if (!shouldShow) {
    return null
  }

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      title={`${percentage}% complete`}
    >
      {/* Animated dot */}
      <div className="relative w-2 h-2">
        <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-75" />
        <div className="absolute inset-0 bg-blue-500 rounded-full" />
      </div>

      {/* Small percentage */}
      <span className="text-xs text-blue-500 font-medium tabular-nums">{percentage}%</span>
    </div>
  )
}

export default TaskProgress
