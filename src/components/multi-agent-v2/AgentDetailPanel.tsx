/**
 * AgentDetailPanel - Right-side panel showing full agent output
 *
 * Features:
 * - Full message history from agent thread
 * - Reuses ChatMessageList component
 * - Closeable/minimizable
 */

import { X, Minimize2 } from 'lucide-react'
import type { AgentDescriptor } from '../../stores/multi-agent-v2'
import { useThreadStore } from '../../stores/thread'
import {
  getAgentTypeDisplayName,
  getAgentTypeIcon,
  formatAgentStatus,
  getStatusColor,
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

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="text-xl">{getAgentTypeIcon(agent.type)}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">
              {getAgentTypeDisplayName(agent.type)} 代理
            </h3>
            <div className="flex items-center space-x-2 mt-0.5">
              <span
                className={cn('text-xs font-medium', getStatusColor(agent.status))}
              >
                {formatAgentStatus(agent.status)}
              </span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-gray-500 truncate">
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
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
              title="最小化"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Task Description */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
          任务
        </h4>
        <p className="text-sm text-gray-600">{agent.task}</p>
      </div>

      {/* Message History */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {threadState ? (
          <>
            {threadState.itemOrder.map((itemId) => {
              const item = threadState.items[itemId]
              if (!item) return null

              if (item.type === 'agentMessage') {
                const content = item.content as { text: string }
                return (
                  <div key={itemId} className="prose prose-sm max-w-none">
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                        {content.text}
                      </pre>
                    </div>
                  </div>
                )
              }

              if (item.type === 'commandExecution') {
                const content = item.content as { command: string; output?: string }
                return (
                  <div key={itemId} className="space-y-2">
                    <div className="bg-gray-900 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-1">$ {content.command}</div>
                      {content.output && (
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                          {content.output}
                        </pre>
                      )}
                    </div>
                  </div>
                )
              }

              return null
            })}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="text-sm">线程未加载</p>
              <p className="text-xs mt-1">Thread ID: {agent.threadId}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Agent Metadata */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 space-y-1">
        <div className="flex justify-between">
          <span>创建时间:</span>
          <span>{agent.createdAt.toLocaleString('zh-CN')}</span>
        </div>
        {agent.startedAt && (
          <div className="flex justify-between">
            <span>开始时间:</span>
            <span>{agent.startedAt.toLocaleString('zh-CN')}</span>
          </div>
        )}
        {agent.completedAt && (
          <div className="flex justify-between">
            <span>完成时间:</span>
            <span>{agent.completedAt.toLocaleString('zh-CN')}</span>
          </div>
        )}
        {agent.dependencies.length > 0 && (
          <div className="flex justify-between">
            <span>依赖代理:</span>
            <span>{agent.dependencies.map((id) => id.slice(0, 8)).join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
