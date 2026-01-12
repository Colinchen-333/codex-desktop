/**
 * ChatMessageList - Virtualized message list component
 *
 * Performance optimizations:
 * - Memoized height estimation with content-aware caching
 * - ResizeObserver for dynamic height measurement
 * - useDeferredValue for filter/search operations
 * - Cache warming for predictive loading
 * - RAF-based scroll handling
 */
import React, { memo, useMemo, useDeferredValue, useCallback, useRef, useEffect } from 'react'
import { List, useDynamicRowHeight } from 'react-window'
import type { ListImperativeAPI, DynamicRowHeight } from 'react-window'
import { useThreadStore, selectFocusedThread } from '../../stores/thread'
import { isUserMessageContent, isAgentMessageContent } from '../../lib/typeGuards'
import { MessageItem } from './messages'
import { ChatEmptyState } from './ChatEmptyState'
import {
  DEFAULT_ITEM_HEIGHT,
  OVERSCAN_COUNT,
  type VirtualizedRowProps,
  type VirtualizedRowCustomProps,
} from './types'
import {
  useItemSizeCache,
  useAutoScroll,
  useScrollHandler,
  useScrollRestoration,
} from './useMessageListHooks'

/**
 * Virtualized list row component with dynamic height support
 * Uses react-window 2.x's useDynamicRowHeight for automatic height tracking
 */
const VirtualizedRow = memo(function VirtualizedRow({
  index,
  style,
  itemOrder,
  items,
  ariaAttributes,
  dynamicHeight,
}: VirtualizedRowProps & { dynamicHeight?: DynamicRowHeight }) {
  const id = itemOrder[index]
  const item = items[id]
  const rowRef = useRef<HTMLDivElement>(null)

  // Register element for dynamic height observation via react-window's built-in system
  useEffect(() => {
    const element = rowRef.current
    if (dynamicHeight && element) {
      // observeRowElements returns a cleanup function
      const cleanup = dynamicHeight.observeRowElements([element])
      return cleanup
    }
  }, [dynamicHeight, index])

  // Set data attribute for react-window's height observation
  useEffect(() => {
    if (rowRef.current) {
      rowRef.current.dataset.index = String(index)
    }
  }, [index])

  if (!item) {
    return <div style={style} {...ariaAttributes} />
  }

  return (
    <div ref={rowRef} style={style} className="py-1.5" data-index={index} {...ariaAttributes}>
      <MessageItem key={id} item={item} />
    </div>
  )
})

export interface ChatMessageListProps {
  scrollAreaRef: React.RefObject<HTMLDivElement | null>
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  virtualListRef: React.MutableRefObject<ListImperativeAPI | null>
  onDragEnter: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  /** Optional filter text for deferred filtering */
  filterText?: string
}

export default memo(function ChatMessageList({
  scrollAreaRef,
  messagesEndRef,
  virtualListRef,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  filterText = '',
}: ChatMessageListProps) {
  // P1 Fix: Use proper selector to prevent re-renders from getter-based state access
  const focusedThread = useThreadStore(selectFocusedThread)

  // Extract data from focused thread state
  const items = focusedThread?.items ?? {}
  const itemOrder = focusedThread?.itemOrder ?? []
  const turnStatus = focusedThread?.turnStatus ?? 'idle'

  // Use deferred value for filter to avoid blocking renders
  const deferredFilterText = useDeferredValue(filterText)

  // Memoize filtered items to prevent recalculation
  const filteredItemOrder = useMemo(() => {
    if (!deferredFilterText) return itemOrder

    return itemOrder.filter((id) => {
      const item = items[id]
      if (!item) return false

      // Filter based on content text
      const content = item.content
      if (item.type === 'agentMessage' && isAgentMessageContent(content)) {
        return content.text.toLowerCase().includes(deferredFilterText.toLowerCase())
      }
      if (item.type === 'userMessage' && isUserMessageContent(content)) {
        return content.text?.toLowerCase().includes(deferredFilterText.toLowerCase())
      }
      // Include non-text items when filtering
      return !deferredFilterText
    })
  }, [itemOrder, items, deferredFilterText])

  // Use react-window's built-in dynamic height support
  // This properly notifies the List when heights change, fixing the overlap issue
  const dynamicHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_ITEM_HEIGHT * 3, // Same as defaultHeight prop
    key: focusedThread?.thread?.id, // Reset when thread changes
  })

  // Keep useItemSizeCache for warmup cache and performance metrics only
  const { warmupCache } = useItemSizeCache(items, filteredItemOrder)

  // Auto-scroll behavior
  const { setAutoScroll, trackScrollPosition } = useAutoScroll(
    virtualListRef,
    messagesEndRef,
    filteredItemOrder,
    items,
    turnStatus
  )

  // Scroll handling
  const { handleScroll } = useScrollHandler(scrollAreaRef, setAutoScroll, trackScrollPosition)

  // Scroll restoration for filter changes
  const { savePosition, restorePosition } = useScrollRestoration(virtualListRef, filteredItemOrder)

  // Warmup cache when visible range changes
  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      warmupCache(visibleRows.startIndex, visibleRows.stopIndex)
    },
    [warmupCache]
  )

  // Save position before filter changes
  useEffect(() => {
    if (filterText !== deferredFilterText) {
      savePosition()
    }
  }, [filterText, deferredFilterText, savePosition])

  // Restore position after filter applied
  useEffect(() => {
    if (filterText === deferredFilterText && filterText) {
      restorePosition()
    }
  }, [filterText, deferredFilterText, restorePosition])

  // Memoize row props to prevent unnecessary re-renders
  const rowProps = useMemo(
    () => ({ itemOrder: filteredItemOrder, items, dynamicHeight }),
    [filteredItemOrder, items, dynamicHeight]
  )

  // Create row component with dynamic height support
  const RowComponent = useCallback(
    (props: VirtualizedRowProps) => (
      <VirtualizedRow {...props} dynamicHeight={dynamicHeight} />
    ),
    [dynamicHeight]
  )

  return (
    <div
      ref={scrollAreaRef}
      className="flex-1 overflow-y-auto p-4"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onScroll={handleScroll}
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      <div className="mx-auto max-w-3xl h-full">
        {filteredItemOrder.length > 0 ? (
          <List<VirtualizedRowCustomProps & { dynamicHeight?: DynamicRowHeight }>
            listRef={virtualListRef}
            rowCount={filteredItemOrder.length}
            rowHeight={dynamicHeight}
            overscanCount={OVERSCAN_COUNT}
            rowProps={rowProps}
            defaultHeight={DEFAULT_ITEM_HEIGHT * 3}
            rowComponent={RowComponent}
            className="overflow-y-auto scrollbar-thin scrollbar-thumb-border"
            onRowsRendered={handleRowsRendered}
          />
        ) : (
          <ChatEmptyState isFiltered={!!deferredFilterText} />
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
})
