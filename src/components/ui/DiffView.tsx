import { useState, memo, useMemo } from 'react'
import { Check, X } from 'lucide-react'
import { List } from 'react-window'
import { cn } from '../../lib/utils'
import { parseDiff, type HunkAction, type DiffHunk, type DiffLine, type FileDiff } from './DiffView.utils'

// Re-export types and utilities for external use
export { parseDiff, type FileDiff, type DiffHunk, type DiffLine, type HunkAction }

// 单行高度（px）
const DIFF_LINE_HEIGHT = 24

// 虚拟化阈值（超过 100 行启用）
const VIRTUALIZATION_THRESHOLD = 100

// Unified 模式行组件自定义 props（通过 rowProps 传递）
interface UnifiedDiffRowCustomProps {
  lines: DiffLine[]
  hunkIndex: number
}

// Unified 模式行组件完整 props（包含 react-window 注入的 props）
interface UnifiedDiffRowProps extends UnifiedDiffRowCustomProps {
  ariaAttributes: {
    'aria-posinset': number
    'aria-setsize': number
    role: 'listitem'
  }
  index: number
  style: React.CSSProperties
}

// Split 模式行组件自定义 props
interface SplitDiffRowCustomProps {
  oldLines: DiffLine[]
  newLines: DiffLine[]
  hunkIndex: number
}

// Split 模式行组件完整 props
interface SplitDiffRowProps extends SplitDiffRowCustomProps {
  ariaAttributes: {
    'aria-posinset': number
    'aria-setsize': number
    role: 'listitem'
  }
  index: number
  style: React.CSSProperties
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

interface HunkActionsProps {
  hunkIndex: number
  hunkState: HunkAction
  enableHunkActions?: boolean
  onHunkAction?: (hunkIndex: number, action: HunkAction) => void
}

function HunkActions({ hunkIndex, hunkState, enableHunkActions, onHunkAction }: HunkActionsProps) {
  if (!enableHunkActions || !onHunkAction) return null

  return (
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
  )
}

// 虚拟化行组件（Unified 模式）
const VirtualizedDiffLine = memo(function VirtualizedDiffLine({
  index,
  style,
  lines,
}: UnifiedDiffRowProps) {
  const line = lines[index]

  return (
    <div
      style={style}
      className={cn(
        'flex',
        line.type === 'add' && 'bg-green-50 dark:bg-green-950/30',
        line.type === 'remove' && 'bg-red-50 dark:bg-red-950/30'
      )}
    >
      {/* 行号 */}
      <div className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border/30">
        {line.oldLineNumber || ''}
      </div>
      <div className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border/30">
        {line.newLineNumber || ''}
      </div>

      {/* 符号 */}
      <div
        className={cn(
          'w-6 flex-shrink-0 text-center select-none',
          line.type === 'add' && 'text-green-600 dark:text-green-500',
          line.type === 'remove' && 'text-red-600 dark:text-red-500'
        )}
      >
        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
      </div>

      {/* 内容 */}
      <div className="flex-1 px-2 whitespace-pre overflow-x-auto">
        {line.content}
      </div>
    </div>
  )
})

// 虚拟化行组件（Split 模式）
const VirtualizedSplitLine = memo(function VirtualizedSplitLine({
  index,
  style,
  oldLines,
  newLines,
}: SplitDiffRowProps) {
  const oldLine = oldLines[index]
  const newLine = newLines[index]

  return (
    <div style={style} className="grid grid-cols-2">
      {/* 左侧（旧）*/}
      <div
        className={cn(
          'flex border-r border-border',
          oldLine?.type === 'remove' && 'bg-red-50 dark:bg-red-950/30'
        )}
      >
        <div className="w-10 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border/30">
          {oldLine?.oldLineNumber || ''}
        </div>
        <div
          className={cn(
            'w-6 flex-shrink-0 text-center select-none',
            oldLine?.type === 'remove' && 'text-red-600 dark:text-red-500'
          )}
        >
          {oldLine?.type === 'remove' ? '-' : ' '}
        </div>
        <div className="flex-1 px-2 whitespace-pre overflow-x-auto">
          {oldLine?.content || ''}
        </div>
      </div>

      {/* 右侧（新）*/}
      <div
        className={cn(
          'flex',
          newLine?.type === 'add' && 'bg-green-50 dark:bg-green-950/30'
        )}
      >
        <div className="w-10 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border/30">
          {newLine?.newLineNumber || ''}
        </div>
        <div
          className={cn(
            'w-6 flex-shrink-0 text-center select-none',
            newLine?.type === 'add' && 'text-green-600 dark:text-green-500'
          )}
        >
          {newLine?.type === 'add' ? '+' : ' '}
        </div>
        <div className="flex-1 px-2 whitespace-pre overflow-x-auto">
          {newLine?.content || ''}
        </div>
      </div>
    </div>
  )
})

function UnifiedDiff({ hunks, enableHunkActions, onHunkAction, hunkStates = [] }: DiffComponentProps) {
  // 计算总行数
  const totalLines = useMemo(() =>
    hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0),
    [hunks]
  )

  // 决定是否使用虚拟化
  const useVirtualization = totalLines > VIRTUALIZATION_THRESHOLD

  // 小 diff：保持原有渲染方式
  if (!useVirtualization) {
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
                <HunkActions
                  hunkIndex={hunkIndex}
                  hunkState={hunkState}
                  enableHunkActions={enableHunkActions}
                  onHunkAction={onHunkAction}
                />
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

  // 大 diff：使用虚拟化
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
              <HunkActions
                hunkIndex={hunkIndex}
                hunkState={hunkState}
                enableHunkActions={enableHunkActions}
                onHunkAction={onHunkAction}
              />
            </div>

            {/* 虚拟化行列表 - 直接使用 memo 化的组件，无需 useCallback */}
            <List<UnifiedDiffRowCustomProps>
              defaultHeight={Math.min(hunk.lines.length * DIFF_LINE_HEIGHT, 600)}
              rowCount={hunk.lines.length}
              rowHeight={DIFF_LINE_HEIGHT}
              rowComponent={VirtualizedDiffLine as (props: UnifiedDiffRowProps) => React.ReactElement}
              rowProps={{ lines: hunk.lines, hunkIndex }}
              overscanCount={10}
            />
          </div>
        )
      })}
    </div>
  )
}

function SplitDiff({ hunks, enableHunkActions, onHunkAction, hunkStates = [] }: DiffComponentProps) {
  // 计算总行数（取最大的一侧）
  const totalLines = useMemo(() =>
    hunks.reduce((sum, hunk) => {
      const oldLines = hunk.lines.filter((l) => l.type !== 'add').length
      const newLines = hunk.lines.filter((l) => l.type !== 'remove').length
      return sum + Math.max(oldLines, newLines)
    }, 0),
    [hunks]
  )

  // 决定是否使用虚拟化
  const useVirtualization = totalLines > VIRTUALIZATION_THRESHOLD

  // 小 diff：保持原有渲染方式
  if (!useVirtualization) {
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
                  <HunkActions
                    hunkIndex={hunkIndex}
                    hunkState={hunkState}
                    enableHunkActions={enableHunkActions}
                    onHunkAction={onHunkAction}
                  />
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

  // 大 diff：使用虚拟化
  return (
    <div className="font-mono text-xs">
      {hunks.map((hunk, hunkIndex) => {
        const hunkState = hunkStates[hunkIndex] || 'pending'
        const oldLines = hunk.lines.filter((l) => l.type !== 'add')
        const newLines = hunk.lines.filter((l) => l.type !== 'remove')
        const maxLines = Math.max(oldLines.length, newLines.length)

        return (
          <div
            key={hunkIndex}
            className={cn(
              hunkState === 'accept' && 'opacity-60',
              hunkState === 'reject' && 'opacity-40 line-through'
            )}
          >
            {/* Headers - 使用 grid 布局 */}
            <div className="grid grid-cols-2 border-y border-border/50">
              <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-3 py-1 border-r border-border">
                <span>-{hunk.oldStart},{hunk.oldLines}</span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-3 py-1 flex items-center justify-between">
                <span>+{hunk.newStart},{hunk.newLines}</span>
                <HunkActions
                  hunkIndex={hunkIndex}
                  hunkState={hunkState}
                  enableHunkActions={enableHunkActions}
                  onHunkAction={onHunkAction}
                />
              </div>
            </div>

            {/* 虚拟化行列表 - 直接使用 memo 化的组件，无需 useCallback */}
            <List<SplitDiffRowCustomProps>
              defaultHeight={Math.min(maxLines * DIFF_LINE_HEIGHT, 600)}
              rowCount={maxLines}
              rowHeight={DIFF_LINE_HEIGHT}
              rowComponent={VirtualizedSplitLine as (props: SplitDiffRowProps) => React.ReactElement}
              rowProps={{ oldLines, newLines, hunkIndex }}
              overscanCount={10}
            />
          </div>
        )
      })}
    </div>
  )
}
