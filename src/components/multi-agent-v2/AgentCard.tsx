/**
 * AgentCard - Display card for a single agent
 *
 * Shows agent status, task, progress, and output preview
 * Supports dark mode and provides retry functionality
 */

import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { ChevronDown, ChevronUp, X, Eye, Pause, Play, AlertCircle, RotateCcw, Loader2, Bell } from 'lucide-react'
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
  onRetry?: (agentId: string) => void
  /** Whether an operation is in progress for this agent */
  isOperating?: boolean
}

function AgentCardComponent({ agent, onViewDetails, onCancel, onPause, onResume, onRetry, isOperating }: AgentCardProps) {
  const [isTaskExpanded, setIsTaskExpanded] = useState(false)
  const threadState = useThreadStore((state) => state.threads[agent.threadId])

  const [localOperationInFlight, setLocalOperationInFlight] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const isButtonDisabled = isOperating || localOperationInFlight

  const resetOperationState = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setLocalOperationInFlight(false)
      timeoutRef.current = null
    }, 300)
  }, [])

  const handlePause = useCallback(() => {
    if (localOperationInFlight || isOperating) return
    setLocalOperationInFlight(true)
    onPause?.(agent.id)
    resetOperationState()
  }, [agent.id, onPause, isOperating, localOperationInFlight, resetOperationState])

  const handleResume = useCallback(() => {
    if (localOperationInFlight || isOperating) return
    setLocalOperationInFlight(true)
    onResume?.(agent.id)
    resetOperationState()
  }, [agent.id, onResume, isOperating, localOperationInFlight, resetOperationState])

  const handleCancel = useCallback(() => {
    if (localOperationInFlight || isOperating) return
    setLocalOperationInFlight(true)
    onCancel?.(agent.id)
    resetOperationState()
  }, [agent.id, onCancel, isOperating, localOperationInFlight, resetOperationState])

  const handleRetry = useCallback(() => {
    if (localOperationInFlight || isOperating) return
    setLocalOperationInFlight(true)
    onRetry?.(agent.id)
    resetOperationState()
  }, [agent.id, onRetry, isOperating, localOperationInFlight, resetOperationState])

  const outputLines = extractAgentOutput(threadState, 3)
  const progressPercentage = calculateProgressPercentage(agent.progress)
  const elapsedTime = getElapsedTime(agent)
  const isRunning = agent.status === 'running'
  const isPaused = agent.status === 'pending' && agent.interruptReason === 'pause'
  const pendingApprovalCount = threadState?.pendingApprovals?.length ?? 0
  const hasWaitingApprovals = pendingApprovalCount > 0

  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-gray-800 shadow-sm transition-all duration-200 hover:shadow-lg',
        'dark:border-gray-700',
        agent.status === 'error' && 'border-red-300 dark:border-red-500/50',
        agent.status === 'running' && 'border-blue-300 dark:border-blue-500/50 ring-2 ring-blue-100 dark:ring-blue-900/30',
        agent.status === 'completed' && 'border-green-300 dark:border-green-500/50',
        agent.status === 'cancelled' && 'border-gray-300 dark:border-gray-600 opacity-75'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b dark:border-gray-700 p-4">
        <div className="flex items-start space-x-3 flex-1">
          {/* Agent Icon with running animation */}
          <div className={cn(
            "text-2xl mt-1 transition-transform",
            isRunning && "animate-pulse"
          )}>
            {isRunning ? (
              <div className="relative">
                {getAgentTypeIcon(agent.type)}
                <Loader2 className="absolute -bottom-1 -right-1 w-3 h-3 text-blue-500 animate-spin" />
              </div>
            ) : (
              getAgentTypeIcon(agent.type)
            )}
          </div>

          {/* Agent Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
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
              {isPaused && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  已暂停
                </span>
              )}
              {hasWaitingApprovals && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center space-x-1 animate-pulse">
                  <Bell className="w-3 h-3" />
                  <span>待审批 {pendingApprovalCount}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ID: {agent.id.slice(0, 8)}
              {elapsedTime > 0 && ` • 耗时: ${formatElapsedTime(elapsedTime)}`}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1 ml-2">
          {isRunning && onPause && (
            <button
              onClick={handlePause}
              disabled={isButtonDisabled}
              className={cn(
                "p-1.5 rounded transition-colors",
                isButtonDisabled
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              )}
              title="暂停"
            >
              {isButtonDisabled ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </button>
          )}

          {isPaused && onResume && (
            <button
              onClick={handleResume}
              disabled={isButtonDisabled}
              className={cn(
                "p-1.5 rounded transition-colors",
                isButtonDisabled
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30"
              )}
              title="恢复"
            >
              {isButtonDisabled ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
          )}

          {onViewDetails && (
            <button
              onClick={() => onViewDetails(agent.id)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300 rounded transition-colors"
              title="查看详情"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}

          {canCancelAgent(agent) && onCancel && (
            <button
              onClick={handleCancel}
              disabled={isButtonDisabled}
              className={cn(
                "p-1.5 rounded transition-colors",
                isButtonDisabled
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
              )}
              title="取消"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Task Description */}
      <div className="p-4 border-b dark:border-gray-700">
        <button
          onClick={() => setIsTaskExpanded(!isTaskExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">任务</span>
          {isTaskExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        <p
          className={cn(
            'text-sm text-gray-600 dark:text-gray-400 mt-2',
            !isTaskExpanded && 'line-clamp-2'
          )}
        >
          {agent.task}
        </p>
      </div>

      {/* Progress */}
      {isRunning && (
        <div className="p-4 border-b dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">进度</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{progressPercentage}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300 animate-pulse"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Progress Description */}
          {agent.progress.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-1">
              {agent.progress.description}
            </p>
          )}
        </div>
      )}

      {agent.status === 'pending' && agent.progress.description && (
        <div className="px-4 pb-4 text-xs text-gray-500 dark:text-gray-400">
          {agent.progress.description}
        </div>
      )}

      {/* Output Preview */}
      {outputLines.length > 0 && (
        <div className="p-4 border-b dark:border-gray-700">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-2">最近输出</span>
          <div className="space-y-1">
            {outputLines.map((line, index) => (
              <p
                key={index}
                className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded truncate"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Error Display with Retry Button */}
      {agent.status === 'error' && agent.error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800 dark:text-red-400">错误</p>
              <p className="text-xs text-red-600 dark:text-red-300 mt-1">{agent.error.message}</p>
              {agent.error.recoverable && onRetry && (
                <button
                  onClick={handleRetry}
                  disabled={isButtonDisabled}
                  className={cn(
                    "mt-2 flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                    isButtonDisabled
                      ? "text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                      : "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60"
                  )}
                >
                  {isButtonDisabled ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  <span>{isButtonDisabled ? '重试中...' : '重试'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer - Dependencies */}
      {agent.dependencies.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400 rounded-b-xl">
          <span className="font-medium">依赖：</span>
          {agent.dependencies.map((depId) => depId.slice(0, 8)).join(', ')}
        </div>
      )}
    </div>
  )
}

export const AgentCard = memo(AgentCardComponent)
