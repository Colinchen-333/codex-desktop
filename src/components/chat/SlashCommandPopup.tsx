import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { cn } from '../../lib/utils'
import {
  type SlashCommand,
  filterCommands,
  COMMAND_CATEGORIES,
} from '../../lib/slashCommands'
import { usePopupNavigation } from '../../hooks/usePopupNavigation'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useToast } from '../ui/useToast'
import { AlertCircle, RefreshCw } from 'lucide-react'
import {
  Cpu,
  ShieldCheck,
  Wrench,
  Eye,
  PlusCircle,
  History,
  Compass,
  Package,
  GitCompare,
  AtSign,
  Activity,
  Plug,
  LogOut,
  Power,
  MessageCircle,
  FlaskConical,
  TestTube2,
  HelpCircle,
  Trash2,
  LayoutGrid,
  Settings,
  GitBranch,
  Terminal,
  Bug,
  type LucideIcon,
} from 'lucide-react'

// Icon mapping for slash commands
const ICON_MAP: Record<string, LucideIcon> = {
  'cpu': Cpu,
  'shield-check': ShieldCheck,
  'wrench': Wrench,
  'eye': Eye,
  'plus-circle': PlusCircle,
  'history': History,
  'compass': Compass,
  'package': Package,
  'git-compare': GitCompare,
  'at-sign': AtSign,
  'activity': Activity,
  'plug': Plug,
  'log-out': LogOut,
  'power': Power,
  'message-circle': MessageCircle,
  'flask-conical': FlaskConical,
  'test-tube-2': TestTube2,
  'help-circle': HelpCircle,
  'trash-2': Trash2,
  'layout-grid': LayoutGrid,
  'settings': Settings,
  'git-branch': GitBranch,
  'bug': Bug,
}

function getIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || Terminal
}

interface SlashCommandPopupProps {
  input: string
  onSelect: (command: SlashCommand) => void
  onClose: () => void
  isVisible: boolean
}

export function SlashCommandPopup({
  input,
  onSelect,
  onClose,
  isVisible,
}: SlashCommandPopupProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useReducedMotion()
  const { toast } = useToast()

  // Error recovery states
  const [error, setError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)

  // Fetch commands with error handling
  const [commands, setCommands] = useState<SlashCommand[]>([])

  const loadCommands = useCallback(async () => {
    try {
      setError(null)
      const filteredCommands = filterCommands(input)
      setCommands(filteredCommands)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load commands'
      setError(errorMessage)
      toast.error('Commands Error', {
        message: errorMessage,
        duration: 5000,
      })
    } finally {
      setIsRetrying(false)
    }
  }, [input, toast])

  // Load commands when input or visibility changes
  useEffect(() => {
    if (isVisible) {
      void loadCommands()
    }
  }, [isVisible, loadCommands])

  // Retry handler
  const handleRetry = useCallback(() => {
    setIsRetrying(true)
    void loadCommands()
  }, [loadCommands])

  // P2.1 优化：使用提取的 usePopupNavigation hook 处理键盘导航
  // 统一了与 FileMentionPopup 的导航逻辑，减少代码重复
  const { selectedIndex, setSelectedIndex } = usePopupNavigation({
    items: commands,
    onSelect,
    onClose,
    isVisible,
  })

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.children[selectedIndex] as HTMLElement
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // P1.3 优化：使用 useMemo 缓存 groupedCommands 计算结果
  // 避免每次渲染都通过 reduce 重新计算分组，只在 commands 变化时重新计算
  const groupedCommands = useMemo(() => {
    return commands.reduce(
      (acc, cmd) => {
        if (!acc[cmd.category]) {
          acc[cmd.category] = []
        }
        acc[cmd.category].push(cmd)
        return acc
      },
      {} as Record<string, SlashCommand[]>
    )
  }, [commands])

  if (!isVisible) return null

  // Show error state
  if (error) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 mx-2">
        <div
          role="alert"
          aria-live="polite"
          className={cn(
            'rounded-xl border border-border/50 bg-card shadow-xl backdrop-blur-sm',
            prefersReducedMotion ? '' : 'animate-in fade-in slide-in-from-bottom-2 duration-200'
          )}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm">Unable to load commands</h3>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <RefreshCw className={cn('w-3 h-3', isRetrying && 'animate-spin')} />
                {isRetrying ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (commands.length === 0) return null

  let globalIndex = 0

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 mx-2">
      <div
        ref={listRef}
        role="listbox"
        aria-label="Slash commands"
        className={cn(
          'max-h-80 overflow-y-auto rounded-xl border border-border/50 bg-card shadow-xl backdrop-blur-sm',
          prefersReducedMotion ? '' : 'animate-in fade-in slide-in-from-bottom-2 duration-200'
        )}
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 p-3 text-xs font-medium text-muted-foreground border-b border-border/30 bg-card/95 backdrop-blur-sm">
          <Terminal size={14} />
          <span>Commands</span>
          <span className="ml-auto text-[10px] opacity-60">
            {commands.length} available
          </span>
        </div>

        <div className="py-1">
          {Object.entries(groupedCommands).map(([category, cmds]) => {
            const categoryInfo = COMMAND_CATEGORIES[category as keyof typeof COMMAND_CATEGORIES]
            const CategoryIcon = getIcon(categoryInfo.icon)

            return (
              <div key={category}>
                <div className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  <CategoryIcon size={12} className="opacity-50" />
                  <span>{categoryInfo.label}</span>
                </div>
                {cmds.map((cmd) => {
                  const currentIndex = globalIndex++
                  const Icon = getIcon(cmd.icon)

                  return (
                    <button
                      key={cmd.name}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-150',
                        currentIndex === selectedIndex
                          ? 'bg-primary/10 text-foreground'
                          : 'text-foreground/80 hover:bg-secondary/50 hover:text-foreground'
                      )}
                      onClick={() => onSelect(cmd)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      <span className={cn(
                        'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
                        currentIndex === selectedIndex
                          ? 'bg-primary/20 text-primary'
                          : 'bg-secondary/50 text-muted-foreground'
                      )}>
                        <Icon size={15} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm font-mono">/{cmd.name}</span>
                          {cmd.aliases && cmd.aliases.length > 0 && (
                            <span className="text-[10px] text-muted-foreground/50">
                              ({cmd.aliases.map((a) => `/${a}`).join(', ')})
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {cmd.description}
                        </p>
                      </div>
                      {currentIndex === selectedIndex && (
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground bg-secondary/80 px-2 py-1 rounded-md font-mono">
                          ↵
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
