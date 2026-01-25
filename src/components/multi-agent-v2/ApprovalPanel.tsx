import { useState, useRef, useEffect, useMemo } from 'react'
import { CheckCircle, XCircle, RotateCcw, ChevronDown, ChevronRight, Terminal, FileCode, AlertCircle, Loader2, X, AlertTriangle, Lightbulb, Copy } from 'lucide-react'
import { cn } from '../../lib/utils'
import { classifyRisk } from '../../lib/safety-utils'
import { useMultiAgentStore, type WorkflowPhase, type AgentDescriptor } from '../../stores/multi-agent-v2'
import { useThreadStore } from '../../stores/thread'
import { getAgentTypeDisplayName, getAgentTypeIcon } from '../../lib/agent-utils'
import { useToast } from '../ui/Toast'
import { DiffView, parseDiff } from '../ui/DiffView'

interface ApprovalPanelProps {
  phase: WorkflowPhase
  agents: AgentDescriptor[]
  onApprove: () => void
  onReject: (reason: string) => void
  onRejectAndRetry?: (reason: string) => void
  onClose: () => void
}

const REJECTION_REASONS = [
  "测试失败需修复",
  "变更范围过大，需拆分",
  "不符合项目架构",
  "缺少回滚方案"
]

export function ApprovalPanel({
  phase,
  agents,
  onApprove,
  onReject,
  onRejectAndRetry,
  onClose,
}: ApprovalPanelProps) {
  const [rejectReason, setRejectReason] = useState('')
  const [isRejectMode, setIsRejectMode] = useState(false)
  const [showLowRisk, setShowLowRisk] = useState(true)
  const [summaryFirstMode, setSummaryFirstMode] = useState(true)
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    phase.agentIds.forEach((id) => { initial[id] = false })
    return initial
  })
  const { showToast } = useToast()
  const threads = useThreadStore((state) => state.threads)

  const phaseAgents = agents.filter((a) => phase.agentIds.includes(a.id))
  const hasErrors = phaseAgents.some((a) => a.status === 'error')
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const approveBtnRef = useRef<HTMLButtonElement>(null)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const approvalInFlight = useMultiAgentStore((state) => state.approvalInFlight[phase.id] ?? false)

  const stats = phaseAgents.reduce(
    (acc, agent) => {
      if (agent.status === 'error') {
        acc.failed++
      } else {
        acc.success++
      }

      const thread = threads[agent.threadId]
      if (thread) {
        thread.itemOrder.forEach((id) => {
          const item = thread.items[id]
          if (!item) return
          if (item.type === 'fileChange') {
            const content = item.content as { changes?: { path: string; kind: string; diff?: string }[] }
            if (content.changes) {
              acc.files += content.changes.length
              content.changes.forEach(change => {
                const risk = classifyRisk(change)
                acc.riskCounts[risk]++
              })
            }
          } else if (item.type === 'commandExecution') {
            acc.commands++
          }
        })
      }
      return acc
    },
    { files: 0, commands: 0, success: 0, failed: 0, riskCounts: { high: 0, medium: 0, low: 0 } }
  )

  const isHighRisk = hasErrors || stats.files > 10

  useEffect(() => {
    const timer = setTimeout(() => {
      approveBtnRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleApproveClick = () => {
    if (isHighRisk && !confirmApprove) {
      setConfirmApprove(true)
      return
    }
    onApprove()
    setConfirmApprove(false)
  }
  
  const enterRejectMode = () => {
    setConfirmApprove(false)
    setIsRejectMode(true)
  }

  useEffect(() => {
    if (isRejectMode && hasErrors && retryButtonRef.current) {
      retryButtonRef.current.focus()
    }
  }, [isRejectMode, hasErrors])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape' && isRejectMode) {
           e.preventDefault()
           e.stopPropagation()
           setIsRejectMode(false)
           setRejectReason('')
        }
        return
      }

      if (isRejectMode) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setIsRejectMode(false)
          setRejectReason('')
        }
      } else {
        if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          handleApproveClick()
        }
        if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          enterRejectMode()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRejectMode, isHighRisk, confirmApprove, onApprove, onClose])

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

  const handleRejectAndRetry = () => {
    if (!rejectReason.trim()) {
      showToast('请输入拒绝原因', 'warning')
      return
    }
    onRejectAndRetry?.(rejectReason)
  }

  return (
    <div 
      className="h-full flex flex-col bg-card border-l border-border shadow-xl"
      role="dialog"
      aria-modal="false"
      aria-labelledby="approval-panel-title"
      aria-describedby="approval-panel-desc"
    >
      {/* Sticky header with decision buttons at TOP */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        {/* Role Reminder */}
        <div className="px-4 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2 border-b border-blue-200 dark:border-blue-800">
          <span className="font-medium">您的角色:</span>
          <span>审查代理提案 → 批准或拒绝 → 推进工作流</span>
        </div>
        {/* Title and phase info */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h2 id="approval-panel-title" className="text-lg font-semibold flex items-center gap-2">
              阶段审批
              {phase.status === 'approval_timeout' && (
                <span className="px-2 py-0.5 text-xs font-medium bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-full">
                  超时
                </span>
              )}
            </h2>
            <p id="approval-panel-desc" className="text-sm text-muted-foreground">{phase.name}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Decision buttons - MOST PROMINENT */}
        <div className="px-4 py-3 bg-muted/30 flex items-center justify-between gap-3">
          {!isRejectMode ? (
             confirmApprove ? (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {hasErrors ? '存在失败代理' : '变更较多'}, 确认批准？
                </span>
                <button onClick={onApprove} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium">
                  确认批准
                </button>
                <button onClick={() => setConfirmApprove(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                  取消
                </button>
              </div>
            ) : (
            <>
              <div className="flex items-center gap-2 flex-1">
                <button 
                  ref={approveBtnRef}
                  onClick={handleApproveClick}
                  disabled={approvalInFlight}
                  aria-label="批准此阶段，快捷键 Enter"
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {approvalInFlight ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  批准 (⏎)
                </button>
                <button 
                  onClick={enterRejectMode}
                  aria-label="拒绝此阶段，快捷键 R"
                  className="flex-1 px-4 py-2 border border-destructive text-destructive bg-background hover:bg-destructive/10 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  拒绝 (R)
                </button>
              </div>
            </>
            )
          ) : (
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-destructive">拒绝原因</span>
                <button 
                  onClick={() => setIsRejectMode(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  取消 (Esc)
                </button>
              </div>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="请说明拒绝原因..."
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background mb-2 focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
                autoFocus
              />
              <div className="flex flex-wrap gap-2 mb-2">
                {REJECTION_REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setRejectReason((prev) => (prev ? `${prev}\n${reason}` : reason))}
                    className="px-2 py-0.5 text-xs bg-muted hover:bg-muted/80 text-muted-foreground rounded border border-border transition-colors"
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                 {onRejectAndRetry && (
                  <button
                    ref={retryButtonRef}
                    onClick={handleRejectAndRetry}
                    className={cn(
                      "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2",
                      hasErrors
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    拒绝并重试
                  </button>
                )}
                <button
                  onClick={handleReject}
                  className="flex-1 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  确认拒绝
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Compact stats - single line */}
        <div 
          className="px-4 py-2 border-t border-border flex items-center gap-4 text-xs text-muted-foreground bg-muted/10"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="flex items-center gap-1"><FileCode className="w-3 h-3" /> {stats.files} 文件</span>
          <span className="flex items-center gap-1"><Terminal className="w-3 h-3" /> {stats.commands} 命令</span>
          <span className="flex items-center gap-1 text-green-600 dark:text-green-500 font-medium">{stats.success} 成功</span>
          {stats.failed > 0 && <span className="flex items-center gap-1 text-red-600 dark:text-red-500 font-medium">{stats.failed} 失败</span>}
        </div>
        
        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs bg-muted/5">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">风险分布:</span>
            {stats.riskCounts.high > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                <AlertTriangle className="w-3 h-3" /> {stats.riskCounts.high} 高风险
              </span>
            )}
            {stats.riskCounts.medium > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                {stats.riskCounts.medium} 中风险
              </span>
            )}
            {stats.riskCounts.low > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                {stats.riskCounts.low} 低风险
              </span>
            )}
            {stats.riskCounts.high === 0 && stats.riskCounts.medium === 0 && stats.riskCounts.low === 0 && (
              <span className="text-muted-foreground/50">无文件变更</span>
            )}
          </div>
          
          <button
            onClick={() => setShowLowRisk(!showLowRisk)}
            className={cn(
              "px-2 py-1 rounded transition-colors",
              showLowRisk 
                ? "bg-muted text-muted-foreground" 
                : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
            )}
          >
            {showLowRisk ? '隐藏低风险' : '显示全部'}
          </button>
        </div>
      </div>
      
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Error Banner */}
           {hasErrors && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">部分代理执行失败</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  建议使用"拒绝并重试"让代理重新执行任务。
                </p>
              </div>
            </div>
          )}

          <div className="p-3 bg-muted/30 border border-border rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">决策摘要</span>
              <span className="text-xs text-muted-foreground">{phase.name}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-sm border border-blue-200 dark:border-blue-800">{phaseAgents.length} 代理</span>
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-sm border border-gray-200 dark:border-gray-700">{stats.files} 文件</span>
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-sm border border-gray-200 dark:border-gray-700">{stats.commands} 命令</span>
              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-sm border border-green-200 dark:border-green-800">{stats.success} 成功</span>
              {stats.failed > 0 && <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-sm border border-red-200 dark:border-red-800">{stats.failed} 失败</span>}
            </div>
            {stats.files > 10 && (
              <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> 大范围变更，建议仔细审查
              </p>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground">批准后进入下一阶段 · 拒绝后进入修正</p>
          </div>

          {/* Phase Output Summary */}
          {phase.output && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">阶段输出</h3>
              <div className="bg-muted/50 border border-border rounded-lg p-3">
                <pre className="text-sm whitespace-pre-wrap font-mono text-foreground">
                  {phase.output}
                </pre>
              </div>
            </div>
          )}

          {/* Agent Artifacts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                工作成果 ({phaseAgents.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSummaryFirstMode(false)
                    const allExpanded: Record<string, boolean> = {}
                    phaseAgents.forEach((a) => { allExpanded[a.id] = true })
                    setExpandedAgents(allExpanded)
                  }}
                  className={cn(
                    "text-xs hover:underline",
                    summaryFirstMode ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                  )}
                >
                  全部展开
                </button>
                <span className="text-muted-foreground/30">|</span>
                <button
                  onClick={() => {
                    setSummaryFirstMode(true)
                    const allCollapsed: Record<string, boolean> = {}
                    phaseAgents.forEach((a) => { allCollapsed[a.id] = false })
                    setExpandedAgents(allCollapsed)
                  }}
                  className={cn(
                    "text-xs hover:underline",
                    summaryFirstMode ? "text-muted-foreground" : "text-blue-600 dark:text-blue-400"
                  )}
                >
                  摘要模式
                </button>
              </div>
            </div>
            
            {phaseAgents.map((agent, index) => (
              <AgentArtifactCard
                key={agent.id}
                agent={agent}
                index={index}
                isExpanded={expandedAgents[agent.id] || false}
                onToggle={() => toggleAgentExpanded(agent.id)}
                showLowRisk={showLowRisk}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface FileChangeContent {
  changes: Array<{
    path: string
    kind: string
    oldPath?: string
    diff: string
  }>
}

interface CommandContent {
  command: string
  output?: string
  exitCode?: number
}

function AgentArtifactCard({
  agent,
  isExpanded,
  onToggle,
  showLowRisk,
}: {
  agent: AgentDescriptor
  index: number
  isExpanded: boolean
  onToggle: () => void
  showLowRisk: boolean
}) {
  const threadState = useThreadStore((state) => state.threads[agent.threadId])

  const artifacts = useMemo(() => {
    if (!threadState) return { fileChanges: [], commands: [], messages: [], errors: [] }

    const fileChanges: Array<{ id: string; content: FileChangeContent }> = []
    const commands: Array<{ id: string; content: CommandContent }> = []
    const messages: string[] = []
    const errors: string[] = []

    for (const id of threadState.itemOrder) {
      const item = threadState.items[id]
      if (!item) continue

      if (item.type === 'fileChange') {
        fileChanges.push({ id, content: item.content as FileChangeContent })
      } else if (item.type === 'commandExecution') {
        commands.push({ id, content: item.content as CommandContent })
      } else if (item.type === 'agentMessage') {
        const text = (item.content as { text?: string })?.text
        if (text) messages.push(text)
      } else if (item.type === 'error') {
        const err = item.content as { message: string }
        errors.push(err.message)
      }
    }

    return { fileChanges, commands, messages, errors }
  }, [threadState])

  const initialExpandedFiles = useMemo(() => {
    const expanded = new Set<string>()
    artifacts.fileChanges.forEach((fc: { id: string; content: FileChangeContent }) => {
      fc.content.changes.forEach((_: unknown, idx: number) => expanded.add(`${fc.id}-${idx}`))
    })
    return expanded
  }, [artifacts.fileChanges])

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(initialExpandedFiles)

  const totalArtifacts = artifacts.fileChanges.length + artifacts.commands.length
  const hasError = agent.status === 'error' || artifacts.errors.length > 0

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden bg-card transition-all", 
      hasError ? "border-red-300 dark:border-red-900" : "border-border"
    )}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="flex-shrink-0 text-muted-foreground">{getAgentTypeIcon(agent.type)}</div>
          <div className="text-left min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm text-foreground truncate">
                {getAgentTypeDisplayName(agent.type)}
              </h4>
              {hasError && (
                <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                  失败
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{agent.task}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <div className="flex items-center gap-2">
              {artifacts.fileChanges.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileCode className="w-3 h-3" /> {artifacts.fileChanges.reduce((sum, fc) => sum + fc.content.changes.length, 0)}
                </span>
              )}
              {artifacts.commands.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Terminal className="w-3 h-3" /> {artifacts.commands.length}
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border divide-y divide-border/50">
          {/* Decision Evidence */}
          {artifacts.messages.length > 0 && (
            <div className="p-2 bg-blue-50 dark:bg-blue-900/10 border-b border-border">
              <p className="text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                <span className="font-medium">决策依据:</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {artifacts.messages[0]}
              </p>
            </div>
          )}

          {/* Errors */}
          {artifacts.errors.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/10">
              <div className="flex items-center justify-between mb-1">
                <h5 className="text-xs font-medium text-red-700 dark:text-red-400">错误</h5>
                <button
                  onClick={() => {
                    const errorText = artifacts.errors.join('\n')
                    void navigator.clipboard.writeText(errorText)
                  }}
                  className="text-[10px] px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1"
                  title="复制错误信息"
                >
                  <Copy className="w-3 h-3" />
                  复制
                </button>
              </div>
              {artifacts.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-300 font-mono break-all">{err}</p>
              ))}
            </div>
          )}

          {/* File Changes with Diff */}
          {artifacts.fileChanges.map((fc) => (
            <div key={fc.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-xs font-medium text-foreground flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5" />
                  文件变更
                </h5>
              </div>

              <div className="space-y-2">
                {fc.content.changes.map((change, idx) => {
                  const fileKey = `${fc.id}-${idx}`
                  const isFileExpanded = expandedFiles.has(fileKey)
                  
                  if (!showLowRisk && classifyRisk(change) === 'low') return null

                  return (
                    <div key={idx} className="border border-border rounded-md overflow-hidden bg-background">
                      <button
                        onClick={() => {
                          const newSet = new Set(expandedFiles)
                          if (isFileExpanded) newSet.delete(fileKey)
                          else newSet.add(fileKey)
                          setExpandedFiles(newSet)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                      >
                         {isFileExpanded ? (
                           <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                         ) : (
                           <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                         )}
                         <span className="font-mono text-xs text-foreground flex-1 truncate" title={change.path}>
                           {change.path}
                         </span>
                         <span className={cn(
                           "text-[10px] px-1 py-0.5 rounded uppercase font-medium flex-shrink-0",
                           change.kind === 'add' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                           change.kind === 'delete' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                           change.kind === 'modify' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                           change.kind === 'rename' && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                         )}>
                           {change.kind}
                         </span>
                      </button>
                      
                      {isFileExpanded && (
                        <div className="border-t border-border">
                          {(() => {
                            const hunks = parseDiff(change.diff || '')
                            const fileDiff = {
                              path: change.path,
                              kind: change.kind as 'add' | 'modify' | 'delete' | 'rename',
                              oldPath: change.oldPath,
                              hunks,
                            }
                            return <DiffView diff={fileDiff} />
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Commands */}
          {artifacts.commands.length > 0 && (
            <div className="p-3">
              <h5 className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5" />
                执行命令
              </h5>
              <div className="space-y-2">
                {artifacts.commands.map((cmd) => (
                  <div key={cmd.id} className="bg-gray-950 rounded-md overflow-hidden border border-gray-800">
                    <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-800">
                      <code className="text-xs text-green-400 truncate max-w-[80%]">$ {cmd.content.command}</code>
                      {cmd.content.exitCode !== undefined && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${cmd.content.exitCode === 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                          exit {cmd.content.exitCode}
                        </span>
                      )}
                    </div>
                    {cmd.content.output && (
                      <pre className="px-3 py-2 text-[10px] text-gray-400 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                        {cmd.content.output}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages (only if no other artifacts) */}
          {artifacts.messages.length > 0 && totalArtifacts === 0 && (
            <div className="p-3">
              <h5 className="text-xs font-medium text-foreground mb-1">代理消息</h5>
              <div className="space-y-2">
                {artifacts.messages.map((msg, i) => (
                  <p key={i} className="text-xs text-muted-foreground bg-muted/20 p-2 rounded">{msg}</p>
                ))}
              </div>
            </div>
          )}

          {/* No artifacts */}
          {totalArtifacts === 0 && artifacts.messages.length === 0 && artifacts.errors.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">
              无可审查的工作成果
            </div>
          )}
        </div>
      )}
    </div>
  )
}
