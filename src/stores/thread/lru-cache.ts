/**
 * LRU Cache Implementation
 *
 * A simple LRU (Least Recently Used) cache to prevent memory leaks
 * from unbounded Map growth. Automatically removes least recently
 * used entries when capacity is reached.
 */

import { log } from '../../lib/logger'
import { LRU_CLEANUP_BATCH_SIZE } from './constants'
import type { LRUCacheNode } from './types'

export class LRUCache<K extends string, V> {
  private cache: Map<K, LRUCacheNode<V>>
  private head: K | null = null
  private tail: K | null = null
  private maxSize: number

  constructor(maxSize: number) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  /** Get value by key and update access time */
  get(key: K): V | undefined {
    const node = this.cache.get(key)
    if (!node) return undefined

    // Update last access time and move to front
    node.lastAccess = Date.now()
    this.moveToFront(key)
    return node.value
  }

  /** Set value for key, evicting LRU entries if necessary */
  set(key: K, value: V): void {
    const existingNode = this.cache.get(key)

    if (existingNode) {
      // Update existing node
      existingNode.value = value
      existingNode.lastAccess = Date.now()
      this.moveToFront(key)
    } else {
      // Create new node
      const newNode: LRUCacheNode<V> = {
        value,
        prev: null,
        next: null,
        lastAccess: Date.now(),
      }

      // Add to cache
      this.cache.set(key, newNode)

      // Add to front of list
      if (!this.head) {
        this.head = key
        this.tail = key
      } else {
        newNode.next = this.head
        if (this.head) {
          const headNode = this.cache.get(this.head)
          if (headNode) headNode.prev = key
        }
        this.head = key
      }

      // Check if we need to evict
      if (this.cache.size > this.maxSize) {
        this.evictLRU()
      }
    }
  }

  /** Check if key exists */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /** Delete key and return value */
  delete(key: K): boolean {
    const node = this.cache.get(key)
    if (!node) return false

    // Remove from linked list
    if (node.prev) {
      const prevNode = this.cache.get(node.prev as K)
      if (prevNode) prevNode.next = node.next
    } else {
      this.head = node.next as K | null
    }

    if (node.next) {
      const nextNode = this.cache.get(node.next as K)
      if (nextNode) nextNode.prev = node.prev
    } else {
      this.tail = node.prev as K | null
    }

    return this.cache.delete(key)
  }

  /** Clear all entries */
  clear(): void {
    this.cache.clear()
    this.head = null
    this.tail = null
  }

  /** Get current size */
  get size(): number {
    return this.cache.size
  }

  /** Get all keys */
  keys(): K[] {
    return Array.from(this.cache.keys())
  }

  /** Get all entries as [key, value] pairs */
  entries(): [K, V][] {
    return Array.from(this.cache.entries()).map(([key, node]) => [key, node.value])
  }

  /** Move key to front of LRU list */
  private moveToFront(key: K): void {
    const node = this.cache.get(key)
    if (!node || !this.head || this.head === key) return

    // Remove from current position
    if (node.prev) {
      const prevNode = this.cache.get(node.prev as K)
      if (prevNode) prevNode.next = node.next
    }
    if (node.next) {
      const nextNode = this.cache.get(node.next as K)
      if (nextNode) nextNode.prev = node.prev
    } else {
      this.tail = node.prev as K | null
    }

    // Move to front
    node.prev = null
    node.next = this.head
    const headNode = this.cache.get(this.head)
    if (headNode) headNode.prev = key
    this.head = key
  }

  /**
   * Evict least recently used entries
   * P2: Optimized batch eviction with direct linked list manipulation
   */
  private evictLRU(): void {
    if (!this.tail) return

    // P2 Fix: Calculate how many entries need to be evicted upfront
    const entriesToEvict = Math.max(0, this.cache.size - this.maxSize)
    const actualEvictCount = Math.min(entriesToEvict, LRU_CLEANUP_BATCH_SIZE)

    if (actualEvictCount === 0) return

    // Phase 1: Collect keys and update linked list pointers
    const keysToEvict: K[] = []
    let currentKey: K | null = this.tail
    let count = 0
    let newTail: K | null = null

    // Walk from tail collecting keys to evict
    while (currentKey && count < actualEvictCount) {
      keysToEvict.push(currentKey)
      const node = this.cache.get(currentKey)

      if (count === actualEvictCount - 1) {
        // This is the last key we're evicting, so its prev becomes new tail
        newTail = node?.prev || null
      }

      currentKey = node?.prev || null
      count++
    }

    // Phase 2: Update tail pointer
    this.tail = newTail
    if (newTail) {
      const newTailNode = this.cache.get(newTail)
      if (newTailNode) {
        newTailNode.next = null // Break link to evicted entries
      }
    } else {
      // All entries evicted
      this.head = null
    }

    // Phase 3: Batch delete from cache Map
    for (const key of keysToEvict) {
      this.cache.delete(key)
    }

    log.debug(
      `[LRUCache] Evicted ${keysToEvict.length} entries, cache size: ${this.cache.size}/${this.maxSize}`,
      'lru-cache'
    )
  }

  /**
   * P2: Batch delete multiple keys efficiently
   * Useful for clearing all entries related to a specific resource
   *
   * @param predicate - Function that returns true for keys to delete
   * @returns Number of entries deleted
   */
  batchDelete(predicate: (key: K, value: V) => boolean): number {
    const keysToDelete: K[] = []

    // Phase 1: Collect keys to delete
    for (const [key, node] of this.cache.entries()) {
      if (predicate(key, node.value)) {
        keysToDelete.push(key)
      }
    }

    // Phase 2: Delete all at once
    for (const key of keysToDelete) {
      this.delete(key)
    }

    return keysToDelete.length
  }

  /** Get statistics for debugging */
  getStats(): { size: number; maxSize: number; head: K | null; tail: K | null } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      head: this.head,
      tail: this.tail,
    }
  }
}
