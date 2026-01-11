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
import { List } from 'react-window'
import type { ListImperativeAPI } from 'react-window'
import { shallow } from 'zustand/shallow'
import { type ThreadState, useThreadStore } from '../../stores/thread'
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
 * Virtualized list row component with ResizeObserver support
 */
const VirtualizedRow = memo(function VirtualizedRow({
  index,
  style,
  itemOrder,
  items,
  ariaAttributes,
  observeElement,
}: VirtualizedRowProps & { observeElement?: (id: string, element: HTMLElement | null) => void }) {
  const id = itemOrder[index]
  const item = items[id]
  const rowRef = useRef<HTMLDivElement>(null)

  // Register element for ResizeObserver
  useEffect(() => {
    if (observeElement && id) {
      observeElement(id, rowRef.current)
      return () => observeElement(id, null)
    }
  }, [observeElement, id])

  if (!item) {
    return <div style={style} {...ariaAttributes} />
  }

  return (
    <div ref={rowRef} style={style} className="py-1.5" {...ariaAttributes}>
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
  // P1 Fix: Use shallow selector to prevent re-renders when only values change
  const messageListData = useThreadStore(
    useCallback(
      (state: ThreadState) => ({
        items: state.items,
        itemOrder: state.itemOrder,
        turnStatus: state.turnStatus,
      }),
      []
    ),
    shallow
  )

  const { items, itemOrder, turnStatus } = messageListData

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

  // Use optimized cache hook
  const { getItemSize, warmupCache, observeElement } = useItemSizeCache(items, filteredItemOrder)

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
    () => ({ itemOrder: filteredItemOrder, items, observeElement }),
    [filteredItemOrder, items, observeElement]
  )

  // Create row component with observeElement
  const RowComponent = useCallback(
    (props: VirtualizedRowProps) => (
      <VirtualizedRow {...props} observeElement={observeElement} />
    ),
    [observeElement]
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
          <List<VirtualizedRowCustomProps & { observeElement?: typeof observeElement }>
            listRef={virtualListRef}
            rowCount={filteredItemOrder.length}
            rowHeight={getItemSize}
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
