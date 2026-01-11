/**
 * useAsyncOperation Hook
 *
 * 管理异步操作的状态，包括加载状态、错误处理和数据管理。
 * 提供统一的异步操作模式，避免重复的 try-catch 和状态管理代码。
 *
 * @example
 * const { execute, isLoading, error, data, reset } = useAsyncOperation(
 *   async (userId: string) => {
 *     const response = await api.getUser(userId)
 *     return response.data
 *   },
 *   {
 *     onSuccess: (user) => console.log('User loaded:', user),
 *     onError: (error) => console.error('Failed to load user:', error),
 *   }
 * )
 *
 * // 调用
 * await execute('user-123')
 */

import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * 异步操作配置选项
 */
export interface UseAsyncOperationOptions<T> {
  /** 操作成功时的回调 */
  onSuccess?: (data: T) => void
  /** 操作失败时的回调 */
  onError?: (error: Error) => void
  /** 是否在组件卸载后忽略结果（默认 true） */
  ignoreOnUnmount?: boolean
}

/**
 * 异步操作 Hook 返回值
 */
export interface UseAsyncOperationReturn<T, Args extends unknown[]> {
  /** 执行异步操作 */
  execute: (...args: Args) => Promise<T | undefined>
  /** 是否正在加载 */
  isLoading: boolean
  /** 错误信息 */
  error: Error | null
  /** 操作返回的数据 */
  data: T | null
  /** 重置状态 */
  reset: () => void
}

/**
 * 异步操作状态
 */
interface AsyncState<T> {
  isLoading: boolean
  error: Error | null
  data: T | null
}

/**
 * 异步操作管理 Hook
 *
 * 提供统一的异步操作状态管理，包括：
 * - 自动管理加载状态
 * - 统一的错误处理
 * - 支持成功/失败回调
 * - 防止组件卸载后的状态更新
 *
 * @param asyncFn - 异步操作函数
 * @param options - 配置选项
 * @returns 异步操作控制接口
 */
export function useAsyncOperation<T, Args extends unknown[]>(
  asyncFn: (...args: Args) => Promise<T>,
  options: UseAsyncOperationOptions<T> = {}
): UseAsyncOperationReturn<T, Args> {
  const { onSuccess, onError, ignoreOnUnmount = true } = options

  const [state, setState] = useState<AsyncState<T>>({
    isLoading: false,
    error: null,
    data: null,
  })

  // 用于追踪组件是否已卸载
  const isMountedRef = useRef(true)
  // 用于取消过期的请求（当新请求发起时，旧请求的结果应被忽略）
  const latestRequestIdRef = useRef(0)

  // 组件卸载时设置标志
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  /**
   * 执行异步操作
   */
  const execute = useCallback(
    async (...args: Args): Promise<T | undefined> => {
      // 生成新的请求 ID
      const requestId = ++latestRequestIdRef.current

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }))

      try {
        const result = await asyncFn(...args)

        // 检查是否应该更新状态
        const shouldUpdate =
          requestId === latestRequestIdRef.current &&
          (isMountedRef.current || !ignoreOnUnmount)

        if (shouldUpdate) {
          setState({
            isLoading: false,
            error: null,
            data: result,
          })
          onSuccess?.(result)
        }

        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))

        // 检查是否应该更新状态
        const shouldUpdate =
          requestId === latestRequestIdRef.current &&
          (isMountedRef.current || !ignoreOnUnmount)

        if (shouldUpdate) {
          setState({
            isLoading: false,
            error,
            data: null,
          })
          onError?.(error)
        }

        return undefined
      }
    },
    [asyncFn, onSuccess, onError, ignoreOnUnmount]
  )

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    // 增加请求 ID 以取消任何进行中的请求
    latestRequestIdRef.current++
    setState({
      isLoading: false,
      error: null,
      data: null,
    })
  }, [])

  return {
    execute,
    isLoading: state.isLoading,
    error: state.error,
    data: state.data,
    reset,
  }
}

/**
 * 简化版本：只关心执行和加载状态
 */
export function useAsyncCallback<Args extends unknown[]>(
  asyncFn: (...args: Args) => Promise<void>,
  options: Omit<UseAsyncOperationOptions<void>, 'onSuccess'> & {
    onSuccess?: () => void
  } = {}
): {
  execute: (...args: Args) => Promise<void>
  isLoading: boolean
} {
  const { execute, isLoading } = useAsyncOperation(asyncFn, options)

  const wrappedExecute = useCallback(
    async (...args: Args): Promise<void> => {
      await execute(...args)
    },
    [execute]
  )

  return { execute: wrappedExecute, isLoading }
}
