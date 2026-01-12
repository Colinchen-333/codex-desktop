/**
 * ChatInputArea - Input area component with textarea, image preview, and send button
 * Extracted from ChatView.tsx for better modularity
 */
import React, { useCallback, useEffect, memo } from 'react'
import { X, Paperclip, StopCircle, ArrowUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useThreadStore, selectFocusedThread } from '../../stores/thread'
import { SlashCommandPopup } from './SlashCommandPopup'
import { FileMentionPopup } from './FileMentionPopup'
import { type SlashCommand } from '../../lib/slashCommands'
import { WorkingStatusBar, QueuedMessagesDisplay, RateLimitWarning, InputStatusHint } from './status'
import {
  useInputPopups,
  useTextareaResize,
  useFocusInput,
  useFileMentionHandler,
} from './useInputHooks'
import { useCommandHistory } from '../../hooks/useCommandHistory'
import { log } from '../../lib/logger'

export interface ChatInputAreaProps {
  inputValue: string
  setInputValue: React.Dispatch<React.SetStateAction<string>>
  attachedImages: string[]
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>
  isDragging: boolean
  onSend: () => Promise<void>
  onPaste: (e: React.ClipboardEvent) => void
  handleImageFile: (file: File) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  projects: Array<{ id: string; path: string }>
  selectedProjectId: string | null
}

/**
 * Image preview component
 */
const ImagePreview = memo(function ImagePreview({
  images,
  onRemove,
}: {
  images: string[]
  onRemove: (index: number) => void
}) {
  if (images.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 px-2 pt-2 pb-1">
      {images.map((img, i) => (
        <div key={i} className="relative group animate-in zoom-in duration-100">
          <img
            src={img}
            alt={`Attached ${i + 1}`}
            loading="lazy"
            decoding="async"
            className="h-14 w-14 rounded-xl object-cover border border-border/50 shadow-sm"
          />
          <button
            className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-background shadow-md text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
            onClick={() => onRemove(i)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
})

/**
 * Send/Stop button component
 */
const SendButton = memo(function SendButton({
  turnStatus,
  canSend,
  onSend,
  onInterrupt,
}: {
  turnStatus: string
  canSend: boolean
  onSend: () => void
  onInterrupt: () => void
}) {
  return (
    <div className="flex items-center gap-1 mb-1">
      {turnStatus === 'running' && (
        <button
          className="h-10 w-10 flex items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground transition-all duration-100"
          onClick={onInterrupt}
          title="Stop generation (Esc)"
          aria-label="Stop generation"
        >
          <StopCircle size={20} aria-hidden="true" />
        </button>
      )}
      <button
        className={cn(
          'h-10 w-10 flex items-center justify-center rounded-full transition-all duration-100 shadow-sm',
          !canSend
            ? 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50'
            : 'bg-primary text-primary-foreground hover:scale-105 hover:shadow-md'
        )}
        onClick={onSend}
        disabled={!canSend}
        title={turnStatus === 'running' ? 'Queue message' : 'Send message (Enter)'}
        aria-label={turnStatus === 'running' ? 'Queue message' : 'Send message'}
      >
        <ArrowUp size={20} aria-hidden="true" />
      </button>
    </div>
  )
})

export default memo(function ChatInputArea({
  inputValue,
  setInputValue,
  attachedImages,
  setAttachedImages,
  isDragging,
  onSend,
  onPaste,
  handleImageFile,
  inputRef,
  projects,
  selectedProjectId,
}: ChatInputAreaProps) {
  // P1 Fix: Use proper selector to avoid re-render loops from getter-based state access
  const focusedThread = useThreadStore(selectFocusedThread)
  const interrupt = useThreadStore((state) => state.interrupt)

  const turnStatus = focusedThread?.turnStatus ?? 'idle'

  const {
    showSlashCommands,
    setShowSlashCommands,
    showFileMention,
    setShowFileMention,
    fileMentionQuery,
    mentionStartPos,
    restoreFocus, // P0 Enhancement: Get focus restoration function
  } = useInputPopups(inputValue, inputRef)

  useTextareaResize(inputRef, inputValue)
  useFocusInput(inputRef)

  // Command history for up/down arrow navigation
  const {
    handleHistoryKeyDown,
    addToHistory,
    resetHistoryCursor,
  } = useCommandHistory({
    inputRef,
    inputValue,
    setInputValue: (value: string) => setInputValue(value),
    popupsOpen: showSlashCommands || showFileMention,
  })

  // Reset history cursor when user types (not during navigation)
  useEffect(() => {
    resetHistoryCursor()
  }, [inputValue, resetHistoryCursor])

  const { handleFileMentionSelect } = useFileMentionHandler({
    inputValue,
    mentionStartPos,
    fileMentionQuery,
    projects,
    selectedProjectId,
    setInputValue,
    setAttachedImages,
    setShowFileMention,
    inputRef,
  })

  const handleSlashCommandSelect = useCallback((command: SlashCommand) => {
    setInputValue(`/${command.name} `)
    setShowSlashCommands(false)
    // P0 Enhancement: Use focus restoration function
    restoreFocus()
  }, [setInputValue, setShowSlashCommands, restoreFocus])

  // Wrapped onSend to add command to history
  const handleSendWithHistory = useCallback(async () => {
    const text = inputValue.trim()
    if (text) {
      addToHistory(text)
    }
    await onSend()
  }, [inputValue, addToHistory, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle history navigation first
      handleHistoryKeyDown(e)

      if (e.key === 'Enter' && !e.shiftKey) {
        if (showSlashCommands || showFileMention) {
          return
        }
        e.preventDefault()
        void handleSendWithHistory()
      }
    },
    [showSlashCommands, showFileMention, handleSendWithHistory, handleHistoryKeyDown]
  )

  const removeImage = useCallback(
    (index: number) => {
      setAttachedImages((prev) => prev.filter((_, i) => i !== index))
    },
    [setAttachedImages]
  )

  // P0 Enhancement: Focus loss detection and logging
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      // Log focus loss for debugging
      const relatedTarget = e.relatedTarget as HTMLElement | null
      const targetDescription = relatedTarget
        ? `${relatedTarget.tagName}${relatedTarget.id ? `#${relatedTarget.id}` : ''}${relatedTarget.className ? `.${relatedTarget.className.split(' ')[0]}` : ''}`
        : 'null'

      log.debug(
        `[ChatInputArea] Focus lost from input. New focus target: ${targetDescription}`,
        'ChatInputArea'
      )

      // Only warn in development if focus is lost unexpectedly (not to buttons or known elements)
      if (process.env.NODE_ENV === 'development') {
        const isExpectedTarget =
          relatedTarget &&
          (relatedTarget.tagName === 'BUTTON' ||
            relatedTarget.closest('[role="dialog"]') ||
            relatedTarget.closest('[role="listbox"]') ||
            relatedTarget.closest('.popup') ||
            relatedTarget.closest('.dialog'))

        if (!isExpectedTarget && relatedTarget !== null) {
          log.warn(
            `[ChatInputArea] Unexpected focus loss to: ${targetDescription}. Consider adding focus restoration.`,
            'ChatInputArea'
          )
        }
      }
    },
    []
  )

  const canSend = inputValue.trim() || attachedImages.length > 0

  return (
    <div className="p-4 bg-transparent" role="form" aria-label="Message composer">
      <div className="mx-auto max-w-3xl">
        <RateLimitWarning />
        <WorkingStatusBar />
        <QueuedMessagesDisplay />

        <div
          className={cn(
            'relative rounded-2xl bg-card shadow-lg border border-border/40 p-2.5 transition-all duration-150',
            'hover:shadow-xl hover:border-border/60',
            isDragging && 'scale-[1.02] ring-2 ring-primary ring-offset-2'
          )}
        >
          <SlashCommandPopup
            input={inputValue}
            onSelect={handleSlashCommandSelect}
            onClose={() => setShowSlashCommands(false)}
            isVisible={showSlashCommands}
          />
          <FileMentionPopup
            query={fileMentionQuery}
            projectPath={projects.find((p) => p.id === selectedProjectId)?.path ?? ''}
            onSelect={handleFileMentionSelect}
            onClose={() => setShowFileMention(false)}
            isVisible={showFileMention && !!selectedProjectId}
          />

          <ImagePreview images={attachedImages} onRemove={removeImage} />

          <div className="flex items-end gap-2 pl-2">
            <input
              type="file"
              id="image-upload"
              className="hidden"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = e.target.files
                if (files) {
                  for (const file of files) {
                    handleImageFile(file)
                  }
                }
                e.target.value = ''
              }}
            />
            <button
              className="mb-2 p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
              onClick={() => {
                document.getElementById('image-upload')?.click()
              }}
              title="Attach images"
              aria-label="Attach images"
            >
              <Paperclip size={20} aria-hidden="true" />
            </button>

            <textarea
              ref={inputRef}
              className="flex-1 max-h-[200px] min-h-[44px] resize-none bg-transparent py-3 text-sm focus:outline-none placeholder:text-muted-foreground/70"
              placeholder={
                turnStatus === 'running'
                  ? 'Type to queue next message...'
                  : 'Message Codex...'
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={onPaste}
              onBlur={handleBlur}
              rows={1}
              aria-label="Message input"
              aria-describedby="input-hint"
            />

            <SendButton
              turnStatus={turnStatus}
              canSend={!!canSend}
              onSend={handleSendWithHistory}
              onInterrupt={interrupt}
            />
          </div>
        </div>

        <InputStatusHint />
      </div>
    </div>
  )
})
