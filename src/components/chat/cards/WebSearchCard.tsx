/**
 * WebSearchCard - Shows web search queries and results
 */
import { ExternalLink } from 'lucide-react'
import { formatTimestamp } from '../utils'
import type { MessageItemProps, WebSearchContentType } from '../types'

export function WebSearchCard({ item }: MessageItemProps) {
  const content = item.content as WebSearchContentType

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-background p-1 text-muted-foreground shadow-sm">
              <ExternalLink size={14} />
            </div>
            <span className="text-xs font-medium text-foreground">Web Search</span>
          </div>
          <div className="flex items-center gap-2">
            {content.isSearching && (
              <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Searching...
              </span>
            )}
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-muted-foreground">Query: {content.query}</div>
          {content.results && content.results.length > 0 && (
            <div className="space-y-2 text-xs">
              {content.results.map((result, i) => (
                <div key={i} className="rounded-lg border border-border/40 p-3">
                  <div className="font-medium text-foreground">{result.title}</div>
                  <div className="text-muted-foreground truncate">{result.url}</div>
                  <div className="text-muted-foreground mt-1">{result.snippet}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
