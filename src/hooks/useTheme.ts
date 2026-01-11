import { useContext } from 'react'
import { ThemeContext, type ThemeContextValue } from '../lib/ThemeContext'

/**
 * Hook to access the current theme context
 * @returns ThemeContextValue containing theme, resolvedTheme, and setTheme
 * @throws Error if used outside of ThemeProvider
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
