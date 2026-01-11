/**
 * Message list hooks for ChatMessageList
 * Optimized for performance with:
 * - ResizeObserver for dynamic height measurement
 * - LRU cache with improved warming strategy
 * - RAF-based scroll handling
 * - Performance metrics logging
 */
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import type { ListImperativeAPI } from 'react-window'
import { type AnyThreadItem } from '../../stores/thread'
import { LRUCache } from '../../stores/thread/lru-cache'
import { MAX_LRU_CACHE_SIZE } from '../../stores/thread/constants'
import { isAgentMessageContent } from '../../lib/typeGuards'
import { DEFAULT_ITEM_HEIGHT } from './types'
import { estimateItemHeight } from './heightEstimation'
import { log } from '../../lib/logger'

// Performance metrics configuration
const PERF_LOG_INTERVAL_MS = 5000
const MEASURED_HEIGHT_WEIGHT = 0.7 // Weight for measured height vs estimated
const WARMUP_BATCH_SIZE = 20 // Number of items to pre-warm cache

// P2: Cache expiration configuration
const CACHE_ENTRY_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

// Height measurement cache with measured vs estimated distinction
interface HeightCacheEntry {
  height: number
  measured: boolean
  timestamp: number
}

/**
 * Performance metrics tracker for virtual list
 */
class VirtualListMetrics {
  private cacheHits = 0
  private cacheMisses = 0
  private measurements = 0
  private lastLogTime = 0
  private estimationErrors: number[] = []

  recordCacheHit(): void {
    this.cacheHits++
  }

  recordCacheMiss(): void {
    this.cacheMisses++
  }

  recordMeasurement(estimated: number, measured: number): void {
    this.measurements++
    const error = Math.abs(estimated - measured) / Math.max(estimated, 1)
    this.estimationErrors.push(error)
    // Keep only last 100 errors for rolling average
    if (this.estimationErrors.length > 100) {
      this.estimationErrors.shift()
    }
  }

  maybeLog(): void {
    const now = Date.now()
    if (now - this.lastLogTime < PERF_LOG_INTERVAL_MS) return

    const total = this.cacheHits + this.cacheMisses
    const hitRate = total > 0 ? ((this.cacheHits / total) * 100).toFixed(1) : '0'
    const avgError =
      this.estimationErrors.length > 0
        ? (
            (this.estimationErrors.reduce((a, b) => a + b, 0) / this.estimationErrors.length) *
            100
          ).toFixed(1)
        : '0'

    log.debug(
      `[VirtualList] Cache: ${hitRate}% hit rate (${this.cacheHits}/${total}), ` +
        `Measurements: ${this.measurements}, Avg estimation error: ${avgError}%`,
      'virtual-list'
    )

    this.lastLogTime = now
  }

  reset(): void {
    this.cacheHits = 0
    this.cacheMisses = 0
    this.measurements = 0
    this.estimationErrors = []
  }
}

// Global metrics instance
const metrics = new VirtualListMetrics()

/**
 * Hook for managing item size cache with LRU eviction and ResizeObserver
 */
export function useItemSizeCache(
  items: Record<string, AnyThreadItem>,
  itemOrder: string[]
) {
  // Main height cache with measured vs estimated distinction
  const heightCache = useRef<LRUCache<string, HeightCacheEntry>>(
    new LRUCache(MAX_LRU_CACHE_SIZE)
  )

  // P2: Reverse index for O(1) cache key lookups by item ID
  // Maps item ID -> Set of cache keys for that item
  const cacheKeyIndex = useRef<Map<string, Set<string>>>(new Map())

  // Track items for change detection
  const prevItemsRef = useRef<Record<string, AnyThreadItem>>(items)
  const itemsRef = useRef<Record<string, AnyThreadItem>>(items)

  // ResizeObserver for dynamic height measurement
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const observedElementsRef = useRef<Map<string, HTMLElement>>(new Map())

  // Callback registry for height updates
  const onHeightChangeRef = useRef<((id: string, height: number) => void) | null>(null)

  // RAF-based debounce for ResizeObserver
  const resizeCallbackRef = useRef<number | null>(null)

  // Initialize ResizeObserver
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    resizeObserverRef.current = new ResizeObserver((entries) => {
      // Cancel any pending RAF callback
      if (resizeCallbackRef.current !== null) {
        cancelAnimationFrame(resizeCallbackRef.current)
      }

      // Schedule processing on next animation frame for debouncing
      resizeCallbackRef.current = requestAnimationFrame(() => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement
          const id = element.dataset.itemId
          if (!id) continue

          const measuredHeight = entry.contentRect.height
          if (measuredHeight <= 0) continue

          const item = itemsRef.current[id]
          if (!item) continue

          const cacheKey = createCacheKey(id, item)
          const existing = heightCache.current.get(cacheKey)
          const estimated = estimateItemHeight(item)

          // Record measurement for metrics
          metrics.recordMeasurement(estimated, measuredHeight)

          // Blend measured with estimated using weighted average
          // This provides stability while incorporating real measurements
          const blendedHeight = existing?.measured
            ? measuredHeight // Already measured, use new measurement directly
            : Math.round(measuredHeight * MEASURED_HEIGHT_WEIGHT + estimated * (1 - MEASURED_HEIGHT_WEIGHT))

          heightCache.current.set(cacheKey, {
            height: blendedHeight,
            measured: true,
            timestamp: Date.now(),
          })

          // Notify about height change if callback registered
          onHeightChangeRef.current?.(id, blendedHeight)
        }
        resizeCallbackRef.current = null
      })
    })

    // Capture ref value for cleanup
    const observedElements = observedElementsRef.current

    return () => {
      // Cancel any pending RAF callback
      if (resizeCallbackRef.current !== null) {
        cancelAnimationFrame(resizeCallbackRef.current)
        resizeCallbackRef.current = null
      }
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      observedElements.clear()
    }
  }, [])

  // Clear cache for changed/removed items
  useEffect(() => {
    const prevItems = prevItemsRef.current
    const currentIds = new Set(Object.keys(items))
    const prevIds = new Set(Object.keys(prevItems))

    // Clear cache for removed items
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        clearCacheForItemOptimized(heightCache.current, cacheKeyIndex.current, id)
        // Stop observing removed elements
        const element = observedElementsRef.current.get(id)
        if (element) {
          resizeObserverRef.current?.unobserve(element)
          observedElementsRef.current.delete(id)
        }
      }
    }

    // Clear cache for modified items (content changed)
    for (const id of currentIds) {
      const prevItem = prevItems[id]
      const currentItem = items[id]

      if (prevItem && currentItem) {
        if (hasItemChanged(prevItem, currentItem)) {
          clearCacheForItemOptimized(heightCache.current, cacheKeyIndex.current, id)
        }
      }
    }

    prevItemsRef.current = items
  }, [items])

  // Pre-warm cache for visible items
  const warmupCache = useCallback(
    (startIndex: number, endIndex: number) => {
      const start = Math.max(0, startIndex - WARMUP_BATCH_SIZE)
      const end = Math.min(itemOrder.length, endIndex + WARMUP_BATCH_SIZE)

      for (let i = start; i < end; i++) {
        const id = itemOrder[i]
        const item = items[id]
        if (!item) continue

        const cacheKey = createCacheKey(id, item)
        if (!heightCache.current.has(cacheKey)) {
          const height = estimateItemHeight(item)
          heightCache.current.set(cacheKey, {
            height,
            measured: false,
            timestamp: Date.now(),
          })
        }
      }
    },
    [itemOrder, items]
  )

  // Register element for observation
  const observeElement = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      element.dataset.itemId = id
      observedElementsRef.current.set(id, element)
      resizeObserverRef.current?.observe(element)
    } else {
      const existing = observedElementsRef.current.get(id)
      if (existing) {
        resizeObserverRef.current?.unobserve(existing)
        observedElementsRef.current.delete(id)
      }
    }
  }, [])

  // Get item size with caching
  const getItemSize = useCallback(
    (index: number) => {
      const id = itemOrder[index]
      const item = items[id]

      if (!item) return DEFAULT_ITEM_HEIGHT

      const cacheKey = createCacheKey(id, item)
      const cached = heightCache.current.get(cacheKey)

      if (cached) {
        // P2: Check if cache entry has expired
        const age = Date.now() - cached.timestamp
        if (age > CACHE_ENTRY_MAX_AGE_MS) {
          heightCache.current.delete(cacheKey)
          // P2: Remove from reverse index
          removeCacheKeyFromIndex(cacheKeyIndex.current, id, cacheKey)
          log.debug(
            `[useMessageListHooks] Cache entry expired for ${id} (age: ${Math.round(age / 1000)}s)`,
            'useMessageListHooks'
          )
        } else {
          metrics.recordCacheHit()
          metrics.maybeLog()
          return cached.height
        }
      }

      metrics.recordCacheMiss()
      metrics.maybeLog()

      // Re-estimate height (cached entry was either missing or expired)
      const height = estimateItemHeight(item)
      heightCache.current.set(cacheKey, {
        height,
        measured: false,
        timestamp: Date.now(),
      })

      // P2: Add to reverse index
      addCacheKeyToIndex(cacheKeyIndex.current, id, cacheKey)

      return height
    },
    [itemOrder, items]
  )

  // Set height change callback
  const setOnHeightChange = useCallback((callback: ((id: string, height: number) => void) | null) => {
    onHeightChangeRef.current = callback
  }, [])

  // Get cache statistics
  const getCacheStats = useCallback(() => {
    return heightCache.current.getStats()
  }, [])

  return {
    getItemSize,
    warmupCache,
    observeElement,
    setOnHeightChange,
    getCacheStats,
  }
}

/**
 * Create cache key for item
 */
function createCacheKey(id: string, item: AnyThreadItem): string {
  return `${id}-${item.type}-${item.status}`
}

/**
 * Add cache key to reverse index for O(1) lookup
 */
function addCacheKeyToIndex(index: Map<string, Set<string>>, itemId: string, cacheKey: string): void {
  let keys = index.get(itemId)
  if (!keys) {
    keys = new Set()
    index.set(itemId, keys)
  }
  keys.add(cacheKey)
}

/**
 * Remove cache key from reverse index
 */
function removeCacheKeyFromIndex(index: Map<string, Set<string>>, itemId: string, cacheKey: string): void {
  const keys = index.get(itemId)
  if (keys) {
    keys.delete(cacheKey)
    if (keys.size === 0) {
      index.delete(itemId)
    }
  }
}

/**
 * P2: Optimized cache clearing using reverse index for O(k) performance
 * where k is the number of cache entries for the item (typically 1-3)
 * instead of O(n) where n is total cache size
 */
function clearCacheForItemOptimized(
  cache: LRUCache<string, HeightCacheEntry>,
  index: Map<string, Set<string>>,
  id: string
): void {
  const keys = index.get(id)
  if (keys) {
    for (const key of keys) {
      cache.delete(key)
    }
    index.delete(id)
  }
}

/**
 * Clear all cache entries for a given item ID (legacy O(n) implementation)
 * Kept for backwards compatibility but not used when index is available
 */
function clearCacheForItem(cache: LRUCache<string, HeightCacheEntry>, id: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${id}-`)) {
      cache.delete(key)
    }
  }
}

/**
 * Check if item has meaningfully changed
 */
function hasItemChanged(prev: AnyThreadItem, current: AnyThreadItem): boolean {
  if (prev.type !== current.type) return true
  if (prev.status !== current.status) return true

  // Deep compare content for streaming messages
  if (prev.content !== current.content) {
    // For agent messages, only invalidate if text length changed significantly
    if (
      prev.type === 'agentMessage' &&
      current.type === 'agentMessage' &&
      isAgentMessageContent(prev.content) &&
      isAgentMessageContent(current.content)
    ) {
      const prevLen = prev.content.text?.length || 0
      const currentLen = current.content.text?.length || 0
      // Only invalidate if text grew by more than 20%
      return currentLen > prevLen * 1.2 || currentLen < prevLen
    }
    return true
  }

  return false
}

/**
 * Hook for auto-scroll behavior with improved stability
 */
export function useAutoScroll(
  virtualListRef: React.MutableRefObject<ListImperativeAPI | null>,
  messagesEndRef: React.RefObject<HTMLDivElement | null>,
  itemOrder: string[],
  items: Record<string, AnyThreadItem>,
  turnStatus: string
) {
  const scrollRAFRef = useRef<number | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const lastScrollPositionRef = useRef<number>(0)

  // Memoize last item info to prevent unnecessary re-renders
  const lastItemInfo = useMemo(() => {
    const lastItemId = itemOrder[itemOrder.length - 1] || ''
    const lastItem = items[lastItemId]
    const lastItemText =
      lastItem?.type === 'agentMessage' && isAgentMessageContent(lastItem.content)
        ? lastItem.content.text.length
        : 0
    return { lastItemId, lastItemText }
  }, [itemOrder, items])

  useEffect(() => {
    if (autoScroll) {
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current)
      }

      scrollRAFRef.current = requestAnimationFrame(() => {
        const isStreaming = turnStatus === 'running'

        if (virtualListRef.current && itemOrder.length > 0) {
          virtualListRef.current.scrollToRow({
            index: itemOrder.length - 1,
            align: 'end',
            behavior: isStreaming ? 'instant' : 'smooth',
          })
        }

        messagesEndRef.current?.scrollIntoView({
          behavior: isStreaming ? 'instant' : 'smooth',
        })

        scrollRAFRef.current = null
      })
    }

    return () => {
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current)
      }
    }
  }, [
    itemOrder.length,
    lastItemInfo.lastItemText,
    autoScroll,
    turnStatus,
    virtualListRef,
    messagesEndRef,
    itemOrder,
    lastItemInfo,
  ])

  // Stable scroll position tracker
  const trackScrollPosition = useCallback((position: number) => {
    lastScrollPositionRef.current = position
  }, [])

  return { autoScroll, setAutoScroll, trackScrollPosition }
}

/**
 * Hook for scroll handling with RAF throttling and position tracking
 */
export function useScrollHandler(
  scrollAreaRef: React.RefObject<HTMLDivElement | null>,
  setAutoScroll: (value: boolean) => void,
  trackScrollPosition?: (position: number) => void
) {
  const scrollThrottleRef = useRef(false)

  const handleScroll = useCallback(() => {
    if (scrollThrottleRef.current) return
    scrollThrottleRef.current = true

    requestAnimationFrame(() => {
      const container = scrollAreaRef.current
      if (container) {
        const threshold = 120
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight

        setAutoScroll(distanceFromBottom < threshold)
        trackScrollPosition?.(container.scrollTop)
      }
      scrollThrottleRef.current = false
    })
  }, [scrollAreaRef, setAutoScroll, trackScrollPosition])

  return { handleScroll }
}

/**
 * Hook for scroll position restoration
 */
export function useScrollRestoration(
  virtualListRef: React.MutableRefObject<ListImperativeAPI | null>,
  itemOrder: string[]
) {
  const savedPositionRef = useRef<{ index: number; offset: number } | null>(null)

  const savePosition = useCallback(() => {
    // This would require access to internal scroll position
    // For now, save the approximate index
    const list = virtualListRef.current
    if (!list) return

    // Approximate - in a real implementation, you'd access the scroll offset
    savedPositionRef.current = {
      index: Math.floor(itemOrder.length / 2),
      offset: 0,
    }
  }, [virtualListRef, itemOrder.length])

  const restorePosition = useCallback(() => {
    const saved = savedPositionRef.current
    if (!saved || !virtualListRef.current) return

    virtualListRef.current.scrollToRow({
      index: saved.index,
      align: 'start',
      behavior: 'instant',
    })

    savedPositionRef.current = null
  }, [virtualListRef])

  return { savePosition, restorePosition }
}
