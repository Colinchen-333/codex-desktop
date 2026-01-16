/**
 * AgentGridView - Grid layout for displaying multiple agents
 *
 * Features:
 * - Responsive grid (1-3 columns)
 * - Grouped by status (Running > Pending > Error > Completed)
 * - Collapsible completed agents
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AgentDescriptor, AgentStatus } from '../../stores/multi-agent-v2'
import { AgentCard } from './AgentCard'
import { groupAgentsByStatus } from '../../lib/agent-utils'
import { cn } from '../../lib/utils'

interface AgentGridViewProps {
  agents: AgentDescriptor[]
  onViewDetails?: (agentId: string) => void
  onCancel?: (agentId: string) => void
  onPause?: (agentId: string) => void
  onResume?: (agentId: string) => void
}

// Status group display config
const STATUS_GROUP_CONFIG: Record<
  AgentStatus,
  { title: string; color: string; defaultExpanded: boolean }
> = {
  running: {
    title: '运行中',
    color: 'text-blue-600',
    defaultExpanded: true,
  },
  pending: {
    title: '等待中',
    color: 'text-gray-600',
    defaultExpanded: true,
  },
  error: {
    title: '错误',
    color: 'text-red-600',
    defaultExpanded: true,
  },
  completed: {
    title: '已完成',
    color: 'text-green-600',
    defaultExpanded: false, // Collapsed by default
  },
  cancelled: {
    title: '已取消',
    color: 'text-gray-400',
    defaultExpanded: false,
  },
}

export function AgentGridView({
  agents,
  onViewDetails,
  onCancel,
  onPause,
  onResume,
}: AgentGridViewProps) {
  // Group agents by status
  const groupedAgents = groupAgentsByStatus(agents)

  // Track expanded state for each group
  const [expandedGroups, setExpandedGroups] = useState<Record<AgentStatus, boolean>>({
    running: true,
    pending: true,
    error: true,
    completed: false,
    cancelled: false,
  })

  const toggleGroup = (status: AgentStatus) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [status]: !prev[status],
    }))
  }

  // Priority order for display
  const statusOrder: AgentStatus[] = ['running', 'pending', 'error', 'completed', 'cancelled']

  // Filter out empty groups
  const visibleGroups = statusOrder.filter((status) => groupedAgents[status].length > 0)

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <p className="text-lg font-medium">暂无代理</p>
          <p className="text-sm mt-1">创建代理以开始多智能体协作</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {visibleGroups.map((status) => {
        const config = STATUS_GROUP_CONFIG[status]
        const agentsInGroup = groupedAgents[status]
        const isExpanded = expandedGroups[status]

        return (
          <div key={status} className="space-y-3">
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(status)}
              className="flex items-center space-x-2 text-left w-full group"
            >
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
              )}
              <h3 className={cn('text-lg font-semibold', config.color)}>
                {config.title} ({agentsInGroup.length})
              </h3>
            </button>

            {/* Group Content */}
            {isExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agentsInGroup.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onViewDetails={onViewDetails}
                    onCancel={onCancel}
                    onPause={onPause}
                    onResume={onResume}
                  />
                ))}
              </div>
            )}

            {/* Collapsed Summary */}
            {!isExpanded && (
              <div className="text-sm text-gray-500 ml-7">
                点击展开查看 {agentsInGroup.length} 个代理
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
