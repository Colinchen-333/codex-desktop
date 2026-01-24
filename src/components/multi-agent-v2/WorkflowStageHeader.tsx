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
  onRecoverTimeout?: (phaseId: string) => void
}

// Phase icons mapping by kind
const PHASE_ICONS: Record<string, React.ReactNode> = {
  explore: <Search className="w-4 h-4" />,
  design: <FileText className="w-4 h-4" />,
  review: <Eye className="w-4 h-4" />,
  implement: <Code className="w-4 h-4" />,
  custom: <Loader2 className="w-4 h-4" />,
}

function WorkflowStageHeaderComponent({ workflow, onRetryWorkflow, onRecoverTimeout }: WorkflowStageHeaderProps) {
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
          {PHASE_ICONS[phase.kind] || <Loader2 className="w-4 h-4" />}
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping" />
        </div>
      )
    }
    if (phase.status === 'awaiting_approval' || phase.status === 'approval_timeout') {
      return <Clock className="w-5 h-5" />
    }
    return PHASE_ICONS[phase.kind] || <span className="text-sm font-semibold">{index + 1}</span>
  }

  const getPhaseRationale = (phase: WorkflowPhase) => {
    switch (phase.kind) {
      case 'explore':
        return '分析代码库结构，发现相关文件和模式'
      case 'design':
        return '制定实施方案，确定变更策略'
      case 'review':
        return '验证方案可行性，检查潜在风险'
      case 'implement':
        return '执行代码变更，运行测试验证'
      default:
        return phase.description
    }
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
    return 'bg-gray-200 dark:bg-gray-700'
  }

  return (
    <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-6 py-4 sticky top-0 z-10 transition-colors duration-300">
      <div className="max-w-5xl mx-auto">
        {/* Workflow Title & Status - Compact Row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{workflow.name}</h2>
            <div className={cn(
              "px-2.5 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wider",
              workflow.status === 'running'
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                : workflow.status === 'completed'
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : workflow.status === 'failed'
                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            )}>
              {workflow.status === 'running' ? 'EXECUTING' :
               workflow.status === 'completed' ? 'COMPLETED' :
               workflow.status === 'failed' ? 'FAILED' : 'PENDING'}
            </div>
          </div>
          
          {workflow.status === 'failed' && onRetryWorkflow && (
            <button
              onClick={onRetryWorkflow}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-all shadow-sm hover:shadow"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Workflow</span>
            </button>
          )}
        </div>

        {/* Phase Progress - Minimalist Design */}
        <div className="flex items-center relative">
          {phases.map((phase, index) => {
            const styles = getPhaseStyles(phase, index)
            const isActive = index === currentPhaseIndex
            
            return (
              <div key={phase.id} className="flex items-center flex-1 last:flex-none">
                {/* Phase Point */}
                <div className="relative flex flex-col items-center group z-10">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500',
                      styles.circle,
                      isActive ? 'scale-110 shadow-xl ring-4 ring-white dark:ring-gray-900' : 'scale-100'
                    )}
                  >
                    {getPhaseIcon(phase, index)}
                  </div>
                  
                    {/* Phase Label - Absolute positioning to avoid layout shift */}
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-32 text-center">
                      <p className={cn(
                        'text-xs font-bold uppercase tracking-wider transition-colors duration-300',
                        styles.label
                      )}>
                        {phase.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight opacity-70">
                        {getPhaseRationale(phase)}
                      </p>
                      {/* Minimal status indicator below label */}
                    {phase.status === 'running' && (
                      <p className="text-[10px] text-blue-500 font-medium animate-pulse mt-0.5">Running...</p>
                    )}
                    {(phase.status === 'awaiting_approval' || phase.status === 'approval_timeout') && (
                      <div className="flex flex-col items-center">
                        <p className="text-[10px] text-amber-500 font-bold mt-0.5">NEEDS APPROVAL</p>
                        {phase.status === 'approval_timeout' && onRecoverTimeout && (
                          <button
                            onClick={() => onRecoverTimeout(phase.id)}
                            className="mt-1 px-2 py-0.5 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded hover:bg-orange-200 transition-colors"
                          >
                            Recover
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Connector Line */}
                {index < phases.length - 1 && (
                  <div className="flex-1 mx-2 h-0.5 bg-gray-100 dark:bg-gray-800 relative overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'absolute inset-0 transition-transform duration-700 origin-left',
                        getConnectorStyle(phase),
                        phase.status === 'completed' ? 'scale-x-100' : 
                        phase.status === 'running' ? 'scale-x-50 opacity-50' : 'scale-x-0'
                      )}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        
        {/* Spacer for absolute labels */}
        <div className="h-6" />
      </div>
    </div>
  )
}

export const WorkflowStageHeader = memo(WorkflowStageHeaderComponent)
