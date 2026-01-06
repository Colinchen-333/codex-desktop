import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import {
  type SlashCommand,
  filterCommands,
  COMMAND_CATEGORIES,
} from '../../lib/slashCommands'
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
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = filterCommands(input)

  // Reset selection when commands change
  useEffect(() => {
    setSelectedIndex(0)
  }, [input])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, commands.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          if (commands[selectedIndex]) {
            onSelect(commands[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, commands, selectedIndex, onSelect, onClose])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.children[selectedIndex] as HTMLElement
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!isVisible || commands.length === 0) return null

  // Group commands by category
  const groupedCommands = commands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = []
      }
      acc[cmd.category].push(cmd)
      return acc
    },
    {} as Record<string, SlashCommand[]>
  )

  let globalIndex = 0

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 mx-2">
      <div
        ref={listRef}
        className="max-h-80 overflow-y-auto rounded-xl border border-border/50 bg-card shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200"
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
