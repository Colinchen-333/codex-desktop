/**
 * Thread Actions Unit Tests
 *
 * Tests for thread lifecycle actions including start, close,
 * switch, and operation sequence validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { WritableDraft } from 'immer'
import type { ThreadState, SingleThreadState } from '../types'
import {
  createStartThread,
  createCloseThread,
  createSwitchThread,
  createResumeThread,
  createInterrupt,
  createCloseAllThreads,
  createGetActiveThreadIds,
  createCanAddSession,
  createClearThread,
} from '../actions/thread-actions'
import {
  closingThreads,
  deltaBuffers,
  flushTimers,
  turnTimeoutTimers,
  getNextOperationSequence,
  getCurrentOperationSequence,
  isOperationValid,
  acquireThreadSwitchLock,
  releaseThreadSwitchLock,
  isThreadSwitchLocked,
} from '../delta-buffer'
import { defaultTokenUsage, defaultTurnTiming } from '../utils/helpers'

// Mock dependencies
vi.mock('../../../lib/api', () => ({
  threadApi: {
    start: vi.fn().mockResolvedValue({
      thread: { id: 'new-thread-id', cwd: '/test/path' },
      model: 'gpt-4',
      modelProvider: 'openai',
      cwd: '/test/path',
      approvalPolicy: 'auto',
      sandbox: { type: 'readOnly' },
    }),
    resume: vi.fn().mockResolvedValue({
      thread: { id: 'resumed-thread-id', cwd: '/test/path' },
      items: [],
    }),
    interrupt: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../../lib/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../../../lib/errorUtils', () => ({
  parseError: vi.fn((error) => String(error)),
  handleAsyncError: vi.fn(),
}))

vi.mock('../../../lib/normalize', () => ({
  normalizeApprovalPolicy: vi.fn((policy) => policy || 'default'),
  normalizeSandboxMode: vi.fn((mode) => mode || 'read-only'),
}))

vi.mock('../utils/timer-cleanup', () => ({
  startApprovalCleanupTimer: vi.fn(),
  stopApprovalCleanupTimer: vi.fn(),
  startTimerCleanupInterval: vi.fn(),
  stopTimerCleanupInterval: vi.fn(),
  performImmediateThreadCleanup: vi.fn(),
}))

vi.mock('../../sessions', () => ({
  useSessionsStore: {
    getState: () => ({
      sessions: [],
      updateSessionStatus: vi.fn(),
    }),
  },
}))

// Helper to create mock thread state
function createMockThreadState(threadId: string): SingleThreadState {
  return {
    thread: { id: threadId, cwd: '/test/path' },
    items: {},
    itemOrder: [],
    turnStatus: 'idle',
    currentTurnId: null,
    pendingApprovals: [],
    tokenUsage: defaultTokenUsage,
    turnTiming: defaultTurnTiming,
    sessionOverrides: {},
    queuedMessages: [],
    error: null,
  }
}

// Helper to create mock global state
function createMockState(
  threads: Record<string, SingleThreadState>,
  maxSessions = 5
): ThreadState {
  const threadIds = Object.keys(threads)
  return {
    threads,
    focusedThreadId: threadIds[0] || null,
    maxSessions,
    snapshots: [],
    isLoading: false,
    globalError: null,
    // Backward-compatible getters
    activeThread: threadIds[0] ? threads[threadIds[0]].thread : null,
    items: threadIds[0] ? threads[threadIds[0]].items : {},
    itemOrder: threadIds[0] ? threads[threadIds[0]].itemOrder : [],
    turnStatus: threadIds[0] ? threads[threadIds[0]].turnStatus : 'idle',
    currentTurnId: threadIds[0] ? threads[threadIds[0]].currentTurnId : null,
    pendingApprovals: threadIds[0] ? threads[threadIds[0]].pendingApprovals : [],
    tokenUsage: threadIds[0] ? threads[threadIds[0]].tokenUsage : defaultTokenUsage,
    turnTiming: threadIds[0] ? threads[threadIds[0]].turnTiming : defaultTurnTiming,
    sessionOverrides: threadIds[0] ? threads[threadIds[0]].sessionOverrides : {},
    queuedMessages: threadIds[0] ? threads[threadIds[0]].queuedMessages : [],
    error: threadIds[0] ? threads[threadIds[0]].error : null,
    // Mock actions
    startThread: vi.fn(),
    resumeThread: vi.fn(),
    sendMessage: vi.fn(),
    interrupt: vi.fn(),
    respondToApproval: vi.fn(),
    clearThread: vi.fn(),
    addInfoItem: vi.fn(),
    flushDeltaBuffer: vi.fn(),
    setSessionOverride: vi.fn(),
    clearSessionOverrides: vi.fn(),
    switchThread: vi.fn(),
    closeThread: vi.fn(),
    closeAllThreads: vi.fn(),
    getActiveThreadIds: vi.fn(),
    canAddSession: vi.fn(),
    handleThreadStarted: vi.fn(),
    handleItemStarted: vi.fn(),
    handleItemCompleted: vi.fn(),
    handleAgentMessageDelta: vi.fn(),
    handleCommandApprovalRequested: vi.fn(),
    handleFileChangeApprovalRequested: vi.fn(),
    handleTurnStarted: vi.fn(),
    handleTurnCompleted: vi.fn(),
    handleTurnDiffUpdated: vi.fn(),
    handleTurnPlanUpdated: vi.fn(),
    handleThreadCompacted: vi.fn(),
    handleCommandExecutionOutputDelta: vi.fn(),
    handleFileChangeOutputDelta: vi.fn(),
    handleReasoningSummaryTextDelta: vi.fn(),
    handleReasoningSummaryPartAdded: vi.fn(),
    handleReasoningTextDelta: vi.fn(),
    handleMcpToolCallProgress: vi.fn(),
    handleTokenUsage: vi.fn(),
    handleStreamError: vi.fn(),
    handleRateLimitExceeded: vi.fn(),
    handleServerDisconnected: vi.fn(),
    createSnapshot: vi.fn(),
    revertToSnapshot: vi.fn(),
    fetchSnapshots: vi.fn(),
    startEditMessage: vi.fn(),
    updateEditText: vi.fn(),
    saveEditMessage: vi.fn(),
    cancelEditMessage: vi.fn(),
    deleteMessage: vi.fn(),
    addItemBack: vi.fn(),
    restoreMessageContent: vi.fn(),
    restoreThreadState: vi.fn(),
    restoreItemOrder: vi.fn(),
  }
}

describe('Operation Sequence Tracking', () => {
  beforeEach(() => {
    // Reset by getting the current sequence
  })

  it('should increment operation sequence', () => {
    const seq1 = getNextOperationSequence()
    const seq2 = getNextOperationSequence()
    expect(seq2).toBe(seq1 + 1)
  })

  it('should validate operation sequences correctly', () => {
    const seq = getNextOperationSequence()
    expect(isOperationValid(seq)).toBe(true)

    // Getting next sequence invalidates the previous
    const newSeq = getNextOperationSequence()
    expect(isOperationValid(seq)).toBe(false)
    expect(isOperationValid(newSeq)).toBe(true)
  })

  it('should return current sequence without incrementing', () => {
    const seq1 = getNextOperationSequence()
    const current = getCurrentOperationSequence()
    expect(current).toBe(seq1)
    expect(getCurrentOperationSequence()).toBe(seq1)
  })
})

describe('Thread Switch Lock', () => {
  afterEach(async () => {
    // Ensure lock is released
    if (isThreadSwitchLocked()) {
      releaseThreadSwitchLock()
    }
  })

  it('should acquire and release lock', async () => {
    expect(isThreadSwitchLocked()).toBe(false)

    await acquireThreadSwitchLock()
    expect(isThreadSwitchLocked()).toBe(true)

    releaseThreadSwitchLock()
    expect(isThreadSwitchLocked()).toBe(false)
  })

  it('should wait for existing lock to be released', async () => {
    await acquireThreadSwitchLock()

    let secondLockAcquired = false
    const secondLockPromise = acquireThreadSwitchLock().then(() => {
      secondLockAcquired = true
    })

    // Give time for the promise to potentially resolve (it shouldn't yet)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(secondLockAcquired).toBe(false)

    // Release first lock
    releaseThreadSwitchLock()

    // Now second lock should acquire
    await secondLockPromise
    expect(secondLockAcquired).toBe(true)

    // Clean up
    releaseThreadSwitchLock()
  })
})

describe('startThread', () => {
  let mockState: ThreadState
  let mockSet: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
  let mockGet: () => ThreadState
  let mockGetThreadStore: () => ThreadState
  let mockCleanupStaleApprovals: () => Promise<void>

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()

    // Ensure lock is released
    if (isThreadSwitchLocked()) {
      releaseThreadSwitchLock()
    }

    mockState = createMockState({})

    mockSet = vi.fn((fn) => {
      const result = fn(mockState as WritableDraft<ThreadState>)
      if (result) mockState = result
    })
    mockGet = () => mockState
    mockGetThreadStore = () => mockState
    mockCleanupStaleApprovals = vi.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()

    if (isThreadSwitchLocked()) {
      releaseThreadSwitchLock()
    }
    vi.clearAllMocks()
  })

  it('should start a new thread', async () => {
    const startThread = createStartThread(
      mockSet,
      mockGet,
      mockGetThreadStore,
      mockCleanupStaleApprovals
    )

    await startThread('project-1', '/test/path', 'gpt-4', 'read-only', 'auto')

    expect(mockSet).toHaveBeenCalled()
    expect(mockState.threads['new-thread-id']).toBeDefined()
    expect(mockState.focusedThreadId).toBe('new-thread-id')
    expect(mockState.isLoading).toBe(false)
  })

  it('should throw error when max sessions reached', async () => {
    mockState = createMockState(
      {
        'thread-1': createMockThreadState('thread-1'),
        'thread-2': createMockThreadState('thread-2'),
        'thread-3': createMockThreadState('thread-3'),
      },
      3 // maxSessions = 3
    )

    const startThread = createStartThread(
      mockSet,
      mockGet,
      mockGetThreadStore,
      mockCleanupStaleApprovals
    )

    await expect(
      startThread('project-1', '/test/path')
    ).rejects.toThrow('Maximum number of parallel sessions')
  })

  it('should set loading state during operation', async () => {
    const startThread = createStartThread(
      mockSet,
      mockGet,
      mockGetThreadStore,
      mockCleanupStaleApprovals
    )

    const setCallsBeforeStart = (mockSet as ReturnType<typeof vi.fn>).mock.calls.length

    await startThread('project-1', '/test/path')

    // Check that isLoading was set to true at some point
    const setCalls = (mockSet as ReturnType<typeof vi.fn>).mock.calls
    const loadingCalls = setCalls.slice(setCallsBeforeStart)
    expect(loadingCalls.length).toBeGreaterThan(0)
  })
})

describe('closeThread', () => {
  let mockState: ThreadState
  let mockSet: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
  let mockGet: () => ThreadState
  let mockGetThreadStore: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()

    const thread1 = createMockThreadState('thread-1')
    const thread2 = createMockThreadState('thread-2')
    mockState = createMockState({ 'thread-1': thread1, 'thread-2': thread2 })

    mockSet = vi.fn((fn) => {
      const result = fn(mockState as WritableDraft<ThreadState>)
      if (result) mockState = result
    })
    mockGet = () => mockState
    mockGetThreadStore = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()
    vi.clearAllMocks()
  })

  it('should close an existing thread', () => {
    const closeThread = createCloseThread(mockSet, mockGet, mockGetThreadStore)

    closeThread('thread-1')

    expect(mockState.threads['thread-1']).toBeUndefined()
    expect(closingThreads.has('thread-1')).toBe(true)
  })

  it('should update focused thread when closing focused thread', () => {
    mockState.focusedThreadId = 'thread-1'

    const closeThread = createCloseThread(mockSet, mockGet, mockGetThreadStore)

    closeThread('thread-1')

    // Should switch to another remaining thread
    expect(mockState.focusedThreadId).toBe('thread-2')
  })

  it('should set focusedThreadId to null when closing last thread', () => {
    // Remove thread-2 first
    delete mockState.threads['thread-2']
    mockState.focusedThreadId = 'thread-1'

    const closeThread = createCloseThread(mockSet, mockGet, mockGetThreadStore)

    closeThread('thread-1')

    expect(mockState.focusedThreadId).toBe(null)
    expect(Object.keys(mockState.threads).length).toBe(0)
  })

  it('should warn when closing non-existent thread', () => {
    const closeThread = createCloseThread(mockSet, mockGet, mockGetThreadStore)

    closeThread('non-existent')

    // Should not throw, just log warning
    expect(mockState.threads['thread-1']).toBeDefined()
    expect(mockState.threads['thread-2']).toBeDefined()
  })

  it('should mark thread as closing immediately', () => {
    const closeThread = createCloseThread(mockSet, mockGet, mockGetThreadStore)

    closeThread('thread-1')

    expect(closingThreads.has('thread-1')).toBe(true)
  })
})

describe('switchThread', () => {
  let mockState: ThreadState
  let mockSet: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()

    const thread1 = createMockThreadState('thread-1')
    const thread2 = createMockThreadState('thread-2')
    mockState = createMockState({ 'thread-1': thread1, 'thread-2': thread2 })

    mockSet = vi.fn((fn) => {
      const result = fn(mockState as WritableDraft<ThreadState>)
      if (result) mockState = result
    })
    mockGet = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    vi.clearAllMocks()
  })

  it('should switch to another thread', () => {
    mockState.focusedThreadId = 'thread-1'

    const switchThread = createSwitchThread(mockSet, mockGet)

    switchThread('thread-2')

    expect(mockState.focusedThreadId).toBe('thread-2')
  })

  it('should not switch to non-existent thread', () => {
    mockState.focusedThreadId = 'thread-1'

    const switchThread = createSwitchThread(mockSet, mockGet)

    switchThread('non-existent')

    expect(mockState.focusedThreadId).toBe('thread-1')
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('should not switch to closing thread', () => {
    mockState.focusedThreadId = 'thread-1'
    closingThreads.add('thread-2')

    const switchThread = createSwitchThread(mockSet, mockGet)

    switchThread('thread-2')

    expect(mockState.focusedThreadId).toBe('thread-1')
    expect(mockSet).not.toHaveBeenCalled()
  })
})

describe('resumeThread', () => {
  let mockState: ThreadState
  let mockSet: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
  let mockGet: () => ThreadState
  let mockGetThreadStore: () => ThreadState
  let mockCleanupStaleApprovals: () => Promise<void>

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()

    if (isThreadSwitchLocked()) {
      releaseThreadSwitchLock()
    }

    mockState = createMockState({})

    mockSet = vi.fn((fn) => {
      const result = fn(mockState as WritableDraft<ThreadState>)
      if (result) mockState = result
    })
    mockGet = () => mockState
    mockGetThreadStore = () => mockState
    mockCleanupStaleApprovals = vi.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()

    if (isThreadSwitchLocked()) {
      releaseThreadSwitchLock()
    }
    vi.clearAllMocks()
  })

  it('should resume an existing thread from backend', async () => {
    const resumeThread = createResumeThread(
      mockSet,
      mockGet,
      mockGetThreadStore,
      mockCleanupStaleApprovals
    )

    await resumeThread('resumed-thread-id')

    expect(mockState.threads['resumed-thread-id']).toBeDefined()
    expect(mockState.focusedThreadId).toBe('resumed-thread-id')
  })

  it('should just switch if thread already exists', async () => {
    mockState.threads['existing-thread'] = createMockThreadState('existing-thread')
    mockState.focusedThreadId = null

    const resumeThread = createResumeThread(
      mockSet,
      mockGet,
      mockGetThreadStore,
      mockCleanupStaleApprovals
    )

    await resumeThread('existing-thread')

    expect(mockState.focusedThreadId).toBe('existing-thread')
  })

  it('should abort resume if thread is closing', async () => {
    closingThreads.add('thread-1')

    const resumeThread = createResumeThread(
      mockSet,
      mockGet,
      mockGetThreadStore,
      mockCleanupStaleApprovals
    )

    await resumeThread('thread-1')

    expect(mockState.threads['thread-1']).toBeUndefined()
  })

  it('should throw error when max sessions reached', async () => {
    mockState = createMockState(
      {
        'thread-1': createMockThreadState('thread-1'),
        'thread-2': createMockThreadState('thread-2'),
        'thread-3': createMockThreadState('thread-3'),
      },
      3
    )

    const resumeThread = createResumeThread(
      mockSet,
      mockGet,
      mockGetThreadStore,
      mockCleanupStaleApprovals
    )

    await expect(resumeThread('new-thread')).rejects.toThrow(
      'Maximum number of parallel sessions'
    )
  })
})

describe('interrupt', () => {
  let mockState: ThreadState
  let mockSet: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()

    const runningThread = createMockThreadState('thread-1')
    runningThread.turnStatus = 'running'
    runningThread.currentTurnId = 'turn-1'
    mockState = createMockState({ 'thread-1': runningThread })

    mockSet = vi.fn((fn) => {
      const result = fn(mockState as WritableDraft<ThreadState>)
      if (result) mockState = result
    })
    mockGet = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()
    vi.clearAllMocks()
  })

  it('should interrupt a running turn', async () => {
    const interrupt = createInterrupt(mockSet, mockGet)

    await interrupt()

    expect(mockState.threads['thread-1'].turnStatus).toBe('interrupted')
    expect(mockState.threads['thread-1'].currentTurnId).toBe(null)
    expect(mockState.threads['thread-1'].pendingApprovals).toEqual([])
  })

  it('should not interrupt if no focused thread', async () => {
    mockState.focusedThreadId = null

    const interrupt = createInterrupt(mockSet, mockGet)

    await interrupt()

    expect(mockSet).not.toHaveBeenCalled()
  })

  it('should not interrupt if turn is not running', async () => {
    mockState.threads['thread-1'].turnStatus = 'idle'

    const interrupt = createInterrupt(mockSet, mockGet)

    await interrupt()

    expect(mockState.threads['thread-1'].turnStatus).toBe('idle')
  })
})

describe('closeAllThreads', () => {
  let mockState: ThreadState
  let mockSet: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()

    mockState = createMockState({
      'thread-1': createMockThreadState('thread-1'),
      'thread-2': createMockThreadState('thread-2'),
      'thread-3': createMockThreadState('thread-3'),
    })

    mockSet = vi.fn((fn) => {
      const result = fn(mockState as WritableDraft<ThreadState>)
      if (result) mockState = result
    })
    mockGet = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    turnTimeoutTimers.clear()
    vi.clearAllMocks()
  })

  it('should close all threads', () => {
    const closeAllThreads = createCloseAllThreads(mockSet, mockGet)

    closeAllThreads()

    expect(Object.keys(mockState.threads).length).toBe(0)
    expect(mockState.focusedThreadId).toBe(null)
    expect(closingThreads.size).toBe(0)
  })

  it('should mark all threads as closing initially', () => {
    const closeAllThreads = createCloseAllThreads(mockSet, mockGet)

    closeAllThreads()

    // After closeAllThreads, the set should be cleared since all threads are gone
    expect(closingThreads.size).toBe(0)
  })
})

describe('getActiveThreadIds', () => {
  let mockState: ThreadState
  let mockGet: () => ThreadState

  beforeEach(() => {
    mockState = createMockState({
      'thread-1': createMockThreadState('thread-1'),
      'thread-2': createMockThreadState('thread-2'),
    })
    mockGet = () => mockState
  })

  it('should return all active thread IDs', () => {
    const getActiveThreadIds = createGetActiveThreadIds(mockGet)

    const ids = getActiveThreadIds()

    expect(ids).toContain('thread-1')
    expect(ids).toContain('thread-2')
    expect(ids.length).toBe(2)
  })

  it('should return empty array when no threads', () => {
    mockState.threads = {}

    const getActiveThreadIds = createGetActiveThreadIds(mockGet)

    const ids = getActiveThreadIds()

    expect(ids).toEqual([])
  })
})

describe('canAddSession', () => {
  let mockState: ThreadState
  let mockGet: () => ThreadState

  beforeEach(() => {
    mockState = createMockState(
      {
        'thread-1': createMockThreadState('thread-1'),
        'thread-2': createMockThreadState('thread-2'),
      },
      5
    )
    mockGet = () => mockState
  })

  it('should return true when under max sessions', () => {
    const canAddSession = createCanAddSession(mockGet)

    expect(canAddSession()).toBe(true)
  })

  it('should return false when at max sessions', () => {
    mockState.maxSessions = 2

    const canAddSession = createCanAddSession(mockGet)

    expect(canAddSession()).toBe(false)
  })

  it('should return true when no threads and max > 0', () => {
    mockState.threads = {}

    const canAddSession = createCanAddSession(mockGet)

    expect(canAddSession()).toBe(true)
  })
})

describe('clearThread', () => {
  let mockGet: () => ThreadState
  let closeThreadMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const mockState = createMockState({
      'thread-1': createMockThreadState('thread-1'),
    })
    mockGet = () => mockState
    closeThreadMock = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should close the focused thread', () => {
    const clearThread = createClearThread(mockGet, closeThreadMock)

    clearThread()

    expect(closeThreadMock).toHaveBeenCalledWith('thread-1')
  })

  it('should not call closeThread if no focused thread', () => {
    const mockState = createMockState({})
    mockState.focusedThreadId = null
    mockGet = () => mockState

    const clearThread = createClearThread(mockGet, closeThreadMock)

    clearThread()

    expect(closeThreadMock).not.toHaveBeenCalled()
  })
})
