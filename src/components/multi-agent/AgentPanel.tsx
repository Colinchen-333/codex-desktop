/**
 * AgentPanel - Displays the status of all child agents
 *
 * Shows a list of spawned sub-agents with their current status,
 * assigned task, and output preview.
 */

import { useMemo, useState, useEffect } from 'react'
import { Bot, Clock, CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react'
import { useMultiAgentStore, type ChildAgent, type ChildAgentStatus } from '../../stores/multi-agent'
import { cn } from '../../lib/utils'

// Agent status sort order - defined outside component to avoid recreation on each render
const AGENT_STATUS_ORDER: Record<ChildAgentStatus, number> = {
  running: 0,
  pending: 1,
  completed: 2,
  error: 3,
}

// Status indicator component
function StatusIndicator({ status }: { status: ChildAgentStatus }) {
  switch (status) {
    case 'pending':
      return <Clock size={14} className="text-muted-foreground" />
    case 'running':
      return <Loader2 size={14} className="text-blue-500 animate-spin" />
    case 'completed':
      return <CheckCircle2 size={14} className="text-green-500" />
    case 'error':
      return <XCircle size={14} className="text-red-500" />
  }
}

// Status label
function statusLabel(status: ChildAgentStatus): string {
  switch (status) {
    case 'pending':
      return 'Waiting'
    case 'running':
      return 'Running'
    case 'completed':
      return 'Completed'
    case 'error':
      return 'Error'
  }
}

// Format elapsed time helper
function formatElapsedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

// Agent card component
function AgentCard({ agent }: { agent: ChildAgent }) {
  // State for live elapsed time updates
  const [now, setNow] = useState(Date.now())

  // Update elapsed time every second for running agents
  useEffect(() => {
    if (agent.status !== 'running') return

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [agent.status])

  // Calculate elapsed time
  const elapsedTime = useMemo(() => {
    const startTime = agent.createdAt.getTime()
    const endTime = agent.completedAt?.getTime() || now
    const seconds = Math.floor((endTime - startTime) / 1000)
    return formatElapsedTime(seconds)
  }, [agent.createdAt, agent.completedAt, now])

  return (
    <div
      className={cn(
        'p-3 rounded-lg border transition-all duration-300',
        agent.status === 'running'
          ? 'border-blue-500/50 bg-blue-500/5'
          : agent.status === 'completed'
            ? 'border-green-500/30 bg-green-500/5'
            : agent.status === 'error'
              ? 'border-red-500/30 bg-red-500/5'
              : 'border-border bg-background'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <Bot size={12} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium truncate block">{agent.persona || 'Sub-Agent'}</span>
            {/* Elapsed time display */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-0.5">
              <Clock size={10} />
              <span>{elapsedTime}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
          <StatusIndicator status={agent.status} />
          <span>{statusLabel(agent.status)}</span>
        </div>
      </div>

      {/* Task */}
      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{agent.task}</p>

      {/* Status timeline */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 mb-2">
        <Zap size={10} className={agent.status !== 'pending' ? 'text-blue-500' : ''} />
        <span>{agent.createdAt.toLocaleTimeString()}</span>
        {agent.completedAt && (
          <>
            <span>→</span>
            <CheckCircle2 size={10} className="text-green-500" />
            <span>{agent.completedAt.toLocaleTimeString()}</span>
          </>
        )}
      </div>

      {/* Output Preview */}
      {agent.output.length > 0 && (
        <div className="mt-2 p-2 rounded bg-secondary/50 text-xs font-mono max-h-20 overflow-y-auto">
          {agent.output.slice(-3).map((line, idx) => (
            <div key={`${agent.id}-${agent.output.length - 3 + idx}`} className="truncate">
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {agent.error && (
        <div className="mt-2 p-2 rounded bg-red-500/10 text-xs text-red-500">
          {agent.error}
        </div>
      )}
    </div>
  )
}

export function AgentPanel() {
  const childAgents = useMultiAgentStore((state) => state.childAgents)

  // 使用 useMemo 缓存排序结果，避免每次渲染都重新排序
  const sortedAgents = useMemo(() => {
    return [...Object.values(childAgents)].sort(
      (a, b) => AGENT_STATUS_ORDER[a.status] - AGENT_STATUS_ORDER[b.status]
    )
  }, [childAgents])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-medium text-sm">Sub-Agents</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {sortedAgents.length === 0
            ? 'No agents spawned yet'
            : `${sortedAgents.filter((a) => a.status === 'running').length} running, ${sortedAgents.filter((a) => a.status === 'completed').length} completed`}
        </p>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sortedAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Bot size={32} className="text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground">
              Sub-agents will appear here when the orchestrator spawns them.
            </p>
          </div>
        ) : (
          sortedAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
        )}
      </div>
    </div>
  )
}
