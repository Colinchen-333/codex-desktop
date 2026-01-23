/**
 * AgentDetailPanel - Right-side panel showing full agent output
 *
 * Features:
 * - Full message history from agent thread
 * - Multiple message types (agent, user, command, error, tool)
 * - Auto-scroll to bottom on new messages
 * - Dark mode support
 * - Closeable/minimizable
 */

import { useRef, useEffect } from 'react'
import { X, Minimize2, Terminal, AlertCircle, Wrench, User, Bot, ChevronDown, FileCode, Check, XCircle } from 'lucide-react'
import type { AgentDescriptor } from '../../stores/multi-agent-v2'
import { useThreadStore } from '../../stores/thread'
import { DiffView, parseDiff } from '../ui/DiffView'
import type { FileChangeContentType } from '../chat/types'
import {
  getAgentTypeDisplayName,
  getAgentTypeIcon,
  formatAgentStatus,
  getStatusColor,
  getStatusBgColor,
} from '../../lib/agent-utils'
import { cn } from '../../lib/utils'

interface AgentDetailPanelProps {
  agent: AgentDescriptor
  onClose: () => void
  onMinimize?: () => void
}

export function AgentDetailPanel({ agent, onClose, onMinimize }: AgentDetailPanelProps) {
  // Get thread state for this agent
  const threadState = useThreadStore((state) => state.threads[agent.threadId])

  // Auto-scroll ref
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollBottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollBottomRef.current && threadState?.itemOrder.length) {
      scrollBottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [threadState?.itemOrder.length])

  // Render message based on type
  const renderMessage = (itemId: string) => {
    const item = threadState?.items[itemId]
    if (!item) return null

    switch (item.type) {
      case 'agentMessage': {
        const content = item.content as { text: string }
        return (
          <div key={itemId} className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono overflow-x-auto">
                  {content.text}
                </pre>
              </div>
            </div>
          </div>
        )
      }

      case 'userMessage': {
        const content = item.content as { text: string }
        return (
          <div key={itemId} className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                <p className="text-sm text-gray-800 dark:text-gray-200">{content.text}</p>
              </div>
            </div>
          </div>
        )
      }

      case 'commandExecution': {
        const content = item.content as { command: string; output?: string; exitCode?: number }
        const hasError = content.exitCode !== undefined && content.exitCode !== 0
        return (
          <div key={itemId} className="flex items-start space-x-3">
            <div className={cn(
              "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
              hasError ? "bg-red-100 dark:bg-red-900/40" : "bg-gray-800 dark:bg-gray-900"
            )}>
              <Terminal className={cn(
                "w-4 h-4",
                hasError ? "text-red-600 dark:text-red-400" : "text-gray-300"
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-3 overflow-hidden">
                <div className="flex items-center space-x-2 text-xs text-gray-400 mb-2">
                  <span className="text-green-400">$</span>
                  <span className="font-mono">{content.command}</span>
                  {content.exitCode !== undefined && (
                    <span className={cn(
                      "ml-auto px-1.5 py-0.5 rounded text-xs",
                      hasError ? "bg-red-900/50 text-red-400" : "bg-green-900/50 text-green-400"
                    )}>
                      exit {content.exitCode}
                    </span>
                  )}
                </div>
                {content.output && (
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto max-h-64 overflow-y-auto">
                    {content.output}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )
      }

      case 'fileChange': {
        const content = item.content as FileChangeContentType
        const addCount = content.changes.filter(c => c.kind === 'add').length
        const modifyCount = content.changes.filter(c => c.kind === 'modify').length
        const deleteCount = content.changes.filter(c => c.kind === 'delete').length
        const needsApproval = content.needsApproval && !content.approved
        const isApplied = content.applied

        return (
          <div key={itemId} className="flex items-start space-x-3">
            <div className={cn(
              "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
              isApplied ? "bg-green-100 dark:bg-green-900/40" : needsApproval ? "bg-amber-100 dark:bg-amber-900/40" : "bg-gray-100 dark:bg-gray-700"
            )}>
              <FileCode className={cn(
                "w-4 h-4",
                isApplied ? "text-green-600 dark:text-green-400" : needsApproval ? "text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-400"
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "rounded-lg border overflow-hidden",
                isApplied ? "border-green-200 dark:border-green-700" : needsApproval ? "border-amber-200 dark:border-amber-700" : "border-gray-200 dark:border-gray-700"
              )}>
                <div className={cn(
                  "px-3 py-2 flex items-center justify-between",
                  isApplied ? "bg-green-50 dark:bg-green-900/20" : needsApproval ? "bg-amber-50 dark:bg-amber-900/20" : "bg-gray-50 dark:bg-gray-800"
                )}>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {addCount > 0 && <span className="text-green-600">+{addCount}</span>}
                    {modifyCount > 0 && <span className="text-yellow-600">~{modifyCount}</span>}
                    {deleteCount > 0 && <span className="text-red-600">-{deleteCount}</span>}
                    <span className="text-gray-500">{content.changes.length} file(s)</span>
                  </div>
                  {isApplied && (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check className="w-3 h-3" /> 已应用
                    </span>
                  )}
                  {needsApproval && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 animate-pulse">待审批</span>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {content.changes.map((change, idx) => {
                    const hunks = parseDiff(change.diff)
                    const fileDiff = {
                      path: change.path,
                      kind: change.kind as 'add' | 'modify' | 'delete' | 'rename',
                      oldPath: change.oldPath,
                      hunks,
                    }
                    return (
                      <div key={idx} className="border-t border-gray-100 dark:border-gray-700 first:border-t-0">
                        <DiffView diff={fileDiff} />
                      </div>
                    )
                  })}
                </div>

                {needsApproval && (
                  <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
                    <button
                      onClick={() => {
                        void useThreadStore.getState().respondToApprovalInThread(agent.threadId, itemId, 'accept')
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                    >
                      <Check className="w-3 h-3" /> 应用
                    </button>
                    <button
                      onClick={() => {
                        void useThreadStore.getState().respondToApprovalInThread(agent.threadId, itemId, 'decline')
                      }}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <XCircle className="w-3 h-3" /> 拒绝
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      case 'mcpTool': {
        const content = item.content as {
          callId: string
          server: string
          tool: string
          arguments: unknown
          result?: unknown
          error?: string
          isRunning: boolean
          progress?: string[]
        }
        const hasError = !!content.error
        const isRunning = content.isRunning

        return (
          <div key={itemId} className="flex items-start space-x-3">
            <div className={cn(
              "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
              hasError
                ? "bg-red-100 dark:bg-red-900/40"
                : isRunning
                  ? "bg-purple-100 dark:bg-purple-900/40"
                  : "bg-green-100 dark:bg-green-900/40"
            )}>
              <Wrench className={cn(
                "w-4 h-4",
                hasError
                  ? "text-red-600 dark:text-red-400"
                  : isRunning
                    ? "text-purple-600 dark:text-purple-400 animate-spin"
                    : "text-green-600 dark:text-green-400"
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "rounded-lg p-3 border",
                hasError
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
                  : isRunning
                    ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700"
                    : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
              )}>
                <div className="flex items-center space-x-2 mb-1">
                  <span className={cn(
                    "text-xs font-semibold",
                    hasError
                      ? "text-red-700 dark:text-red-300"
                      : isRunning
                        ? "text-purple-700 dark:text-purple-300"
                        : "text-green-700 dark:text-green-300"
                  )}>
                    {hasError ? '工具错误' : isRunning ? '工具执行中' : '工具完成'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{content.tool}</span>
                </div>
                {content.arguments != null && typeof content.arguments === 'object' && Object.keys(content.arguments as object).length > 0 ? (
                  <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono overflow-x-auto mb-2">
                    {JSON.stringify(content.arguments, null, 2)}
                  </pre>
                ) : null}
                {hasError && (
                  <pre className="text-xs text-red-600 dark:text-red-400 font-mono overflow-x-auto whitespace-pre-wrap">
                    {content.error}
                  </pre>
                )}
                {!hasError && content.result !== undefined && (
                  <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {typeof content.result === 'string' ? content.result : JSON.stringify(content.result, null, 2)}
                  </pre>
                )}
                {isRunning && content.progress && content.progress.length > 0 && (
                  <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                    {content.progress[content.progress.length - 1]}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      case 'error': {
        const content = item.content as { message: string; code?: string }
        return (
          <div key={itemId} className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-700">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-xs font-semibold text-red-700 dark:text-red-300">错误</span>
                  {content.code && (
                    <span className="text-xs text-red-500 font-mono">[{content.code}]</span>
                  )}
                </div>
                <p className="text-sm text-red-600 dark:text-red-400">{content.message}</p>
              </div>
            </div>
          </div>
        )
      }

      default:
        // Fallback for unknown message types
        return (
          <div key={itemId} className="flex items-start space-x-3 opacity-60">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500">{item.type}</span>
                <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono mt-1 overflow-x-auto">
                  {JSON.stringify(item.content, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="text-xl">{getAgentTypeIcon(agent.type)}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {getAgentTypeDisplayName(agent.type)} 代理
            </h3>
            <div className="flex items-center space-x-2 mt-0.5">
              <span
                className={cn(
                  'px-1.5 py-0.5 text-xs font-medium rounded',
                  getStatusBgColor(agent.status),
                  getStatusColor(agent.status)
                )}
              >
                {formatAgentStatus(agent.status)}
              </span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                {agent.id.slice(0, 12)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1 ml-2">
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="最小化"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Task Description */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
          任务
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">{agent.task}</p>
      </div>

      {/* Message History */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/50"
      >
        {threadState ? (
          <>
            {threadState.itemOrder.length > 0 ? (
              <>
                {threadState.itemOrder.map(renderMessage)}
                {/* Auto-scroll anchor */}
                <div ref={scrollBottomRef} />
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <div className="text-center">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">等待代理输出...</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">线程未加载</p>
              <p className="text-xs mt-1 font-mono">ID: {agent.threadId.slice(0, 16)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Agent Metadata */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <div className="flex justify-between">
          <span>创建时间:</span>
          <span className="font-mono">{agent.createdAt.toLocaleString('zh-CN')}</span>
        </div>
        {agent.startedAt && (
          <div className="flex justify-between">
            <span>开始时间:</span>
            <span className="font-mono">{agent.startedAt.toLocaleString('zh-CN')}</span>
          </div>
        )}
        {agent.completedAt && (
          <div className="flex justify-between">
            <span>完成时间:</span>
            <span className="font-mono">{agent.completedAt.toLocaleString('zh-CN')}</span>
          </div>
        )}
        {agent.dependencies.length > 0 && (
          <div className="flex justify-between">
            <span>依赖代理:</span>
            <span className="font-mono">{agent.dependencies.map((id) => id.slice(0, 8)).join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
