/**
 * OrchestratorView - Multi-agent orchestrator chat interface
 *
 * Displays the main orchestrator chat with a collapsible panel showing
 * the status of child agents spawned during the session.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Bot, ChevronDown, ChevronUp, Send, FolderOpen, Square } from 'lucide-react'
import { useMultiAgentStore, type ChildAgent } from '../../stores/multi-agent'
import { useThreadStore } from '../../stores/thread'
import { AgentPanel } from './AgentPanel'
import { cn } from '../../lib/utils'
import { log } from '../../lib/logger'
import type {
  UserMessageItem,
  AgentMessageItem,
  McpToolItem,
  AnyThreadItem,
} from '../../stores/thread/types'

// Simple message type for display
interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

/**
 * P1 Fix: 清理 agent ID，只删除控制字符和危险字符，保留 Unicode 字符
 * 原来的 /[^\w\-_.]/g 会删除所有非 ASCII 字符，导致国际化 ID 变为空字符串
 * 现在只删除：控制字符 (0x00-0x1f, 0x7f-0x9f)、特殊 shell 字符 (<>|;&$`\)
 */
// Pre-compiled regex patterns for control character removal
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\x00-\x1f\x7f-\x9f]/g
const DANGEROUS_CHARS_REGEX = /[<>|;&$`\\]/g
const NEWLINE_REGEX = /[\n\r]/g

function sanitizeAgentId(id: string): string {
  return id
    // 删除控制字符 (C0 和 C1 控制字符)
    .replace(CONTROL_CHARS_REGEX, '')
    // 删除可能导致命令注入的危险字符
    .replace(DANGEROUS_CHARS_REGEX, '')
    // 删除换行符和回车符（可能被用于日志注入）
    .replace(NEWLINE_REGEX, '')
    .trim()
}

/**
 * 解析 spawn_agent 工具调用的结果
 * 从工具返回的内容中提取 agent_id
 */
function parseSpawnAgentResult(result: unknown): string | null {
  if (typeof result === 'string') {
    // 格式: "agent_id: xxx"
    // 使用非空白字符匹配，避免贪心匹配到换行符和控制字符
    const match = result.match(/agent_id:\s*([^\s\n\r]+)/i)
    if (match) {
      // P1 Fix: 使用更宽松的清理规则，保留 Unicode 字符
      const agentId = sanitizeAgentId(match[1])
      if (agentId === '') {
        log.warn('[parseSpawnAgentResult] Extracted agent_id is empty string after sanitization', 'multi-agent')
        return null
      }
      // P1 Fix: 添加长度限制，防止过长的 ID
      if (agentId.length > 256) {
        log.warn(`[parseSpawnAgentResult] agent_id exceeds max length (${agentId.length} > 256)`, 'multi-agent')
        return null
      }
      return agentId
    }
  }
  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>
    if (typeof obj.agent_id === 'string') {
      // P1 Fix: 对对象格式的 agent_id 也应用清理规则
      const agentId = sanitizeAgentId(obj.agent_id)
      if (agentId === '') {
        log.warn('[parseSpawnAgentResult] agent_id in result object is empty string after sanitization', 'multi-agent')
        return null
      }
      if (agentId.length > 256) {
        log.warn(`[parseSpawnAgentResult] agent_id in result object exceeds max length (${agentId.length} > 256)`, 'multi-agent')
        return null
      }
      return agentId
    }
  }
  return null
}

/**
 * 从工具参数中提取任务描述
 */
function parseSpawnAgentArgs(args: unknown): { message: string } | null {
  if (typeof args === 'object' && args !== null) {
    const obj = args as Record<string, unknown>
    if (typeof obj.message === 'string') {
      return { message: obj.message }
    }
  }
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args) as Record<string, unknown>
      if (typeof parsed.message === 'string') {
        return { message: parsed.message }
      }
    } catch (error) {
      // 不是有效的 JSON，记录警告日志
      log.warn(
        `[parseSpawnAgentArgs] Failed to parse args as JSON: ${error instanceof Error ? error.message : String(error)}`,
        'multi-agent'
      )
    }
  }
  return null
}

/**
 * 解析工具参数中的 agent ID
 * 支持字符串和对象两种格式
 */
function parseAgentId(args: unknown): string | undefined {
  // 处理字符串类型（可能是 JSON）
  if (typeof args === 'string') {
    try {
      const parsed: unknown = JSON.parse(args)
      if (typeof parsed === 'object' && parsed !== null && 'id' in parsed) {
        const id = (parsed as Record<string, unknown>).id
        if (typeof id === 'string') {
          return id
        }
      }
    } catch {
      // 忽略解析错误
    }
    return undefined
  }

  // 处理对象类型
  if (typeof args === 'object' && args !== null && 'id' in args) {
    const id = (args as Record<string, unknown>).id
    if (typeof id === 'string') {
      return id
    }
  }

  return undefined
}

/**
 * 从任务消息中提取人设/角色描述
 * 支持多种中文人设表述格式
 */
function extractPersonaFromMessage(message: string): string {
  // 支持多种中文人设表述格式
  const patterns = [
    /你是(?:一个)?(.{2,20}?)(?:智能体|专家|助手|。|，|的|$)/i, // 你是XXX
    /作为(?:一个)?(.{2,20}?)(?:智能体|专家|助手|。|，|的|$)/i, // 作为XXX
    /负责(.{2,20}?)(?:的)?(?:智能体|工作|任务|。|，|$)/i, // 负责XXX
    /(.{2,15}?)(?:专家|助手|处理器|分析师)/, // XXX专家
    /【(.{2,15}?)】/, // 【XXX】格式
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      const extracted = match[1].trim()
      if (extracted.length >= 2 && extracted.length <= 20) {
        return extracted
      }
    }
  }

  // 如果所有模式都不匹配，返回前20个字符
  const fallback = message.slice(0, 20).trim()
  return fallback + (message.length > 20 ? '...' : '')
}

/**
 * 从 wait 工具结果中提取子智能体的输出
 * 支持多种可能的结果格式
 */
function extractOutputFromWaitResult(result: unknown, depth = 0): string[] {
  const MAX_DEPTH = 10
  const MAX_LINES = 100 // 最大行数限制，防止大型输出消耗过多内存

  // 防止深层递归导致栈溢出
  if (depth > MAX_DEPTH) {
    return ['[Output truncated: max depth exceeded]']
  }

  if (!result || typeof result !== 'object') {
    return []
  }

  const resultObj = result as Record<string, unknown>
  const outputLines: string[] = []

  // 辅助函数：检查是否已达到行数限制
  const isAtLimit = () => outputLines.length >= MAX_LINES

  // 尝试从各种可能的字段提取输出
  const outputFields = [
    'output',
    'result',
    'response',
    'last_output',
    'last_response',
    'message',
    'content',
    'data',
    'text',
  ]

  for (const field of outputFields) {
    if (isAtLimit()) break // 已达到限制，停止处理

    const value = resultObj[field]
    if (value !== undefined && value !== null) {
      if (typeof value === 'string' && value.trim()) {
        // 将字符串按行分割
        const lines = value.split('\n').filter((line) => line.trim())
        for (const line of lines) {
          if (isAtLimit()) break
          outputLines.push(line)
        }
      } else if (Array.isArray(value)) {
        // 处理数组格式的输出
        for (const item of value) {
          if (isAtLimit()) break
          if (typeof item === 'string' && item.trim()) {
            outputLines.push(item)
          } else if (typeof item === 'object' && item !== null) {
            // 尝试从对象中提取文本
            const itemObj = item as Record<string, unknown>
            const text = itemObj.text || itemObj.content || itemObj.message
            if (typeof text === 'string' && text.trim()) {
              outputLines.push(text)
            }
          }
        }
      } else if (typeof value === 'object') {
        // 递归处理嵌套对象
        const nestedOutput = extractOutputFromWaitResult(value, depth + 1)
        for (const line of nestedOutput) {
          if (isAtLimit()) break
          outputLines.push(line)
        }
      }
    }
  }

  // 如果没有找到标准字段，尝试将整个结果对象转换为字符串
  if (outputLines.length === 0 && Object.keys(resultObj).length > 0) {
    // 排除已知的状态字段
    const statusFields = ['status', 'timed_out', 'agent_id', 'id', 'error']
    const hasOtherContent = Object.keys(resultObj).some(
      (key) => !statusFields.includes(key) && resultObj[key] !== undefined
    )

    if (hasOtherContent) {
      try {
        const jsonStr = JSON.stringify(resultObj, null, 2)
        if (jsonStr !== '{}') {
          // 对 JSON 字符串也进行行数限制
          const jsonLines = jsonStr.split('\n')
          for (const line of jsonLines) {
            if (isAtLimit()) break
            outputLines.push(line)
          }
        }
      } catch {
        // 忽略序列化错误
      }
    }
  }

  // 如果输出被截断，添加提示信息
  if (outputLines.length >= MAX_LINES) {
    // 用截断提示替换最后一行
    outputLines[MAX_LINES - 1] = '[Output truncated: max lines exceeded]'
  }

  return outputLines
}

/**
 * 检测线程项目中的 spawn_agent 调用
 * 返回检测到的子智能体信息
 */
function detectSpawnAgentCalls(
  items: Record<string, AnyThreadItem>,
  itemOrder: string[],
  existingAgentIds: Set<string>
): ChildAgent[] {
  const newAgents: ChildAgent[] = []

  for (const itemId of itemOrder) {
    const item = items[itemId]
    if (!item || item.type !== 'mcpTool') continue

    const mcpItem = item as McpToolItem
    const { tool, arguments: args, result } = mcpItem.content

    // 检测 spawn_agent 工具调用
    if (tool === 'spawn_agent') {
      const agentId = parseSpawnAgentResult(result)
      if (agentId && !existingAgentIds.has(agentId)) {
        const parsedArgs = parseSpawnAgentArgs(args)
        const message = parsedArgs?.message || ''
        const persona = extractPersonaFromMessage(message)

        // 新创建的子智能体初始状态为 'pending'
        // 只有当检测到后续活动（如 send_input）时才变为 'running'
        newAgents.push({
          id: agentId,
          task: message,
          persona,
          status: 'pending',
          output: [],
          createdAt: new Date(mcpItem.createdAt),
        })
      }
    }
  }

  return newAgents
}

// Extract displayable messages from thread items
function extractMessages(
  items: Record<string, AnyThreadItem>,
  itemOrder: string[]
): DisplayMessage[] {
  const messages: DisplayMessage[] = []

  for (const itemId of itemOrder) {
    const item = items[itemId]
    if (!item) continue

    if (item.type === 'userMessage') {
      const userItem = item as UserMessageItem
      // 防守性检查：确保 content.text 是有效的非空字符串
      if (typeof userItem.content?.text === 'string' && userItem.content.text.trim()) {
        messages.push({
          id: itemId,
          role: 'user',
          content: userItem.content.text,
        })
      }
    } else if (item.type === 'agentMessage') {
      const agentItem = item as AgentMessageItem
      // 防守性检查：确保 content.text 是有效字符串（允许空字符串）
      if (typeof agentItem.content?.text === 'string') {
        messages.push({
          id: itemId,
          role: 'assistant',
          content: agentItem.content.text,
        })
      }
    }
  }

  return messages
}

/**
 * 状态优先级映射
 * 数值越大优先级越高，状态只能从低优先级转换到高优先级
 * 这确保了状态转换是单向的，不会从 completed 回退到 running
 */
const STATUS_PRIORITY: Record<ChildAgent['status'], number> = {
  pending: 0,
  running: 1,
  completed: 2,
  error: 3, // error 优先级最高，一旦出错就不应该被覆盖
}

/**
 * 检查是否可以从当前状态转换到新状态
 * 只允许从低优先级状态转换到高优先级状态
 */
function canTransitionStatus(
  currentStatus: ChildAgent['status'],
  newStatus: ChildAgent['status']
): boolean {
  return STATUS_PRIORITY[newStatus] > STATUS_PRIORITY[currentStatus]
}

export function OrchestratorView() {
  const config = useMultiAgentStore((state) => state.config)
  const orchestratorThreadId = useMultiAgentStore((state) => state.orchestratorThreadId)
  const childAgents = useMultiAgentStore((state) => state.childAgents)
  const addChildAgent = useMultiAgentStore((state) => state.addChildAgent)
  const updateChildAgent = useMultiAgentStore((state) => state.updateChildAgent)
  const reset = useMultiAgentStore((state) => state.reset)

  // Get thread state
  const threads = useThreadStore((state) => state.threads)
  const focusedThreadId = useThreadStore((state) => state.focusedThreadId)
  const sendMessage = useThreadStore((state) => state.sendMessage)
  const interrupt = useThreadStore((state) => state.interrupt)
  const switchThread = useThreadStore((state) => state.switchThread)
  const closeThread = useThreadStore((state) => state.closeThread)

  const thread = orchestratorThreadId ? threads[orchestratorThreadId] : null
  const turnStatus = thread?.turnStatus ?? 'idle'

  // 使用 useMemo 包装 items 和 itemOrder，避免每次渲染创建新引用
  // 注意：依赖 thread?.items/itemOrder 是正确的，因为消息会动态添加
  // 不能只依赖 thread?.id，否则新消息添加时 UI 不会更新
  const items = useMemo(() => thread?.items ?? {}, [thread?.items])
  const itemOrder = useMemo(() => thread?.itemOrder ?? [], [thread?.itemOrder])

  // Extract messages for display
  const messages = useMemo(() => extractMessages(items, itemOrder), [items, itemOrder])

  const [showAgentPanel, setShowAgentPanel] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 跟踪已处理的 item IDs，避免重复处理导致的竞态条件
  const processedItemIdsRef = useRef<Set<string>>(new Set())

  // Ensure orchestrator thread is focused (only switch if not already on target thread)
  // Also validates thread existence to prevent UI crashes when thread has been closed
  // Note: 使用 useThreadStore.getState() 获取最新的 threads 状态，而不是将 threads 作为依赖
  // 这避免了因 threads 对象引用变化导致的无限循环问题
  // P0 Fix: 在 switchThread 调用前后都验证线程存在性，防止竞态条件
  useEffect(() => {
    if (orchestratorThreadId) {
      // 在 effect 内部获取最新的 threads 状态，避免将 threads 作为依赖导致无限循环
      const currentThreads = useThreadStore.getState().threads
      const threadExists = Boolean(currentThreads[orchestratorThreadId])

      if (!threadExists) {
        // 线程不存在，记录警告并重置多智能体状态
        log.warn(
          `[OrchestratorView] Orchestrator thread ${orchestratorThreadId} does not exist in threads. Resetting multi-agent state.`,
          'multi-agent'
        )
        // 重置多智能体状态以避免 UI 崩溃
        reset()
        return
      }

      // 线程存在，检查是否需要切换
      if (focusedThreadId !== orchestratorThreadId) {
        // P0 Fix: 在调用 switchThread 前再次验证线程存在性
        // 防止在上面检查后、switchThread 调用前线程被并发关闭的竞态条件
        const latestThreads = useThreadStore.getState().threads
        if (!latestThreads[orchestratorThreadId]) {
          log.warn(
            `[OrchestratorView] Thread ${orchestratorThreadId} was closed during switch preparation. Resetting.`,
            'multi-agent'
          )
          reset()
          return
        }

        log.debug(
          `[OrchestratorView] Switching thread: ${focusedThreadId} -> ${orchestratorThreadId}`,
          'multi-agent'
        )
        switchThread(orchestratorThreadId)
      }
    }
  }, [orchestratorThreadId, focusedThreadId, switchThread, reset])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 组件卸载时清理 processedItemIdsRef，防止内存泄漏
  useEffect(() => {
    return () => {
      processedItemIdsRef.current.clear()
    }
  }, [])

  // 检测 spawn_agent 调用并更新子智能体状态
  // 使用 processedItemIdsRef 跟踪已处理的 items，避免重复处理导致的竞态条件
  // 使用状态优先级确保状态转换是单向的（pending -> running -> completed/error）
  useEffect(() => {
    if (!items || Object.keys(items).length === 0) return

    const existingAgentIds = new Set(Object.keys(childAgents))
    const newAgents = detectSpawnAgentCalls(items, itemOrder, existingAgentIds)

    // 添加新检测到的子智能体
    for (const agent of newAgents) {
      log.debug(`[OrchestratorView] Detected new child agent: ${agent.id}`, 'multi-agent')
      addChildAgent(agent)
    }

    // 收集所有需要的状态更新，按优先级处理
    // 使用 Map 来确保每个 agent 只有一个最终状态更新（选择优先级最高的）
    const pendingUpdates = new Map<
      string,
      { status: ChildAgent['status']; update: Partial<ChildAgent> }
    >()

    // 辅助函数：尝试添加状态更新，只有当新状态优先级更高时才添加
    const tryAddUpdate = (
      agentId: string,
      newStatus: ChildAgent['status'],
      updateData: Partial<ChildAgent>
    ): boolean => {
      const agent = childAgents[agentId]
      if (!agent) return false

      const currentStatus = agent.status

      // 检查状态优先级是否允许转换
      if (!canTransitionStatus(currentStatus, newStatus)) {
        return false
      }

      const existingUpdate = pendingUpdates.get(agentId)
      // 如果已有更新，只在新状态优先级更高时替换
      if (!existingUpdate || STATUS_PRIORITY[newStatus] > STATUS_PRIORITY[existingUpdate.status]) {
        pendingUpdates.set(agentId, { status: newStatus, update: updateData })
        return true
      }
      return false
    }

    // 检测 send_input、close_agent 和 wait 调用，更新状态
    for (const itemId of itemOrder) {
      const item = items[itemId]
      if (!item || item.type !== 'mcpTool') continue

      const mcpItem = item as McpToolItem
      const { tool, arguments: args, result } = mcpItem.content
      const itemStatus = mcpItem.status // 使用 item 的 status

      // 检测 send_input 调用，将子智能体状态从 'pending' 更新为 'running'
      if (tool === 'send_input') {
        // 检查是否已处理过该 item
        const processedKey = `send_input:${itemId}`
        if (processedItemIdsRef.current.has(processedKey)) {
          continue
        }

        const agentId = parseAgentId(args)
        if (agentId) {
          tryAddUpdate(agentId, 'running', { status: 'running' })
        }

        // 只有当 item 已完成或失败时才标记为已处理
        if (itemStatus === 'completed' || itemStatus === 'failed') {
          processedItemIdsRef.current.add(processedKey)
        }
      }

      if (tool === 'close_agent' && itemStatus === 'completed') {
        // 检查是否已处理过该 item
        const processedKey = `close_agent:${itemId}`
        if (processedItemIdsRef.current.has(processedKey)) {
          continue
        }

        // 解析被关闭的智能体 ID
        const agentId = parseAgentId(args)
        if (agentId) {
          tryAddUpdate(agentId, 'completed', {
            status: 'completed',
            completedAt: new Date(),
          })
        }

        processedItemIdsRef.current.add(processedKey)
      }

      if (tool === 'wait' && itemStatus === 'completed') {
        // 检查是否已处理过该 item，避免重复处理
        const processedKey = `wait:${itemId}`
        if (processedItemIdsRef.current.has(processedKey)) {
          continue
        }

        // 解析等待结果，检查是否有错误
        const agentId = parseAgentId(args)
        if (agentId && childAgents[agentId]) {
          // 标记为已处理
          processedItemIdsRef.current.add(processedKey)

          // 从结果中解析状态
          const resultObj = result as { status?: string; timed_out?: boolean } | undefined

          let newStatus: ChildAgent['status']
          let updateData: Partial<ChildAgent>

          if (resultObj?.timed_out) {
            newStatus = 'error'
            updateData = { status: 'error', error: 'Timeout' }
          } else if (resultObj?.status === 'completed' || resultObj?.status === 'idle') {
            newStatus = 'completed'
            updateData = { status: 'completed', completedAt: new Date() }

            // 从结果中提取输出
            const extractedOutput = extractOutputFromWaitResult(result)
            if (extractedOutput.length > 0) {
              const currentOutput = childAgents[agentId].output || []
              updateData.output = [...currentOutput, ...extractedOutput]
              log.debug(
                `[OrchestratorView] Extracted ${extractedOutput.length} output lines for agent ${agentId}`,
                'multi-agent'
              )
            }
          } else {
            // 如果结果不明确，不更新状态
            continue
          }

          tryAddUpdate(agentId, newStatus, updateData)
        }
      }
    }

    // 应用所有收集到的状态更新
    // 由于我们已经收集了优先级最高的更新，这里可以安全地应用
    for (const [agentId, { status, update }] of pendingUpdates) {
      const currentStatus = childAgents[agentId]?.status
      // 再次检查以确保状态转换有效（childAgents 可能在收集过程中已变化）
      if (currentStatus && canTransitionStatus(currentStatus, status)) {
        log.debug(
          `[OrchestratorView] Agent ${agentId} transitioning from ${currentStatus} to ${status}`,
          'multi-agent'
        )
        updateChildAgent(agentId, update)
      }
    }
  }, [items, itemOrder, childAgents, addChildAgent, updateChildAgent])

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !orchestratorThreadId || turnStatus === 'running') return

    const message = inputValue.trim()
    setInputValue('')
    // sendMessage signature: (text, images?, skills?, threadId?)
    await sendMessage(message, undefined, undefined, orchestratorThreadId)
  }, [inputValue, orchestratorThreadId, turnStatus, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleInterrupt = async () => {
    // interrupt takes no arguments, works on focused thread
    await interrupt()
  }

  const handleEndSession = async () => {
    // 添加确认对话
    const childAgentCount = Object.keys(childAgents).length
    if (childAgentCount > 0) {
      const confirmed = window.confirm(
        `End session? This will close ${childAgentCount} agent(s) and clear the conversation.`
      )
      if (!confirmed) return
    }

    // 关闭编排器线程，释放资源
    if (orchestratorThreadId) {
      try {
        await closeThread(orchestratorThreadId)
      } catch (error) {
        log.error(
          `[OrchestratorView] Failed to close orchestrator thread: ${error instanceof Error ? error.message : String(error)}`,
          'multi-agent'
        )
      }
    }
    // 清空已处理的 item IDs，防止内存泄漏
    processedItemIdsRef.current.clear()
    // 确保即使 closeThread 失败也执行 reset
    reset()
  }

  const childAgentCount = Object.keys(childAgents).length
  const runningAgents = Object.values(childAgents).filter((a) => a.status === 'running').length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
            <Bot size={16} className="text-primary" />
          </div>
          <div>
            <h2 className="font-medium">Orchestrator</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FolderOpen size={12} />
              <span className="truncate max-w-[300px]">{config.cwd}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Agent Panel Toggle */}
          <button
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
              showAgentPanel
                ? 'bg-primary/10 text-primary'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
            onClick={() => setShowAgentPanel(!showAgentPanel)}
          >
            <Bot size={14} />
            <span>
              Agents {childAgentCount > 0 && `(${runningAgents}/${childAgentCount})`}
            </span>
            {showAgentPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* End Session */}
          <button
            className="px-3 py-1.5 rounded-lg text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            onClick={handleEndSession}
          >
            End Session
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot size={48} className="text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">
                  Ready to orchestrate
                </h3>
                <p className="text-sm text-muted-foreground/70 mt-2 max-w-md">
                  Describe a complex task and the orchestrator will automatically decompose it,
                  spawn specialized sub-agents, and coordinate their work.
                </p>
              </div>
            ) : (
              messages.map((msg: DisplayMessage) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-3',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot size={16} className="text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg px-4 py-3',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary'
                    )}
                  >
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {msg.content}
                    </pre>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                className="flex-1 resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={messages.length === 0
                  ? "Describe a complex task for the orchestrator..."
                  : "Continue the conversation or adjust the approach..."}
                rows={2}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={turnStatus === 'running'}
              />
              {turnStatus === 'running' ? (
                <button
                  className="px-4 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                  onClick={handleInterrupt}
                  title="Stop"
                >
                  <Square size={18} />
                </button>
              ) : (
                <button
                  className={cn(
                    'px-4 rounded-lg transition-colors',
                    inputValue.trim()
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-primary/50 text-primary-foreground/50 cursor-not-allowed'
                  )}
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  title="Send"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Agent Panel */}
        {showAgentPanel && (
          <div className="w-80 border-l border-border overflow-hidden">
            <AgentPanel />
          </div>
        )}
      </div>
    </div>
  )
}
