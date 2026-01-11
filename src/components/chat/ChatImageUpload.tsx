/**
 * ChatImageUpload - Handles image upload via drag & drop and paste
 * Extracted from ChatView.tsx for better modularity
 */
import React, { useCallback, memo } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useToast } from '../ui/Toast'
import { MAX_IMAGE_SIZE, MAX_IMAGES_COUNT } from './types'

export interface ImageUploadState {
  attachedImages: string[]
  isDragging: boolean
}

export interface ImageUploadActions {
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>
}

export interface ChatImageUploadProps extends ImageUploadState, ImageUploadActions {
  children: React.ReactNode
}

/**
 * Hook for image file handling logic
 * Can be used independently or with ChatImageUpload component
 */
export function useImageUpload(
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>
) {
  const { showToast } = useToast()

  const handleImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        showToast('Only image files are supported', 'error')
        return
      }

      if (file.size > MAX_IMAGE_SIZE) {
        showToast('Image too large (max 5MB)', 'error')
        return
      }

      setAttachedImages((prev) => {
        if (prev.length >= MAX_IMAGES_COUNT) {
          showToast(`Maximum ${MAX_IMAGES_COUNT} images allowed`, 'error')
          return prev
        }

        const reader = new FileReader()
        reader.onload = (e) => {
          const base64 = e.target?.result as string
          setAttachedImages((current) => {
            if (current.length >= MAX_IMAGES_COUNT) return current
            return [...current, base64]
          })
        }
        reader.onerror = () => {
          showToast('Failed to read image file', 'error')
        }
        reader.readAsDataURL(file)
        return prev
      })
    },
    [showToast, setAttachedImages]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            handleImageFile(file)
          }
          break
        }
      }
    },
    [handleImageFile]
  )

  return { handleImageFile, handlePaste }
}

/**
 * Hook for drag and drop handling
 */
export function useDragAndDrop(
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>,
  handleImageFile: (file: File) => void
) {
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [setIsDragging])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [setIsDragging])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as Node | null
    const currentTarget = e.currentTarget as Node
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setIsDragging(false)
    }
  }, [setIsDragging])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = e.dataTransfer.files
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          handleImageFile(file)
        }
      }
    },
    [handleImageFile, setIsDragging]
  )

  return { handleDragEnter, handleDragOver, handleDragLeave, handleDrop }
}

/**
 * Drag overlay component shown when dragging files
 */
export const DragOverlay = memo(function DragOverlay({
  onDragLeave,
  onDrop,
}: {
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-primary/5 via-background/95 to-primary/10 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="relative pointer-events-none">
        {/* Animated rings */}
        <div
          className="absolute inset-0 -m-8 rounded-full border-2 border-primary/20 animate-ping"
          style={{ animationDuration: '2s' }}
        />
        <div className="absolute inset-0 -m-4 rounded-full border-2 border-primary/30 animate-pulse" />

        {/* Main content */}
        <div className="relative flex flex-col items-center gap-5 p-10 rounded-3xl bg-card/80 border-2 border-dashed border-primary/50 shadow-2xl shadow-primary/10">
          <div className="relative">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-lg">
              <ImageIcon size={36} className="text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-md">
              <span className="text-primary-foreground text-xs font-bold">+</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold text-foreground mb-1">Drop images here</p>
            <p className="text-sm text-muted-foreground">PNG, JPG, GIF, WebP supported</p>
          </div>
        </div>
      </div>
    </div>
  )
})

/**
 * Combined hook for all image upload functionality
 */
export function useChatImageUpload(
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>,
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>
) {
  const { handleImageFile, handlePaste } = useImageUpload(setAttachedImages)
  const dragHandlers = useDragAndDrop(setIsDragging, handleImageFile)

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index))
  }, [setAttachedImages])

  return {
    handleImageFile,
    handlePaste,
    removeImage,
    ...dragHandlers,
  }
}

export default memo(function ChatImageUpload({
  children,
  isDragging,
  setIsDragging,
  setAttachedImages,
}: ChatImageUploadProps) {
  const { handleImageFile } = useImageUpload(setAttachedImages)
  const { handleDragLeave, handleDrop } = useDragAndDrop(setIsDragging, handleImageFile)

  return (
    <>
      {isDragging && (
        <DragOverlay onDragLeave={handleDragLeave} onDrop={handleDrop} />
      )}
      {children}
    </>
  )
})
