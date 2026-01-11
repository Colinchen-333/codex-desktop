import { describe, it, expect } from 'vitest'
import {
  mapItemType,
  normalizeStatus,
  stringifyCommandAction,
  toThreadItem,
  createEmptyThreadState,
  getFocusedThreadState,
  defaultTokenUsage,
  defaultTurnTiming,
} from '../utils/helpers'
import type { ThreadInfo } from '../../../lib/api'
import type {
  UserMessageItem,
  AgentMessageItem,
  CommandExecutionItem,
  FileChangeItem,
  WebSearchItem,
  ReviewItem,
  InfoItem,
} from '../types'

describe('mapItemType', () => {
  it('should map known item types correctly', () => {
    expect(mapItemType('userMessage')).toBe('userMessage')
    expect(mapItemType('agentMessage')).toBe('agentMessage')
    expect(mapItemType('reasoning')).toBe('reasoning')
    expect(mapItemType('commandExecution')).toBe('commandExecution')
    expect(mapItemType('fileChange')).toBe('fileChange')
    expect(mapItemType('mcpToolCall')).toBe('mcpTool')
    expect(mapItemType('webSearch')).toBe('webSearch')
    expect(mapItemType('imageView')).toBe('info')
    expect(mapItemType('enteredReviewMode')).toBe('review')
    expect(mapItemType('exitedReviewMode')).toBe('review')
  })

  it('should default to agentMessage for unknown types', () => {
    expect(mapItemType('unknownType')).toBe('agentMessage')
    expect(mapItemType('')).toBe('agentMessage')
  })
})

describe('normalizeStatus', () => {
  it('should normalize completed statuses', () => {
    expect(normalizeStatus('completed')).toBe('completed')
    expect(normalizeStatus('COMPLETED')).toBe('completed')
    expect(normalizeStatus(null)).toBe('completed')
    expect(normalizeStatus(undefined)).toBe('completed')
  })

  it('should normalize failed statuses', () => {
    const failedStatuses = ['failed', 'declined', 'cancelled', 'canceled', 'aborted', 'interrupted']
    failedStatuses.forEach(status => {
      expect(normalizeStatus(status)).toBe('failed')
      expect(normalizeStatus(status.toUpperCase())).toBe('failed')
    })
  })

  it('should normalize inProgress statuses', () => {
    const inProgressStatuses = ['inprogress', 'in_progress', 'in-progress', 'running', 'open']
    inProgressStatuses.forEach(status => {
      expect(normalizeStatus(status)).toBe('inProgress')
      expect(normalizeStatus(status.toUpperCase())).toBe('inProgress')
    })
  })

  it('should normalize pending statuses', () => {
    const pendingStatuses = ['pending', 'queued']
    pendingStatuses.forEach(status => {
      expect(normalizeStatus(status)).toBe('pending')
      expect(normalizeStatus(status.toUpperCase())).toBe('pending')
    })
  })

  it('should default to completed for unknown statuses', () => {
    expect(normalizeStatus('unknown')).toBe('completed')
    expect(normalizeStatus('')).toBe('completed')
  })
})

describe('stringifyCommandAction', () => {
  it('should handle null and undefined', () => {
    expect(stringifyCommandAction(null)).toBe('unknown')
    expect(stringifyCommandAction(undefined)).toBe('unknown')
  })

  it('should handle non-object types', () => {
    expect(stringifyCommandAction('string')).toBe('unknown')
    expect(stringifyCommandAction(123)).toBe('unknown')
    expect(stringifyCommandAction(true)).toBe('unknown')
  })

  it('should extract type, command, path, and query', () => {
    const action = {
      type: 'write',
      command: 'echo hello',
      path: '/test/path',
      query: 'search term',
    }
    expect(stringifyCommandAction(action)).toBe('write echo hello /test/path search term')
  })

  it('should handle partial information', () => {
    expect(stringifyCommandAction({ type: 'write' })).toBe('write')
    expect(stringifyCommandAction({ command: 'echo' })).toBe('action echo')
    expect(stringifyCommandAction({ path: '/test' })).toBe('action /test')
    expect(stringifyCommandAction({ query: 'test' })).toBe('action test')
  })

  it('should use fallback fields', () => {
    expect(stringifyCommandAction({ kind: 'write' })).toBe('write')
    expect(stringifyCommandAction({ action: 'write' })).toBe('write')
  })

  it('should filter out empty strings', () => {
    const action = {
      type: 'write',
      command: '',
      path: '/test',
      query: '',
    }
    expect(stringifyCommandAction(action)).toBe('write /test')
  })
})

describe('toThreadItem', () => {
  const baseItem = {
    id: 'test-id',
    type: 'userMessage',
    status: 'completed',
    createdAt: 1234567890,
  }

  it('should create userMessage item', () => {
    const item = {
      ...baseItem,
      content: [{ text: 'Hello world' }],
    }
    const result = toThreadItem(item) as UserMessageItem

    expect(result.id).toBe('test-id')
    expect(result.type).toBe('userMessage')
    expect(result.status).toBe('completed')
    expect(result.content.text).toBe('Hello world')
  })

  it('should extract images from userMessage content', () => {
    const item = {
      ...baseItem,
      content: [
        { text: 'Hello' },
        { type: 'image', url: 'http://example.com/image.jpg' },
        { type: 'localImage', path: '/local/image.jpg' },
      ],
    }
    const result = toThreadItem(item) as UserMessageItem

    expect(result.content.images).toEqual([
      'http://example.com/image.jpg',
      '/local/image.jpg',
    ])
  })

  it('should create agentMessage item', () => {
    const item = {
      ...baseItem,
      type: 'agentMessage',
      text: 'Agent response',
    }
    const result = toThreadItem(item) as AgentMessageItem

    expect(result.type).toBe('agentMessage')
    expect(result.content.text).toBe('Agent response')
    expect(result.content.isStreaming).toBe(false)
  })

  it('should set isStreaming for inProgress status', () => {
    const item = {
      ...baseItem,
      type: 'agentMessage',
      text: 'Streaming...',
      status: 'inProgress',
    }
    const result = toThreadItem(item) as AgentMessageItem

    expect(result.content.isStreaming).toBe(true)
  })

  it('should create commandExecution item', () => {
    const item = {
      ...baseItem,
      type: 'commandExecution',
      command: 'npm test',
      cwd: '/project',
      commandActions: [{ type: 'run', command: 'npm test' }],
      aggregatedOutput: 'Test output',
      exitCode: 0,
      durationMs: 1500,
    }
    const result = toThreadItem(item) as CommandExecutionItem

    expect(result.type).toBe('commandExecution')
    expect(result.content.command).toBe('npm test')
    expect(result.content.cwd).toBe('/project')
    expect(result.content.commandActions).toEqual(['run npm test'])
    expect(result.content.output).toBe('Test output')
    expect(result.content.exitCode).toBe(0)
    expect(result.content.durationMs).toBe(1500)
  })

  it('should create fileChange item with add/delete/modify', () => {
    const item = {
      ...baseItem,
      type: 'fileChange',
      changes: [
        { path: '/new.txt', kind: 'add', diff: '+new content' },
        { path: '/old.txt', kind: 'delete', diff: '-old content' },
        { path: '/mod.txt', kind: 'modify', diff: '±modified' },
      ],
    }
    const result = toThreadItem(item) as FileChangeItem

    expect(result.type).toBe('fileChange')
    expect(result.content.changes).toHaveLength(3)
    expect(result.content.changes[0].kind).toBe('add')
    expect(result.content.changes[1].kind).toBe('delete')
    expect(result.content.changes[2].kind).toBe('modify')
  })

  it('should handle file rename', () => {
    const item = {
      ...baseItem,
      type: 'fileChange',
      changes: [
        { path: '/new.txt', kind: { type: 'add' } },
        { path: '/moved.txt', kind: { movePath: '/old.txt' } },
      ],
    }
    const result = toThreadItem(item) as FileChangeItem

    expect(result.content.changes[0].kind).toBe('add')
    expect(result.content.changes[1].kind).toBe('rename')
    expect(result.content.changes[1].oldPath).toBe('/old.txt')
  })

  it('should create webSearch item', () => {
    const item = {
      ...baseItem,
      type: 'webSearch',
      query: 'test query',
      results: [
        { title: 'Result 1', url: 'http://test1.com', snippet: 'Snippet 1' },
        { title: 'Result 2', url: 'http://test2.com', snippet: 'Snippet 2' },
      ],
    }
    const result = toThreadItem(item) as WebSearchItem

    expect(result.type).toBe('webSearch')
    expect(result.content.query).toBe('test query')
    expect(result.content.results).toHaveLength(2)
    expect(result.content.results?.[0].title).toBe('Result 1')
  })

  it('should create review items', () => {
    const enteredItem = {
      ...baseItem,
      type: 'enteredReviewMode',
      review: 'Review started',
    }
    const result1 = toThreadItem(enteredItem) as ReviewItem

    expect(result1.type).toBe('review')
    expect(result1.content.phase).toBe('started')
    expect(result1.content.text).toBe('Review started')

    const exitedItem = {
      ...baseItem,
      type: 'exitedReviewMode',
      review: 'Review completed',
    }
    const result2 = toThreadItem(exitedItem) as ReviewItem

    expect(result2.content.phase).toBe('completed')
    expect(result2.content.text).toBe('Review completed')
  })

  it('should create info item for unknown types', () => {
    const item = {
      ...baseItem,
      type: 'unknownType',
      data: 'test data',
    }
    const result = toThreadItem(item) as InfoItem

    expect(result.type).toBe('info')
    expect(result.content.title).toBe('Unknown item type: unknownType')
    expect(result.content.details).toContain('"type": "unknownType"')
  })

  it('should use current timestamp if createdAt is not provided', () => {
    const before = Date.now()
    const item = {
      id: 'test-id',
      type: 'userMessage',
    }
    const result = toThreadItem(item)
    const after = Date.now()

    expect(result.createdAt).toBeGreaterThanOrEqual(before)
    expect(result.createdAt).toBeLessThanOrEqual(after)
  })
})

describe('createEmptyThreadState', () => {
  it('should create empty thread state', () => {
    const thread: ThreadInfo = {
      id: 'thread-1',
      cwd: '/test/path',
    }

    const state = createEmptyThreadState(thread)

    expect(state.thread).toBe(thread)
    expect(state.items).toEqual({})
    expect(state.itemOrder).toEqual([])
    expect(state.turnStatus).toBe('idle')
    expect(state.currentTurnId).toBe(null)
    expect(state.pendingApprovals).toEqual([])
    expect(state.tokenUsage).toEqual(defaultTokenUsage)
    expect(state.turnTiming).toEqual(defaultTurnTiming)
    expect(state.sessionOverrides).toEqual({})
    expect(state.queuedMessages).toEqual([])
    expect(state.error).toBe(null)
  })
})

describe('getFocusedThreadState', () => {
  it('should return focused thread state', () => {
    const thread1 = createEmptyThreadState({ id: '1', cwd: '/path/1' })
    const thread2 = createEmptyThreadState({ id: '2', cwd: '/path/2' })
    const threads = { '1': thread1, '2': thread2 }

    expect(getFocusedThreadState(threads, '1')).toBe(thread1)
    expect(getFocusedThreadState(threads, '2')).toBe(thread2)
  })

  it('should return undefined for null focusedThreadId', () => {
    const threads = { '1': createEmptyThreadState({ id: '1', cwd: '/path/1' }) }
    expect(getFocusedThreadState(threads, null)).toBeUndefined()
  })

  it('should return undefined for non-existent thread', () => {
    const threads = { '1': createEmptyThreadState({ id: '1', cwd: '/path/1' }) }
    expect(getFocusedThreadState(threads, 'nonexistent')).toBeUndefined()
  })
})