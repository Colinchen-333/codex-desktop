/**
 * WorkflowStageHeader - Display workflow phases progress
 *
 * Features:
 * - 4 phases (Explore > Design > Review > Implement)
 * - Animated progress indicator
 * - Phase transitions with smooth animations
 * - Dark mode support
 * - Running phase pulse effect
 */

import { memo } from 'react'
import { Check, AlertCircle, Search, FileText, Eye, Code, Loader2, RotateCcw, Clock } from 'lucide-react'
import type { Workflow, WorkflowPhase } from '../../stores/multi-agent-v2'
import { cn } from '../../lib/utils'

interface WorkflowStageHeaderProps {
  workflow: Workflow
  onRetryWorkflow?: () => void
}

// Phase icons mapping
const PHASE_ICONS: Record<string, React.ReactNode> = {
  explore: <Search className="w-4 h-4" />,
  design: <FileText className="w-4 h-4" />,
  review: <Eye className="w-4 h-4" />,
  implement: <Code className="w-4 h-4" />,
}

function WorkflowStageHeaderComponent({ workflow, onRetryWorkflow }: WorkflowStageHeaderProps) {
  const { phases, currentPhaseIndex } = workflow

  const getPhaseIcon = (phase: WorkflowPhase, index: number) => {
    if (phase.status === 'completed') {
      return <Check className="w-5 h-5" />
    }
    if (phase.status === 'failed') {
      return <AlertCircle className="w-5 h-5" />
    }
    if (phase.status === 'running') {
      return (
        <div className="relative">
          {PHASE_ICONS[phase.id] || <Loader2 className="w-4 h-4" />}
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping" />
        </div>
      )
    }
    if (phase.status === 'awaiting_approval' || phase.status === 'approval_timeout') {
      return <Clock className="w-5 h-5" />
    }
    return PHASE_ICONS[phase.id] || <span className="text-sm font-semibold">{index + 1}</span>
  }

  const getPhaseStyles = (phase: WorkflowPhase, index: number) => {
    const isCurrentPhase = index === currentPhaseIndex
    const isPastPhase = index < currentPhaseIndex

    if (phase.status === 'completed') {
      return {
        circle: 'bg-green-500 dark:bg-green-600 text-white shadow-lg shadow-green-500/30',
        label: 'text-green-700 dark:text-green-400',
      }
    }
    if (phase.status === 'failed') {
      return {
        circle: 'bg-red-500 dark:bg-red-600 text-white shadow-lg shadow-red-500/30',
        label: 'text-red-700 dark:text-red-400',
      }
    }
    if (phase.status === 'running') {
      return {
        circle: 'bg-blue-500 dark:bg-blue-600 text-white shadow-lg shadow-blue-500/40 animate-pulse',
        label: 'text-blue-700 dark:text-blue-400 font-semibold',
      }
    }
    if (phase.status === 'awaiting_approval') {
      return {
        circle: 'bg-amber-500 dark:bg-amber-600 text-white shadow-lg shadow-amber-500/30',
        label: 'text-amber-700 dark:text-amber-400 font-semibold',
      }
    }
    if (phase.status === 'approval_timeout') {
      return {
        circle: 'bg-orange-500 dark:bg-orange-600 text-white shadow-lg shadow-orange-500/30',
        label: 'text-orange-700 dark:text-orange-400',
      }
    }
    if (isCurrentPhase) {
      return {
        circle: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 ring-2 ring-blue-500/50',
        label: 'text-blue-700 dark:text-blue-400',
      }
    }
    if (isPastPhase) {
      return {
        circle: 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400',
        label: 'text-gray-600 dark:text-gray-400',
      }
    }
    return {
      circle: 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
      label: 'text-gray-500 dark:text-gray-400',
    }
  }

  const getConnectorStyle = (phase: WorkflowPhase) => {
    if (phase.status === 'completed') {
      return 'bg-green-500 dark:bg-green-600'
    }
    if (phase.status === 'awaiting_approval' || phase.status === 'approval_timeout') {
      return 'bg-amber-500 dark:bg-amber-600'
    }
    if (phase.status === 'running') {
      return 'bg-gradient-to-r from-blue-500 to-gray-300 dark:from-blue-600 dark:to-gray-700 animate-pulse'
    }
    return 'bg-gray-300 dark:bg-gray-700'
  }

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="max-w-4xl mx-auto">
        {/* Workflow Title */}
        <div className="mb-4">
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{workflow.name}</h2>
            <span className={cn(
              "px-2 py-0.5 text-xs font-medium rounded-full",
              workflow.status === 'running'
                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400"
                : workflow.status === 'completed'
                  ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                  : workflow.status === 'failed'
                    ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
            )}>
              {workflow.status === 'running' ? '运行中' :
               workflow.status === 'completed' ? '已完成' :
               workflow.status === 'failed' ? '失败' : '等待中'}
            </span>
            {workflow.status === 'failed' && onRetryWorkflow && (
              <button
                onClick={onRetryWorkflow}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>重试</span>
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{workflow.description}</p>
        </div>

        {/* Phase Progress */}
        <div className="flex items-center">
          {phases.map((phase, index) => {
            const styles = getPhaseStyles(phase, index)

            return (
              <div key={phase.id} className="flex items-center flex-1">
                {/* Phase Circle & Info */}
                <div className="flex flex-col items-center group">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 transform group-hover:scale-110',
                      styles.circle
                    )}
                  >
                    {getPhaseIcon(phase, index)}
                  </div>
                  <div className="mt-2 text-center">
                    <p className={cn('text-xs font-medium transition-colors', styles.label)}>
                      {phase.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {phase.agentIds.length} 代理
                    </p>

                    {phase.requiresApproval &&
                      (phase.status === 'awaiting_approval' || phase.status === 'approval_timeout') &&
                      index === currentPhaseIndex && (
                        <span className="mt-2 inline-block px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                          {phase.status === 'approval_timeout' ? '审批超时' : '等待审批'}
                        </span>
                      )}
                  </div>
                </div>

                {/* Connector Line - Enhanced */}
                {index < phases.length - 1 && (
                  <div className="flex-1 mx-3 relative">
                    {/* Background track */}
                    <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    {/* Progress fill */}
                    <div
                      className={cn(
                        'absolute top-0 left-0 h-1 rounded-full transition-all duration-500',
                        getConnectorStyle(phase),
                        phase.status === 'completed' ? 'w-full' :
                        phase.status === 'running' ? 'w-1/2' : 'w-0'
                      )}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Current Phase Description */}
        {phases[currentPhaseIndex] && (
          <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                phases[currentPhaseIndex].status === 'running'
                  ? "bg-blue-500 animate-pulse"
                  : phases[currentPhaseIndex].status === 'completed'
                    ? "bg-green-500"
                    : "bg-gray-400"
              )} />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                当前阶段：{phases[currentPhaseIndex].name}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-4">
              {phases[currentPhaseIndex].description}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export const WorkflowStageHeader = memo(WorkflowStageHeaderComponent)
