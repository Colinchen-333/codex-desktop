/**
 * BaseCard - Abstract base component for all card types
 *
 * Provides unified layout, styling, and behavior for cards including:
 * - Header with icon, title, subtitle, status, and timestamp
 * - Expandable/collapsible content with smooth animation
 * - Status indicator with colored left border
 * - Action slots (header actions and footer actions)
 * - React.memo optimization with custom comparison
 *
 * Usage:
 * ```tsx
 * <BaseCard
 *   icon={<Terminal size={14} />}
 *   title="Command Execution"
 *   subtitle="npm install"
 *   status="running"
 *   statusText="Running..."
 *   timestamp={Date.now()}
 *   expandable
 *   defaultExpanded
 * >
 *   <div>Card content here</div>
 * </BaseCard>
 * ```
 */
import { memo, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatTimestamp } from '../utils'
import { STATUS_CONFIG, getBorderClass, type CardStatus } from './card-utils'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type { CardStatus } from './card-utils'

export interface BaseCardProps {
  /** Icon to display in the header */
  icon: ReactNode
  /** Main title of the card */
  title: string
  /** Optional subtitle (displayed after title) */
  subtitle?: string
  /** Timestamp to display (Unix timestamp in ms) */
  timestamp?: number
  /** Current status of the card */
  status?: CardStatus
  /** Custom status text to display */
  statusText?: string
  /** Custom border color (overrides status-based color) */
  borderColor?: string
  /** Additional CSS classes for the card container */
  className?: string
  /** Card content */
  children: ReactNode
  /** Footer actions (buttons, etc.) */
  actions?: ReactNode
  /** Header actions (displayed before chevron) */
  headerActions?: ReactNode
  /** Whether the card starts expanded (default: true) */
  defaultExpanded?: boolean
  /** Whether the card is expandable (default: true) */
  expandable?: boolean
  /** Callback when expand state changes */
  onExpandChange?: (expanded: boolean) => void
  /** Custom header background color class */
  headerBgClass?: string
  /** Whether to show the running animation on the icon */
  iconAnimated?: boolean
  /** Icon container background when active/running */
  iconActiveBgClass?: string
  /** Max width class (default: 'max-w-2xl') */
  maxWidthClass?: string
  /** Disable the entrance animation */
  disableAnimation?: boolean
  /** Custom content padding class */
  contentPaddingClass?: string
  /** Collapsed preview content (shown when collapsed) */
  collapsedPreview?: ReactNode
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

interface StatusIndicatorProps {
  status: CardStatus
  text?: string
  showDot?: boolean
}

/**
 * Status indicator with optional pulsing dot
 */
export const StatusIndicator = memo(function StatusIndicator({
  status,
  text,
  showDot = true,
}: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status]
  if (!config) return null

  return (
    <span className={cn('flex items-center gap-1 text-[10px]', config.textColor)}>
      {showDot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            config.dotColor,
            status === 'running' && 'animate-pulse'
          )}
        />
      )}
      {text}
    </span>
  )
})

interface StatusBadgeProps {
  status: CardStatus
  text: string
}

/**
 * Status badge (pill-shaped)
 */
export const StatusBadge = memo(function StatusBadge({ status, text }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  if (!config) return null

  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-medium',
        config.badgeBg,
        config.textColor
      )}
    >
      {text}
    </span>
  )
})

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export const BaseCard = memo(
  function BaseCard({
    icon,
    title,
    subtitle,
    timestamp,
    status,
    statusText,
    borderColor,
    className,
    children,
    actions,
    headerActions,
    defaultExpanded = true,
    expandable = true,
    onExpandChange,
    headerBgClass = 'bg-secondary/30',
    iconAnimated = false,
    iconActiveBgClass,
    maxWidthClass = 'max-w-2xl',
    disableAnimation = false,
    contentPaddingClass = 'p-4',
    collapsedPreview,
  }: BaseCardProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)
    const contentRef = useRef<HTMLDivElement>(null)
    const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto')

    // Update content height for animation
    useEffect(() => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.scrollHeight)
      }
    }, [children, isExpanded])

    // Handle expand/collapse toggle
    const handleToggle = useCallback(() => {
      if (!expandable) return
      const newState = !isExpanded
      setIsExpanded(newState)
      onExpandChange?.(newState)
    }, [expandable, isExpanded, onExpandChange])

    // Determine icon container classes
    const iconContainerClass = cn(
      'rounded-md p-1 shadow-sm transition-colors',
      iconActiveBgClass && (status === 'running' || iconAnimated)
        ? iconActiveBgClass
        : 'bg-background text-muted-foreground'
    )

    return (
      <div
        className={cn(
          'flex justify-start pr-12',
          !disableAnimation && 'animate-in slide-in-from-bottom-2 duration-150',
          className
        )}
      >
        <div
          className={cn(
            'w-full overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
            maxWidthClass,
            getBorderClass(status, borderColor)
          )}
        >
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between border-b border-border/40 px-4 py-2.5',
              headerBgClass,
              expandable && 'cursor-pointer select-none'
            )}
            onClick={handleToggle}
            role={expandable ? 'button' : undefined}
            tabIndex={expandable ? 0 : undefined}
            onKeyDown={
              expandable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleToggle()
                    }
                  }
                : undefined
            }
            aria-expanded={expandable ? isExpanded : undefined}
          >
            {/* Left side: Icon + Title */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className={iconContainerClass}>
                <span className={cn(iconAnimated && 'animate-pulse')}>{icon}</span>
              </div>
              <span className="text-xs font-medium text-foreground truncate">{title}</span>
              {subtitle && (
                <code className="text-xs font-medium text-foreground font-mono truncate max-w-md">
                  {subtitle}
                </code>
              )}
            </div>

            {/* Right side: Status + Actions + Timestamp + Chevron */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Status indicator */}
              {status === 'running' && statusText && (
                <StatusIndicator status={status} text={statusText} />
              )}

              {/* Header actions slot */}
              {headerActions}

              {/* Timestamp */}
              {timestamp !== undefined && (
                <span className="text-[10px] text-muted-foreground/60">
                  {formatTimestamp(timestamp)}
                </span>
              )}

              {/* Expand/Collapse chevron */}
              {expandable && (
                <span className="text-muted-foreground text-xs">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              )}
            </div>
          </div>

          {/* Content with expand/collapse animation */}
          <div
            className="overflow-hidden transition-all duration-200 ease-in-out"
            style={{
              maxHeight: isExpanded ? (contentHeight === 'auto' ? 'none' : contentHeight) : 0,
              opacity: isExpanded ? 1 : 0,
            }}
          >
            <div ref={contentRef} className={contentPaddingClass}>
              {children}
            </div>
          </div>

          {/* Collapsed preview */}
          {!isExpanded && collapsedPreview && (
            <div className="px-4 py-2 text-xs text-muted-foreground truncate border-t border-border/20">
              {collapsedPreview}
            </div>
          )}

          {/* Footer actions */}
          {actions && isExpanded && (
            <div className="border-t border-border/40 bg-secondary/10 p-4">{actions}</div>
          )}
        </div>
      </div>
    )
  },
  // Custom comparison function for React.memo
  (prev, next) => {
    // Always re-render if children change (reference comparison)
    if (prev.children !== next.children) return false
    if (prev.actions !== next.actions) return false
    if (prev.headerActions !== next.headerActions) return false
    if (prev.collapsedPreview !== next.collapsedPreview) return false

    // Compare primitive props
    if (prev.title !== next.title) return false
    if (prev.subtitle !== next.subtitle) return false
    if (prev.timestamp !== next.timestamp) return false
    if (prev.status !== next.status) return false
    if (prev.statusText !== next.statusText) return false
    if (prev.borderColor !== next.borderColor) return false
    if (prev.className !== next.className) return false
    if (prev.defaultExpanded !== next.defaultExpanded) return false
    if (prev.expandable !== next.expandable) return false
    if (prev.iconAnimated !== next.iconAnimated) return false

    // Props are equal, skip re-render
    return true
  }
)

// -----------------------------------------------------------------------------
// Compound Components for Common Patterns
// -----------------------------------------------------------------------------

interface CardSectionProps {
  title: string
  titleColor?: string
  children: ReactNode
  className?: string
}

/**
 * Section within a card with a title
 */
export const CardSection = memo(function CardSection({
  title,
  titleColor = 'text-muted-foreground',
  children,
  className,
}: CardSectionProps) {
  return (
    <div className={className}>
      <div
        className={cn('mb-1 text-[11px] font-medium uppercase tracking-wider', titleColor)}
      >
        {title}
      </div>
      {children}
    </div>
  )
})

interface CardOutputProps {
  children: ReactNode
  error?: boolean
  maxHeight?: string
  className?: string
}

/**
 * Output/code block within a card
 */
export const CardOutput = memo(function CardOutput({
  children,
  error = false,
  maxHeight = 'max-h-60',
  className,
}: CardOutputProps) {
  return (
    <pre
      className={cn(
        'overflow-auto rounded-lg p-3 font-mono text-xs scrollbar-thin scrollbar-thumb-border whitespace-pre-wrap',
        maxHeight,
        error
          ? 'bg-red-50/50 dark:bg-red-900/10 text-red-800 dark:text-red-300'
          : 'bg-black/[0.03] dark:bg-white/[0.03] text-muted-foreground',
        className
      )}
    >
      {children}
    </pre>
  )
})

interface CardActionsProps {
  children: ReactNode
  className?: string
}

/**
 * Action button container
 */
export const CardActions = memo(function CardActions({
  children,
  className,
}: CardActionsProps) {
  return <div className={cn('flex gap-2', className)}>{children}</div>
})
