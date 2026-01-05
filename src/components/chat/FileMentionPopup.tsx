import { useEffect, useRef, useState, useCallback } from 'react'
import { File, Folder, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { projectApi, type FileEntry } from '../../lib/api'

interface FileMentionPopupProps {
  /** The text after @ that we're filtering by */
  query: string
  /** Project path for file listing */
  projectPath: string
  /** Called when a file is selected */
  onSelect: (file: FileEntry) => void
  /** Called when popup should close */
  onClose: () => void
  /** Whether the popup is visible */
  isVisible: boolean
}

export function FileMentionPopup({
  query,
  projectPath,
  onSelect,
  onClose,
  isVisible,
}: FileMentionPopupProps) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Fetch files with debouncing
  const fetchFiles = useCallback(async (searchQuery: string) => {
    if (!projectPath) return

    setIsLoading(true)
    try {
      const result = await projectApi.listFiles(
        projectPath,
        searchQuery || undefined,
        50
      )
      setFiles(result)
      setSelectedIndex(0)
    } catch (error) {
      console.error('Failed to fetch files:', error)
      setFiles([])
    } finally {
      setIsLoading(false)
    }
  }, [projectPath])

  // Debounced fetch on query change
  useEffect(() => {
    if (!isVisible) return

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      fetchFiles(query)
    }, 150)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, isVisible, fetchFiles])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, files.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          if (files[selectedIndex]) {
            onSelect(files[selectedIndex])
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
  }, [isVisible, files, selectedIndex, onSelect, onClose])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!isVisible) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 mx-2">
      <div
        className="max-h-72 overflow-y-auto rounded-xl border border-border/50 bg-card shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
      >
        <div className="p-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/30 bg-secondary/30 flex items-center justify-between">
          <span>Files</span>
          {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
        </div>

        <div ref={listRef} className="py-1">
          {files.length === 0 && !isLoading ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              {query ? 'No matching files' : 'Start typing to search files'}
            </div>
          ) : (
            files.map((file, index) => (
              <button
                key={file.path}
                data-index={index}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                  index === selectedIndex
                    ? 'bg-primary/10 text-foreground'
                    : 'text-foreground hover:bg-secondary/50'
                )}
                onClick={() => onSelect(file)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="flex-shrink-0 text-muted-foreground">
                  {file.isDir ? (
                    <Folder className="w-4 h-4" />
                  ) : (
                    <File className="w-4 h-4" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{file.name}</div>
                  {file.path !== file.name && (
                    <div className="text-xs text-muted-foreground truncate">
                      {file.path}
                    </div>
                  )}
                </div>
                {index === selectedIndex && (
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                    ↵
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
