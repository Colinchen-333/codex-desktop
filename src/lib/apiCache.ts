/**
 * P2.2 优化：API 请求缓存层
 * 为频繁调用但数据很少变化的 API 添加缓存机制，减少不必要的 IPC 调用
 *
 * 使用场景：
 * - getModels: 模型列表很少变化，缓存 5 分钟
 * - listSkills: 技能列表可能变化，缓存 1 分钟，支持强制刷新
 * - listMcpServers: MCP 服务器列表较稳定，缓存 2 分钟
 */

interface CacheEntry<T> {
  data: T
  expiry: number
}

// 使用 Map 存储缓存，key 为缓存键，value 为缓存条目
const cache = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()

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
  ttlMs: number = 60000
): Promise<T> {
  const now = Date.now()
  const cached = cache.get(key) as CacheEntry<T> | undefined

  // 如果缓存存在且未过期，直接返回缓存数据
  if (cached && cached.expiry > now) {
    return cached.data
  }

  const existing = inFlight.get(key) as Promise<T> | undefined
  if (existing) {
    return existing
  }

  // 调用实际的 API 获取数据
  const request = fetcher()
    .then((data) => {
      cache.set(key, { data, expiry: now + ttlMs })
      inFlight.delete(key)
      return data
    })
    .catch((error) => {
      inFlight.delete(key)
      throw error
    })

  inFlight.set(key, request)

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
  cache.delete(key)
  inFlight.delete(key)
}

/**
 * 清除所有缓存
 * 用于登出、切换项目等需要完全刷新状态的场景
 */
export function clearAllCache(): void {
  cache.clear()
  inFlight.clear()
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
