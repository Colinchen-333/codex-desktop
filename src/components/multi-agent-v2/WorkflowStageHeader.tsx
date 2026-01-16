/**
 * WorkflowStageHeader - Display workflow phases progress
 *
 * Shows 4 phases (Explore > Design > Review > Implement) with progress indicator
 */

import { Check, Clock, AlertCircle } from 'lucide-react'
import type { Workflow, WorkflowPhase } from '../../stores/multi-agent-v2'
import { cn } from '../../lib/utils'

interface WorkflowStageHeaderProps {
  workflow: Workflow
  onApprovePhase?: (phaseId: string) => void
}

export function WorkflowStageHeader({ workflow, onApprovePhase }: WorkflowStageHeaderProps) {
  const { phases, currentPhaseIndex } = workflow

  const getPhaseIcon = (phase: WorkflowPhase, index: number) => {
    if (phase.status === 'completed') {
      return <Check className="w-5 h-5" />
    }
    if (phase.status === 'failed') {
      return <AlertCircle className="w-5 h-5" />
    }
    if (phase.status === 'running') {
      return <Clock className="w-5 h-5 animate-pulse" />
    }
    return <span className="text-sm font-semibold">{index + 1}</span>
  }

  const getPhaseColor = (phase: WorkflowPhase, index: number) => {
    if (phase.status === 'completed') return 'bg-green-500 text-white'
    if (phase.status === 'failed') return 'bg-red-500 text-white'
    if (phase.status === 'running') return 'bg-blue-500 text-white'
    if (index === currentPhaseIndex) return 'bg-blue-200 text-blue-700'
    return 'bg-gray-200 text-gray-600'
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-4xl mx-auto">
        {/* Workflow Title */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{workflow.name}</h2>
          <p className="text-sm text-gray-500 mt-1">{workflow.description}</p>
        </div>

        {/* Phase Progress */}
        <div className="flex items-center justify-between">
          {phases.map((phase, index) => (
            <div key={phase.id} className="flex items-center flex-1">
              {/* Phase Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                    getPhaseColor(phase, index)
                  )}
                >
                  {getPhaseIcon(phase, index)}
                </div>
                <div className="mt-2 text-center">
                  <p className="text-xs font-medium text-gray-700">{phase.name}</p>
                  <p className="text-xs text-gray-500">{phase.agentIds.length} 代理</p>

                  {/* Approval Button */}
                  {phase.requiresApproval &&
                    phase.status === 'completed' &&
                    index === currentPhaseIndex &&
                    onApprovePhase && (
                      <button
                        onClick={() => onApprovePhase(phase.id)}
                        className="mt-2 px-3 py-1 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded"
                      >
                        批准继续
                      </button>
                    )}
                </div>
              </div>

              {/* Connector Line */}
              {index < phases.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2',
                    phase.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
