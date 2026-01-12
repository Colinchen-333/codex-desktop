/**
 * ChatView - Main chat interface component (Coordinator)
 * Refactored to use modular sub-components for better maintainability
 *
 * Sub-components:
 * - ChatMessageList: Virtualized message list with auto-scroll
 * - ChatInputArea: Input area with textarea, popups, and send button
 * - ChatImageUpload: Drag & drop and paste image handling
 * - useChatCommands: Command context builder hook
 */
import { useRef, useState, useCallback } from 'react'
import type { ListImperativeAPI } from 'react-window'
import { useThreadStore } from '../../stores/thread'
import { useProjectsStore, type ProjectsState } from '../../stores/projects'
import { serverApi, type SkillInput, type ReviewTarget } from '../../lib/api'
import { ReviewSelectorDialog } from '../LazyComponents'
import { log } from '../../lib/logger'
import { executeCommand } from '../../lib/commandExecutor'

// Import sub-components
import ChatMessageList from './ChatMessageList'
import ChatInputArea from './ChatInputArea'
import { DragOverlay, useChatImageUpload } from './ChatImageUpload'
import { useChatCommands } from './useChatCommands'

export function ChatView() {
  // Store selectors
  const selectedProjectId = useProjectsStore((state: ProjectsState) => state.selectedProjectId)
  const projects = useProjectsStore((state: ProjectsState) => state.projects)

  // Local state
  const [inputValue, setInputValue] = useState('')
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [showReviewSelector, setShowReviewSelector] = useState(false)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const virtualListRef = useRef<ListImperativeAPI | null>(null)

  // Custom hooks
  const {
    handleImageFile,
    handlePaste,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useChatImageUpload(setAttachedImages, setIsDragging)

  const {
    buildCommandContext,
    sendMessage,
    addInfoItem,
    showToast,
    activeThread,
  } = useChatCommands({
    inputRef,
    inputValue,
    setInputValue,
    setShowReviewSelector,
  })

  // Handle send message
  const handleSend = useCallback(async () => {
    const text = inputValue.trim()
    if (!text && attachedImages.length === 0) return

    // Preserve input state for potential restoration on error
    const preservedInput = inputValue
    const preservedImages = [...attachedImages]
    const preservedHeight = inputRef.current?.style.height

    // Clear input immediately for better UX
    setInputValue('')
    setAttachedImages([])
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    // Check if it's a slash command
    if (text.startsWith('/')) {
      try {
        const result = await executeCommand(text, buildCommandContext())
        if (result.handled) {
          // P0 Fix: Restore focus after successful command execution
          requestAnimationFrame(() => {
            inputRef.current?.focus()
          })
          return
        }
      } catch (error) {
        log.error(`Failed to execute command: ${error}`, 'ChatView')
        showToast('Failed to execute command', 'error')
        // P1 Fix: Complete state restoration on error
        setInputValue(preservedInput)
        setAttachedImages(preservedImages)
        if (inputRef.current && preservedHeight) {
          inputRef.current.style.height = preservedHeight
        }
        // Refocus input for easy retry
        requestAnimationFrame(() => {
          inputRef.current?.focus()
        })
        return // P1 Fix: Early return to prevent further execution
      }
    }

    // Handle ! shell command prefix (like CLI)
    if (text.startsWith('!') && text.length > 1) {
      const shellCommand = text.slice(1).trim()
      if (!shellCommand) {
        showToast('Please provide a command after !', 'error')
        // Restore input on error
        setInputValue(preservedInput)
        setAttachedImages(preservedImages)
        return
      }

      if (!activeThread) {
        showToast('No active session', 'error')
        // Restore input on error
        setInputValue(preservedInput)
        setAttachedImages(preservedImages)
        return
      }

      try {
        addInfoItem('Shell Command', `Running: ${shellCommand}`)
        await serverApi.runUserShellCommand(activeThread.id, shellCommand)
        // P0 Fix: Restore focus after successful shell command
        requestAnimationFrame(() => {
          inputRef.current?.focus()
        })
      } catch (error) {
        log.error(`Failed to run shell command: ${error}`, 'ChatView')
        showToast('Failed to run shell command', 'error')
        // P1 Fix: Complete state restoration on error
        setInputValue(preservedInput)
        setAttachedImages(preservedImages)
        if (inputRef.current && preservedHeight) {
          inputRef.current.style.height = preservedHeight
        }
        // Refocus input for easy retry
        requestAnimationFrame(() => {
          inputRef.current?.focus()
        })
      }
      return
    }

    try {
      const project = projects.find((p) => p.id === selectedProjectId)

      // Detect skill mentions in the text
      const skillMentionPattern = /(?:^|[\s(])(\$([a-zA-Z][a-zA-Z0-9_-]*))(?=[\s,.):]|$)/g
      const skillMentions: string[] = []
      let match
      while ((match = skillMentionPattern.exec(text)) !== null) {
        skillMentions.push(match[2])
      }

      let skills: SkillInput[] | undefined
      if (skillMentions.length > 0 && project) {
        try {
          const response = await serverApi.listSkills([project.path], false, selectedProjectId)
          const allSkills = response.data.flatMap((entry) => entry.skills)
          skills = skillMentions
            .map((name) => {
              const skill = allSkills.find(
                (s) => s.name === name || s.name.toLowerCase() === name.toLowerCase()
              )
              if (skill) {
                return { name: skill.name, path: skill.path }
              }
              return null
            })
            .filter((s): s is SkillInput => s !== null)

          if (skills.length === 0) {
            skills = undefined
          }
        } catch (error) {
          log.warn(`Failed to load skills for mentions: ${error}`, 'ChatView')
        }
      }

      await sendMessage(text, attachedImages.length > 0 ? attachedImages : undefined, skills)

      // P0 Fix: Restore focus after successful message send
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    } catch (error) {
      log.error(`Failed to send message: ${error}`, 'ChatView')
      showToast('Failed to send message. Please try again.', 'error')
      // Restore input on error so user can retry
      setInputValue(preservedInput)
      setAttachedImages(preservedImages)
      if (inputRef.current && preservedHeight) {
        inputRef.current.style.height = preservedHeight
      }
      // Refocus input for easy retry
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [
    inputValue,
    attachedImages,
    buildCommandContext,
    sendMessage,
    showToast,
    addInfoItem,
    selectedProjectId,
    projects,
    activeThread,
  ])

  // Handle review target selection from dialog
  // P0 Fix: Added proper error handling and use activeThread from hook to avoid stale closure
  const handleReviewSelect = useCallback(async (target: ReviewTarget) => {
    if (!activeThread) {
      showToast('No active session', 'error')
      return
    }
    const targetDesc =
      target.type === 'uncommittedChanges'
        ? 'uncommitted changes'
        : target.type === 'baseBranch'
          ? `branch: ${target.branch}`
          : target.type === 'commit'
            ? `commit: ${target.sha.slice(0, 7)}`
            : 'custom instructions'
    addInfoItem('Review', `Starting review of ${targetDesc}...`)
    try {
      await serverApi.startReview(activeThread.id, target)
    } catch (error) {
      log.error(`Failed to start review: ${error}`, 'ChatView')
      showToast('Failed to start review', 'error')
    }
  }, [activeThread, addInfoItem, showToast])

  // Get current project for review selector
  const currentProject = projects.find((p) => p.id === selectedProjectId)

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative">
      {/* Drag Overlay */}
      {isDragging && (
        <DragOverlay onDragLeave={handleDragLeave} onDrop={handleDrop} />
      )}

      {/* Messages Area - Virtualized */}
      <ChatMessageList
        scrollAreaRef={scrollAreaRef}
        messagesEndRef={messagesEndRef}
        virtualListRef={virtualListRef}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />

      {/* Input Area */}
      <ChatInputArea
        inputValue={inputValue}
        setInputValue={setInputValue}
        attachedImages={attachedImages}
        setAttachedImages={setAttachedImages}
        isDragging={isDragging}
        onSend={handleSend}
        onPaste={handlePaste}
        handleImageFile={handleImageFile}
        inputRef={inputRef}
        projects={projects}
        selectedProjectId={selectedProjectId}
      />

      {/* Review Selector Dialog */}
      <ReviewSelectorDialog
        isOpen={showReviewSelector}
        onClose={() => setShowReviewSelector(false)}
        onSelect={handleReviewSelect}
        projectPath={currentProject?.path ?? ''}
      />
    </div>
  )
}
