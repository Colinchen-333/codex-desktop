import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'

export type HunkAction = 'accept' | 'reject' | 'pending'

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface FileDiff {
  path: string
  kind: 'add' | 'modify' | 'delete' | 'rename'
  oldPath?: string
  hunks: DiffHunk[]
  raw?: string
}

interface DiffViewProps {
  diff: FileDiff
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** Enable per-hunk accept/reject actions */
  enableHunkActions?: boolean
  /** Callback when a hunk is accepted/rejected */
  onHunkAction?: (hunkIndex: number, action: HunkAction) => void
  /** Current state of each hunk */
  hunkStates?: HunkAction[]
}

export function DiffView({
  diff,
  collapsed = false,
  onToggleCollapse,
  enableHunkActions = false,
  onHunkAction,
  hunkStates = [],
}: DiffViewProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified')

  const kindIcon = {
    add: '+',
    modify: '~',
    delete: '-',
    rename: '→',
  }

  const kindColor = {
    add: 'text-green-500',
    modify: 'text-yellow-500',
    delete: 'text-red-500',
    rename: 'text-blue-500',
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between bg-secondary/50 px-3 py-2 cursor-pointer hover:bg-secondary/80"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <span className={cn('font-mono text-sm', kindColor[diff.kind])}>
            {kindIcon[diff.kind]}
          </span>
          <span className="font-mono text-sm">{diff.path}</span>
          {diff.oldPath && diff.kind === 'rename' && (
            <span className="text-muted-foreground text-sm">
              (from {diff.oldPath})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className={cn(
              'px-2 py-0.5 text-xs rounded',
              viewMode === 'unified' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
            )}
            onClick={(e) => {
              e.stopPropagation()
              setViewMode('unified')
            }}
          >
            Unified
          </button>
          <button
            className={cn(
              'px-2 py-0.5 text-xs rounded',
              viewMode === 'split' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
            )}
            onClick={(e) => {
              e.stopPropagation()
              setViewMode('split')
            }}
          >
            Split
          </button>
          <span className="text-muted-foreground">
            {collapsed ? '▶' : '▼'}
          </span>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="overflow-x-auto">
          {diff.hunks.length === 0 && diff.raw ? (
            <pre className="p-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono">
              {diff.raw}
            </pre>
          ) : viewMode === 'unified' ? (
            <UnifiedDiff
              hunks={diff.hunks}
              enableHunkActions={enableHunkActions}
              onHunkAction={onHunkAction}
              hunkStates={hunkStates}
            />
          ) : (
            <SplitDiff
              hunks={diff.hunks}
              enableHunkActions={enableHunkActions}
              onHunkAction={onHunkAction}
              hunkStates={hunkStates}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface DiffComponentProps {
  hunks: DiffHunk[]
  enableHunkActions?: boolean
  onHunkAction?: (hunkIndex: number, action: HunkAction) => void
  hunkStates?: HunkAction[]
}

function UnifiedDiff({ hunks, enableHunkActions, onHunkAction, hunkStates = [] }: DiffComponentProps) {
  return (
    <div className="font-mono text-xs">
      {hunks.map((hunk, hunkIndex) => {
        const hunkState = hunkStates[hunkIndex] || 'pending'
        return (
        <div
          key={hunkIndex}
          className={cn(
            hunkState === 'accept' && 'opacity-60',
            hunkState === 'reject' && 'opacity-40 line-through'
          )}
        >
          {/* Hunk header */}
          <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-3 py-1 border-y border-border/50 flex items-center justify-between">
            <span>@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</span>
            {enableHunkActions && onHunkAction && (
              <div className="flex items-center gap-1">
                {hunkState !== 'accept' && (
                  <button
                    onClick={() => onHunkAction(hunkIndex, 'accept')}
                    className="p-1 rounded hover:bg-green-200 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400"
                    title="Accept this change"
                  >
                    <Check size={14} />
                  </button>
                )}
                {hunkState !== 'reject' && (
                  <button
                    onClick={() => onHunkAction(hunkIndex, 'reject')}
                    className="p-1 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400"
                    title="Reject this change"
                  >
                    <X size={14} />
                  </button>
                )}
                {hunkState !== 'pending' && (
                  <button
                    onClick={() => onHunkAction(hunkIndex, 'pending')}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80"
                    title="Reset"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Lines */}
          {hunk.lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              className={cn(
                'flex',
                line.type === 'add' && 'bg-green-50 dark:bg-green-950/30',
                line.type === 'remove' && 'bg-red-50 dark:bg-red-950/30'
              )}
            >
              {/* Line numbers */}
              <div className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border/30">
                {line.oldLineNumber || ''}
              </div>
              <div className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border/30">
                {line.newLineNumber || ''}
              </div>
              {/* Sign */}
              <div
                className={cn(
                  'w-6 flex-shrink-0 text-center select-none',
                  line.type === 'add' && 'text-green-600 dark:text-green-500',
                  line.type === 'remove' && 'text-red-600 dark:text-red-500'
                )}
              >
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              </div>
              {/* Content */}
              <div className="flex-1 px-2 whitespace-pre overflow-x-auto">
                {line.content}
              </div>
            </div>
          ))}
        </div>
        )
      })}
    </div>
  )
}

function SplitDiff({ hunks, enableHunkActions, onHunkAction, hunkStates = [] }: DiffComponentProps) {
  return (
    <div className="font-mono text-xs grid grid-cols-2">
      {hunks.map((hunk, hunkIndex) => {
        const hunkState = hunkStates[hunkIndex] || 'pending'
        return (
        <div
          key={hunkIndex}
          className={cn(
            'contents',
            hunkState === 'accept' && 'opacity-60',
            hunkState === 'reject' && 'opacity-40'
          )}
        >
          {/* Left side (old) */}
          <div className="border-r border-border">
            <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-3 py-1 border-y border-border/50 flex items-center justify-between">
              <span>-{hunk.oldStart},{hunk.oldLines}</span>
            </div>
            {hunk.lines
              .filter((l) => l.type !== 'add')
              .map((line, lineIndex) => (
                <div
                  key={lineIndex}
                  className={cn(
                    'flex',
                    line.type === 'remove' && 'bg-red-50 dark:bg-red-950/30'
                  )}
                >
                  <div className="w-10 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border/30">
                    {line.oldLineNumber || ''}
                  </div>
                  <div
                    className={cn(
                      'w-6 flex-shrink-0 text-center select-none',
                      line.type === 'remove' && 'text-red-600 dark:text-red-500'
                    )}
                  >
                    {line.type === 'remove' ? '-' : ' '}
                  </div>
                  <div className="flex-1 px-2 whitespace-pre overflow-x-auto">
                    {line.content}
                  </div>
                </div>
              ))}
          </div>
          {/* Right side (new) */}
          <div>
            <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-3 py-1 border-y border-border/50 flex items-center justify-between">
              <span>+{hunk.newStart},{hunk.newLines}</span>
              {enableHunkActions && onHunkAction && (
                <div className="flex items-center gap-1">
                  {hunkState !== 'accept' && (
                    <button
                      onClick={() => onHunkAction(hunkIndex, 'accept')}
                      className="p-1 rounded hover:bg-green-200 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400"
                      title="Accept this change"
                    >
                      <Check size={14} />
                    </button>
                  )}
                  {hunkState !== 'reject' && (
                    <button
                      onClick={() => onHunkAction(hunkIndex, 'reject')}
                      className="p-1 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400"
                      title="Reject this change"
                    >
                      <X size={14} />
                    </button>
                  )}
                  {hunkState !== 'pending' && (
                    <button
                      onClick={() => onHunkAction(hunkIndex, 'pending')}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80"
                      title="Reset"
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
            {hunk.lines
              .filter((l) => l.type !== 'remove')
              .map((line, lineIndex) => (
                <div
                  key={lineIndex}
                  className={cn('flex', line.type === 'add' && 'bg-green-50 dark:bg-green-950/30')}
                >
                  <div className="w-10 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border/30">
                    {line.newLineNumber || ''}
                  </div>
                  <div
                    className={cn(
                      'w-6 flex-shrink-0 text-center select-none',
                      line.type === 'add' && 'text-green-600 dark:text-green-500'
                    )}
                  >
                    {line.type === 'add' ? '+' : ' '}
                  </div>
                  <div className="flex-1 px-2 whitespace-pre overflow-x-auto">
                    {line.content}
                  </div>
                </div>
              ))}
          </div>
        </div>
        )
      })}
    </div>
  )
}

// Helper to parse unified diff string
export function parseDiff(diffString: string): DiffHunk[] {
  const lines = diffString.split('\n')
  const hunks: DiffHunk[] = []
  let currentHunk: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/)
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk)
      }
      oldLine = parseInt(hunkMatch[1], 10)
      newLine = parseInt(hunkMatch[3], 10)
      currentHunk = {
        oldStart: oldLine,
        oldLines: parseInt(hunkMatch[2] || '1', 10),
        newStart: newLine,
        newLines: parseInt(hunkMatch[4] || '1', 10),
        lines: [],
      }
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNumber: newLine++,
      })
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNumber: oldLine++,
      })
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.slice(1) || '',
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      })
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk)
  }

  return hunks
}
