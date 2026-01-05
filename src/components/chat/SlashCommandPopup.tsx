import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import {
  type SlashCommand,
  filterCommands,
  COMMAND_CATEGORIES,
} from '../../lib/slashCommands'

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
        className="max-h-64 overflow-y-auto rounded-xl border border-border/50 bg-card shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
      >
        <div className="p-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/30 bg-secondary/30">
          Commands
        </div>

        <div className="py-1">
          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                {COMMAND_CATEGORIES[category as keyof typeof COMMAND_CATEGORIES]}
              </div>
              {cmds.map((cmd) => {
                const currentIndex = globalIndex++
                return (
                  <button
                    key={cmd.name}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      currentIndex === selectedIndex
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground hover:bg-secondary/50'
                    )}
                    onClick={() => onSelect(cmd)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  >
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-base">
                      {cmd.icon || '/'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">/{cmd.name}</span>
                        {cmd.aliases && cmd.aliases.length > 0 && (
                          <span className="text-[10px] text-muted-foreground/60">
                            ({cmd.aliases.map((a) => `/${a}`).join(', ')})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {cmd.description}
                      </p>
                    </div>
                    {currentIndex === selectedIndex && (
                      <span className="flex-shrink-0 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        ↵
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
