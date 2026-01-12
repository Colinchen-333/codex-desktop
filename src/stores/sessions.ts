import { create } from 'zustand'
import { sessionApi, type SessionMetadata, type SessionStatus, type TaskItem } from '../lib/api'
import { parseError } from '../lib/errorUtils'
import { log } from '../lib/logger'
import { eventBus } from '../lib/eventBus'

/**
 * 回滚记录类型
 */
interface RollbackRecord {
  id: string
  timestamp: number
  previousSessions: SessionMetadata[]
  description: string
}

export interface SessionsState {
  sessions: SessionMetadata[]
  selectedSessionId: string | null
  isLoading: boolean
  error: string | null

  // Search state
  searchQuery: string
  searchResults: SessionMetadata[]
  isSearching: boolean

  // Rollback state
  rollbackHistory: RollbackRecord[]
  maxRollbackHistory: number

  // Actions
  fetchSessions: (projectId: string) => Promise<void>
  selectSession: (id: string | null) => void
  updateSession: (
    sessionId: string,
    updates: {
      title?: string
      tags?: string[]
      isFavorite?: boolean
      isArchived?: boolean
      status?: SessionStatus
      firstMessage?: string
      projectId?: string
    }
  ) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  addSession: (session: SessionMetadata) => void

  // Status management actions
  updateSessionStatus: (sessionId: string, status: SessionStatus) => Promise<void>
  setSessionFirstMessage: (sessionId: string, firstMessage: string) => Promise<void>
  updateSessionTasks: (sessionId: string, tasks: TaskItem[]) => Promise<void>

  // Search actions
  searchSessions: (query: string, tagsFilter?: string[], favoritesOnly?: boolean) => Promise<void>
  clearSearch: () => void

  // Helper to get session display name
  getSessionDisplayName: (session: SessionMetadata) => string

  // Rollback actions
  /**
   * 创建回滚点
   * @param description - 回滚点描述
   * @returns 回滚点 ID
   */
  createRollbackPoint: (description: string) => string
  /**
   * 回滚到指定的回滚点
   * @param rollbackId - 回滚点 ID
   */
  rollbackTo: (rollbackId: string) => void
  /**
   * 回滚到上一个状态
   */
  rollbackLast: () => void
  /**
   * 清除回滚历史
   */
  clearRollbackHistory: () => void
  /**
   * 获取回滚历史
   */
  getRollbackHistory: () => RollbackRecord[]

  // Optimistic update with rollback
  /**
   * 带回滚支持的乐观更新会话状态
   * @param sessionId - 会话 ID
   * @param status - 新状态
   * @returns 回滚函数
   */
  updateSessionStatusWithRollback: (
    sessionId: string,
    status: SessionStatus
  ) => Promise<(() => void) | undefined>

  // P1 Fix: Lifecycle management
  /**
   * 初始化事件监听器
   */
  initialize: () => void
  /**
   * 清理事件监听器
   */
  cleanup: () => void
}

/**
 * 生成唯一 ID (使用 milliseconds 时间戳)
 */
function generateRollbackId(): string {
  return `rollback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function cloneSessionsSnapshot(sessions: SessionMetadata[]): SessionMetadata[] {
  if (typeof structuredClone === 'function') {
    return structuredClone(sessions)
  }
  return sessions.map((session) => ({
    ...session,
    tags: session.tags ? [...session.tags] : session.tags,
  }))
}

let fetchSessionsSeq = 0
let searchSessionsSeq = 0
const statusUpdateSeq = new Map<string, number>()

/**
 * P1 Fix: Helper to clear all sequence numbers
 */
function clearAllSequences(): void {
  fetchSessionsSeq = 0
  searchSessionsSeq = 0
  statusUpdateSeq.clear()
}

export const useSessionsStore = create<SessionsState>((set, get) => {
  // P1 Fix: Event listener cleanup handlers
  let cleanupHandlers: (() => void)[] = []

  // P1 Fix: Event handlers defined inside the store factory
  const handleStatusUpdate = ({ sessionId, status }: { sessionId: string; status: SessionStatus }) => {
    void get()
      .updateSessionStatus(sessionId, status)
      .catch((error) => {
        log.error(`Failed to handle session status update: ${error}`, 'sessions')
      })
  }

  const handleFirstMessage = ({ sessionId, firstMessage }: { sessionId: string; firstMessage: string }) => {
    void get()
      .setSessionFirstMessage(sessionId, firstMessage)
      .catch((error) => {
        log.error(`Failed to handle session first message update: ${error}`, 'sessions')
      })
  }

  const initEventListeners = () => {
    if (cleanupHandlers.length > 0) {
      log.warn('[SessionsStore] Event listeners already initialized, reinitializing', 'sessions')
      cleanupHandlers.forEach((cleanup) => cleanup())
      cleanupHandlers = []
    }

    eventBus.on('session:status-update', handleStatusUpdate)
    eventBus.on('session:set-first-message', handleFirstMessage)

    cleanupHandlers = [
      () => eventBus.off('session:status-update', handleStatusUpdate),
      () => eventBus.off('session:set-first-message', handleFirstMessage),
    ]

    log.debug('[SessionsStore] Event listeners initialized', 'sessions')
  }

  return {
  sessions: [],
  selectedSessionId: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,

  // Rollback state
  rollbackHistory: [],
  maxRollbackHistory: 20,

  fetchSessions: async (projectId: string) => {
    fetchSessionsSeq += 1
    const requestId = fetchSessionsSeq
    set({ isLoading: true, error: null })
    try {
      const sessions = await sessionApi.list(projectId)
      if (requestId !== fetchSessionsSeq) return
      set({ sessions, isLoading: false })
    } catch (error) {
      if (requestId !== fetchSessionsSeq) return
      set({ error: parseError(error), isLoading: false })
    }
  },

  selectSession: (id: string | null) => {
    set({ selectedSessionId: id })
  },

  updateSession: async (sessionId, updates) => {
    try {
      const updated = await sessionApi.update(
        sessionId,
        updates.title,
        updates.tags,
        updates.isFavorite,
        updates.isArchived,
        updates.status,
        updates.firstMessage,
        undefined, // tasksJson - not used in this method
        updates.projectId // projectId for creating new session metadata
      )
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId ? updated : s
        ),
      }))
    } catch (error) {
      set({ error: parseError(error) })
      throw error
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await sessionApi.delete(sessionId)
      // P1 Fix: Clear status update sequence for deleted session
      statusUpdateSeq.delete(sessionId)
      set((state) => ({
        sessions: state.sessions.filter((s) => s.sessionId !== sessionId),
        selectedSessionId:
          state.selectedSessionId === sessionId ? null : state.selectedSessionId,
      }))
    } catch (error) {
      set({ error: parseError(error) })
      throw error
    }
  },

  addSession: (session: SessionMetadata) => {
    set((state) => ({
      sessions: [session, ...state.sessions],
    }))
  },

  // Lightweight status update - optimistic update then sync
  updateSessionStatus: async (sessionId: string, status: SessionStatus) => {
    const existing = get().sessions.find((s) => s.sessionId === sessionId)
    if (!existing) return

    const previousStatus = existing.status
    const nextSeq = (statusUpdateSeq.get(sessionId) ?? 0) + 1
    statusUpdateSeq.set(sessionId, nextSeq)

    // Optimistic update
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, status } : s
      ),
    }))
    try {
      await sessionApi.updateStatus(sessionId, status)
    } catch (error) {
      if (statusUpdateSeq.get(sessionId) !== nextSeq) return
      // Revert on error
      log.error(`Failed to update session status: ${error}`, 'sessions')
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, status: previousStatus } : s
        ),
      }))
      set({ error: parseError(error) })
    }
  },

  // Set first message - only updates if not already set
  setSessionFirstMessage: async (sessionId: string, firstMessage: string) => {
    const session = get().sessions.find((s) => s.sessionId === sessionId)
    // Only update if first message not already set
    if (session && !session.firstMessage) {
      // Optimistic update
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, firstMessage } : s
        ),
      }))
      try {
        await sessionApi.setFirstMessage(sessionId, firstMessage)
      } catch (error) {
        log.error(`Failed to set session first message: ${error}`, 'sessions')
      }
    }
  },

  // Update tasks for progress tracking
  updateSessionTasks: async (sessionId: string, tasks: TaskItem[]) => {
    let tasksJson: string
    let tasksToSend = tasks // Track which tasks to send to API

    try {
      tasksJson = JSON.stringify(tasks)

      // P2: Check serialized size to prevent memory issues
      const MAX_TASKS_JSON_SIZE = 1024 * 1024 // 1MB limit
      const sizeBytes = new TextEncoder().encode(tasksJson).length

      if (sizeBytes > MAX_TASKS_JSON_SIZE) {
        log.warn(
          `Tasks JSON size (${(sizeBytes / 1024).toFixed(1)}KB) exceeds limit (${(MAX_TASKS_JSON_SIZE / 1024).toFixed(1)}KB). Truncating tasks.`,
          'sessions'
        )
        // Keep only the most recent tasks until we're under the limit
        let truncatedTasks = tasks.slice(-Math.floor(tasks.length / 2))
        let truncatedJson = JSON.stringify(truncatedTasks)
        let truncatedSize = new TextEncoder().encode(truncatedJson).length

        while (truncatedSize > MAX_TASKS_JSON_SIZE && truncatedTasks.length > 1) {
          truncatedTasks = truncatedTasks.slice(-Math.floor(truncatedTasks.length / 2))
          truncatedJson = JSON.stringify(truncatedTasks)
          truncatedSize = new TextEncoder().encode(truncatedJson).length
        }

        tasksJson = truncatedJson
        tasksToSend = truncatedTasks // Send truncated tasks to API
        log.info(
          `Truncated tasks from ${tasks.length} to ${truncatedTasks.length} items (${(truncatedSize / 1024).toFixed(1)}KB)`,
          'sessions'
        )
      }
    } catch (e) {
      log.error(`Failed to serialize tasks: ${e}`, 'sessions')
      tasksJson = '[]'
      tasksToSend = [] // Send empty array on serialization error
    }
    // Optimistic update
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, tasksJson } : s
      ),
    }))
    try {
      await sessionApi.updateTasks(sessionId, tasksToSend)
    } catch (error) {
      log.error(`Failed to update session tasks: ${error}`, 'sessions')
    }
  },

  searchSessions: async (query: string, tagsFilter?: string[], favoritesOnly?: boolean) => {
    if (!query.trim()) {
      searchSessionsSeq += 1
      set({ searchQuery: '', searchResults: [], isSearching: false })
      return
    }

    searchSessionsSeq += 1
    const requestId = searchSessionsSeq
    set({ searchQuery: query, isSearching: true })
    try {
      const results = await sessionApi.search(query, tagsFilter, favoritesOnly)
      if (requestId !== searchSessionsSeq) return
      set({ searchResults: results, isSearching: false })
    } catch (error) {
      if (requestId !== searchSessionsSeq) return
      set({ error: parseError(error), isSearching: false })
    }
  },

  clearSearch: () => {
    searchSessionsSeq += 1
    set({ searchQuery: '', searchResults: [], isSearching: false })
  },

  // Helper to get display name for a session
  getSessionDisplayName: (session: SessionMetadata) => {
    if (session.title && session.title.trim()) {
      return session.title
    }
    if (session.firstMessage) {
      // Truncate to 30 chars
      const msg = session.firstMessage.trim()
      return msg.length > 30 ? msg.slice(0, 30) + '...' : msg
    }
    return `Session ${session.sessionId.slice(0, 8)}`
  },

  // ============================================
  // Rollback Actions
  // ============================================

  /**
   * 创建回滚点
   * 保存当前 sessions 状态的快照
   */
  createRollbackPoint: (description: string) => {
    const id = generateRollbackId()
    const { sessions, rollbackHistory, maxRollbackHistory } = get()

    const newRecord: RollbackRecord = {
      id,
      timestamp: Date.now(),
      previousSessions: cloneSessionsSnapshot(sessions), // 深拷贝当前状态
      description,
    }

    // 添加新记录并限制历史记录数量
    const updatedHistory = [...rollbackHistory, newRecord]
    if (updatedHistory.length > maxRollbackHistory) {
      updatedHistory.shift() // 移除最旧的记录
    }

    set({ rollbackHistory: updatedHistory })
    log.info(`Created rollback point: ${id} - ${description}`, 'sessions')

    return id
  },

  /**
   * 回滚到指定的回滚点
   */
  rollbackTo: (rollbackId: string) => {
    const { rollbackHistory } = get()
    const targetIndex = rollbackHistory.findIndex((r) => r.id === rollbackId)

    if (targetIndex === -1) {
      log.warn(`Rollback point not found: ${rollbackId}`, 'sessions')
      return
    }

    const targetRecord = rollbackHistory[targetIndex]

    // 恢复状态
    set({
      sessions: [...targetRecord.previousSessions],
      // 移除该回滚点之后的所有记录
      rollbackHistory: rollbackHistory.slice(0, targetIndex),
    })

    log.info(`Rolled back to: ${rollbackId} - ${targetRecord.description}`, 'sessions')
  },

  /**
   * 回滚到上一个状态
   */
  rollbackLast: () => {
    const { rollbackHistory } = get()

    if (rollbackHistory.length === 0) {
      log.warn('No rollback history available', 'sessions')
      return
    }

    const lastRecord = rollbackHistory[rollbackHistory.length - 1]

    // 恢复状态
    set({
      sessions: [...lastRecord.previousSessions],
      rollbackHistory: rollbackHistory.slice(0, -1),
    })

    log.info(`Rolled back to last state: ${lastRecord.description}`, 'sessions')
  },

  /**
   * 清除回滚历史
   */
  clearRollbackHistory: () => {
    set({ rollbackHistory: [] })
    log.info('Cleared rollback history', 'sessions')
  },

  /**
   * 获取回滚历史
   */
  getRollbackHistory: () => {
    return get().rollbackHistory
  },

  /**
   * 带回滚支持的乐观更新会话状态
   * 先执行乐观更新，如果 API 调用失败则自动回滚
   */
  updateSessionStatusWithRollback: async (sessionId: string, status: SessionStatus) => {
    const { sessions } = get()

    // 找到目标会话并保存之前的状态
    const targetSession = sessions.find((s) => s.sessionId === sessionId)
    if (!targetSession) {
      log.warn(`Session not found for rollback: ${sessionId}`, 'sessions')
      return undefined
    }

    const previousStatus = targetSession.status

    // 创建回滚函数
    const rollback = () => {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, status: previousStatus } : s
        ),
      }))
      log.info(`Rolled back session status: ${sessionId} to ${previousStatus}`, 'sessions')
    }

    // 乐观更新
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, status } : s
      ),
    }))

    try {
      await sessionApi.updateStatus(sessionId, status)
      log.info(`Session status updated: ${sessionId} to ${status}`, 'sessions')
      return rollback // 返回回滚函数供调用者手动使用
    } catch (error) {
      // API 调用失败，自动回滚
      log.error(`Failed to update session status, rolling back: ${error}`, 'sessions')
      rollback()
      set({ error: parseError(error) })
      return undefined
    }
  },

  // P1 Fix: Lifecycle management methods
  initialize: () => {
    initEventListeners()
  },

  cleanup: () => {
    cleanupHandlers.forEach((cleanup) => cleanup())
    cleanupHandlers = []
    // P1 Fix: Clear all sequence numbers on cleanup
    clearAllSequences()
    log.debug('[SessionsStore] Event listeners and sequences cleaned up', 'sessions')
  },
  }
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    useSessionsStore.getState().cleanup()
  })
}
