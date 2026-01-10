/**
 * ColorizedOutput - Colorize diff output like CLI
 * Optimized with custom memo comparison to only re-render when text content changes
 */
import { memo, useMemo } from 'react'

interface ColorizedOutputProps {
  text: string
}

export const ColorizedOutput = memo(
  function ColorizedOutput({ text }: ColorizedOutputProps) {
    const lines = useMemo(() => text.split('\n'), [text])

    const lineClasses = useMemo(
      () =>
        lines.map((line) => {
          if (line.startsWith('+') && !line.startsWith('+++'))
            return 'text-green-600 dark:text-green-400'
          if (line.startsWith('-') && !line.startsWith('---'))
            return 'text-red-600 dark:text-red-400'
          if (line.startsWith('@@') || line.startsWith('diff --git'))
            return 'text-cyan-600 dark:text-cyan-400'
          return ''
        }),
      [lines]
    )

    return (
      <>
        {lines.map((line, i) => (
          <span key={i} className={lineClasses[i]}>
            {line}
            {i < lines.length - 1 && '\n'}
          </span>
        ))}
      </>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if text content actually changes
    // This prevents unnecessary re-renders when parent components update
    return prevProps.text === nextProps.text
  }
)
