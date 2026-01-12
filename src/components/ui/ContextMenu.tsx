import { useState, useEffect, useLayoutEffect, useRef, type ReactNode, type MouseEvent } from 'react'
import { cn } from '../../lib/utils'

export interface ContextMenuItem {
  label: string
  icon?: string
  onClick: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  children: ReactNode
  className?: string
}

export function ContextMenu({ items, children, className }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Calculate position, ensuring menu stays in viewport
    const x = e.clientX
    const y = e.clientY

    setPosition({ x, y })
    setIsOpen(true)
  }

  useEffect(() => {
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleScroll = () => {
      setIsOpen(false)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('scroll', handleScroll, true)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // P0 Fix: Track if position has been adjusted to prevent infinite loop
  // The issue was that position in dependency + setPosition in effect body = potential loop
  const hasAdjustedRef = useRef(false)

  // Reset adjustment flag when menu opens at new position
  useEffect(() => {
    if (isOpen) {
      hasAdjustedRef.current = false
    }
  }, [isOpen])

  // Adjust position if menu would overflow viewport - legitimate DOM measurement update
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current || hasAdjustedRef.current) {
      return
    }

    const rect = menuRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let newX = position.x
    let newY = position.y

    if (rect.right > viewportWidth) {
      newX = viewportWidth - rect.width - 8
    }
    if (rect.bottom > viewportHeight) {
      newY = viewportHeight - rect.height - 8
    }

    if (newX !== position.x || newY !== position.y) {
      // P0 Fix: Mark as adjusted to prevent re-triggering
      hasAdjustedRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Position update based on DOM measurements
      setPosition({ x: newX, y: newY })
    }
  }, [isOpen, position])

  return (
    <>
      <div
        ref={triggerRef}
        className={className}
        onContextMenu={handleContextMenu}
      >
        {children}
      </div>

      {isOpen && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg"
          style={{ left: position.x, top: position.y }}
        >
          {items.map((item, index) => (
            <button
              key={index}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                item.disabled
                  ? 'cursor-not-allowed opacity-50'
                  : item.variant === 'danger'
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'hover:bg-accent'
              )}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick()
                  setIsOpen(false)
                }
              }}
              disabled={item.disabled}
            >
              {item.icon && <span>{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
