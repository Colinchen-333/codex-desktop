/**
 * McpToolCard - Shows external MCP tool calls
 */
import { useState } from 'react'
import { Wrench, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatTimestamp } from '../utils'
import type { MessageItemProps, McpToolContentType } from '../types'

export function McpToolCard({ item }: MessageItemProps) {
  const content = item.content as McpToolContentType
  const [isExpanded, setIsExpanded] = useState(false)

  // Compute JSON strings inline - React Compiler will optimize this
  // Only computed when isExpanded is true
  const argumentsJson = content.arguments ? JSON.stringify(content.arguments, null, 2) : ''
  const resultJson =
    content.result && typeof content.result !== 'string'
      ? JSON.stringify(content.result, null, 2)
      : null

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
      <div
        className={cn(
          'w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.isRunning
            ? 'border-l-4 border-l-cyan-500 border-y-border/50 border-r-border/50'
            : content.error
              ? 'border-l-4 border-l-red-500 border-y-border/50 border-r-border/50'
              : 'border-border/50'
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border/40 bg-cyan-50/50 dark:bg-cyan-900/10 px-4 py-2.5 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'rounded-md p-1 shadow-sm',
                content.isRunning
                  ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400'
                  : 'bg-background text-muted-foreground'
              )}
            >
              <Wrench size={14} className={content.isRunning ? 'animate-spin' : ''} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">{content.server}</span>
              <span className="text-muted-foreground/50">/</span>
              <code className="text-xs font-medium text-foreground font-mono">{content.tool}</code>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {content.isRunning && (
              <span className="flex items-center gap-1 text-[10px] text-cyan-600 dark:text-cyan-400">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                Running...
              </span>
            )}
            {content.error && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                Failed
              </span>
            )}
            {!content.isRunning && !content.error && content.durationMs !== undefined && (
              <span className="text-[10px] text-muted-foreground">
                {content.durationMs < 1000
                  ? `${content.durationMs}ms`
                  : `${(content.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
            <span className="text-muted-foreground text-xs">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-4 space-y-3">
            {content.progress && content.progress.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Progress
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {content.progress.map((line: string, i: number) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            )}
            {/* Arguments */}
            {argumentsJson && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Arguments
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-secondary/50 p-3 font-mono text-xs text-muted-foreground">
                  {argumentsJson}
                </pre>
              </div>
            )}

            {/* Result */}
            {content.result !== undefined && content.result !== null && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">
                  Result
                </div>
                <pre className="max-h-60 overflow-auto rounded-lg bg-green-50/50 dark:bg-green-900/10 p-3 font-mono text-xs text-foreground">
                  {typeof content.result === 'string' ? content.result : resultJson}
                </pre>
              </div>
            )}

            {/* Error */}
            {content.error && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                  Error
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-red-50/50 dark:bg-red-900/10 p-3 font-mono text-xs text-red-800 dark:text-red-300">
                  {content.error}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
