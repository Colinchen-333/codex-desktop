/**
 * P2.2 优化：API 请求缓存层
 * 为频繁调用但数据很少变化的 API 添加缓存机制，减少不必要的 IPC 调用
 *
 * 使用场景：
 * - getModels: 模型列表很少变化，缓存 5 分钟
 * - listSkills: 技能列表可能变化，缓存 1 分钟，支持强制刷新
 * - listMcpServers: MCP 服务器列表较稳定，缓存 2 分钟
 */

/**
 * P1 Fix: Enhanced cache entry with error support
 */
interface CacheEntry<T> {
  data: T
  expiry: number
  isError?: boolean  // P1 Fix: Flag to indicate if this is an error response
}

// 使用 Map 存储缓存，key 为缓存键，value 为缓存条目
const cache = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()
const requestSeq = new Map<string, number>()
const inFlightTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * P1 Fix: Error TTL (15 seconds) - shorter than success responses
 */
const ERROR_TTL_MS = 15000
const MAX_CACHE_ENTRIES = 200
const MAX_IN_FLIGHT_MS = 5 * 60 * 1000

function clearInFlightTimeout(key: string): void {
  const timeoutId = inFlightTimeouts.get(key)
  if (timeoutId) {
    clearTimeout(timeoutId)
    inFlightTimeouts.delete(key)
  }
}

function deleteCacheEntry(key: string): void {
  cache.delete(key)
  if (!inFlight.has(key)) {
    requestSeq.delete(key)
  }
}

function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiry <= now && !inFlight.has(key)) {
      cache.delete(key)
      requestSeq.delete(key)
    }
  }

  if (cache.size <= MAX_CACHE_ENTRIES) return

  let overflow = cache.size - MAX_CACHE_ENTRIES
  for (const key of cache.keys()) {
    deleteCacheEntry(key)
    overflow -= 1
    if (overflow <= 0) break
  }
}

/**
 * 使用缓存包装 API 调用
 * 如果缓存有效则返回缓存数据，否则调用 fetcher 获取新数据并更新缓存
 *
 * @param key 缓存键，用于标识不同的 API 调用
 * @param fetcher 实际的 API 调用函数
 * @param ttlMs 缓存有效期（毫秒），默认 60 秒
 * @returns Promise<T> 返回缓存或新获取的数据
 *
 * @example
 * // 缓存 5 分钟
 * const models = await withCache('models', () => invoke<Model[]>('get_models'), 300000)
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 60000,
  cacheErrors: boolean = true  // P1 Fix: New parameter to control error caching
): Promise<T> {
  const now = Date.now()
  pruneCache(now)
  const cached = cache.get(key) as CacheEntry<T> | undefined

  // 如果缓存存在且未过期
  if (cached && cached.expiry > now) {
    // P1 Fix: If cached entry is an error, re-throw it
    if (cached.isError) {
      if (!cacheErrors) {
        deleteCacheEntry(key)
      } else {
        throw cached.data
      }
    } else {
      return cached.data
    }
  }

  const existing = inFlight.get(key) as Promise<T> | undefined
  if (existing) {
    return existing
  }

  // 调用实际的 API 获取数据
  const requestId = (requestSeq.get(key) ?? 0) + 1
  requestSeq.set(key, requestId)

  const request = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      // P1 Fix: Calculate expiry at completion time, not request start time
      if (requestSeq.get(key) === requestId) {
        cache.set(key, { data, expiry: Date.now() + ttlMs, isError: false })
      }
      pruneCache(Date.now())
      inFlight.delete(key)
      clearInFlightTimeout(key)
      return data
    })
    .catch((error) => {
      // P1 Fix: Cache error responses with shorter TTL
      // Also use completion time for expiry calculation
      if (cacheErrors && requestSeq.get(key) === requestId) {
        cache.set(key, {
          data: error,
          expiry: Date.now() + ERROR_TTL_MS,
          isError: true,
        })
      }
      pruneCache(Date.now())
      inFlight.delete(key)
      clearInFlightTimeout(key)
      throw error
    })

  inFlight.set(key, request)
  clearInFlightTimeout(key)
  inFlightTimeouts.set(
    key,
    setTimeout(() => {
      if (inFlight.get(key) === request) {
        inFlight.delete(key)
        cache.delete(key)
        requestSeq.delete(key)
      }
      inFlightTimeouts.delete(key)
    }, MAX_IN_FLIGHT_MS)
  )

  return request
}

/**
 * 清除指定的缓存
 * 用于需要强制刷新数据的场景
 *
 * @param key 要清除的缓存键
 *
 * @example
 * clearCache('skills') // 清除技能列表缓存
 */
export function clearCache(key: string): void {
  const hadInFlight = inFlight.has(key)
  inFlight.delete(key)
  clearInFlightTimeout(key)
  cache.delete(key)
  if (hadInFlight) {
    requestSeq.set(key, (requestSeq.get(key) ?? 0) + 1)
  } else {
    requestSeq.delete(key)
  }
}

/**
 * 清除所有缓存
 * 用于登出、切换项目等需要完全刷新状态的场景
 */
export function clearAllCache(): void {
  cache.clear()
  inFlight.clear()
  requestSeq.clear()
  for (const timeoutId of inFlightTimeouts.values()) {
    clearTimeout(timeoutId)
  }
  inFlightTimeouts.clear()
}

/**
 * 获取缓存统计信息（用于调试）
 * @returns 缓存条目数量和各缓存键的过期时间
 */
export function getCacheStats(): { size: number; entries: Record<string, number> } {
  const entries: Record<string, number> = {}
  const now = Date.now()

  cache.forEach((entry, key) => {
    entries[key] = Math.max(0, entry.expiry - now) // 剩余有效时间（毫秒）
  })

  return {
    size: cache.size,
    entries
  }
}

// 缓存键常量，避免魔法字符串
export const CACHE_KEYS = {
  MODELS: 'models',
  SKILLS: 'skills',
  MCP_SERVERS: 'mcpServers',
  ACCOUNT_INFO: 'accountInfo',
} as const

// 缓存 TTL 常量（毫秒）
export const CACHE_TTL = {
  MODELS: 5 * 60 * 1000,      // 5 分钟 - 模型列表很少变化
  SKILLS: 60 * 1000,          // 1 分钟 - 技能可能动态变化
  MCP_SERVERS: 2 * 60 * 1000, // 2 分钟 - MCP 服务器较稳定
  ACCOUNT_INFO: 60 * 1000,    // 1 分钟 - 账户信息可能变化
} as const
