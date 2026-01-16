/**
 * AgentCard - Display card for a single agent
 *
 * Shows agent status, task, progress, and output preview
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, X, Eye, Pause, Play, AlertCircle } from 'lucide-react'
import type { AgentDescriptor } from '../../stores/multi-agent-v2'
import { useThreadStore } from '../../stores/thread'
import {
  formatAgentStatus,
  getStatusColor,
  getStatusBgColor,
  calculateProgressPercentage,
  extractAgentOutput,
  canCancelAgent,
  getElapsedTime,
  formatElapsedTime,
  getAgentTypeDisplayName,
  getAgentTypeIcon,
} from '../../lib/agent-utils'
import { cn } from '../../lib/utils'

interface AgentCardProps {
  agent: AgentDescriptor
  onViewDetails?: (agentId: string) => void
  onCancel?: (agentId: string) => void
  onPause?: (agentId: string) => void
  onResume?: (agentId: string) => void
}

export function AgentCard({ agent, onViewDetails, onCancel, onPause, onResume }: AgentCardProps) {
  const [isTaskExpanded, setIsTaskExpanded] = useState(false)
  const threadState = useThreadStore((state) => state.threads[agent.threadId])

  // Get output preview
  const outputLines = extractAgentOutput(threadState, 3)
  const progressPercentage = calculateProgressPercentage(agent.progress)
  const elapsedTime = getElapsedTime(agent)

  return (
    <div
      className={cn(
        'rounded-lg border bg-white shadow-sm transition-all hover:shadow-md',
        agent.status === 'error' && 'border-red-300',
        agent.status === 'running' && 'border-blue-300',
        agent.status === 'completed' && 'border-green-300'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b p-4">
        <div className="flex items-start space-x-3 flex-1">
          {/* Agent Icon */}
          <div className="text-2xl mt-1">{getAgentTypeIcon(agent.type)}</div>

          {/* Agent Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-gray-900">
                {getAgentTypeDisplayName(agent.type)} 代理
              </h3>
              <span
                className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  getStatusBgColor(agent.status),
                  getStatusColor(agent.status)
                )}
              >
                {formatAgentStatus(agent.status)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ID: {agent.id.slice(0, 8)}
              {elapsedTime > 0 && ` • 耗时: ${formatElapsedTime(elapsedTime)}`}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1 ml-2">
          {agent.status === 'running' && onPause && (
            <button
              onClick={() => onPause(agent.id)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="暂停"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}

          {agent.status === 'pending' && agent.interruptReason === 'pause' && onResume && (
            <button
              onClick={() => onResume(agent.id)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="恢复"
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          {onViewDetails && (
            <button
              onClick={() => onViewDetails(agent.id)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="查看详情"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}

          {canCancelAgent(agent) && onCancel && (
            <button
              onClick={() => onCancel(agent.id)}
              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
              title="取消"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Task Description */}
      <div className="p-4 border-b">
        <button
          onClick={() => setIsTaskExpanded(!isTaskExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-sm font-medium text-gray-700">任务</span>
          {isTaskExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        <p
          className={cn(
            'text-sm text-gray-600 mt-2',
            !isTaskExpanded && 'line-clamp-2'
          )}
        >
          {agent.task}
        </p>
      </div>

      {/* Progress */}
      {agent.status === 'running' && (
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700">进度</span>
            <span className="text-xs text-gray-500">{progressPercentage}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Progress Description */}
          {agent.progress.description && (
            <p className="text-xs text-gray-500 mt-2 line-clamp-1">
              {agent.progress.description}
            </p>
          )}
        </div>
      )}

      {agent.status === 'pending' && agent.progress.description && (
        <div className="px-4 pb-4 text-xs text-gray-500">
          {agent.progress.description}
        </div>
      )}

      {/* Output Preview */}
      {outputLines.length > 0 && (
        <div className="p-4 border-b">
          <span className="text-xs font-medium text-gray-700 block mb-2">最近输出</span>
          <div className="space-y-1">
            {outputLines.map((line, index) => (
              <p
                key={index}
                className="text-xs text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded truncate"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {agent.status === 'error' && agent.error && (
        <div className="p-4 bg-red-50">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">错误</p>
              <p className="text-xs text-red-600 mt-1">{agent.error.message}</p>
              {agent.error.recoverable && (
                <p className="text-xs text-red-500 mt-1">此错误可以重试</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer - Dependencies */}
      {agent.dependencies.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
          <span className="font-medium">依赖：</span>
          {agent.dependencies.map((depId) => depId.slice(0, 8)).join(', ')}
        </div>
      )}
    </div>
  )
}
