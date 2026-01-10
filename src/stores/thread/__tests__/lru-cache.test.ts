import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LRUCache } from '../lru-cache'

describe('LRUCache', () => {
  let cache: LRUCache<string, number>
  const maxSize = 5

  beforeEach(() => {
    cache = new LRUCache<string, number>(maxSize)
    // Mock console.debug to avoid test output pollution
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  describe('Basic Operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 100)
      expect(cache.get('key1')).toBe(100)
    })

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined()
    })

    it('should check if key exists', () => {
      cache.set('key1', 100)
      expect(cache.has('key1')).toBe(true)
      expect(cache.has('nonexistent')).toBe(false)
    })

    it('should update existing values', () => {
      cache.set('key1', 100)
      cache.set('key1', 200)
      expect(cache.get('key1')).toBe(200)
    })

    it('should delete keys', () => {
      cache.set('key1', 100)
      expect(cache.delete('key1')).toBe(true)
      expect(cache.has('key1')).toBe(false)
      expect(cache.get('key1')).toBeUndefined()
    })

    it('should return false when deleting non-existent key', () => {
      expect(cache.delete('nonexistent')).toBe(false)
    })

    it('should clear all entries', () => {
      cache.set('key1', 100)
      cache.set('key2', 200)
      cache.clear()
      expect(cache.size).toBe(0)
      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(false)
    })

    it('should return correct size', () => {
      expect(cache.size).toBe(0)
      cache.set('key1', 100)
      expect(cache.size).toBe(1)
      cache.set('key2', 200)
      expect(cache.size).toBe(2)
    })
  })

  describe('LRU Eviction', () => {
    it('should evict least recently used entries when capacity is exceeded', () => {
      // Fill cache to capacity
      cache.set('key1', 1)
      cache.set('key2', 2)
      cache.set('key3', 3)
      cache.set('key4', 4)
      cache.set('key5', 5)

      // Access key1 and key2 to make them recently used
      cache.get('key1')
      cache.get('key2')

      // Add one more to trigger eviction
      cache.set('key6', 6)

      // key3 should be evicted (least recently used)
      expect(cache.has('key3')).toBe(false)
      expect(cache.has('key1')).toBe(true)
      expect(cache.has('key2')).toBe(true)
      expect(cache.has('key4')).toBe(true)
      expect(cache.has('key5')).toBe(true)
      expect(cache.has('key6')).toBe(true)
      expect(cache.size).toBe(maxSize)
    })

    it('should update access time on get', () => {
      cache.set('key1', 1)
      cache.set('key2', 2)
      cache.set('key3', 3)
      cache.set('key4', 4)
      cache.set('key5', 5)

      // Access key1 to make it recently used
      cache.get('key1')

      // Add new key to trigger eviction
      cache.set('key6', 6)

      // key2 should be evicted, not key1
      expect(cache.has('key1')).toBe(true)
      expect(cache.has('key2')).toBe(false)
    })

    it('should update access time on set for existing keys', () => {
      cache.set('key1', 1)
      cache.set('key2', 2)
      cache.set('key3', 3)
      cache.set('key4', 4)
      cache.set('key5', 5)

      // Update key1 to make it recently used
      cache.set('key1', 100)

      // Add new key to trigger eviction
      cache.set('key6', 6)

      // key2 should be evicted, not key1
      expect(cache.has('key1')).toBe(true)
      expect(cache.get('key1')).toBe(100)
      expect(cache.has('key2')).toBe(false)
    })
  })

  describe('Utility Methods', () => {
    it('should return all keys', () => {
      cache.set('key1', 1)
      cache.set('key2', 2)
      cache.set('key3', 3)

      const keys = cache.keys()
      expect(keys).toHaveLength(3)
      expect(keys).toContain('key1')
      expect(keys).toContain('key2')
      expect(keys).toContain('key3')
    })

    it('should return all entries as key-value pairs', () => {
      cache.set('key1', 1)
      cache.set('key2', 2)
      cache.set('key3', 3)

      const entries = cache.entries()
      expect(entries).toHaveLength(3)
      expect(entries).toContainEqual(['key1', 1])
      expect(entries).toContainEqual(['key2', 2])
      expect(entries).toContainEqual(['key3', 3])
    })

    it('should provide statistics', () => {
      cache.set('key1', 1)
      cache.set('key2', 2)

      const stats = cache.getStats()
      expect(stats.size).toBe(2)
      expect(stats.maxSize).toBe(maxSize)
      expect(stats.head).toBe('key2') // Most recently used
      expect(stats.tail).toBe('key1') // Least recently used
    })
  })

  describe('Edge Cases', () => {
    it('should handle cache with size 0', () => {
      const zeroCache = new LRUCache<string, number>(0)
      zeroCache.set('key1', 1)
      expect(zeroCache.has('key1')).toBe(false)
      expect(zeroCache.size).toBe(0)
    })

    it('should handle cache with size 1', () => {
      const singleCache = new LRUCache<string, number>(1)
      singleCache.set('key1', 1)
      expect(singleCache.get('key1')).toBe(1)

      singleCache.set('key2', 2)
      expect(singleCache.has('key1')).toBe(false)
      expect(singleCache.has('key2')).toBe(true)
    })

    it('should handle operations on empty cache', () => {
      expect(cache.size).toBe(0)
      expect(cache.keys()).toEqual([])
      expect(cache.entries()).toEqual([])

      const stats = cache.getStats()
      expect(stats.size).toBe(0)
      expect(stats.head).toBe(null)
      expect(stats.tail).toBe(null)
    })
  })
})