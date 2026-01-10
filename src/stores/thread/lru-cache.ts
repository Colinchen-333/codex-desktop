/**
 * LRU Cache Implementation
 *
 * A simple LRU (Least Recently Used) cache to prevent memory leaks
 * from unbounded Map growth. Automatically removes least recently
 * used entries when capacity is reached.
 */

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

  /** Evict least recently used entries */
  private evictLRU(): void {
    if (!this.tail) return

    // Evict batch of entries for efficiency
    let evicted = 0
    let currentKey: K | null = this.tail

    while (currentKey && evicted < LRU_CLEANUP_BATCH_SIZE && this.cache.size > this.maxSize) {
      const node = this.cache.get(currentKey)
      const prevKey = node?.prev || null

      if (this.delete(currentKey)) {
        evicted++
      }

      currentKey = prevKey as K | null
    }

    console.debug(
      `[LRUCache] Evicted ${evicted} entries to maintain max size of ${this.maxSize}. Current size: ${this.cache.size}`
    )
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
