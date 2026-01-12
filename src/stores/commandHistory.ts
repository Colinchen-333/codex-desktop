/**
 * Command History Store
 *
 * Manages the history of user commands for up/down arrow navigation.
 * Persisted to localStorage for cross-session persistence.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CommandHistoryState {
  /** Command history array (newest at end) */
  history: string[]
  /** Current cursor position (-1 = not navigating, 0 = oldest, length-1 = newest) */
  cursor: number
  /** Maximum number of commands to store */
  maxHistory: number
  /** Temporary input saved when navigating */
  savedInput: string

  // Actions
  /** Add a command to history (deduplicates consecutive identical commands) */
  add: (command: string) => void
  /** Navigate to previous command (up arrow) */
  getPrevious: (currentInput: string) => string | null
  /** Navigate to next command (down arrow) */
  getNext: () => string | null
  /** Reset cursor to end (when user types new content) */
  resetCursor: () => void
  /** Clear all history */
  clear: () => void
}

const DEFAULT_MAX_HISTORY = 100

export const useCommandHistoryStore = create<CommandHistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      cursor: -1,
      maxHistory: DEFAULT_MAX_HISTORY,
      savedInput: '',

      add: (command: string) => {
        const trimmed = command.trim()
        if (!trimmed) return

        set((state) => {
          // Skip if the last command is identical (deduplication)
          if (state.history.length > 0 && state.history[state.history.length - 1] === trimmed) {
            return { cursor: -1, savedInput: '' }
          }

          // Add to history, respecting max limit
          const newHistory = [...state.history, trimmed]
          if (newHistory.length > state.maxHistory) {
            newHistory.shift() // Remove oldest
          }

          return {
            history: newHistory,
            cursor: -1,
            savedInput: '',
          }
        })
      },

      getPrevious: (currentInput: string) => {
        const state = get()
        const { history, cursor } = state

        if (history.length === 0) return null

        // If not navigating yet, save current input and start from the end
        if (cursor === -1) {
          const newCursor = history.length - 1
          set({ cursor: newCursor, savedInput: currentInput })
          return history[newCursor]
        }

        // Move up in history
        if (cursor > 0) {
          const newCursor = cursor - 1
          set({ cursor: newCursor })
          return history[newCursor]
        }

        // Already at oldest, return current
        return history[cursor]
      },

      getNext: () => {
        const state = get()
        const { history, cursor, savedInput } = state

        // Not navigating
        if (cursor === -1) return null

        // Move down in history
        if (cursor < history.length - 1) {
          const newCursor = cursor + 1
          set({ cursor: newCursor })
          return history[newCursor]
        }

        // At the end, restore saved input
        set({ cursor: -1, savedInput: '' })
        return savedInput
      },

      resetCursor: () => {
        const state = get()
        if (state.cursor !== -1) {
          set({ cursor: -1, savedInput: '' })
        }
      },

      clear: () => {
        set({ history: [], cursor: -1, savedInput: '' })
      },
    }),
    {
      name: 'codex-command-history',
      version: 1,
      partialize: (state) => ({
        // Only persist history and maxHistory, not cursor or savedInput
        history: state.history,
        maxHistory: state.maxHistory,
      }),
    }
  )
)
