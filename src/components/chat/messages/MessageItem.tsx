/**
 * MessageItem - Routes to appropriate message/card component based on item type
 * Memoized to prevent unnecessary re-renders
 */
import { memo } from 'react'
import { log } from '../../../lib/logger'
import { shallowContentEqual } from '../utils'
import { UserMessage } from './UserMessage'
import { AgentMessage } from './AgentMessage'
import { CommandExecutionCard } from '../cards/CommandExecutionCard'
import { FileChangeCard } from '../cards/FileChangeCard'
import { ReasoningCard } from '../cards/ReasoningCard'
import { McpToolCard } from '../cards/McpToolCard'
import { WebSearchCard } from '../cards/WebSearchCard'
import { ReviewCard } from '../cards/ReviewCard'
import { InfoCard } from '../cards/InfoCard'
import { ErrorCard } from '../cards/ErrorCard'
import { PlanCard } from '../cards/PlanCard'
import type { MessageItemProps } from '../types'
import type { AnyThreadItem } from '../../../stores/thread'

export const MessageItem = memo(
  function MessageItem({ item }: MessageItemProps) {
    switch (item.type) {
      case 'userMessage':
        return <UserMessage item={item} />
      case 'agentMessage':
        return <AgentMessage item={item} />
      case 'commandExecution':
        return <CommandExecutionCard item={item} />
      case 'fileChange':
        return <FileChangeCard item={item} />
      case 'reasoning':
        return <ReasoningCard item={item} />
      case 'mcpTool':
        return <McpToolCard item={item} />
      case 'webSearch':
        return <WebSearchCard item={item} />
      case 'review':
        return <ReviewCard item={item} />
      case 'info':
        return <InfoCard item={item} />
      case 'error':
        return <ErrorCard item={item} />
      case 'plan':
        return <PlanCard item={item} />
      default:
        log.warn(`Unknown item type: ${(item as AnyThreadItem).type}`, 'MessageItem')
        return null
    }
  },
  // Custom comparison function for better memoization - O(1) shallow compare
  (prevProps, nextProps) => {
    const prev = prevProps.item
    const next = nextProps.item
    // Compare identity first (fastest path)
    if (prev === next) return true
    // Compare key properties
    if (prev.id !== next.id) return false
    if (prev.status !== next.status) return false
    if (prev.type !== next.type) return false
    // Use O(1) shallow comparison instead of O(n) JSON.stringify
    return shallowContentEqual(prev.content, next.content)
  }
)
