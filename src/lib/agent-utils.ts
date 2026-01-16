/**
 * Agent Utilities - Helper functions for multi-agent system
 */

import type { AgentStatus, AgentProgress, AgentDescriptor } from '../stores/multi-agent-v2'
import type { SingleThreadState } from '../stores/thread/types'

/**
 * Generate a unique agent ID
 */
export function generateAgentId(): string {
  return crypto.randomUUID()
}

/**
 * Format agent status for display
 */
export function formatAgentStatus(status: AgentStatus): string {
  const statusMap: Record<AgentStatus, string> = {
    pending: '等待中',
    running: '运行中',
    completed: '已完成',
    error: '错误',
    cancelled: '已取消',
  }
  return statusMap[status] || status
}

/**
 * Get status color
 */
export function getStatusColor(status: AgentStatus): string {
  const colorMap: Record<AgentStatus, string> = {
    pending: 'text-gray-500',
    running: 'text-blue-500',
    completed: 'text-green-500',
    error: 'text-red-500',
    cancelled: 'text-gray-400',
  }
  return colorMap[status] || 'text-gray-500'
}

/**
 * Get status background color
 */
export function getStatusBgColor(status: AgentStatus): string {
  const colorMap: Record<AgentStatus, string> = {
    pending: 'bg-gray-100',
    running: 'bg-blue-100',
    completed: 'bg-green-100',
    error: 'bg-red-100',
    cancelled: 'bg-gray-100',
  }
  return colorMap[status] || 'bg-gray-100'
}

/**
 * Calculate agent progress percentage
 */
export function calculateProgressPercentage(progress: AgentProgress): number {
  if (progress.total === 0) return 0
  return Math.round((progress.current / progress.total) * 100)
}

/**
 * Extract agent output from thread store
 * Returns the recent messages from the thread
 */
export function extractAgentOutput(threadState: SingleThreadState | undefined, limit = 3): string[] {
  if (!threadState) return []

  const output: string[] = []
  const items = threadState.itemOrder
    .map((id) => threadState.items[id])
    .filter((item) => item !== undefined)
    .slice(-limit) // Get last N items

  for (const item of items) {
    if (item.type === 'agentMessage') {
      const content = item.content as { text: string }
      if (content.text) {
        // Split by newlines and take first line or first 100 chars
        const firstLine = content.text.split('\n')[0]
        output.push(firstLine.slice(0, 100) + (firstLine.length > 100 ? '...' : ''))
      }
    } else if (item.type === 'commandExecution') {
      const content = item.content as { command: string }
      if (content.command) {
        output.push(`$ ${content.command}`)
      }
    } else if (item.type === 'fileChange') {
      const content = item.content as Record<string, any>
      if (content.path) {
        output.push(`${content.operation || 'Modified'}: ${content.path}`)
      }
    }
  }

  return output
}

/**
 * Check if agent has completed successfully
 */
export function isAgentCompleted(agent: AgentDescriptor): boolean {
  return agent.status === 'completed'
}

/**
 * Check if agent is running
 */
export function isAgentRunning(agent: AgentDescriptor): boolean {
  return agent.status === 'running'
}

/**
 * Check if agent has error
 */
export function hasAgentError(agent: AgentDescriptor): boolean {
  return agent.status === 'error'
}

/**
 * Check if agent can be cancelled
 */
export function canCancelAgent(agent: AgentDescriptor): boolean {
  return agent.status === 'running' || agent.status === 'pending'
}

/**
 * Check if agent can be retried
 */
export function canRetryAgent(agent: AgentDescriptor): boolean {
  return agent.status === 'error' && agent.error?.recoverable === true
}

/**
 * Get elapsed time in seconds
 */
export function getElapsedTime(agent: AgentDescriptor): number {
  if (!agent.startedAt) return 0
  const endTime = agent.completedAt || new Date()
  return Math.floor((endTime.getTime() - agent.startedAt.getTime()) / 1000)
}

/**
 * Format elapsed time
 */
export function formatElapsedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}分${remainingSeconds}秒`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}时${remainingMinutes}分`
}

/**
 * Get agent type display name
 */
export function getAgentTypeDisplayName(type: string): string {
  const typeMap: Record<string, string> = {
    explore: '探索',
    plan: '规划',
    'code-writer': '编码',
    bash: '命令',
    reviewer: '审查',
    tester: '测试',
    documenter: '文档',
  }
  return typeMap[type] || type
}

/**
 * Get agent type icon
 */
export function getAgentTypeIcon(type: string): string {
  const iconMap: Record<string, string> = {
    explore: '🔍',
    plan: '📋',
    'code-writer': '💻',
    bash: '⚡',
    reviewer: '👁️',
    tester: '🧪',
    documenter: '📝',
  }
  return iconMap[type] || '🤖'
}

/**
 * Sort agents by status priority
 * Priority: running > pending > error > completed > cancelled
 */
export function sortAgentsByStatus(agents: AgentDescriptor[]): AgentDescriptor[] {
  const statusPriority: Record<AgentStatus, number> = {
    running: 1,
    pending: 2,
    error: 3,
    completed: 4,
    cancelled: 5,
  }

  return [...agents].sort((a, b) => {
    const priorityDiff = statusPriority[a.status] - statusPriority[b.status]
    if (priorityDiff !== 0) return priorityDiff

    // If same priority, sort by creation time
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

/**
 * Group agents by status
 */
export function groupAgentsByStatus(
  agents: AgentDescriptor[]
): Record<AgentStatus, AgentDescriptor[]> {
  const groups: Record<AgentStatus, AgentDescriptor[]> = {
    pending: [],
    running: [],
    completed: [],
    error: [],
    cancelled: [],
  }

  for (const agent of agents) {
    groups[agent.status].push(agent)
  }

  return groups
}
