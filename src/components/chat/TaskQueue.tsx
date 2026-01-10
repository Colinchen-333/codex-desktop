/**
 * TaskQueue Component
 * Displays a list of tasks with their status and interactive controls
 */

import { useMemo } from 'react'
import { CheckCircle2, Clock, XCircle, Loader2, X, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { TaskItem } from './TaskProgress'

interface TaskQueueProps {
  tasksJson: string | null
  status: 'idle' | 'running' | 'completed' | 'failed' | 'interrupted'
  showControls?: boolean
  onCancelTask?: (taskIndex: number) => void
  onRetryTask?: (taskIndex: number) => void
  onCancelAll?: () => void
  onRetryAll?: () => void
  className?: string
  maxVisible?: number
}

// Status icon configuration
const StatusIcon = ({ status, size = 'md' }: { status: TaskItem['status']; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClass = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size]

  switch (status) {
    case 'completed':
      return (
        <CheckCircle2 className={cn(sizeClass, 'text-green-500 flex-shrink-0')} />
      )
    case 'in_progress':
      return (
        <Loader2 className={cn(sizeClass, 'text-blue-500 flex-shrink-0 animate-spin')} />
      )
    case 'failed':
      return (
        <XCircle className={cn(sizeClass, 'text-red-500 flex-shrink-0')} />
      )
    case 'pending':
    default:
      return (
        <Clock className={cn(sizeClass, 'text-muted-foreground flex-shrink-0')} />
      )
  }
}

// Status label mapping
const statusLabels: Record<TaskItem['status'], string> = {
  completed: '已完成',
  in_progress: '进行中',
  failed: '失败',
  pending: '等待中',
}

// Parse tasks JSON safely
function parseTasks(tasksJson: string | null): TaskItem[] {
  if (!tasksJson) return []
  try {
    const parsed = JSON.parse(tasksJson)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('[TaskQueue] Failed to parse tasks JSON:', error)
    return []
  }
}

export function TaskQueue({
  tasksJson,
  status,
  showControls = false,
  onCancelTask,
  onRetryTask,
  onCancelAll,
  onRetryAll,
  className,
  maxVisible,
}: TaskQueueProps) {
  const tasks = useMemo(() => parseTasks(tasksJson), [tasksJson])

  // Determine visible tasks
  const visibleTasks = maxVisible ? tasks.slice(0, maxVisible) : tasks
  const hasMoreTasks = maxVisible && tasks.length > maxVisible
  const remainingCount = maxVisible ? Math.max(0, tasks.length - maxVisible) : 0

  // Calculate statistics
  const stats = useMemo(() => {
    const completed = tasks.filter((t) => t.status === 'completed').length
    const failed = tasks.filter((t) => t.status === 'failed').length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const pending = tasks.filter((t) => t.status === 'pending').length

    return {
      total: tasks.length,
      completed,
      failed,
      inProgress,
      pending,
    }
  }, [tasks])

  // Don't render if no tasks
  if (tasks.length === 0) {
    return null
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Header with statistics */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">任务队列</span>
          <span className="text-muted-foreground">({stats.total})</span>
        </div>

        {/* Global controls */}
        {showControls && status !== 'idle' && (
          <div className="flex items-center gap-1">
            {status === 'running' && onCancelAll && (
              <button
                onClick={onCancelAll}
                className={cn(
                  'px-2 py-1 text-xs rounded hover:bg-destructive/20 hover:text-destructive transition-colors'
                )}
              >
                取消全部
              </button>
            )}
            {(status === 'failed' || status === 'interrupted') && onRetryAll && (
              <button
                onClick={onRetryAll}
                className={cn(
                  'px-2 py-1 text-xs rounded hover:bg-primary/20 hover:text-primary transition-colors'
                )}
              >
                重试全部
              </button>
            )}
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="space-y-1">
        {visibleTasks.map((task, index) => {
          const canCancel = showControls && (task.status === 'pending' || task.status === 'in_progress') && onCancelTask
          const canRetry = showControls && task.status === 'failed' && onRetryTask

          return (
            <div
              key={index}
              className={cn(
                'group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors',
                'hover:bg-secondary/50',
                task.status === 'in_progress' && 'bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/30 dark:border-blue-800/30',
                task.status === 'completed' && 'bg-green-50/30 dark:bg-green-950/10',
                task.status === 'failed' && 'bg-red-50/30 dark:bg-red-950/10'
              )}
            >
              {/* Status icon */}
              <StatusIcon status={task.status} size="sm" />

              {/* Task content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground truncate">{task.content}</span>
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      'bg-muted text-muted-foreground',
                      task.status === 'in_progress' && 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
                      task.status === 'completed' && 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400',
                      task.status === 'failed' && 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                    )}
                  >
                    {statusLabels[task.status]}
                  </span>
                </div>
              </div>

              {/* Task controls */}
              {(canCancel || canRetry) && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canCancel && (
                    <button
                      onClick={() => onCancelTask!(index)}
                      className={cn(
                        'p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors'
                      )}
                      title="取消任务"
                      aria-label="Cancel task"
                    >
                      <X size={14} />
                    </button>
                  )}
                  {canRetry && (
                    <button
                      onClick={() => onRetryTask!(index)}
                      className={cn(
                        'p-1 rounded hover:bg-primary/20 hover:text-primary transition-colors'
                      )}
                      title="重试任务"
                      aria-label="Retry task"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Show remaining count */}
        {hasMoreTasks && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
            还有 {remainingCount} 个任务...
          </div>
        )}
      </div>

      {/* Summary footer */}
      <div className="flex items-center justify-between px-1 pt-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>已完成: {stats.completed}</span>
          <span>进行中: {stats.inProgress}</span>
          <span>等待中: {stats.pending}</span>
          {stats.failed > 0 && (
            <span className="text-red-500">失败: {stats.failed}</span>
          )}
        </div>
        {stats.total > 0 && (
          <span className="tabular-nums">
            {Math.round((stats.completed / stats.total) * 100)}%
          </span>
        )}
      </div>
    </div>
  )
}

// Compact horizontal version for inline display
interface TaskQueueCompactProps {
  tasksJson: string | null
  className?: string
  maxTasks?: number
}

export function TaskQueueCompact({
  tasksJson,
  className,
  maxTasks = 3,
}: TaskQueueCompactProps) {
  const tasks = useMemo(() => parseTasks(tasksJson), [tasksJson])
  const visibleTasks = tasks.slice(0, maxTasks)

  if (tasks.length === 0) {
    return null
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {visibleTasks.map((task, index) => (
        <div
          key={index}
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
            'bg-muted/50',
            task.status === 'in_progress' && 'bg-blue-100 dark:bg-blue-900/50 border border-blue-300/50',
            task.status === 'completed' && 'bg-green-100 dark:bg-green-900/50',
            task.status === 'failed' && 'bg-red-100 dark:bg-red-900/50'
          )}
          title={task.content}
        >
          <StatusIcon status={task.status} size="sm" />
          <span className="max-w-[80px] truncate">{task.content}</span>
        </div>
      ))}
      {tasks.length > maxTasks && (
        <span className="text-xs text-muted-foreground">+{tasks.length - maxTasks}</span>
      )}
    </div>
  )
}

export default TaskQueue
