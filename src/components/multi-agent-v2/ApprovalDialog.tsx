/**
 * ApprovalDialog - Phase approval dialog
 *
 * Features:
 * - Display phase summary
 * - Show all agent outputs
 * - Approve/Reject/Adjust actions
 */

import { useState } from 'react'
import { CheckCircle, XCircle, Edit, ChevronDown, ChevronUp } from 'lucide-react'
import type { WorkflowPhase, AgentDescriptor } from '../../stores/multi-agent-v2'
import { useThreadStore } from '../../stores/thread'
import { getAgentTypeDisplayName, getAgentTypeIcon } from '../../lib/agent-utils'
import { useToast } from '../ui/Toast'

interface ApprovalDialogProps {
  phase: WorkflowPhase
  agents: AgentDescriptor[]
  onApprove: () => void
  onReject: (reason: string) => void
  onAdjust?: () => void
}

export function ApprovalDialog({
  phase,
  agents,
  onApprove,
  onReject,
  onAdjust,
}: ApprovalDialogProps) {
  const [rejectReason, setRejectReason] = useState('')
  const [isRejectMode, setIsRejectMode] = useState(false)
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const { showToast } = useToast()

  const phaseAgents = agents.filter((a) => phase.agentIds.includes(a.id))

  const toggleAgentExpanded = (agentId: string) => {
    setExpandedAgents((prev) => ({
      ...prev,
      [agentId]: !prev[agentId],
    }))
  }

  const handleReject = () => {
    if (!rejectReason.trim()) {
      showToast('请输入拒绝原因', 'warning')
      return
    }
    onReject(rejectReason)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-900 dark:bg-gray-100 rounded-full flex items-center justify-center text-white dark:text-gray-900">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                阶段审批：{phase.name}
              </h2>
              <p className="text-sm text-gray-500">{phase.description}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Phase Summary */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">阶段总结</h3>
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                本阶段共执行了 <span className="font-semibold">{phaseAgents.length}</span>{' '}
                个代理任务，所有任务已完成。请审查以下输出并决定是否继续下一阶段。
              </p>
            </div>
          </div>

          {/* Agent Outputs */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">代理输出</h3>
            {phaseAgents.map((agent, index) => (
              <AgentOutputCard
                key={agent.id}
                agent={agent}
                index={index}
                isExpanded={expandedAgents[agent.id] || false}
                onToggle={() => toggleAgentExpanded(agent.id)}
              />
            ))}
          </div>

          {/* Reject Mode */}
          {isRejectMode && (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                拒绝原因
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="请说明拒绝此阶段的原因..."
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              审批后将继续执行下一阶段
            </div>
            <div className="flex items-center space-x-3">
              {!isRejectMode ? (
                <>
                  {onAdjust && (
                    <button
                      onClick={onAdjust}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
                    >
                      <Edit className="w-4 h-4" />
                      <span>调整</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIsRejectMode(true)}
                    className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors flex items-center space-x-2"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>拒绝</span>
                  </button>
                  <button
                    onClick={onApprove}
                    className="px-6 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center space-x-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>批准并继续</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setIsRejectMode(false)
                      setRejectReason('')
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleReject}
                    className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center space-x-2"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>确认拒绝</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Agent Output Card Component
 */
function AgentOutputCard({
  agent,
  index,
  isExpanded,
  onToggle,
}: {
  agent: AgentDescriptor
  index: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const threadState = useThreadStore((state) => state.threads[agent.threadId])

  const getAgentOutput = (): { text: string; itemCount: number; types: string[] } => {
    if (!threadState) return { text: '无输出', itemCount: 0, types: [] }

    const relevantTypes = ['agentMessage', 'fileChange', 'commandExecution', 'error']
    const items = threadState.itemOrder
      .map((id) => threadState.items[id])
      .filter((item) => item && relevantTypes.includes(item.type))

    if (items.length === 0) return { text: '无输出', itemCount: 0, types: [] }

    const types = [...new Set(items.map((item) => item.type))]
    const lines: string[] = []

    for (const item of items) {
      if (item.type === 'agentMessage') {
        const text = (item.content as { text?: string })?.text
        if (text) lines.push(text)
      } else if (item.type === 'commandExecution') {
        const cmd = item.content as { command: string; output?: string; exitCode?: number }
        lines.push(`$ ${cmd.command}${cmd.exitCode !== undefined ? ` (exit ${cmd.exitCode})` : ''}`)
        if (cmd.output) lines.push(cmd.output.slice(0, 500))
      } else if (item.type === 'fileChange') {
        const fc = item.content as { changes: Array<{ path: string; kind: string }> }
        lines.push(`文件变更: ${fc.changes.map((c) => `${c.kind} ${c.path}`).join(', ')}`)
      } else if (item.type === 'error') {
        const err = item.content as { message: string }
        lines.push(`错误: ${err.message}`)
      }
    }

    return { text: lines.join('\n\n'), itemCount: items.length, types }
  }

  const { text: output, itemCount, types } = getAgentOutput()
  const preview = output.slice(0, 300) + (output.length > 300 ? '...' : '')

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="text-xl">{getAgentTypeIcon(agent.type)}</div>
          <div className="text-left">
            <h4 className="font-semibold text-gray-900">
              代理 {index + 1}: {getAgentTypeDisplayName(agent.type)}
            </h4>
            <p className="text-xs text-gray-500">{agent.task}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-400">{itemCount} 条记录</span>
              {types.length > 0 && (
                <span className="text-xs text-gray-400">({types.join(', ')})</span>
              )}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded ? (
        <div className="px-4 py-3 bg-white">
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-3 rounded">
              {output}
            </pre>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 bg-white">
          <p className="text-sm text-gray-600 line-clamp-3">{preview}</p>
        </div>
      )}
    </div>
  )
}
