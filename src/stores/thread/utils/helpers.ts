/**
 * Thread Store Helper Functions
 *
 * Utility functions for converting and normalizing thread data.
 */

import { isRecord } from '../../../lib/typeGuards'
import type {
  ThreadItemType,
  ThreadItem,
  AnyThreadItem,
  UserMessageItem,
  AgentMessageItem,
  CommandExecutionItem,
  FileChangeItem,
  ReasoningItem,
  McpToolItem,
  WebSearchItem,
  ReviewItem,
  InfoItem,
  TokenUsage,
  TurnTiming,
  SingleThreadState,
} from '../types'
import type { ThreadInfo } from '../../../lib/api'

// ==================== Type Mapping ====================

export function mapItemType(type: string): ThreadItemType {
  const typeMap: Record<string, ThreadItemType> = {
    userMessage: 'userMessage',
    agentMessage: 'agentMessage',
    reasoning: 'reasoning',
    commandExecution: 'commandExecution',
    fileChange: 'fileChange',
    mcpToolCall: 'mcpTool',
    webSearch: 'webSearch',
    imageView: 'info',
    enteredReviewMode: 'review',
    exitedReviewMode: 'review',
  }
  return typeMap[type] || 'agentMessage'
}

// ==================== Status Normalization ====================

export function normalizeStatus(status?: string | null): ThreadItem['status'] {
  if (!status) return 'completed'
  const normalized = status.toLowerCase()
  switch (normalized) {
    case 'completed':
      return 'completed'
    case 'failed':
    case 'declined':
    case 'cancelled':
    case 'canceled':
    case 'aborted':
    case 'interrupted':
      return 'failed'
    case 'inprogress':
    case 'in_progress':
    case 'in-progress':
    case 'running':
    case 'open':
      return 'inProgress'
    case 'pending':
    case 'queued':
      return 'pending'
    default:
      return 'completed'
  }
}

// ==================== Command Action Stringification ====================

export function stringifyCommandAction(action: unknown): string {
  if (!action || typeof action !== 'object') return 'unknown'
  const record = isRecord(action) ? action : null
  if (!record) return 'unknown'

  const type = String(record.type || record.kind || record.action || 'action')
  const command = typeof record.command === 'string' ? record.command : ''
  const path = typeof record.path === 'string' ? record.path : ''
  const query = typeof record.query === 'string' ? record.query : ''
  const parts = [type, command, path, query].filter(Boolean)
  return parts.join(' ')
}

// ==================== Thread Item Conversion ====================

export function toThreadItem(item: { id: string; type: string } & Record<string, unknown>): AnyThreadItem {
  const base = {
    id: item.id,
    type: mapItemType(item.type),
    status: normalizeStatus(item.status as string | undefined),
    // Preserve original timestamp from backend if available, otherwise use current time
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
  }

  switch (item.type) {
    case 'userMessage':
      return {
        ...base,
        type: 'userMessage',
        content: {
          text:
            Array.isArray(item.content) && item.content.length > 0
              ? item.content
                  .map((entry) => {
                    if (entry && typeof entry === 'object' && 'text' in (entry as object)) {
                      return String((entry as { text?: string }).text || '')
                    }
                    return ''
                  })
                  .join('\n')
              : '',
          images: Array.isArray(item.content)
            ? item.content
                .map((entry) => {
                  if (entry && typeof entry === 'object') {
                    const asObj = entry as { type?: string; url?: string; path?: string }
                    if (asObj.type === 'image' && asObj.url) return asObj.url
                    if (asObj.type === 'localImage' && asObj.path) return asObj.path
                  }
                  return null
                })
                .filter(Boolean) as string[]
            : undefined,
        },
      } as UserMessageItem
    case 'agentMessage':
      return {
        ...base,
        type: 'agentMessage',
        content: {
          text: typeof item.text === 'string' ? item.text : '',
          isStreaming: base.status === 'inProgress',
        },
      } as AgentMessageItem
    case 'reasoning':
      return {
        ...base,
        type: 'reasoning',
        content: {
          summary: Array.isArray(item.summary) ? (item.summary as string[]) : [],
          fullContent: Array.isArray(item.content) ? (item.content as string[]) : undefined,
          isStreaming: base.status === 'inProgress',
        },
      } as ReasoningItem
    case 'commandExecution':
      return {
        ...base,
        type: 'commandExecution',
        content: {
          callId: item.id,
          command: typeof item.command === 'string' ? item.command : '',
          cwd: typeof item.cwd === 'string' ? item.cwd : '',
          commandActions: Array.isArray(item.commandActions)
            ? (item.commandActions as unknown[]).map(stringifyCommandAction)
            : undefined,
          output: typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : '',
          stdout: typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : undefined,
          exitCode: typeof item.exitCode === 'number' ? item.exitCode : undefined,
          durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
          needsApproval: false,
          approved: undefined,
          isRunning: base.status === 'inProgress',
        },
      } as CommandExecutionItem
    case 'fileChange':
      return {
        ...base,
        type: 'fileChange',
        content: {
          changes: Array.isArray(item.changes)
            ? (item.changes as Array<Record<string, unknown>>).map((change) => {
                const kind = change.kind as { type?: string; movePath?: string } | string
                if (typeof kind === 'string') {
                  const lower = kind.toLowerCase()
                  return {
                    path: String(change.path || ''),
                    kind: lower === 'add' ? 'add' : lower === 'delete' ? 'delete' : 'modify',
                    diff: String(change.diff || ''),
                  }
                }
                if (kind && typeof kind === 'object') {
                  if (kind.type === 'add') {
                    return { path: String(change.path || ''), kind: 'add', diff: String(change.diff || '') }
                  }
                  if (kind.type === 'delete') {
                    return { path: String(change.path || ''), kind: 'delete', diff: String(change.diff || '') }
                  }
                  const movePath =
                    typeof (kind as { movePath?: string }).movePath === 'string'
                      ? (kind as { movePath?: string }).movePath
                      : undefined
                  return {
                    path: String(change.path || ''),
                    kind: movePath ? 'rename' : 'modify',
                    diff: String(change.diff || ''),
                    oldPath: movePath,
                  }
                }
                return { path: String(change.path || ''), kind: 'modify', diff: String(change.diff || '') }
              })
            : [],
          needsApproval: false,
          approved: undefined,
          applied: base.status === 'completed',
        },
      } as FileChangeItem
    case 'mcpToolCall':
      return {
        ...base,
        type: 'mcpTool',
        content: {
          callId: item.id,
          server: typeof item.server === 'string' ? item.server : '',
          tool: typeof item.tool === 'string' ? item.tool : '',
          arguments: item.arguments ?? {},
          result: item.result,
          error: item.error ? String((item.error as { message?: string }).message || item.error) : undefined,
          durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
          isRunning: base.status === 'inProgress',
        },
      } as McpToolItem
    case 'webSearch':
      return {
        ...base,
        type: 'webSearch',
        content: {
          query: typeof item.query === 'string' ? item.query : '',
          results: Array.isArray(item.results)
            ? (item.results as Array<Record<string, unknown>>).map((result) => ({
                title: typeof result.title === 'string' ? result.title : '',
                url: typeof result.url === 'string' ? result.url : '',
                snippet: typeof result.snippet === 'string' ? result.snippet : '',
              }))
            : undefined,
          isSearching: base.status === 'inProgress',
        },
      } as WebSearchItem
    case 'enteredReviewMode':
      return {
        ...base,
        type: 'review',
        content: {
          phase: 'started',
          text: typeof item.review === 'string' ? item.review : 'Review started',
        },
      } as ReviewItem
    case 'exitedReviewMode':
      return {
        ...base,
        type: 'review',
        content: {
          phase: 'completed',
          text: typeof item.review === 'string' ? item.review : '',
        },
      } as ReviewItem
    case 'imageView':
      return {
        ...base,
        type: 'info',
        content: {
          title: 'Image view',
          details: typeof item.path === 'string' ? item.path : '',
        },
      } as InfoItem
    default:
      return {
        ...base,
        type: 'info' as const,
        content: {
          title: `Unknown item type: ${String(item.type)}`,
          details: JSON.stringify(item, null, 2),
        },
      } as InfoItem
  }
}

// ==================== Default Values ====================

export const defaultTokenUsage: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  modelContextWindow: null,
}

export const defaultTurnTiming: TurnTiming = {
  startedAt: null,
  completedAt: null,
}

// ==================== Thread State Creation ====================

export function createEmptyThreadState(thread: ThreadInfo): SingleThreadState {
  return {
    thread,
    items: {},
    itemOrder: [],
    turnStatus: 'idle',
    currentTurnId: null,
    pendingApprovals: [],
    approvalInFlight: {},
    tokenUsage: defaultTokenUsage,
    turnTiming: defaultTurnTiming,
    sessionOverrides: {},
    queuedMessages: [],
    error: null,
  }
}

// ==================== Focused Thread Helper ====================

export function getFocusedThreadState(
  threads: Record<string, SingleThreadState>,
  focusedThreadId: string | null
): SingleThreadState | undefined {
  if (!focusedThreadId) return undefined
  return threads[focusedThreadId]
}
