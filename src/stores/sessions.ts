import { create } from 'zustand'
import { sessionApi, type SessionMetadata, type SessionStatus, type TaskItem } from '../lib/api'

interface SessionsState {
  sessions: SessionMetadata[]
  selectedSessionId: string | null
  isLoading: boolean
  error: string | null

  // Search state
  searchQuery: string
  searchResults: SessionMetadata[]
  isSearching: boolean

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
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,

  fetchSessions: async (projectId: string) => {
    set({ isLoading: true, error: null })
    try {
      const sessions = await sessionApi.list(projectId)
      set({ sessions, isLoading: false })
    } catch (error) {
      set({ error: String(error), isLoading: false })
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
      set({ error: String(error) })
      throw error
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await sessionApi.delete(sessionId)
      set((state) => ({
        sessions: state.sessions.filter((s) => s.sessionId !== sessionId),
        selectedSessionId:
          state.selectedSessionId === sessionId ? null : state.selectedSessionId,
      }))
    } catch (error) {
      set({ error: String(error) })
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
    // Optimistic update
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, status } : s
      ),
    }))
    try {
      await sessionApi.updateStatus(sessionId, status)
    } catch (error) {
      // Revert on error
      console.error('Failed to update session status:', error)
      set({ error: String(error) })
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
        console.error('Failed to set session first message:', error)
      }
    }
  },

  // Update tasks for progress tracking
  updateSessionTasks: async (sessionId: string, tasks: TaskItem[]) => {
    const tasksJson = JSON.stringify(tasks)
    // Optimistic update
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, tasksJson } : s
      ),
    }))
    try {
      await sessionApi.updateTasks(sessionId, tasks)
    } catch (error) {
      console.error('Failed to update session tasks:', error)
    }
  },

  searchSessions: async (query: string, tagsFilter?: string[], favoritesOnly?: boolean) => {
    if (!query.trim()) {
      set({ searchQuery: '', searchResults: [], isSearching: false })
      return
    }

    set({ searchQuery: query, isSearching: true })
    try {
      const results = await sessionApi.search(query, tagsFilter, favoritesOnly)
      set({ searchResults: results, isSearching: false })
    } catch (error) {
      set({ error: String(error), isSearching: false })
    }
  },

  clearSearch: () => {
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
}))
