/**
 * PlanCard - Shows turn plan with step progress
 */
import { useState } from 'react'
import { ListChecks, Circle, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatTimestamp } from '../utils'
import type { PlanStep } from '../../../stores/thread'
import type { MessageItemProps, PlanContentType } from '../types'

export function PlanCard({ item }: MessageItemProps) {
  const content = item.content as PlanContentType
  const [isExpanded, setIsExpanded] = useState(true)

  // Get step status icon
  const getStepIcon = (status: PlanStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={14} className="text-green-500" />
      case 'in_progress':
        return <Loader2 size={14} className="text-blue-500 animate-spin" />
      case 'failed':
        return <XCircle size={14} className="text-red-500" />
      default:
        return <Circle size={14} className="text-muted-foreground/50" />
    }
  }

  // Calculate progress
  const completedSteps = content.steps.filter((s) => s.status === 'completed').length
  const totalSteps = content.steps.length
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
      <div
        className={cn(
          'w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.isActive
            ? 'border-l-4 border-l-blue-500 border-y-border/50 border-r-border/50'
            : 'border-border/50'
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border/40 bg-blue-50/50 dark:bg-blue-900/10 px-4 py-2.5 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'rounded-md p-1 shadow-sm',
                content.isActive
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              )}
            >
              <ListChecks size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">
              {content.isActive ? 'Executing Plan' : 'Plan Completed'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {completedSteps}/{totalSteps} steps
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress bar */}
            <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-150',
                  content.isActive ? 'bg-blue-500' : 'bg-green-500'
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
            <span className="text-muted-foreground text-xs">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-4 space-y-3">
            {/* Explanation */}
            {content.explanation && (
              <p className="text-sm text-muted-foreground mb-3">{content.explanation}</p>
            )}

            {/* Steps */}
            <div className="space-y-2">
              {content.steps.map((step, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-start gap-2.5 py-1.5 px-2 rounded-lg transition-colors',
                    step.status === 'in_progress' && 'bg-blue-50/50 dark:bg-blue-900/10',
                    step.status === 'completed' && 'opacity-70'
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0">{getStepIcon(step.status)}</div>
                  <span
                    className={cn(
                      'text-sm leading-relaxed',
                      step.status === 'completed' && 'line-through text-muted-foreground',
                      step.status === 'in_progress' && 'text-blue-700 dark:text-blue-300 font-medium',
                      step.status === 'failed' && 'text-red-700 dark:text-red-300',
                      step.status === 'pending' && 'text-muted-foreground'
                    )}
                  >
                    {step.step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
