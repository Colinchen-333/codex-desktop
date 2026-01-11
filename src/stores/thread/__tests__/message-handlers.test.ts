/**
 * Message Handlers Unit Tests
 *
 * Tests for message-related event handlers including item started,
 * item completed, and delta handlers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { WritableDraft } from 'immer'
import type {
  ItemStartedEvent,
  ItemCompletedEvent,
  AgentMessageDeltaEvent,
  CommandExecutionOutputDeltaEvent,
  FileChangeOutputDeltaEvent,
  ReasoningSummaryTextDeltaEvent,
  ReasoningTextDeltaEvent,
  McpToolCallProgressEvent,
} from '../../../lib/events'
import type { ThreadState, SingleThreadState, AnyThreadItem } from '../types'
import {
  createHandleItemStarted,
  createHandleItemCompleted,
  createHandleAgentMessageDelta,
  createHandleCommandExecutionOutputDelta,
  createHandleFileChangeOutputDelta,
  createHandleReasoningSummaryTextDelta,
  createHandleReasoningTextDelta,
  createHandleMcpToolCallProgress,
} from '../handlers/message-handlers'
import { closingThreads, deltaBuffers, flushTimers } from '../delta-buffer'
import { defaultTokenUsage, defaultTurnTiming } from '../utils/helpers'

// Mock dependencies
vi.mock('../../../lib/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../../../lib/errorUtils', () => ({
  handleAsyncError: vi.fn(),
}))

vi.mock('../../sessions', () => ({
  useSessionsStore: {
    getState: () => ({
      sessions: [],
      setSessionFirstMessage: vi.fn(),
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
function createMockState(threads: Record<string, SingleThreadState>): ThreadState {
  const threadIds = Object.keys(threads)
  return {
    threads,
    focusedThreadId: threadIds[0] || null,
    maxSessions: 5,
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

describe('handleItemStarted', () => {
  let mockState: ThreadState
  let mockSet: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
  let mockGet: () => ThreadState

  beforeEach(() => {
    // Clear closing threads set
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()

    const threadState = createMockThreadState('thread-1')
    mockState = createMockState({ 'thread-1': threadState })

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
    vi.clearAllMocks()
  })

  it('should add a new item to the thread', () => {
    const handleItemStarted = createHandleItemStarted(mockSet, mockGet)

    const event: ItemStartedEvent = {
      item: {
        id: 'item-1',
        type: 'agentMessage',
        text: 'Hello world',
        status: 'inProgress',
        createdAt: Date.now(),
      },
      threadId: 'thread-1',
      turnId: 'turn-1',
    }

    handleItemStarted(event)

    expect(mockSet).toHaveBeenCalled()
    expect(mockState.threads['thread-1'].items['item-1']).toBeDefined()
    expect(mockState.threads['thread-1'].items['item-1'].status).toBe('inProgress')
    expect(mockState.threads['thread-1'].itemOrder).toContain('item-1')
  })

  it('should ignore events for closing threads', () => {
    closingThreads.add('thread-1')

    const handleItemStarted = createHandleItemStarted(mockSet, mockGet)

    const event: ItemStartedEvent = {
      item: {
        id: 'item-1',
        type: 'agentMessage',
        text: 'Hello world',
      },
      threadId: 'thread-1',
      turnId: 'turn-1',
    }

    handleItemStarted(event)

    // Should not call set for closing threads
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('should ignore events for non-existent threads', () => {
    const handleItemStarted = createHandleItemStarted(mockSet, mockGet)

    const event: ItemStartedEvent = {
      item: {
        id: 'item-1',
        type: 'agentMessage',
        text: 'Hello world',
      },
      threadId: 'non-existent-thread',
      turnId: 'turn-1',
    }

    handleItemStarted(event)

    expect(mockSet).not.toHaveBeenCalled()
  })

  it('should not add duplicate user messages', () => {
    // Pre-populate with existing user message
    mockState.threads['thread-1'].items['existing-user'] = {
      id: 'existing-user',
      type: 'userMessage',
      status: 'completed',
      content: { text: 'Hello' },
      createdAt: Date.now(),
    } as AnyThreadItem
    mockState.threads['thread-1'].itemOrder = ['existing-user']

    const handleItemStarted = createHandleItemStarted(mockSet, mockGet)

    const event: ItemStartedEvent = {
      item: {
        id: 'new-user',
        type: 'userMessage',
        content: [{ text: 'Hello' }],
      },
      threadId: 'thread-1',
      turnId: 'turn-1',
    }

    handleItemStarted(event)

    // The new duplicate message should not be added
    expect(mockState.threads['thread-1'].items['new-user']).toBeUndefined()
  })

  it('should handle existing items by adding to order if not present', () => {
    // Pre-populate with existing item but not in order
    mockState.threads['thread-1'].items['item-1'] = {
      id: 'item-1',
      type: 'agentMessage',
      status: 'inProgress',
      content: { text: 'Hello', isStreaming: true },
      createdAt: Date.now(),
    } as AnyThreadItem

    const handleItemStarted = createHandleItemStarted(mockSet, mockGet)

    const event: ItemStartedEvent = {
      item: {
        id: 'item-1',
        type: 'agentMessage',
        text: 'Hello world',
      },
      threadId: 'thread-1',
      turnId: 'turn-1',
    }

    handleItemStarted(event)

    expect(mockState.threads['thread-1'].itemOrder).toContain('item-1')
  })
})

describe('handleItemCompleted', () => {
  let mockState: ThreadState
  let mockSet: (fn: (state: WritableDraft<ThreadState>) => ThreadState | void) => void
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()

    const threadState = createMockThreadState('thread-1')
    mockState = createMockState({ 'thread-1': threadState })

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
    vi.clearAllMocks()
  })

  it('should complete an existing item', () => {
    // Pre-populate with in-progress item
    mockState.threads['thread-1'].items['item-1'] = {
      id: 'item-1',
      type: 'agentMessage',
      status: 'inProgress',
      content: { text: 'Hello', isStreaming: true },
      createdAt: Date.now(),
    } as AnyThreadItem
    mockState.threads['thread-1'].itemOrder = ['item-1']

    const handleItemCompleted = createHandleItemCompleted(mockSet, mockGet)

    const event: ItemCompletedEvent = {
      item: {
        id: 'item-1',
        type: 'agentMessage',
        text: 'Hello world',
        status: 'completed',
      },
      threadId: 'thread-1',
      turnId: 'turn-1',
    }

    handleItemCompleted(event)

    expect(mockSet).toHaveBeenCalled()
    expect(mockState.threads['thread-1'].items['item-1'].status).toBe('completed')
  })

  it('should add new item if not exists', () => {
    const handleItemCompleted = createHandleItemCompleted(mockSet, mockGet)

    const event: ItemCompletedEvent = {
      item: {
        id: 'item-1',
        type: 'agentMessage',
        text: 'Hello world',
        status: 'completed',
      },
      threadId: 'thread-1',
      turnId: 'turn-1',
    }

    handleItemCompleted(event)

    expect(mockState.threads['thread-1'].items['item-1']).toBeDefined()
    expect(mockState.threads['thread-1'].itemOrder).toContain('item-1')
  })

  it('should ignore events for closing threads', () => {
    closingThreads.add('thread-1')

    const handleItemCompleted = createHandleItemCompleted(mockSet, mockGet)

    const event: ItemCompletedEvent = {
      item: {
        id: 'item-1',
        type: 'agentMessage',
        text: 'Hello world',
      },
      threadId: 'thread-1',
      turnId: 'turn-1',
    }

    handleItemCompleted(event)

    expect(mockSet).not.toHaveBeenCalled()
  })

  it('should preserve needsApproval and approved fields for command execution', () => {
    // Pre-populate with command execution item
    mockState.threads['thread-1'].items['cmd-1'] = {
      id: 'cmd-1',
      type: 'commandExecution',
      status: 'inProgress',
      content: {
        callId: 'call-1',
        command: 'npm test',
        cwd: '/test',
        needsApproval: true,
        approved: true,
        output: 'existing output',
      },
      createdAt: Date.now(),
    } as AnyThreadItem
    mockState.threads['thread-1'].itemOrder = ['cmd-1']

    const handleItemCompleted = createHandleItemCompleted(mockSet, mockGet)

    const event: ItemCompletedEvent = {
      item: {
        id: 'cmd-1',
        type: 'commandExecution',
        command: 'npm test',
        cwd: '/test',
        exitCode: 0,
        status: 'completed',
      },
      threadId: 'thread-1',
      turnId: 'turn-1',
    }

    handleItemCompleted(event)

    const item = mockState.threads['thread-1'].items['cmd-1'] as AnyThreadItem
    expect(item.status).toBe('completed')
    // Preserved fields should still exist
    if (item.type === 'commandExecution') {
      expect(item.content.needsApproval).toBe(true)
      expect(item.content.approved).toBe(true)
    }
  })

  it('should preserve fields for file change items', () => {
    // Pre-populate with file change item
    mockState.threads['thread-1'].items['file-1'] = {
      id: 'file-1',
      type: 'fileChange',
      status: 'inProgress',
      content: {
        changes: [],
        needsApproval: true,
        approved: true,
        applied: true,
        snapshotId: 'snapshot-1',
        output: 'existing output',
      },
      createdAt: Date.now(),
    } as AnyThreadItem
    mockState.threads['thread-1'].itemOrder = ['file-1']

    const handleItemCompleted = createHandleItemCompleted(mockSet, mockGet)

    const event: ItemCompletedEvent = {
      item: {
        id: 'file-1',
        type: 'fileChange',
        changes: [{ path: '/test.txt', kind: 'add', diff: '+test' }],
        status: 'completed',
      },
      threadId: 'thread-1',
      turnId: 'turn-1',
    }

    handleItemCompleted(event)

    const item = mockState.threads['thread-1'].items['file-1'] as AnyThreadItem
    expect(item.status).toBe('completed')
    if (item.type === 'fileChange') {
      expect(item.content.needsApproval).toBe(true)
      expect(item.content.approved).toBe(true)
      expect(item.content.applied).toBe(true)
      expect(item.content.snapshotId).toBe('snapshot-1')
    }
  })
})

describe('handleAgentMessageDelta', () => {
  let mockState: ThreadState
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()

    const threadState = createMockThreadState('thread-1')
    mockState = createMockState({ 'thread-1': threadState })
    mockGet = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    vi.clearAllMocks()
  })

  it('should accumulate deltas in buffer', () => {
    const handleAgentMessageDelta = createHandleAgentMessageDelta(mockGet)

    const event: AgentMessageDeltaEvent = {
      itemId: 'item-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'Hello ',
    }

    handleAgentMessageDelta(event)

    const buffer = deltaBuffers.get('thread-1')
    expect(buffer).toBeDefined()
    expect(buffer?.agentMessages.get('item-1')).toBe('Hello ')
  })

  it('should append multiple deltas', () => {
    const handleAgentMessageDelta = createHandleAgentMessageDelta(mockGet)

    handleAgentMessageDelta({
      itemId: 'item-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'Hello ',
    })

    handleAgentMessageDelta({
      itemId: 'item-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'world!',
    })

    const buffer = deltaBuffers.get('thread-1')
    expect(buffer?.agentMessages.get('item-1')).toBe('Hello world!')
  })

  it('should ignore events for closing threads', () => {
    closingThreads.add('thread-1')

    const handleAgentMessageDelta = createHandleAgentMessageDelta(mockGet)

    handleAgentMessageDelta({
      itemId: 'item-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'Hello',
    })

    // Buffer should not be created for closing threads
    expect(deltaBuffers.get('thread-1')).toBeUndefined()
  })

  it('should ignore events for non-existent threads', () => {
    const handleAgentMessageDelta = createHandleAgentMessageDelta(mockGet)

    handleAgentMessageDelta({
      itemId: 'item-1',
      threadId: 'non-existent',
      turnId: 'turn-1',
      delta: 'Hello',
    })

    expect(deltaBuffers.get('non-existent')).toBeUndefined()
  })
})

describe('handleCommandExecutionOutputDelta', () => {
  let mockState: ThreadState
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()

    const threadState = createMockThreadState('thread-1')
    mockState = createMockState({ 'thread-1': threadState })
    mockGet = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    vi.clearAllMocks()
  })

  it('should accumulate command output deltas', () => {
    const handleDelta = createHandleCommandExecutionOutputDelta(mockGet)

    const event: CommandExecutionOutputDeltaEvent = {
      itemId: 'cmd-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'Running tests...',
    }

    handleDelta(event)

    const buffer = deltaBuffers.get('thread-1')
    expect(buffer?.commandOutputs.get('cmd-1')).toBe('Running tests...')
  })

  it('should ignore events for closing threads', () => {
    closingThreads.add('thread-1')

    const handleDelta = createHandleCommandExecutionOutputDelta(mockGet)

    handleDelta({
      itemId: 'cmd-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'output',
    })

    expect(deltaBuffers.get('thread-1')).toBeUndefined()
  })
})

describe('handleFileChangeOutputDelta', () => {
  let mockState: ThreadState
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()

    const threadState = createMockThreadState('thread-1')
    mockState = createMockState({ 'thread-1': threadState })
    mockGet = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    vi.clearAllMocks()
  })

  it('should accumulate file change output deltas', () => {
    const handleDelta = createHandleFileChangeOutputDelta(mockGet)

    const event: FileChangeOutputDeltaEvent = {
      itemId: 'file-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: '+new line\n',
    }

    handleDelta(event)

    const buffer = deltaBuffers.get('thread-1')
    expect(buffer?.fileChangeOutputs.get('file-1')).toBe('+new line\n')
  })

  it('should ignore events for closing threads', () => {
    closingThreads.add('thread-1')

    const handleDelta = createHandleFileChangeOutputDelta(mockGet)

    handleDelta({
      itemId: 'file-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'output',
    })

    expect(deltaBuffers.get('thread-1')).toBeUndefined()
  })
})

describe('handleReasoningSummaryTextDelta', () => {
  let mockState: ThreadState
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()

    const threadState = createMockThreadState('thread-1')
    mockState = createMockState({ 'thread-1': threadState })
    mockGet = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    vi.clearAllMocks()
  })

  it('should accumulate reasoning summary deltas', () => {
    const handleDelta = createHandleReasoningSummaryTextDelta(mockGet)

    const event: ReasoningSummaryTextDeltaEvent = {
      itemId: 'reasoning-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'Thinking about...',
      summaryIndex: 0,
    }

    handleDelta(event)

    const buffer = deltaBuffers.get('thread-1')
    const summaries = buffer?.reasoningSummaries.get('reasoning-1')
    expect(summaries).toBeDefined()
    expect(summaries?.[0]).toEqual({ index: 0, text: 'Thinking about...' })
  })

  it('should handle multiple summary indices', () => {
    const handleDelta = createHandleReasoningSummaryTextDelta(mockGet)

    handleDelta({
      itemId: 'reasoning-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'First thought',
      summaryIndex: 0,
    })

    handleDelta({
      itemId: 'reasoning-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'Second thought',
      summaryIndex: 1,
    })

    const buffer = deltaBuffers.get('thread-1')
    const summaries = buffer?.reasoningSummaries.get('reasoning-1')
    expect(summaries).toHaveLength(2)
    expect(summaries?.[0].text).toBe('First thought')
    expect(summaries?.[1].text).toBe('Second thought')
  })

  it('should append to existing summary index', () => {
    const handleDelta = createHandleReasoningSummaryTextDelta(mockGet)

    handleDelta({
      itemId: 'reasoning-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'Hello ',
      summaryIndex: 0,
    })

    handleDelta({
      itemId: 'reasoning-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'world',
      summaryIndex: 0,
    })

    const buffer = deltaBuffers.get('thread-1')
    const summaries = buffer?.reasoningSummaries.get('reasoning-1')
    expect(summaries?.[0].text).toBe('Hello world')
  })

  it('should ignore events for closing threads', () => {
    closingThreads.add('thread-1')

    const handleDelta = createHandleReasoningSummaryTextDelta(mockGet)

    handleDelta({
      itemId: 'reasoning-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'text',
      summaryIndex: 0,
    })

    expect(deltaBuffers.get('thread-1')).toBeUndefined()
  })
})

describe('handleReasoningTextDelta', () => {
  let mockState: ThreadState
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()

    const threadState = createMockThreadState('thread-1')
    mockState = createMockState({ 'thread-1': threadState })
    mockGet = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    vi.clearAllMocks()
  })

  it('should accumulate reasoning text deltas', () => {
    const handleDelta = createHandleReasoningTextDelta(mockGet)

    const event: ReasoningTextDeltaEvent = {
      itemId: 'reasoning-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'Deep thinking...',
      contentIndex: 0,
    }

    handleDelta(event)

    const buffer = deltaBuffers.get('thread-1')
    const contents = buffer?.reasoningContents.get('reasoning-1')
    expect(contents).toBeDefined()
    expect(contents?.[0]).toEqual({ index: 0, text: 'Deep thinking...' })
  })

  it('should ignore events for closing threads', () => {
    closingThreads.add('thread-1')

    const handleDelta = createHandleReasoningTextDelta(mockGet)

    handleDelta({
      itemId: 'reasoning-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'text',
      contentIndex: 0,
    })

    expect(deltaBuffers.get('thread-1')).toBeUndefined()
  })
})

describe('handleMcpToolCallProgress', () => {
  let mockState: ThreadState
  let mockGet: () => ThreadState

  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()

    const threadState = createMockThreadState('thread-1')
    mockState = createMockState({ 'thread-1': threadState })
    mockGet = () => mockState
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    vi.clearAllMocks()
  })

  it('should accumulate MCP progress messages', () => {
    const handleProgress = createHandleMcpToolCallProgress(mockGet)

    const event: McpToolCallProgressEvent = {
      itemId: 'mcp-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      message: 'Connecting to server...',
    }

    handleProgress(event)

    const buffer = deltaBuffers.get('thread-1')
    const messages = buffer?.mcpProgress.get('mcp-1')
    expect(messages).toEqual(['Connecting to server...'])
  })

  it('should append multiple progress messages', () => {
    const handleProgress = createHandleMcpToolCallProgress(mockGet)

    handleProgress({
      itemId: 'mcp-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      message: 'Step 1',
    })

    handleProgress({
      itemId: 'mcp-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      message: 'Step 2',
    })

    const buffer = deltaBuffers.get('thread-1')
    const messages = buffer?.mcpProgress.get('mcp-1')
    expect(messages).toEqual(['Step 1', 'Step 2'])
  })

  it('should ignore events for closing threads', () => {
    closingThreads.add('thread-1')

    const handleProgress = createHandleMcpToolCallProgress(mockGet)

    handleProgress({
      itemId: 'mcp-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      message: 'progress',
    })

    expect(deltaBuffers.get('thread-1')).toBeUndefined()
  })
})

describe('closingThreads check integration', () => {
  beforeEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
  })

  afterEach(() => {
    closingThreads.clear()
    deltaBuffers.clear()
    flushTimers.clear()
    vi.clearAllMocks()
  })

  it('should properly track closing threads', () => {
    closingThreads.add('thread-1')
    expect(closingThreads.has('thread-1')).toBe(true)
    expect(closingThreads.has('thread-2')).toBe(false)

    closingThreads.delete('thread-1')
    expect(closingThreads.has('thread-1')).toBe(false)
  })

  it('should clear all closing threads', () => {
    closingThreads.add('thread-1')
    closingThreads.add('thread-2')
    closingThreads.add('thread-3')

    closingThreads.clear()

    expect(closingThreads.size).toBe(0)
  })
})
