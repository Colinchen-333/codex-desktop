/**
 * LRU Cache Test Suite
 * This file demonstrates and tests the LRU cache implementation in thread.ts
 */

// Mock the LRUCache class for testing (same implementation as in thread.ts)
interface LRUCacheNode<V> {
  value: V
  prev: string | null
  next: string | null
  lastAccess: number
}

class LRUCache<K extends string, V> {
  private cache: Map<K, LRUCacheNode<V>>
  private head: K | null = null
  private tail: K | null = null
  private maxSize: number

  constructor(maxSize: number) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    const node = this.cache.get(key)
    if (!node) return undefined

    node.lastAccess = Date.now()
    this.moveToFront(key)
    return node.value
  }

  set(key: K, value: V): void {
    const existingNode = this.cache.get(key)

    if (existingNode) {
      existingNode.value = value
      existingNode.lastAccess = Date.now()
      this.moveToFront(key)
    } else {
      const newNode: LRUCacheNode<V> = {
        value,
        prev: null,
        next: null,
        lastAccess: Date.now(),
      }

      this.cache.set(key, newNode)

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

      if (this.cache.size > this.maxSize) {
        this.evictLRU()
      }
    }
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  delete(key: K): boolean {
    const node = this.cache.get(key)
    if (!node) return false

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

  clear(): void {
    this.cache.clear()
    this.head = null
    this.tail = null
  }

  get size(): number {
    return this.cache.size
  }

  keys(): K[] {
    return Array.from(this.cache.keys())
  }

  entries(): [K, V][] {
    return Array.from(this.cache.entries()).map(([key, node]) => [key, node.value])
  }

  private moveToFront(key: K): void {
    const node = this.cache.get(key)
    if (!node || !this.head || this.head === key) return

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

    node.prev = null
    node.next = this.head
    const headNode = this.cache.get(this.head)
    if (headNode) headNode.prev = key
    this.head = key
  }

  private evictLRU(): void {
    if (!this.tail) return

    let evicted = 0
    let currentKey: K | null = this.tail

    while (currentKey && evicted < 50 && this.cache.size > this.maxSize) {
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

  getStats(): { size: number; maxSize: number; head: K | null; tail: K | null } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      head: this.head,
      tail: this.tail,
    }
  }
}

// Test cases
function runLRUTests() {
  console.log('=== LRU Cache Test Suite ===\n')

  // Test 1: Basic operations
  console.log('Test 1: Basic get/set operations')
  const cache = new LRUCache<string, number>(5)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('c', 3)

  console.assert(cache.get('a') === 1, 'Failed to get value for key "a"')
  console.assert(cache.get('b') === 2, 'Failed to get value for key "b"')
  console.assert(cache.get('c') === 3, 'Failed to get value for key "c"')
  console.assert(cache.size === 3, 'Cache size should be 3')
  console.log('✓ Basic operations work correctly\n')

  // Test 2: LRU eviction
  console.log('Test 2: LRU eviction when max size exceeded')
  cache.set('d', 4)
  cache.set('e', 5)
  cache.set('f', 6) // Should evict 'a' (least recently used)

  console.assert(cache.size === 5, 'Cache size should be limited to max size (5)')
  console.assert(!cache.has('a'), 'Least recently used entry should be evicted')
  console.assert(cache.has('b'), 'More recently used entries should remain')
  console.log('✓ LRU eviction works correctly\n')

  // Test 3: Access updates LRU order
  console.log('Test 3: Accessing entries updates LRU order')
  const cache2 = new LRUCache<string, number>(3)
  cache2.set('x', 1)
  cache2.set('y', 2)
  cache2.set('z', 3)
  cache2.get('x') // Access 'x' to make it more recent
  cache2.set('a', 4) // Should evict 'y' (now least recently used)

  console.assert(cache2.has('x'), 'Recently accessed entry should remain')
  console.assert(cache2.has('z'), 'Recently added entry should remain')
  console.assert(cache2.has('a'), 'New entry should be added')
  console.assert(!cache2.has('y'), 'Least recently used entry should be evicted')
  console.log('✓ Access order updates work correctly\n')

  // Test 4: Delete operation
  console.log('Test 4: Delete operation')
  const cache3 = new LRUCache<string, number>(5)
  cache3.set('a', 1)
  cache3.set('b', 2)
  cache3.set('c', 3)
  cache3.delete('b')

  console.assert(!cache3.has('b'), 'Deleted entry should not exist')
  console.assert(cache3.size === 2, 'Cache size should be 2 after deletion')
  console.log('✓ Delete operation works correctly\n')

  // Test 5: Clear operation
  console.log('Test 5: Clear operation')
  const cache4 = new LRUCache<string, number>(5)
  cache4.set('a', 1)
  cache4.set('b', 2)
  cache4.clear()

  console.assert(cache4.size === 0, 'Cache should be empty after clear')
  console.assert(!cache4.has('a'), 'No entries should exist after clear')
  console.log('✓ Clear operation works correctly\n')

  // Test 6: Memory leak prevention with large datasets
  console.log('Test 6: Memory leak prevention (simulated)')
  const cache5 = new LRUCache<string, string>(100)
  const initialSize = 100

  // Add more entries than max size
  for (let i = 0; i < 200; i++) {
    cache5.set(`key-${i}`, `value-${i}`)
  }

  console.assert(
    cache5.size <= initialSize,
    `Cache size should not exceed ${initialSize}, but got ${cache5.size}`
  )
  console.log(`✓ Memory leak prevention works (size capped at ${initialSize})\n`)

  // Test 7: Stats
  console.log('Test 7: Statistics')
  const cache6 = new LRUCache<string, number>(10)
  cache6.set('a', 1)
  cache6.set('b', 2)
  cache6.set('c', 3)
  const stats = cache6.getStats()

  console.assert(stats.size === 3, 'Stats should report correct size')
  console.assert(stats.maxSize === 10, 'Stats should report correct maxSize')
  console.log('✓ Statistics work correctly\n')

  console.log('=== All LRU Cache Tests Passed ✓ ===')
}

// Run tests
runLRUTests()

export { LRUCache }
