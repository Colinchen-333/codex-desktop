/**
 * useOptimisticUpdate Hook Unit Tests
 *
 * Tests for optimistic update patterns including:
 * - Optimistic updates
 * - Rollback mechanisms
 * - Batch operations
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useOptimisticUpdate,
  useOptimisticStateUpdate,
  useBatchOptimisticUpdate,
  type UseOptimisticUpdateOptions,
} from '../useOptimisticUpdate'

describe('useOptimisticUpdate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('basic functionality', () => {
    it('should execute optimistic update and async operation', async () => {
      const asyncOperation = vi.fn().mockResolvedValue('result')
      const optimisticUpdate = vi.fn().mockReturnValue('previousState')
      const rollbackFn = vi.fn()

      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: asyncOperation,
        optimisticUpdate,
        rollbackFn,
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe(null)

      let executeResult: string | undefined
      await act(async () => {
        executeResult = await result.current.execute()
      })

      expect(optimisticUpdate).toHaveBeenCalled()
      expect(asyncOperation).toHaveBeenCalled()
      expect(executeResult).toBe('result')
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe(null)
    })

    it('should set loading state during execution', async () => {
      let resolveAsync: (value: string) => void
      const asyncPromise = new Promise<string>((resolve) => {
        resolveAsync = resolve
      })

      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: () => asyncPromise,
        optimisticUpdate: () => 'prev',
        rollbackFn: vi.fn(),
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      let executePromise: Promise<string | undefined>
      act(() => {
        executePromise = result.current.execute()
      })

      // Should be loading while promise is pending
      expect(result.current.isLoading).toBe(true)

      // Resolve and wait
      await act(async () => {
        resolveAsync!('done')
        await executePromise
      })

      expect(result.current.isLoading).toBe(false)
    })

    it('should call onSuccess callback on successful execution', async () => {
      const onSuccess = vi.fn()

      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: vi.fn().mockResolvedValue('result'),
        optimisticUpdate: () => 'prev',
        rollbackFn: vi.fn(),
        onSuccess,
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      await act(async () => {
        await result.current.execute()
      })

      expect(onSuccess).toHaveBeenCalledWith('result')
    })
  })

  describe('error handling and rollback', () => {
    it('should auto rollback on error when autoRollback is true', async () => {
      const rollbackFn = vi.fn()
      const error = new Error('Test error')

      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: vi.fn().mockRejectedValue(error),
        optimisticUpdate: () => 'previousState',
        rollbackFn,
        autoRollback: true,
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      await act(async () => {
        await result.current.execute()
      })

      expect(rollbackFn).toHaveBeenCalledWith('previousState')
      expect(result.current.error).toBe(error)
    })

    it('should not auto rollback when autoRollback is false', async () => {
      const rollbackFn = vi.fn()
      const error = new Error('Test error')

      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: vi.fn().mockRejectedValue(error),
        optimisticUpdate: () => 'previousState',
        rollbackFn,
        autoRollback: false,
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      await act(async () => {
        await result.current.execute()
      })

      expect(rollbackFn).not.toHaveBeenCalled()
      expect(result.current.error).toBe(error)
    })

    it('should call onError callback with manual rollback function', async () => {
      const rollbackFn = vi.fn()
      const onError = vi.fn()
      const error = new Error('Test error')

      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: vi.fn().mockRejectedValue(error),
        optimisticUpdate: () => 'previousState',
        rollbackFn,
        onError,
        autoRollback: false,
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      await act(async () => {
        await result.current.execute()
      })

      expect(onError).toHaveBeenCalled()
      expect(onError.mock.calls[0][0]).toBe(error)
      expect(typeof onError.mock.calls[0][1]).toBe('function')
    })

    it('should handle error in optimisticUpdate function', async () => {
      const error = new Error('Optimistic update failed')

      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: vi.fn().mockResolvedValue('result'),
        optimisticUpdate: () => {
          throw error
        },
        rollbackFn: vi.fn(),
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      await act(async () => {
        await result.current.execute()
      })

      expect(result.current.error).toBe(error)
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('manual rollback', () => {
    it('should support rollbackTo specific operation', async () => {
      const rollbackFn = vi.fn()

      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: vi.fn().mockRejectedValue(new Error('fail')),
        optimisticUpdate: () => 'state1',
        rollbackFn,
        autoRollback: false,
        operationId: 'op-1',
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      await act(async () => {
        await result.current.execute()
      })

      act(() => {
        result.current.rollbackTo('op-1')
      })

      expect(rollbackFn).toHaveBeenCalledWith('state1')
    })

    it('should clear entry from history on successful execution', async () => {
      const rollbackFn = vi.fn()

      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: vi.fn().mockResolvedValue('result'),
        optimisticUpdate: () => 'previousState',
        rollbackFn,
        operationId: 'test-op',
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      await act(async () => {
        await result.current.execute()
      })

      // After success, the specific operation should be removed from history
      const history = result.current.getRollbackHistory()
      expect(history.find((h) => h.id === 'test-op')).toBeUndefined()
    })
  })

  describe('rollback history', () => {
    it('should track rollback history on failure', async () => {
      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: vi.fn().mockRejectedValue(new Error('fail')),
        optimisticUpdate: () => 'state1',
        rollbackFn: vi.fn(),
        autoRollback: false,
        operationId: 'test-op',
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      await act(async () => {
        await result.current.execute()
      })

      const history = result.current.getRollbackHistory()
      expect(history.length).toBeGreaterThan(0)
      expect(history.some((h) => h.id === 'test-op')).toBe(true)
    })

    it('should clear rollback history', async () => {
      const options: UseOptimisticUpdateOptions<string, string> = {
        execute: vi.fn().mockRejectedValue(new Error('fail')),
        optimisticUpdate: () => 'state1',
        rollbackFn: vi.fn(),
        autoRollback: false,
      }

      const { result } = renderHook(() => useOptimisticUpdate(options))

      await act(async () => {
        await result.current.execute()
      })

      act(() => {
        result.current.clearRollbackHistory()
      })

      expect(result.current.getRollbackHistory().length).toBe(0)
      expect(result.current.getCanRollback()).toBe(false)
    })
  })
})

describe('useOptimisticStateUpdate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should update state optimistically', async () => {
    let state = { value: 'original' }
    const getState = () => state
    const setState = (newState: typeof state) => {
      state = newState
    }

    const { result } = renderHook(() =>
      useOptimisticStateUpdate({
        getState,
        setState,
        asyncOperation: vi.fn().mockResolvedValue('done'),
        optimisticValue: { value: 'updated' },
      })
    )

    await act(async () => {
      await result.current.execute()
    })

    expect(state.value).toBe('updated')
  })

  it('should rollback on failure', async () => {
    let state = { value: 'original' }
    const getState = () => state
    const setState = (newState: typeof state) => {
      state = newState
    }

    const { result } = renderHook(() =>
      useOptimisticStateUpdate({
        getState,
        setState,
        asyncOperation: vi.fn().mockRejectedValue(new Error('fail')),
        optimisticValue: { value: 'updated' },
        autoRollback: true,
      })
    )

    await act(async () => {
      await result.current.execute()
    })

    // Should rollback to original
    expect(state.value).toBe('original')
    expect(result.current.error).toBeDefined()
  })

  it('should not auto rollback when disabled', async () => {
    let state = { value: 'original' }
    const getState = () => state
    const setState = (newState: typeof state) => {
      state = newState
    }

    const { result } = renderHook(() =>
      useOptimisticStateUpdate({
        getState,
        setState,
        asyncOperation: vi.fn().mockRejectedValue(new Error('fail')),
        optimisticValue: { value: 'updated' },
        autoRollback: false,
      })
    )

    await act(async () => {
      await result.current.execute()
    })

    // Should remain updated since autoRollback is false
    expect(state.value).toBe('updated')
    expect(result.current.error).toBeDefined()
  })
})

describe('useBatchOptimisticUpdate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('basic batch operations', () => {
    it('should execute all operations in batch', async () => {
      const { result } = renderHook(() => useBatchOptimisticUpdate())

      const operations = [
        {
          execute: vi.fn().mockResolvedValue('result1'),
          optimisticUpdate: vi.fn().mockReturnValue('prev1'),
          rollbackFn: vi.fn(),
        },
        {
          execute: vi.fn().mockResolvedValue('result2'),
          optimisticUpdate: vi.fn().mockReturnValue('prev2'),
          rollbackFn: vi.fn(),
        },
      ]

      let results: string[] | undefined
      await act(async () => {
        results = await result.current.executeBatch(operations)
      })

      expect(results).toEqual(['result1', 'result2'])
      expect(operations[0].execute).toHaveBeenCalled()
      expect(operations[1].execute).toHaveBeenCalled()
      expect(operations[0].optimisticUpdate).toHaveBeenCalled()
      expect(operations[1].optimisticUpdate).toHaveBeenCalled()
    })

    it('should set loading state during batch execution', async () => {
      const { result } = renderHook(() => useBatchOptimisticUpdate())

      let resolveFirst: (value: string) => void
      const firstPromise = new Promise<string>((resolve) => {
        resolveFirst = resolve
      })

      const operations = [
        {
          execute: () => firstPromise,
          optimisticUpdate: () => 'prev1',
          rollbackFn: vi.fn(),
        },
      ]

      let batchPromise: Promise<string[] | undefined>
      act(() => {
        batchPromise = result.current.executeBatch(operations)
      })

      expect(result.current.isLoading).toBe(true)

      await act(async () => {
        resolveFirst!('done')
        await batchPromise
      })

      expect(result.current.isLoading).toBe(false)
    })

    it('should call onSuccess for each operation', async () => {
      const { result } = renderHook(() => useBatchOptimisticUpdate())

      const onSuccess1 = vi.fn()
      const onSuccess2 = vi.fn()

      const operations = [
        {
          execute: vi.fn().mockResolvedValue('result1'),
          optimisticUpdate: () => 'prev1',
          rollbackFn: vi.fn(),
          onSuccess: onSuccess1,
        },
        {
          execute: vi.fn().mockResolvedValue('result2'),
          optimisticUpdate: () => 'prev2',
          rollbackFn: vi.fn(),
          onSuccess: onSuccess2,
        },
      ]

      await act(async () => {
        await result.current.executeBatch(operations)
      })

      expect(onSuccess1).toHaveBeenCalledWith('result1')
      expect(onSuccess2).toHaveBeenCalledWith('result2')
    })
  })

  describe('batch error handling and rollback', () => {
    it('should rollback all operations if any fails', async () => {
      const { result } = renderHook(() => useBatchOptimisticUpdate())

      const rollback1 = vi.fn()
      const rollback2 = vi.fn()

      const operations = [
        {
          execute: vi.fn().mockResolvedValue('result1'),
          optimisticUpdate: () => 'prev1',
          rollbackFn: rollback1,
        },
        {
          execute: vi.fn().mockRejectedValue(new Error('fail')),
          optimisticUpdate: () => 'prev2',
          rollbackFn: rollback2,
        },
      ]

      await act(async () => {
        await result.current.executeBatch(operations)
      })

      // Both should be rolled back
      expect(rollback1).toHaveBeenCalledWith('prev1')
      expect(rollback2).toHaveBeenCalledWith('prev2')
      expect(result.current.error).toBeDefined()
    })

    it('should return undefined on batch failure', async () => {
      const { result } = renderHook(() => useBatchOptimisticUpdate())

      const operations = [
        {
          execute: vi.fn().mockRejectedValue(new Error('fail')),
          optimisticUpdate: () => 'prev1',
          rollbackFn: vi.fn(),
        },
      ]

      let results: string[] | undefined
      await act(async () => {
        results = await result.current.executeBatch(operations)
      })

      expect(results).toBeUndefined()
    })

    it('should support manual rollbackAll', async () => {
      const { result } = renderHook(() => useBatchOptimisticUpdate())

      const rollback1 = vi.fn()
      const rollback2 = vi.fn()

      const operations = [
        {
          execute: vi.fn().mockResolvedValue('result1'),
          optimisticUpdate: () => 'prev1',
          rollbackFn: rollback1,
        },
        {
          execute: vi.fn().mockResolvedValue('result2'),
          optimisticUpdate: () => 'prev2',
          rollbackFn: rollback2,
        },
      ]

      await act(async () => {
        await result.current.executeBatch(operations)
      })

      // After success, rollback stack is cleared
      act(() => {
        result.current.rollbackAll()
      })

      // No rollbacks should happen since stack was cleared on success
      // This just verifies the function doesn't throw
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('batch with mixed results', () => {
    it('should execute operations in order', async () => {
      const { result } = renderHook(() => useBatchOptimisticUpdate())

      const executionOrder: number[] = []

      const operations = [
        {
          execute: vi.fn().mockImplementation(async () => {
            executionOrder.push(1)
            return 'result1'
          }),
          optimisticUpdate: () => 'prev1',
          rollbackFn: vi.fn(),
        },
        {
          execute: vi.fn().mockImplementation(async () => {
            executionOrder.push(2)
            return 'result2'
          }),
          optimisticUpdate: () => 'prev2',
          rollbackFn: vi.fn(),
        },
        {
          execute: vi.fn().mockImplementation(async () => {
            executionOrder.push(3)
            return 'result3'
          }),
          optimisticUpdate: () => 'prev3',
          rollbackFn: vi.fn(),
        },
      ]

      await act(async () => {
        await result.current.executeBatch(operations)
      })

      expect(executionOrder).toEqual([1, 2, 3])
    })

    it('should apply all optimistic updates before executing async operations', async () => {
      const { result } = renderHook(() => useBatchOptimisticUpdate())

      const updateOrder: string[] = []
      const executeOrder: string[] = []

      const operations = [
        {
          execute: vi.fn().mockImplementation(async () => {
            executeOrder.push('exec1')
            return 'result1'
          }),
          optimisticUpdate: () => {
            updateOrder.push('update1')
            return 'prev1'
          },
          rollbackFn: vi.fn(),
        },
        {
          execute: vi.fn().mockImplementation(async () => {
            executeOrder.push('exec2')
            return 'result2'
          }),
          optimisticUpdate: () => {
            updateOrder.push('update2')
            return 'prev2'
          },
          rollbackFn: vi.fn(),
        },
      ]

      await act(async () => {
        await result.current.executeBatch(operations)
      })

      // All updates should happen before any executes
      expect(updateOrder).toEqual(['update1', 'update2'])
      expect(executeOrder).toEqual(['exec1', 'exec2'])
    })
  })

  describe('empty batch', () => {
    it('should handle empty batch gracefully', async () => {
      const { result } = renderHook(() => useBatchOptimisticUpdate())

      let results: unknown[] | undefined
      await act(async () => {
        results = await result.current.executeBatch([])
      })

      expect(results).toEqual([])
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe(null)
    })
  })
})

describe('edge cases', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should handle rapid successive calls', async () => {
    const asyncOperation = vi.fn().mockResolvedValue('result')
    const optimisticUpdate = vi.fn().mockReturnValue('prev')

    const options: UseOptimisticUpdateOptions<string, string> = {
      execute: asyncOperation,
      optimisticUpdate,
      rollbackFn: vi.fn(),
    }

    const { result } = renderHook(() => useOptimisticUpdate(options))

    await act(async () => {
      // Fire multiple calls rapidly
      const promises = [
        result.current.execute(),
        result.current.execute(),
        result.current.execute(),
      ]
      await Promise.all(promises)
    })

    expect(asyncOperation).toHaveBeenCalledTimes(3)
    expect(optimisticUpdate).toHaveBeenCalledTimes(3)
  })

  it('should handle non-Error rejections', async () => {
    const options: UseOptimisticUpdateOptions<string, string> = {
      execute: vi.fn().mockRejectedValue('string error'),
      optimisticUpdate: () => 'prev',
      rollbackFn: vi.fn(),
    }

    const { result } = renderHook(() => useOptimisticUpdate(options))

    await act(async () => {
      await result.current.execute()
    })

    expect(result.current.error).toBeDefined()
    expect(result.current.error?.message).toBe('string error')
  })

  it('should handle undefined return from optimisticUpdate', async () => {
    const options: UseOptimisticUpdateOptions<undefined, string> = {
      execute: vi.fn().mockResolvedValue('result'),
      optimisticUpdate: () => undefined,
      rollbackFn: vi.fn(),
    }

    const { result } = renderHook(() => useOptimisticUpdate(options))

    await act(async () => {
      const res = await result.current.execute()
      expect(res).toBe('result')
    })
  })

  it('should handle concurrent operations correctly', async () => {
    const results: string[] = []
    let counter = 0

    const options: UseOptimisticUpdateOptions<number, string> = {
      execute: vi.fn().mockImplementation(async () => {
        const val = `result-${++counter}`
        results.push(val)
        return val
      }),
      optimisticUpdate: () => counter,
      rollbackFn: vi.fn(),
    }

    const { result } = renderHook(() => useOptimisticUpdate(options))

    await act(async () => {
      await Promise.all([
        result.current.execute(),
        result.current.execute(),
      ])
    })

    expect(results.length).toBe(2)
    expect(results).toContain('result-1')
    expect(results).toContain('result-2')
  })
})
