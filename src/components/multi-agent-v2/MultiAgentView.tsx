/**
 * MultiAgentView - Main view for multi-agent mode
 *
 * Features:
 * - Workflow progress header (4 phases)
 * - Agent grid view (grouped by status)
 * - Agent detail panel (right side drawer)
 * - Real-time state updates from multi-agent store
 */

import { useState, useEffect } from 'react'
import { WorkflowStageHeader } from './WorkflowStageHeader'
import { AgentGridView } from './AgentGridView'
import { AgentDetailPanel } from './AgentDetailPanel'
import { ApprovalDialog } from './ApprovalDialog'
import { useMultiAgentStore } from '../../stores/multi-agent-v2'
import { cn } from '../../lib/utils'

export function MultiAgentView() {
  const agents = useMultiAgentStore((state) => Object.values(state.agents))
  const { workflow, approvePhase, rejectPhase, cancelAgent, pauseAgent, resumeAgent } =
    useMultiAgentStore()

  // Track selected agent for detail panel
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  
  // Track approval dialog
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [pendingApprovalPhaseId, setPendingApprovalPhaseId] = useState<string | null>(null)

  const selectedAgent = selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId)
    : null

  // Monitor workflow phases for approval requirement
  useEffect(() => {
    if (!workflow) return

    const currentPhase = workflow.phases[workflow.currentPhaseIndex]
    if (!currentPhase) return

    // Check if phase requires approval and all agents are complete
    if (
      currentPhase.requiresApproval &&
      currentPhase.status === 'completed' &&
      currentPhase.agentIds.length > 0
    ) {
      const phaseAgents = currentPhase.agentIds
        .map((id) => agents.find((a) => a.id === id))
        .filter(Boolean)

      const allCompleted = phaseAgents.every(
        (a) => a!.status === 'completed' || a!.status === 'error' || a!.status === 'cancelled'
      )

      if (allCompleted && !showApprovalDialog) {
        // Use setTimeout to avoid setState during effect
        setTimeout(() => {
          setPendingApprovalPhaseId(currentPhase.id)
          setShowApprovalDialog(true)
        }, 0)
      }
    }
  }, [workflow, agents, showApprovalDialog])

  const currentPhase = workflow && pendingApprovalPhaseId
    ? workflow.phases.find((p) => p.id === pendingApprovalPhaseId)
    : null

  const handleViewDetails = (agentId: string) => {
    setSelectedAgentId(agentId)
  }

  const handleCloseDetail = () => {
    setSelectedAgentId(null)
  }

  const handleCancel = (agentId: string) => {
    void cancelAgent(agentId)
  }

  const handlePause = (agentId: string) => {
    void pauseAgent(agentId)
  }

  const handleResume = (agentId: string) => {
    void resumeAgent(agentId)
  }

  const handleApprovePhase = (phaseId: string) => {
    void approvePhase(phaseId)
  }

  const handleApproval = () => {
    if (pendingApprovalPhaseId) {
      void approvePhase(pendingApprovalPhaseId)
      setShowApprovalDialog(false)
      setPendingApprovalPhaseId(null)
    }
  }

  const handleRejection = (reason: string) => {
    if (pendingApprovalPhaseId) {
      rejectPhase(pendingApprovalPhaseId, reason)
      setShowApprovalDialog(false)
      setPendingApprovalPhaseId(null)
    }
  }

  return (
    <>
      {/* Approval Dialog */}
      {showApprovalDialog && currentPhase && (
        <ApprovalDialog
          phase={currentPhase}
          agents={agents.filter((a) => currentPhase.agentIds.includes(a.id))}
          onApprove={handleApproval}
          onReject={handleRejection}
        />
      )}

      {/* Main View */}
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Workflow Header */}
      {workflow && (
        <WorkflowStageHeader workflow={workflow} onApprovePhase={handleApprovePhase} />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Agent Grid - Main Area */}
        <div
          className={cn(
            'flex-1 overflow-auto transition-all duration-300',
            selectedAgent ? 'mr-0' : ''
          )}
        >
          <div className="p-6">
            {agents.length === 0 && !workflow ? (
              // Empty state - no agents and no workflow
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <div className="text-6xl mb-4">🤖</div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    欢迎使用多智能体模式
                  </h2>
                  <p className="text-gray-600 mb-6 max-w-md">
                    创建代理或启动工作流，让多个专门化的 AI 代理协同完成复杂任务
                  </p>
                  <div className="flex items-center justify-center space-x-4">
                    <button
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      onClick={() => {
                        // TODO: Open setup dialog or workflow selector
                      }}
                    >
                      启动工作流
                    </button>
                    <button
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={() => {
                        // TODO: Open manual agent creation dialog
                      }}
                    >
                      手动创建代理
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <AgentGridView
                agents={agents}
                onViewDetails={handleViewDetails}
                onCancel={handleCancel}
                onPause={handlePause}
                onResume={handleResume}
              />
            )}
          </div>
        </div>

        {/* Agent Detail Panel - Right Side Drawer */}
        {selectedAgent && (
          <div className="w-[600px] flex-shrink-0 border-l border-gray-200 bg-white shadow-xl">
            <AgentDetailPanel agent={selectedAgent} onClose={handleCloseDetail} />
          </div>
        )}
      </div>

      {/* Bottom Status Bar (Optional) */}
      {agents.length > 0 && (
        <div className="border-t border-gray-200 bg-white px-6 py-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center space-x-6">
              <span>
                总计代理: <span className="font-semibold text-gray-900">{agents.length}</span>
              </span>
              <span>
                运行中:{' '}
                <span className="font-semibold text-blue-600">
                  {agents.filter((a) => a.status === 'running').length}
                </span>
              </span>
              <span>
                已完成:{' '}
                <span className="font-semibold text-green-600">
                  {agents.filter((a) => a.status === 'completed').length}
                </span>
              </span>
              <span>
                错误:{' '}
                <span className="font-semibold text-red-600">
                  {agents.filter((a) => a.status === 'error').length}
                </span>
              </span>
            </div>

            {workflow && (
              <div className="text-gray-500">
                工作流: <span className="font-medium text-gray-900">{workflow.name}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  )
}
