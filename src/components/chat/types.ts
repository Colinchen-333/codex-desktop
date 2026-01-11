/**
 * Shared types for chat components
 */
import type { AnyThreadItem, PlanStep } from '../../stores/thread'

// Maximum height for the textarea (in pixels)
export const MAX_TEXTAREA_HEIGHT = 200

// Maximum lines before truncating output
export const MAX_OUTPUT_LINES = 50

// Maximum image size (5MB) and max images count
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024
export const MAX_IMAGES_COUNT = 5

// Virtualized list configuration
export const DEFAULT_ITEM_HEIGHT = 200 // Estimated height for a message item
export const OVERSCAN_COUNT = 5 // Number of items to render outside the visible area

// Message item props - shared by all message components
export interface MessageItemProps {
  item: AnyThreadItem
}

// Content type interfaces for type-safe content access
export interface UserMessageContentType {
  text?: string
  images?: string[]
}

export interface AgentMessageContentType {
  text: string
  isStreaming?: boolean
}

export interface CommandExecutionContentType {
  command: string | string[]
  cwd: string
  output?: string
  stdout?: string
  stderr?: string
  exitCode?: number
  durationMs?: number
  isRunning?: boolean
  needsApproval?: boolean
  reason?: string
  commandActions?: string[]
  proposedExecpolicyAmendment?: string
}

export interface FileChangeContentType {
  changes: Array<{
    path: string
    kind: string
    diff: string
    oldPath?: string
  }>
  needsApproval: boolean
  approved?: boolean
  applied?: boolean
  snapshotId?: string
  reason?: string
}

export interface ReasoningContentType {
  summary: string[]
  fullContent?: string[]
  isStreaming: boolean
}

export interface McpToolContentType {
  callId: string
  server: string
  tool: string
  arguments: unknown
  result?: unknown
  error?: string
  durationMs?: number
  isRunning: boolean
  progress?: string[]
}

export interface WebSearchContentType {
  query: string
  results?: Array<{ title: string; url: string; snippet: string }>
  isSearching: boolean
}

export interface ReviewContentType {
  phase: 'started' | 'complete'
  text: string
}

export interface InfoContentType {
  title: string
  details?: string
}

export interface ErrorContentType {
  message: string
  errorType?: string
  httpStatusCode?: number
  willRetry?: boolean
}

export interface PlanContentType {
  explanation?: string
  steps: PlanStep[]
  isActive: boolean
}

// Virtualized list row custom props (for react-window 2.x)
// These are the props passed via rowProps
export interface VirtualizedRowCustomProps {
  itemOrder: string[]
  items: Record<string, AnyThreadItem>
}

// Full row component props including react-window's injected props
export interface VirtualizedRowProps extends VirtualizedRowCustomProps {
  ariaAttributes: {
    'aria-posinset': number
    'aria-setsize': number
    role: 'listitem'
  }
  index: number
  style: React.CSSProperties
}
