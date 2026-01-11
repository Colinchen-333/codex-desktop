/**
 * UserMessage - Displays user messages with optional images
 * Supports editing and deletion of messages
 * Memoized to prevent unnecessary re-renders when parent state changes
 */
import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { isUserMessageContent } from '../../../lib/typeGuards'
import { log } from '../../../lib/logger'
import { useThreadStore, type UserMessageItem } from '../../../stores/thread'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import type { MessageItemProps } from '../types'
import type { UserMessageContent } from '../../../lib/types/thread'

/**
 * Type guard to check if item is a UserMessageItem
 */
function isUserMessageItem(item: unknown): item is UserMessageItem {
  if (typeof item !== 'object' || item === null) return false
  const threadItem = item as { type?: string }
  return threadItem.type === 'userMessage'
}

export const UserMessage = memo(
  function UserMessage({ item }: MessageItemProps) {
    // Store actions - must be called before any conditional returns
    const startEditMessage = useThreadStore((state) => state.startEditMessage)
    const updateEditText = useThreadStore((state) => state.updateEditText)
    const saveEditMessage = useThreadStore((state) => state.saveEditMessage)
    const cancelEditMessage = useThreadStore((state) => state.cancelEditMessage)
    const deleteMessage = useThreadStore((state) => state.deleteMessage)

    // Local state - must be called before any conditional returns
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isHovered, setIsHovered] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Get edit state from UserMessageItem
    const userMessageItem = isUserMessageItem(item) ? item : null
    const editState = userMessageItem?.editState
    const isEditing = editState?.isEditing ?? false
    const editedText = editState?.editedText ?? ''
    const editedAt = editState?.editedAt

    // Check content validity and narrow type
    const isValidContent = isUserMessageContent(item.content)
    const content: UserMessageContent | null = isValidContent ? (item.content as UserMessageContent) : null

    // All hooks must be called before conditional returns
    // Auto-focus and auto-resize textarea when entering edit mode
    useEffect(() => {
      if (isEditing && textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(
          textareaRef.current.value.length,
          textareaRef.current.value.length
        )
        // Auto-resize
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
    }, [isEditing])

    // Handle edit button click
    const handleEditClick = useCallback(() => {
      startEditMessage(item.id)
    }, [item.id, startEditMessage])

    // Handle text change during editing
    const handleTextChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateEditText(item.id, e.target.value)
        // Auto-resize textarea
        e.target.style.height = 'auto'
        e.target.style.height = `${e.target.scrollHeight}px`
      },
      [item.id, updateEditText]
    )

    // Handle save edit
    const handleSaveEdit = useCallback(() => {
      if (editedText.trim()) {
        saveEditMessage(item.id)
      }
    }, [item.id, editedText, saveEditMessage])

    // Handle cancel edit
    const handleCancelEdit = useCallback(() => {
      cancelEditMessage(item.id)
    }, [item.id, cancelEditMessage])

    // Handle keyboard events in edit mode
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          handleCancelEdit()
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          handleSaveEdit()
        }
      },
      [handleCancelEdit, handleSaveEdit]
    )

    // Handle delete button click
    const handleDeleteClick = useCallback(() => {
      setShowDeleteConfirm(true)
    }, [])

    // Handle confirm delete
    const handleConfirmDelete = useCallback(() => {
      deleteMessage(item.id)
      setShowDeleteConfirm(false)
    }, [item.id, deleteMessage])

    // Handle cancel delete
    const handleCancelDelete = useCallback(() => {
      setShowDeleteConfirm(false)
    }, [])

    // Format edited time
    const formatEditedTime = useCallback((timestamp: number): string => {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffMins < 1) return 'just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays < 7) return `${diffDays}d ago`
      return date.toLocaleDateString()
    }, [])

    // Now we can do conditional returns after all hooks
    if (!isValidContent || !content) {
      log.warn(`Invalid user message content for item ${item.id}`, 'UserMessage')
      return null
    }

    return (
      <>
        <div
          className="flex justify-end pl-12 animate-in slide-in-from-bottom-2 duration-200"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="group relative max-w-[85%]">
            {/* Action buttons - visible on hover when not editing */}
            {!isEditing && isHovered && (
              <div className="absolute -left-20 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={handleEditClick}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit message"
                  aria-label="Edit message"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete message"
                  aria-label="Delete message"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            <div className="rounded-2xl rounded-tr-sm bg-primary px-5 py-4 text-primary-foreground shadow-md">
              {/* Images */}
              {content.images && content.images.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {content.images.map((img: string, i: number) => (
                    <img
                      key={i}
                      src={img}
                      alt={`Attached ${i + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="h-32 w-32 rounded-xl object-cover border border-primary-foreground/10 bg-black/20 shadow-sm"
                    />
                  ))}
                </div>
              )}

              {/* Edit mode */}
              {isEditing ? (
                <div className="space-y-3">
                  <textarea
                    ref={textareaRef}
                    value={editedText}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    className="w-full min-h-[60px] max-h-[200px] bg-primary-foreground/10 text-primary-foreground rounded-lg px-3 py-2 text-[15px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary-foreground/30 placeholder:text-primary-foreground/50"
                    placeholder="Enter your message..."
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-primary-foreground/60">
                      Press Esc to cancel, Cmd/Ctrl+Enter to save
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="p-1.5 rounded-lg hover:bg-primary-foreground/10 text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                        title="Cancel edit"
                        aria-label="Cancel edit"
                      >
                        <X size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={!editedText.trim()}
                        className="p-1.5 rounded-lg hover:bg-primary-foreground/10 text-primary-foreground/70 hover:text-primary-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Save edit"
                        aria-label="Save edit"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <>
                  {content.text && (
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed selection:bg-primary-foreground/30">
                      {content.text}
                    </p>
                  )}
                  {/* Edited indicator */}
                  {editedAt && (
                    <p className="mt-2 text-xs text-primary-foreground/50 italic">
                      edited {formatEditedTime(editedAt)}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Delete confirmation dialog */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Delete Message"
          message="Are you sure you want to delete this message? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      </>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison: re-render if item identity, content, or edit state changes
    if (prevProps.item !== nextProps.item) return false

    // Check edit state changes for UserMessageItem
    const prevUserItem = isUserMessageItem(prevProps.item) ? prevProps.item : null
    const nextUserItem = isUserMessageItem(nextProps.item) ? nextProps.item : null

    if (prevUserItem?.editState !== nextUserItem?.editState) return false

    return true
  }
)
