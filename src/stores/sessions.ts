import { create } from 'zustand'
import { sessionApi, type SessionMetadata } from '../lib/api'

interface SessionsState {
  sessions: SessionMetadata[]
  selectedSessionId: string | null
  isLoading: boolean
  error: string | null

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
    }
  ) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  addSession: (session: SessionMetadata) => void
}

export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: [],
  selectedSessionId: null,
  isLoading: false,
  error: null,

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
        updates.isArchived
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
}))
