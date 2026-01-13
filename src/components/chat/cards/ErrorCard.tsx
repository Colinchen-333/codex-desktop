/**
 * ErrorCard - Shows stream errors
 * Memoized to prevent unnecessary re-renders
 */
import { memo } from 'react'
import { AlertCircle } from 'lucide-react'
import { formatTimestamp } from '../utils'
import type { MessageItemProps, ErrorContentType } from '../types'

const HTTP_STATUS_LABELS: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Access denied',
  404: 'Not found',
  408: 'Request timed out',
  409: 'Conflict',
  413: 'Request too large',
  429: 'Too many requests',
  500: 'Server error',
  502: 'Bad gateway',
  503: 'Service unavailable',
  504: 'Gateway timeout',
}

const formatHttpStatus = (statusCode?: number) => {
  if (!statusCode) return null
  const label = HTTP_STATUS_LABELS[statusCode] ?? 'Request failed'
  return `${label} (${statusCode})`
}

export const ErrorCard = memo(
  function ErrorCard({ item }: MessageItemProps) {
    const content = item.content as ErrorContentType
    const statusText = formatHttpStatus(content.httpStatusCode)

    return (
      <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
        <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-l-4 border-l-red-500 border-y-border/50 border-r-border/50 bg-card shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 bg-red-50/50 dark:bg-red-900/10 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-red-100 dark:bg-red-900/30 p-1 text-red-600 dark:text-red-400 shadow-sm">
                <AlertCircle size={14} />
              </div>
              <span className="text-xs font-medium text-foreground">Error</span>
              {content.errorType && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {content.errorType}
                </span>
              )}
              {statusText && (
                <span className="text-[10px] text-muted-foreground">
                  {statusText}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {content.willRetry && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  Will retry...
                </span>
              )}
              {/* Timestamp */}
              <span className="text-[10px] text-muted-foreground/60">
                {formatTimestamp(item.createdAt)}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <p className="text-sm text-red-800 dark:text-red-300 leading-relaxed">
              {content.message}
            </p>
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison: error cards are immutable once created
    return prevProps.item === nextProps.item
  }
)
