/**
 * Input-related hooks for ChatInputArea
 * Extracted from ChatInputArea.tsx to reduce component size
 */
import { useEffect, useCallback, useRef, useState } from 'react'
import { useAppStore, type AppState } from '../../stores/app'
import { MAX_TEXTAREA_HEIGHT, MAX_IMAGE_SIZE } from './types'
import { validateFilePath } from './utils'
import { useToast } from '../ui/Toast'
import { log } from '../../lib/logger'
import { type FileEntry } from '../../lib/api'

/**
 * P0 Enhancement: Hook for automatic focus restoration
 * Restores focus to input after popups close or file operations complete
 */
export function useFocusRestoration(inputRef: React.RefObject<HTMLTextAreaElement | null>) {
  const restoreFocus = useCallback(() => {
    // P2: Enhanced focus restoration with retry mechanism
    let attempts = 0
    const maxAttempts = 3
    
    const attemptFocus = () => {
      if (!inputRef.current) return
      
      // If already focused, success
      if (document.activeElement === inputRef.current) {
        if (attempts > 0) {
          log.debug(
            `[useFocusRestoration] Focus restored after ${attempts + 1} attempts`,
            'useInputHooks'
          )
        }
        return
      }
      
      // Attempt to focus
      inputRef.current.focus()
      attempts++
      
      // If haven't reached max attempts, retry on next frame
      if (attempts < maxAttempts) {
        requestAnimationFrame(attemptFocus)
      } else if (document.activeElement !== inputRef.current) {
        log.warn(
          `[useFocusRestoration] Failed to restore focus after ${maxAttempts} attempts`,
          'useInputHooks'
        )
      }
    }
    
    // Start the focus attempt chain
    requestAnimationFrame(attemptFocus)
  }, [inputRef])

  return { restoreFocus }
}

/**
 * Hook for slash command and file mention detection
 *
 * P0 Enhancement: Integrated with focus restoration
 */
export function useInputPopups(
  inputValue: string,
  inputRef: React.RefObject<HTMLTextAreaElement | null>
) {
  const [showSlashCommands, setShowSlashCommands] = useState(false)
  const [showFileMention, setShowFileMention] = useState(false)
  const [fileMentionQuery, setFileMentionQuery] = useState('')
  const [mentionStartPos, setMentionStartPos] = useState(-1)
  const { restoreFocus } = useFocusRestoration(inputRef)

  useEffect(() => {
    // Part 1: Slash command popup control
    if (inputValue.startsWith('/') && !inputValue.includes(' ')) {
      setShowSlashCommands(true)
    } else {
      setShowSlashCommands(false)
    }

    // Part 2: @ file mention detection
    const cursorPos = inputRef.current?.selectionStart ?? inputValue.length
    const textBeforeCursor = inputValue.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex >= 0) {
      const charBefore = lastAtIndex > 0 ? inputValue[lastAtIndex - 1] : ' '
      if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
        const query = textBeforeCursor.slice(lastAtIndex + 1)
        if (!query.includes(' ')) {
          setShowFileMention(true)
          setFileMentionQuery(query)
          setMentionStartPos(lastAtIndex)
          return
        }
      }
    }

    setShowFileMention(false)
    setFileMentionQuery('')
    setMentionStartPos(-1)
  }, [inputValue, inputRef])

  return {
    showSlashCommands,
    setShowSlashCommands,
    showFileMention,
    setShowFileMention,
    fileMentionQuery,
    setFileMentionQuery,
    mentionStartPos,
    setMentionStartPos,
    restoreFocus, // P0 Enhancement: Export focus restoration function
  }
}

/**
 * Hook for textarea auto-resize
 */
export function useTextareaResize(
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  inputValue: string
) {
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const newHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)
    textarea.style.height = `${newHeight}px`
  }, [inputRef])

  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue, adjustTextareaHeight])

  return { adjustTextareaHeight }
}

/**
 * Hook for focus input trigger
 *
 * P0 Enhancement: Improved focus management to avoid render conflicts.
 * - Uses requestAnimationFrame to delay focus until after render completes
 * - Maintains local focus request cache to prevent unnecessary focus attempts
 * - Removed dependency on global App Store for better isolation
 */
export function useFocusInput(inputRef: React.RefObject<HTMLTextAreaElement | null>) {
  const shouldFocusInput = useAppStore((state: AppState) => state.shouldFocusInput)
  const focusRequestIdRef = useRef(0)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (shouldFocusInput) {
      focusRequestIdRef.current += 1
      const requestId = focusRequestIdRef.current

      // P0 Enhancement: Use requestAnimationFrame to avoid render conflicts
      // This ensures focus happens after the browser has completed rendering
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
      rafIdRef.current = requestAnimationFrame(() => {
        if (focusRequestIdRef.current !== requestId) return
        if (inputRef.current) {
          log.debug('[useFocusInput] Focusing input after requestAnimationFrame', 'useInputHooks')
          inputRef.current.focus()
        } else {
          log.warn('[useFocusInput] Input ref is null, cannot focus', 'useInputHooks')
        }
        rafIdRef.current = null
      })

      // Clear the flag immediately to prevent re-triggering
      useAppStore.getState().clearFocusInput()

      // Cleanup: cancel animation frame if component unmounts
      return () => {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
      }
    }
  }, [shouldFocusInput, inputRef])
}

export interface FileMentionHandlerProps {
  inputValue: string
  mentionStartPos: number
  fileMentionQuery: string
  projects: Array<{ id: string; path: string }>
  selectedProjectId: string | null
  setInputValue: React.Dispatch<React.SetStateAction<string>>
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>
  setShowFileMention: (show: boolean) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}

/**
 * Hook for file mention selection handling
 */
export function useFileMentionHandler({
  inputValue,
  mentionStartPos,
  fileMentionQuery,
  projects,
  selectedProjectId,
  setInputValue,
  setAttachedImages,
  setShowFileMention,
  inputRef,
}: FileMentionHandlerProps) {
  const { showToast } = useToast()
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current)
        selectionTimeoutRef.current = null
      }
    }
  }, [])

  const handleFileMentionSelect = useCallback(
    async (file: FileEntry) => {
      const project = projects.find((p) => p.id === selectedProjectId)
      if (!project) return

      const fullPath = validateFilePath(project.path, file.path)
      if (!fullPath) {
        showToast(`Invalid file path: ${file.path}`, 'error')
        return
      }

      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
      const ext = file.path.toLowerCase().slice(file.path.lastIndexOf('.'))

      if (imageExts.includes(ext)) {
        try {
          const { readFile, stat } = await import('@tauri-apps/plugin-fs')

          const fileInfo = await stat(fullPath)
          if (fileInfo.size > MAX_IMAGE_SIZE) {
            showToast(
              `Image too large: ${(fileInfo.size / 1024 / 1024).toFixed(1)}MB (max 5MB)`,
              'error'
            )
            return
          }

          const bytes = await readFile(fullPath)
          const blob = new Blob([bytes], { type: `image/${ext.slice(1)}` })
          const reader = new FileReader()
          // P1 Fix: Add comprehensive error handling for FileReader
          reader.onerror = () => {
            log.error(`FileReader error for ${file.name}: ${reader.error}`, 'FileMentionHandler')
            showToast(`Failed to read image: ${file.name}`, 'error')
          }
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              setAttachedImages((prev) => [...prev, reader.result as string])
              showToast(`Image attached: ${file.name}`, 'success')
            } else {
              log.warn(`FileReader returned non-string result for ${file.name}`, 'FileMentionHandler')
              showToast(`Failed to process image: ${file.name}`, 'error')
            }
          }
          reader.readAsDataURL(blob)
        } catch (error) {
          log.error(`Failed to load image: ${error}`, 'FileMentionHandler')
          showToast(`Failed to load image: ${file.name}`, 'error')
        }

        if (mentionStartPos >= 0) {
          const queryEndPos = mentionStartPos + 1 + fileMentionQuery.length
          const before = inputValue.slice(0, mentionStartPos)
          const after = inputValue.slice(queryEndPos)
          setInputValue(`${before}${after}`.trim())
        }
      } else {
        if (mentionStartPos >= 0) {
          const queryEndPos = mentionStartPos + 1 + fileMentionQuery.length
          const before = inputValue.slice(0, mentionStartPos)
          const after = inputValue.slice(queryEndPos)

          const needsQuotes = /[\s"'`$\\]/.test(file.path)
          const quotedPath = needsQuotes ? `"${file.path}"` : file.path
          const newValue = `${before}@${quotedPath} ${after}`
          setInputValue(newValue)

          if (selectionTimeoutRef.current) {
            clearTimeout(selectionTimeoutRef.current)
          }
          selectionTimeoutRef.current = setTimeout(() => {
            if (inputRef.current) {
              const newPos = mentionStartPos + quotedPath.length + 2
              inputRef.current.setSelectionRange(newPos, newPos)
              inputRef.current.focus()
            }
            selectionTimeoutRef.current = null
          }, 0)
        }
      }
      setShowFileMention(false)

      // P0 Enhancement: Restore focus after file selection
      requestAnimationFrame(() => {
        if (inputRef.current) {
          log.debug('[handleFileMentionSelect] Restoring focus after file selection', 'useInputHooks')
          inputRef.current.focus()
        }
      })
    },
    [
      inputValue,
      mentionStartPos,
      fileMentionQuery,
      projects,
      selectedProjectId,
      showToast,
      setInputValue,
      setAttachedImages,
      setShowFileMention,
      inputRef,
    ]
  )

  return { handleFileMentionSelect }
}
