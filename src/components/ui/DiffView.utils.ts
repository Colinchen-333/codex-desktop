export type HunkAction = 'accept' | 'reject' | 'pending'

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface FileDiff {
  path: string
  kind: 'add' | 'modify' | 'delete' | 'rename'
  oldPath?: string
  hunks: DiffHunk[]
  raw?: string
}

// Helper to parse unified diff string
export function parseDiff(diffString: string): DiffHunk[] {
  const lines = diffString.split('\n')
  const hunks: DiffHunk[] = []
  let currentHunk: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/)
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk)
      }

      const oldStart = parseInt(hunkMatch[1])
      const oldLength = parseInt(hunkMatch[2] || '1')
      const newStart = parseInt(hunkMatch[3])
      const newLength = parseInt(hunkMatch[4] || '1')

      currentHunk = {
        oldStart,
        oldLines: oldLength,
        newStart,
        newLines: newLength,
        lines: []
      }

      oldLine = oldStart
      newLine = newStart
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNumber: newLine++
      })
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNumber: oldLine++
      })
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'context',
        content: line.slice(1),
        oldLineNumber: oldLine++,
        newLineNumber: newLine++
      })
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk)
  }

  return hunks
}