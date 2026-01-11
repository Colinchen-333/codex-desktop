/**
 * useOptimisticUpdate Hook
 *
 * 提供乐观更新和自动回滚机制。允许在异步操作完成前立即更新 UI，
 * 并在操作失败时自动回滚到之前的状态。
 *
 * 特性:
 * - 乐观更新：立即应用状态变更
 * - 自动回滚：操作失败时恢复原始状态
 * - 嵌套回滚：支持多个操作的回滚栈
 * - 手动回滚 API：允许在任何时候手动触发回滚
 *
 * @example
 * const { execute, isLoading, error, rollback } = useOptimisticUpdate({
 *   execute: () => api.updateUser(userId, newData),
 *   optimisticUpdate: () => {
 *     const previousState = store.getState().user
 *     store.setState({ user: newData })
 *     return previousState // 返回用于回滚的状态
 *   },
 *   onError: (error, rollbackFn) => {
 *     console.error('Update failed:', error)
 *     // 自动回滚已启用，或手动调用 rollbackFn()
 *   },
 *   autoRollback: true
 * })
 */

import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * 回滚操作记录
 */
interface RollbackEntry<T> {
  /** 唯一标识 */
  id: string
  /** 之前的状态 */
  previousState: T
  /** 回滚函数 */
  rollbackFn: (state: T) => void
  /** 创建时间戳 */
  timestamp: number
}

/**
 * 乐观更新配置选项
 */
export interface UseOptimisticUpdateOptions<T, R> {
  /**
   * 执行实际的异步操作
   */
  execute: () => Promise<R>

  /**
   * 乐观更新状态
   * 应该返回之前的状态用于回滚
   */
  optimisticUpdate: () => T

  /**
   * 回滚函数 - 将状态恢复到之前的值
   * 如果不提供，将使用默认的回滚逻辑
   */
  rollbackFn?: (previousState: T) => void

  /**
   * 成功回调
   */
  onSuccess?: (result: R) => void

  /**
   * 失败时的回调
   * @param error - 发生的错误
   * @param rollback - 手动回滚函数
   */
  onError?: (error: Error, rollback: () => void) => void

  /**
   * 是否自动回滚（默认 true）
   * 如果为 false，需要在 onError 中手动调用 rollback
   */
  autoRollback?: boolean

  /**
   * 是否在组件卸载后忽略结果（默认 true）
   */
  ignoreOnUnmount?: boolean

  /**
   * 操作的唯一标识，用于嵌套回滚
   */
  operationId?: string
}

/**
 * 乐观更新 Hook 返回值
 */
export interface UseOptimisticUpdateReturn<R> {
  /** 执行乐观更新操作 */
  execute: () => Promise<R | undefined>
  /** 是否正在加载 */
  isLoading: boolean
  /** 错误信息 */
  error: Error | null
  /** 手动回滚到上一个状态 */
  rollback: () => void
  /** 回滚到指定的操作 */
  rollbackTo: (operationId: string) => void
  /** 清除回滚历史 */
  clearRollbackHistory: () => void
  /** 获取回滚历史记录 */
  getRollbackHistory: () => Array<{ id: string; timestamp: number }>
  /** 检查是否有可回滚的状态（函数形式避免渲染期间访问 ref） */
  getCanRollback: () => boolean
}

/**
 * 全局回滚栈管理器
 * 用于支持跨组件的嵌套回滚
 */
class RollbackStackManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stack: RollbackEntry<any>[] = []
  private maxSize = 50 // 最大回滚历史记录数

  push<T>(entry: RollbackEntry<T>): void {
    this.stack.push(entry)
    // 限制栈大小
    if (this.stack.length > this.maxSize) {
      this.stack.shift()
    }
  }

  pop<T>(): RollbackEntry<T> | undefined {
    return this.stack.pop()
  }

  findById<T>(id: string): RollbackEntry<T> | undefined {
    return this.stack.find((entry) => entry.id === id)
  }

  removeById(id: string): boolean {
    const index = this.stack.findIndex((entry) => entry.id === id)
    if (index !== -1) {
      this.stack.splice(index, 1)
      return true
    }
    return false
  }

  rollbackTo<T>(id: string): RollbackEntry<T>[] {
    const index = this.stack.findIndex((entry) => entry.id === id)
    if (index === -1) return []

    // 回滚从栈顶到指定位置的所有操作
    const entriesToRollback = this.stack.splice(index)
    return entriesToRollback.reverse()
  }

  getHistory(): Array<{ id: string; timestamp: number }> {
    return this.stack.map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
    }))
  }

  clear(): void {
    this.stack = []
  }

  get size(): number {
    return this.stack.length
  }
}

// 全局回滚栈实例
const globalRollbackStack = new RollbackStackManager()

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 乐观更新 Hook
 *
 * 提供统一的乐观更新模式，支持：
 * - 立即应用状态变更
 * - 操作失败时自动回滚
 * - 嵌套操作的回滚管理
 * - 手动回滚 API
 *
 * @param options - 配置选项
 * @returns 乐观更新控制接口
 */
export function useOptimisticUpdate<T, R>(
  options: UseOptimisticUpdateOptions<T, R>
): UseOptimisticUpdateReturn<R> {
  const {
    execute: executeAsync,
    optimisticUpdate,
    rollbackFn,
    onSuccess,
    onError,
    autoRollback = true,
    ignoreOnUnmount = true,
    operationId: customOperationId,
  } = options

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 组件挂载状态
  const isMountedRef = useRef(true)
  // 当前操作的 ID
  const currentOperationIdRef = useRef<string | null>(null)
  // 本地回滚栈（用于组件级别的回滚）
  const localRollbackStackRef = useRef<RollbackEntry<T>[]>([])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (localRollbackStackRef.current.length > 0) {
        for (const entry of localRollbackStackRef.current) {
          globalRollbackStack.removeById(entry.id)
        }
        localRollbackStackRef.current = []
      }
    }
  }, [])

  /**
   * 执行单个回滚操作
   */
  const executeRollback = useCallback(
    (entry: RollbackEntry<T>) => {
      if (rollbackFn) {
        rollbackFn(entry.previousState)
      }
    },
    [rollbackFn]
  )

  /**
   * 手动回滚到上一个状态
   */
  const rollback = useCallback(() => {
    // 先尝试从本地栈回滚
    const localEntry = localRollbackStackRef.current.pop()
    if (localEntry) {
      executeRollback(localEntry)
      globalRollbackStack.removeById(localEntry.id)
      return
    }

    // 如果本地栈为空，从全局栈回滚
    const globalEntry = globalRollbackStack.pop<T>()
    if (globalEntry && rollbackFn) {
      rollbackFn(globalEntry.previousState)
    }
  }, [executeRollback, rollbackFn])

  /**
   * 回滚到指定的操作
   */
  const rollbackTo = useCallback(
    (targetOperationId: string) => {
      const entries = globalRollbackStack.rollbackTo<T>(targetOperationId)
      entries.forEach((entry) => {
        if (rollbackFn) {
          rollbackFn(entry.previousState)
        }
      })

      // 同步更新本地栈
      localRollbackStackRef.current = localRollbackStackRef.current.filter(
        (entry) => !entries.some((e) => e.id === entry.id)
      )
    },
    [rollbackFn]
  )

  /**
   * 清除回滚历史
   */
  const clearRollbackHistory = useCallback(() => {
    localRollbackStackRef.current = []
    globalRollbackStack.clear()
  }, [])

  /**
   * 获取回滚历史记录
   */
  const getRollbackHistory = useCallback(() => {
    return globalRollbackStack.getHistory()
  }, [])

  /**
   * 执行乐观更新操作
   */
  const execute = useCallback(async (): Promise<R | undefined> => {
    const operationId = customOperationId || generateId()
    currentOperationIdRef.current = operationId

    setIsLoading(true)
    setError(null)

    // 1. 执行乐观更新，保存之前的状态
    let previousState: T
    try {
      previousState = optimisticUpdate()
    } catch (err) {
      const updateError = err instanceof Error ? err : new Error(String(err))
      setError(updateError)
      setIsLoading(false)
      return undefined
    }

    // 2. 创建回滚记录
    const rollbackEntry: RollbackEntry<T> = {
      id: operationId,
      previousState,
      rollbackFn: rollbackFn || (() => {}),
      timestamp: Date.now(),
    }

    // 添加到回滚栈
    localRollbackStackRef.current.push(rollbackEntry)
    globalRollbackStack.push(rollbackEntry)

    try {
      // 3. 执行实际的异步操作
      const result = await executeAsync()

      // 4. 操作成功，从回滚栈中移除
      if (isMountedRef.current || !ignoreOnUnmount) {
        setIsLoading(false)
        setError(null)

        // 成功后清除该操作的回滚记录
        localRollbackStackRef.current = localRollbackStackRef.current.filter(
          (entry) => entry.id !== operationId
        )
        globalRollbackStack.removeById(operationId)

        onSuccess?.(result)
      }

      return result
    } catch (err) {
      const asyncError = err instanceof Error ? err : new Error(String(err))

      if (isMountedRef.current || !ignoreOnUnmount) {
        setError(asyncError)
        setIsLoading(false)

        // 创建回滚函数供 onError 使用
        const manualRollback = () => {
          const entry = localRollbackStackRef.current.find(
            (e) => e.id === operationId
          )
          if (entry && rollbackFn) {
            rollbackFn(entry.previousState)
            localRollbackStackRef.current = localRollbackStackRef.current.filter(
              (e) => e.id !== operationId
            )
            globalRollbackStack.removeById(operationId)
          }
        }

        // 5. 如果启用自动回滚，立即执行回滚
        if (autoRollback && rollbackFn) {
          const entry = localRollbackStackRef.current.find(
            (e) => e.id === operationId
          )
          if (entry) {
            rollbackFn(entry.previousState)
            localRollbackStackRef.current = localRollbackStackRef.current.filter(
              (e) => e.id !== operationId
            )
            globalRollbackStack.removeById(operationId)
          }
        }

        // 调用错误回调
        onError?.(asyncError, manualRollback)
      }

      return undefined
    }
  }, [
    customOperationId,
    optimisticUpdate,
    rollbackFn,
    executeAsync,
    ignoreOnUnmount,
    onSuccess,
    autoRollback,
    onError,
  ])

  /**
   * 检查是否有可回滚的状态
   * 使用函数形式避免在渲染期间访问 ref
   */
  const getCanRollback = useCallback(() => {
    return localRollbackStackRef.current.length > 0 || globalRollbackStack.size > 0
  }, [])

  return {
    execute,
    isLoading,
    error,
    rollback,
    rollbackTo,
    clearRollbackHistory,
    getRollbackHistory,
    getCanRollback,
  }
}

/**
 * 简化版本：用于状态更新的乐观更新 Hook
 *
 * 专门为 Zustand store 状态更新设计，提供更简洁的 API。
 *
 * @example
 * const { execute, isLoading } = useOptimisticStateUpdate({
 *   getState: () => store.getState().items,
 *   setState: (items) => store.setState({ items }),
 *   asyncOperation: () => api.updateItems(items),
 *   optimisticValue: newItems,
 * })
 */
export interface UseOptimisticStateUpdateOptions<T, R> {
  /** 获取当前状态 */
  getState: () => T
  /** 设置状态 */
  setState: (state: T) => void
  /** 异步操作 */
  asyncOperation: () => Promise<R>
  /** 乐观更新值 */
  optimisticValue: T
  /** 成功回调 */
  onSuccess?: (result: R) => void
  /** 失败回调 */
  onError?: (error: Error) => void
  /** 是否自动回滚（默认 true） */
  autoRollback?: boolean
}

export function useOptimisticStateUpdate<T, R>(
  options: UseOptimisticStateUpdateOptions<T, R>
): {
  execute: () => Promise<R | undefined>
  isLoading: boolean
  error: Error | null
  rollback: () => void
} {
  const {
    getState,
    setState,
    asyncOperation,
    optimisticValue,
    onSuccess,
    onError,
    autoRollback = true,
  } = options

  return useOptimisticUpdate<T, R>({
    execute: asyncOperation,
    optimisticUpdate: () => {
      const previousState = getState()
      setState(optimisticValue)
      return previousState
    },
    rollbackFn: (previousState) => {
      setState(previousState)
    },
    onSuccess,
    onError,
    autoRollback,
  })
}

/**
 * 创建一个带回滚支持的 Zustand store 更新器
 *
 * @example
 * const updateWithRollback = createOptimisticUpdater(useMyStore)
 *
 * // 使用
 * await updateWithRollback({
 *   selector: (state) => state.items,
 *   updater: (set) => set({ items: newItems }),
 *   asyncOperation: () => api.updateItems(newItems),
 * })
 */
export interface OptimisticUpdaterOptions<TStore, TSlice, R> {
  /** 选择要更新的状态片段 */
  selector: (state: TStore) => TSlice
  /** 更新状态 */
  updater: (set: (partial: Partial<TStore>) => void) => void
  /** 异步操作 */
  asyncOperation: () => Promise<R>
  /** 成功回调 */
  onSuccess?: (result: R) => void
  /** 失败回调 */
  onError?: (error: Error) => void
}

/**
 * 批量乐观更新 Hook
 *
 * 支持多个操作的原子性回滚。如果任何一个操作失败，
 * 所有已执行的操作都会被回滚。
 *
 * @example
 * const { executeBatch, isLoading } = useBatchOptimisticUpdate()
 *
 * await executeBatch([
 *   {
 *     execute: () => api.updateUser(user),
 *     optimisticUpdate: () => {
 *       const prev = store.getState().user
 *       store.setState({ user: newUser })
 *       return prev
 *     },
 *     rollbackFn: (prev) => store.setState({ user: prev }),
 *   },
 *   {
 *     execute: () => api.updateSettings(settings),
 *     optimisticUpdate: () => {
 *       const prev = store.getState().settings
 *       store.setState({ settings: newSettings })
 *       return prev
 *     },
 *     rollbackFn: (prev) => store.setState({ settings: prev }),
 *   },
 * ])
 */
export interface BatchOptimisticOperation<T, R> {
  execute: () => Promise<R>
  optimisticUpdate: () => T
  rollbackFn: (previousState: T) => void
  onSuccess?: (result: R) => void
}

export interface UseBatchOptimisticUpdateReturn {
  executeBatch: <T, R>(
    operations: BatchOptimisticOperation<T, R>[]
  ) => Promise<R[] | undefined>
  isLoading: boolean
  error: Error | null
  rollbackAll: () => void
}

export function useBatchOptimisticUpdate(): UseBatchOptimisticUpdateReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rollbackStackRef = useRef<Array<{ previousState: any; rollbackFn: (state: any) => void }>>([])
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  /**
   * 回滚所有已执行的操作
   */
  const rollbackAll = useCallback(() => {
    // 从后往前回滚
    while (rollbackStackRef.current.length > 0) {
      const entry = rollbackStackRef.current.pop()
      if (entry) {
        entry.rollbackFn(entry.previousState)
      }
    }
  }, [])

  /**
   * 执行批量乐观更新
   */
  const executeBatch = useCallback(
    async <T, R>(
      operations: BatchOptimisticOperation<T, R>[]
    ): Promise<R[] | undefined> => {
      setIsLoading(true)
      setError(null)
      rollbackStackRef.current = []

      const results: R[] = []

      try {
        // 1. 先执行所有乐观更新
        for (const op of operations) {
          const previousState = op.optimisticUpdate()
          rollbackStackRef.current.push({
            previousState,
            rollbackFn: op.rollbackFn,
          })
        }

        // 2. 然后执行所有异步操作
        for (let i = 0; i < operations.length; i++) {
          const op = operations[i]
          const result = await op.execute()
          results.push(result)
          op.onSuccess?.(result)
        }

        // 3. 所有操作成功，清除回滚栈
        if (isMountedRef.current) {
          rollbackStackRef.current = []
          setIsLoading(false)
        }

        return results
      } catch (err) {
        const batchError = err instanceof Error ? err : new Error(String(err))

        if (isMountedRef.current) {
          setError(batchError)
          setIsLoading(false)

          // 回滚所有已执行的乐观更新
          rollbackAll()
        }

        return undefined
      }
    },
    [rollbackAll]
  )

  return {
    executeBatch,
    isLoading,
    error,
    rollbackAll,
  }
}
