import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { useSessionsStore } from '../../../stores/sessions'

interface SessionSearchProps {
  /** Whether search is visible (typically only on sessions tab) */
  visible: boolean
}

/**
 * SessionSearch - Global session search with debounce
 *
 * Features:
 * - Debounced search (300ms) to avoid excessive API calls
 * - Clear button when query is present
 * - Loading spinner during search
 * - Results count display for global search
 *
 * Uses getState() pattern to avoid function reference dependencies
 * and prevent stale closures.
 */
export const SessionSearch = memo(function SessionSearch({ visible }: SessionSearchProps) {
  // Local search input state (immediate feedback)
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Subscribe to store state for search results display
  const {
    searchQuery: storeSearchQuery,
    searchResults,
    isSearching,
  } = useSessionsStore()

  const isGlobalSearch = !!storeSearchQuery

  // Debounced search handler
  const handleSearchChange = useCallback((query: string) => {
    setLocalSearchQuery(query)

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }

    // Debounce search API call
    searchTimeoutRef.current = setTimeout(() => {
      searchTimeoutRef.current = null
      if (query.trim()) {
        void useSessionsStore.getState().searchSessions(query)
      } else {
        void useSessionsStore.getState().clearSearch()
      }
    }, 300)
  }, [])

  // Clear search handler
  const handleClearSearch = useCallback(() => {
    setLocalSearchQuery('')
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
    useSessionsStore.getState().clearSearch()
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
    }
  }, [])

  // Clear timeout when visibility changes (e.g., switching tabs)
  useEffect(() => {
    if (!visible && searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
  }, [visible])

  if (!visible) {
    return null
  }

  return (
    <div className="mb-3">
      <div className="relative">
        <input
          type="text"
          placeholder="Search all sessions..."
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none pr-8"
          value={localSearchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label="Search sessions"
          aria-describedby={
            isGlobalSearch && searchResults.length > 0
              ? 'search-results-count'
              : undefined
          }
        />
        {isSearching && (
          <div
            className="absolute right-2.5 top-1/2 -translate-y-1/2"
            role="status"
            aria-busy="true"
            aria-label="Searching"
          >
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {localSearchQuery && !isSearching && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            onClick={handleClearSearch}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {isGlobalSearch && searchResults.length > 0 && (
        <div
          id="search-results-count"
          className="mt-1.5 text-xs text-muted-foreground"
          aria-live="polite"
        >
          Found {searchResults.length} session(s) across all projects
        </div>
      )}
    </div>
  )
})
