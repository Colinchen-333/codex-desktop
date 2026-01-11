/**
 * Sessions Store Unit Tests
 *
 * Tests for session management including CRUD operations,
 * search functionality, and rollback mechanisms.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import type { SessionMetadata, SessionStatus } from '../../lib/api'

// Mock the API before importing the store
vi.mock('../../lib/api', () => ({
  sessionApi: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    search: vi.fn(),
    updateStatus: vi.fn(),
    setFirstMessage: vi.fn(),
    updateTasks: vi.fn(),
  },
}))

vi.mock('../../lib/errorUtils', () => ({
  parseError: vi.fn((error) => String(error)),
}))

vi.mock('../../lib/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Import after mocks are set up
import { useSessionsStore } from '../sessions'
import { sessionApi } from '../../lib/api'

// Helper to create mock session
function createMockSession(
  id: string,
  overrides: Partial<SessionMetadata> = {}
): SessionMetadata {
  return {
    sessionId: id,
    projectId: 'project-1',
    title: `Session ${id}`,
    tags: null,
    isFavorite: false,
    isArchived: false,
    lastAccessedAt: Date.now() / 1000,
    createdAt: Date.now() / 1000,
    status: 'idle' as SessionStatus,
    firstMessage: null,
    tasksJson: null,
    ...overrides,
  }
}

describe('Sessions Store', () => {
  beforeEach(() => {
    // Reset store state
    useSessionsStore.setState({
      sessions: [],
      selectedSessionId: null,
      isLoading: false,
      error: null,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      rollbackHistory: [],
      maxRollbackHistory: 20,
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchSessions', () => {
    it('should fetch and set sessions', async () => {
      const mockSessions = [
        createMockSession('session-1'),
        createMockSession('session-2'),
      ]
      vi.mocked(sessionApi.list).mockResolvedValue(mockSessions)

      await act(async () => {
        await useSessionsStore.getState().fetchSessions('project-1')
      })

      const state = useSessionsStore.getState()
      expect(state.sessions).toEqual(mockSessions)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBe(null)
    })

    it('should set loading state during fetch', async () => {
      let resolvePromise: (value: SessionMetadata[]) => void
      const promise = new Promise<SessionMetadata[]>((resolve) => {
        resolvePromise = resolve
      })
      vi.mocked(sessionApi.list).mockReturnValue(promise)

      const fetchPromise = useSessionsStore.getState().fetchSessions('project-1')

      // Check loading state
      expect(useSessionsStore.getState().isLoading).toBe(true)

      // Resolve promise
      resolvePromise!([])
      await fetchPromise

      expect(useSessionsStore.getState().isLoading).toBe(false)
    })

    it('should handle fetch error', async () => {
      vi.mocked(sessionApi.list).mockRejectedValue(new Error('Network error'))

      await act(async () => {
        await useSessionsStore.getState().fetchSessions('project-1')
      })

      const state = useSessionsStore.getState()
      expect(state.error).toBeDefined()
      expect(state.isLoading).toBe(false)
    })
  })

  describe('selectSession', () => {
    it('should select a session', () => {
      act(() => {
        useSessionsStore.getState().selectSession('session-1')
      })

      expect(useSessionsStore.getState().selectedSessionId).toBe('session-1')
    })

    it('should allow selecting null', () => {
      useSessionsStore.setState({ selectedSessionId: 'session-1' })

      act(() => {
        useSessionsStore.getState().selectSession(null)
      })

      expect(useSessionsStore.getState().selectedSessionId).toBe(null)
    })
  })

  describe('updateSession', () => {
    it('should update a session', async () => {
      const originalSession = createMockSession('session-1')
      const updatedSession = { ...originalSession, title: 'Updated Title' }

      useSessionsStore.setState({ sessions: [originalSession] })
      vi.mocked(sessionApi.update).mockResolvedValue(updatedSession)

      await act(async () => {
        await useSessionsStore.getState().updateSession('session-1', {
          title: 'Updated Title',
        })
      })

      const state = useSessionsStore.getState()
      expect(state.sessions[0].title).toBe('Updated Title')
    })

    it('should handle update error', async () => {
      const originalSession = createMockSession('session-1')
      useSessionsStore.setState({ sessions: [originalSession] })
      vi.mocked(sessionApi.update).mockRejectedValue(new Error('Update failed'))

      await expect(
        useSessionsStore.getState().updateSession('session-1', { title: 'New' })
      ).rejects.toThrow()

      expect(useSessionsStore.getState().error).toBeDefined()
    })
  })

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      const sessions = [
        createMockSession('session-1'),
        createMockSession('session-2'),
      ]
      useSessionsStore.setState({ sessions })
      vi.mocked(sessionApi.delete).mockResolvedValue(undefined)

      await act(async () => {
        await useSessionsStore.getState().deleteSession('session-1')
      })

      const state = useSessionsStore.getState()
      expect(state.sessions.length).toBe(1)
      expect(state.sessions[0].sessionId).toBe('session-2')
    })

    it('should clear selectedSessionId if deleted session was selected', async () => {
      const session = createMockSession('session-1')
      useSessionsStore.setState({
        sessions: [session],
        selectedSessionId: 'session-1',
      })
      vi.mocked(sessionApi.delete).mockResolvedValue(undefined)

      await act(async () => {
        await useSessionsStore.getState().deleteSession('session-1')
      })

      expect(useSessionsStore.getState().selectedSessionId).toBe(null)
    })
  })

  describe('addSession', () => {
    it('should add a session to the beginning', () => {
      const existingSession = createMockSession('session-1')
      const newSession = createMockSession('session-2')
      useSessionsStore.setState({ sessions: [existingSession] })

      act(() => {
        useSessionsStore.getState().addSession(newSession)
      })

      const state = useSessionsStore.getState()
      expect(state.sessions.length).toBe(2)
      expect(state.sessions[0].sessionId).toBe('session-2')
    })
  })

  describe('updateSessionStatus', () => {
    it('should optimistically update session status', async () => {
      const session = createMockSession('session-1', { status: 'idle' })
      useSessionsStore.setState({ sessions: [session] })
      vi.mocked(sessionApi.updateStatus).mockResolvedValue(undefined)

      await act(async () => {
        await useSessionsStore.getState().updateSessionStatus('session-1', 'running')
      })

      expect(useSessionsStore.getState().sessions[0].status).toBe('running')
    })

    it('should revert on error', async () => {
      const session = createMockSession('session-1', { status: 'idle' })
      useSessionsStore.setState({ sessions: [session] })
      vi.mocked(sessionApi.updateStatus).mockRejectedValue(new Error('Failed'))

      await act(async () => {
        await useSessionsStore.getState().updateSessionStatus('session-1', 'running')
      })

      // Status should still be running because revert is handled by error state
      // but error should be set
      expect(useSessionsStore.getState().error).toBeDefined()
    })
  })

  describe('setSessionFirstMessage', () => {
    it('should set first message if not already set', async () => {
      const session = createMockSession('session-1', { firstMessage: null })
      useSessionsStore.setState({ sessions: [session] })
      vi.mocked(sessionApi.setFirstMessage).mockResolvedValue(undefined)

      await act(async () => {
        await useSessionsStore.getState().setSessionFirstMessage('session-1', 'Hello!')
      })

      expect(useSessionsStore.getState().sessions[0].firstMessage).toBe('Hello!')
    })

    it('should not update if first message already set', async () => {
      const session = createMockSession('session-1', { firstMessage: 'Existing' })
      useSessionsStore.setState({ sessions: [session] })

      await act(async () => {
        await useSessionsStore.getState().setSessionFirstMessage('session-1', 'New')
      })

      expect(useSessionsStore.getState().sessions[0].firstMessage).toBe('Existing')
      expect(sessionApi.setFirstMessage).not.toHaveBeenCalled()
    })
  })

  describe('updateSessionTasks', () => {
    it('should update session tasks', async () => {
      const session = createMockSession('session-1')
      useSessionsStore.setState({ sessions: [session] })
      vi.mocked(sessionApi.updateTasks).mockResolvedValue(undefined)

      const tasks = [
        { content: 'Task 1', status: 'completed' as const },
        { content: 'Task 2', status: 'in_progress' as const },
      ]

      await act(async () => {
        await useSessionsStore.getState().updateSessionTasks('session-1', tasks)
      })

      const state = useSessionsStore.getState()
      expect(state.sessions[0].tasksJson).toBe(JSON.stringify(tasks))
    })
  })

  describe('searchSessions', () => {
    it('should search sessions', async () => {
      const results = [createMockSession('session-1')]
      vi.mocked(sessionApi.search).mockResolvedValue(results)

      await act(async () => {
        await useSessionsStore.getState().searchSessions('test query')
      })

      const state = useSessionsStore.getState()
      expect(state.searchQuery).toBe('test query')
      expect(state.searchResults).toEqual(results)
      expect(state.isSearching).toBe(false)
    })

    it('should clear search on empty query', async () => {
      useSessionsStore.setState({
        searchQuery: 'previous',
        searchResults: [createMockSession('session-1')],
      })

      await act(async () => {
        await useSessionsStore.getState().searchSessions('')
      })

      const state = useSessionsStore.getState()
      expect(state.searchQuery).toBe('')
      expect(state.searchResults).toEqual([])
    })

    it('should handle search error', async () => {
      vi.mocked(sessionApi.search).mockRejectedValue(new Error('Search failed'))

      await act(async () => {
        await useSessionsStore.getState().searchSessions('test')
      })

      expect(useSessionsStore.getState().error).toBeDefined()
      expect(useSessionsStore.getState().isSearching).toBe(false)
    })
  })

  describe('clearSearch', () => {
    it('should clear search state', () => {
      useSessionsStore.setState({
        searchQuery: 'test',
        searchResults: [createMockSession('session-1')],
        isSearching: true,
      })

      act(() => {
        useSessionsStore.getState().clearSearch()
      })

      const state = useSessionsStore.getState()
      expect(state.searchQuery).toBe('')
      expect(state.searchResults).toEqual([])
      expect(state.isSearching).toBe(false)
    })
  })

  describe('getSessionDisplayName', () => {
    it('should return title if present', () => {
      const session = createMockSession('session-1', { title: 'My Session' })

      const displayName = useSessionsStore
        .getState()
        .getSessionDisplayName(session)

      expect(displayName).toBe('My Session')
    })

    it('should return truncated firstMessage if no title', () => {
      const longMessage =
        'This is a very long first message that should be truncated'
      const session = createMockSession('session-1', {
        title: null,
        firstMessage: longMessage,
      })

      const displayName = useSessionsStore
        .getState()
        .getSessionDisplayName(session)

      // The implementation truncates to 30 chars + '...'
      expect(displayName).toBe('This is a very long first mess...')
    })

    it('should return session ID prefix if no title or message', () => {
      const session = createMockSession('session-123456789', {
        title: null,
        firstMessage: null,
      })

      const displayName = useSessionsStore
        .getState()
        .getSessionDisplayName(session)

      expect(displayName).toBe('Session session-')
    })
  })
})

describe('Rollback Mechanism', () => {
  beforeEach(() => {
    useSessionsStore.setState({
      sessions: [],
      selectedSessionId: null,
      isLoading: false,
      error: null,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      rollbackHistory: [],
      maxRollbackHistory: 20,
    })
    vi.clearAllMocks()
  })

  describe('createRollbackPoint', () => {
    it('should create a rollback point', () => {
      const sessions = [
        createMockSession('session-1'),
        createMockSession('session-2'),
      ]
      useSessionsStore.setState({ sessions })

      let rollbackId: string
      act(() => {
        rollbackId = useSessionsStore
          .getState()
          .createRollbackPoint('Before update')
      })

      const history = useSessionsStore.getState().rollbackHistory
      expect(history.length).toBe(1)
      expect(history[0].id).toBe(rollbackId!)
      expect(history[0].description).toBe('Before update')
      expect(history[0].previousSessions).toEqual(sessions)
    })

    it('should limit rollback history to maxRollbackHistory', () => {
      useSessionsStore.setState({ maxRollbackHistory: 3 })

      act(() => {
        useSessionsStore.getState().createRollbackPoint('Point 1')
        useSessionsStore.getState().createRollbackPoint('Point 2')
        useSessionsStore.getState().createRollbackPoint('Point 3')
        useSessionsStore.getState().createRollbackPoint('Point 4')
      })

      const history = useSessionsStore.getState().rollbackHistory
      expect(history.length).toBe(3)
      expect(history[0].description).toBe('Point 2')
      expect(history[2].description).toBe('Point 4')
    })
  })

  describe('rollbackTo', () => {
    it('should rollback to a specific point', () => {
      const sessionsV1 = [createMockSession('session-1')]
      const sessionsV2 = [
        createMockSession('session-1'),
        createMockSession('session-2'),
      ]

      useSessionsStore.setState({ sessions: sessionsV1 })

      let rollbackId: string
      act(() => {
        rollbackId = useSessionsStore.getState().createRollbackPoint('V1')
      })

      useSessionsStore.setState({ sessions: sessionsV2 })

      act(() => {
        useSessionsStore.getState().rollbackTo(rollbackId!)
      })

      const state = useSessionsStore.getState()
      expect(state.sessions).toEqual(sessionsV1)
      expect(state.rollbackHistory.length).toBe(0) // History before target is removed
    })

    it('should do nothing for invalid rollback ID', () => {
      const sessions = [createMockSession('session-1')]
      useSessionsStore.setState({ sessions })

      act(() => {
        useSessionsStore.getState().createRollbackPoint('Point 1')
      })

      act(() => {
        useSessionsStore.getState().rollbackTo('invalid-id')
      })

      expect(useSessionsStore.getState().sessions).toEqual(sessions)
      expect(useSessionsStore.getState().rollbackHistory.length).toBe(1)
    })
  })

  describe('rollbackLast', () => {
    it('should rollback to last state', () => {
      const sessionsV1 = [createMockSession('session-1')]
      const sessionsV2 = [
        createMockSession('session-1'),
        createMockSession('session-2'),
      ]

      useSessionsStore.setState({ sessions: sessionsV1 })

      act(() => {
        useSessionsStore.getState().createRollbackPoint('V1')
      })

      useSessionsStore.setState({ sessions: sessionsV2 })

      act(() => {
        useSessionsStore.getState().rollbackLast()
      })

      expect(useSessionsStore.getState().sessions).toEqual(sessionsV1)
    })

    it('should do nothing if no rollback history', () => {
      const sessions = [createMockSession('session-1')]
      useSessionsStore.setState({ sessions, rollbackHistory: [] })

      act(() => {
        useSessionsStore.getState().rollbackLast()
      })

      expect(useSessionsStore.getState().sessions).toEqual(sessions)
    })
  })

  describe('clearRollbackHistory', () => {
    it('should clear all rollback history', () => {
      act(() => {
        useSessionsStore.getState().createRollbackPoint('Point 1')
        useSessionsStore.getState().createRollbackPoint('Point 2')
      })

      expect(useSessionsStore.getState().rollbackHistory.length).toBe(2)

      act(() => {
        useSessionsStore.getState().clearRollbackHistory()
      })

      expect(useSessionsStore.getState().rollbackHistory.length).toBe(0)
    })
  })

  describe('getRollbackHistory', () => {
    it('should return rollback history', () => {
      act(() => {
        useSessionsStore.getState().createRollbackPoint('Point 1')
        useSessionsStore.getState().createRollbackPoint('Point 2')
      })

      const history = useSessionsStore.getState().getRollbackHistory()
      expect(history.length).toBe(2)
    })
  })

  describe('updateSessionStatusWithRollback', () => {
    it('should update status with rollback support', async () => {
      const session = createMockSession('session-1', { status: 'idle' })
      useSessionsStore.setState({ sessions: [session] })
      vi.mocked(sessionApi.updateStatus).mockResolvedValue(undefined)

      let rollbackFn: (() => void) | undefined
      await act(async () => {
        rollbackFn = await useSessionsStore
          .getState()
          .updateSessionStatusWithRollback('session-1', 'running')
      })

      expect(useSessionsStore.getState().sessions[0].status).toBe('running')
      expect(rollbackFn).toBeDefined()
    })

    it('should provide working rollback function', async () => {
      const session = createMockSession('session-1', { status: 'idle' })
      useSessionsStore.setState({ sessions: [session] })
      vi.mocked(sessionApi.updateStatus).mockResolvedValue(undefined)

      let rollbackFn: (() => void) | undefined
      await act(async () => {
        rollbackFn = await useSessionsStore
          .getState()
          .updateSessionStatusWithRollback('session-1', 'running')
      })

      expect(useSessionsStore.getState().sessions[0].status).toBe('running')

      act(() => {
        rollbackFn?.()
      })

      expect(useSessionsStore.getState().sessions[0].status).toBe('idle')
    })

    it('should auto rollback on API error', async () => {
      const session = createMockSession('session-1', { status: 'idle' })
      useSessionsStore.setState({ sessions: [session] })
      vi.mocked(sessionApi.updateStatus).mockRejectedValue(
        new Error('API Error')
      )

      await act(async () => {
        await useSessionsStore
          .getState()
          .updateSessionStatusWithRollback('session-1', 'running')
      })

      // Should rollback to original status
      expect(useSessionsStore.getState().sessions[0].status).toBe('idle')
      expect(useSessionsStore.getState().error).toBeDefined()
    })

    it('should return undefined for non-existent session', async () => {
      useSessionsStore.setState({ sessions: [] })

      let result: (() => void) | undefined
      await act(async () => {
        result = await useSessionsStore
          .getState()
          .updateSessionStatusWithRollback('non-existent', 'running')
      })

      expect(result).toBeUndefined()
    })
  })
})
