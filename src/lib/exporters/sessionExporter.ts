/**
 * Session Exporter
 *
 * Exports session/thread data to various formats (Markdown, JSON)
 */

import { threadApi } from '../api'
import type { ThreadInfo } from '../api'
import { logError } from '../errorUtils'

export type ExportFormat = 'markdown' | 'json'

export interface ExportOptions {
  includeMetadata?: boolean
  includeTimestamps?: boolean
}

// Type for raw thread items from API
type RawThreadItem = {
  id: string
  type: string
  status?: string
  createdAt?: number
  content?: unknown
  [key: string]: unknown
}

/**
 * Formats a timestamp to a human-readable date string
 */
function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toISOString().split('T')[0] + ' ' + date.toTimeString().slice(0, 5)
}

/**
 * Formats thread items as Markdown
 */
function formatItemAsMarkdown(item: RawThreadItem): string {
  let markdown = ''
  const type = item.type
  const content = item.content as Record<string, unknown> | undefined

  switch (type) {
    case 'userMessage': {
      markdown += `## User\n\n`
      const text = content?.text || ''
      const images = content?.images as string[] | undefined
      if (typeof text === 'string' && text) {
        markdown += `${text}\n\n`
      }
      if (images && images.length > 0) {
        markdown += `*Images: ${images.length} attached*\n\n`
      }
      break
    }

    case 'agentMessage': {
      markdown += `## Agent\n\n`
      const text = item.text as string | undefined
      if (text) {
        markdown += `${text}\n\n`
      }
      break
    }

    case 'commandExecution': {
      markdown += `### Command\n\n`
      const command = content?.command
      const commandStr = Array.isArray(command) ? command.join(' ') : String(command || '')
      markdown += `\`\`\`bash\n${commandStr}\n\`\`\`\n\n`

      const output = content?.output || item.aggregatedOutput
      if (output) {
        markdown += `**Output**:\n\`\`\`\n${output}\n\`\`\`\n\n`
      }
      const exitCode = content?.exitCode as number | undefined
      if (exitCode !== undefined) {
        const status = exitCode === 0 ? '✓ Success' : `✗ Exit ${exitCode}`
        markdown += `*${status}*\n\n`
      }
      break
    }

    case 'fileChange': {
      markdown += `### File Changes\n\n`
      const changes = content?.changes as Array<{ path?: string; kind?: string; diff?: string }> | undefined
      if (changes && changes.length > 0) {
        changes.forEach((change) => {
          const icon = change.kind === 'add' ? '+' : change.kind === 'delete' ? '-' : '~'
          markdown += `- ${icon} ${change.path || 'unknown'}\n`
        })
        markdown += '\n'
      }
      if (changes && changes[0]?.diff) {
        markdown += `**Diff**:\n\`\`\`diff\n${changes[0].diff}\n\`\`\`\n\n`
      }
      break
    }

    case 'reasoning': {
      const summary = content?.summary as string[] | undefined
      if (summary && summary.length > 0) {
        markdown += `### Reasoning\n\n`
        summary.forEach((point, idx) => {
          markdown += `${idx + 1}. ${point}\n`
        })
        markdown += '\n'
      }
      break
    }

    case 'mcpToolCall': {
      markdown += `### MCP Tool: ${item.tool || 'Unknown'}\n\n`
      markdown += `*Server: ${item.server || 'Unknown'}*\n\n`
      const args = item.arguments
      if (args) {
        markdown += `**Arguments**:\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n\n`
      }
      const result = item.result
      if (result) {
        markdown += `**Result**:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\n`
      }
      const error = item.error as { message?: string } | string | undefined
      if (error) {
        const errorMsg = typeof error === 'string' ? error : error.message || 'Unknown error'
        markdown += `**Error**: ${errorMsg}\n\n`
      }
      break
    }

    case 'webSearch': {
      markdown += `### Web Search\n\n`
      const query = content?.query || item.query
      markdown += `*Query: ${query}*\n\n`
      const results = content?.results as Array<{ title?: string; url?: string; snippet?: string }> | undefined
      if (results && results.length > 0) {
        markdown += `**Results**:\n\n`
        results.forEach((result) => {
          markdown += `- [${result.title || 'No title'}](${result.url || '#'})\n`
          if (result.snippet) {
            markdown += `  ${result.snippet}\n`
          }
          markdown += '\n'
        })
      }
      break
    }

    case 'enteredReviewMode':
    case 'exitedReviewMode': {
      markdown += `### Review\n\n`
      const phase = type === 'enteredReviewMode' ? 'Review Started' : 'Review Completed'
      markdown += `*${phase}*\n\n`
      const reviewText = content?.review || item.review
      if (reviewText) {
        markdown += `${reviewText}\n\n`
      }
      break
    }

    case 'imageView': {
      markdown += `### Image View\n\n`
      const path = content?.path || item.path
      if (path) {
        markdown += `*Image: ${path}*\n\n`
      }
      break
    }

    default: {
      markdown += `### ${type}\n\n`
      // Try to include any available text content
      const text = item.text as string | undefined
      if (text) {
        markdown += `${text}\n\n`
      }
    }
  }

  return markdown
}

/**
 * Converts session data to Markdown format
 */
function convertToMarkdown(
  threadInfo: ThreadInfo,
  items: RawThreadItem[],
  options: ExportOptions
): string {
  const { includeMetadata = true, includeTimestamps = true } = options

  let markdown = ''

  // Header
  const title = threadInfo.preview || 'Untitled Session'
  markdown += `# Codex Session: ${title}\n\n`

  // Metadata
  if (includeMetadata) {
    markdown += '---\n\n'
    if (threadInfo.cwd) {
      markdown += `**Project**: \`${threadInfo.cwd}\`\n\n`
    }
    if (threadInfo.model) {
      markdown += `**Model**: ${threadInfo.model}\n\n`
    }
    if (threadInfo.modelProvider) {
      markdown += `**Provider**: ${threadInfo.modelProvider}\n\n`
    }
    if (threadInfo.createdAt) {
      markdown += `**Date**: ${formatTimestamp(threadInfo.createdAt)}\n\n`
    }
    if (threadInfo.gitInfo) {
      const gitInfo: string[] = []
      if (threadInfo.gitInfo.branch) gitInfo.push(`branch: ${threadInfo.gitInfo.branch}`)
      if (threadInfo.gitInfo.sha) gitInfo.push(`commit: ${threadInfo.gitInfo.sha.slice(0, 8)}`)
      if (gitInfo.length > 0) {
        markdown += `**Git**: ${gitInfo.join(', ')}\n\n`
      }
    }
    markdown += '---\n\n'
  }

  // Items
  items.forEach((item) => {
    if (includeTimestamps && item.createdAt) {
      markdown += `*${formatTimestamp(item.createdAt)}*\n\n`
    }
    markdown += formatItemAsMarkdown(item)
  })

  return markdown
}

/**
 * Converts session data to JSON format
 */
function convertToJSON(
  threadInfo: ThreadInfo,
  items: RawThreadItem[],
  options: ExportOptions
): string {
  const { includeMetadata = true, includeTimestamps = true } = options

  const data: {
    metadata?: Record<string, unknown>
    items: RawThreadItem[]
  } = {
    items: items.map((item) => ({
      ...item,
      createdAt: includeTimestamps ? item.createdAt : undefined,
    })),
  }

  if (includeMetadata) {
    data.metadata = {
      id: threadInfo.id,
      cwd: threadInfo.cwd,
      model: threadInfo.model,
      modelProvider: threadInfo.modelProvider,
      preview: threadInfo.preview,
      createdAt: threadInfo.createdAt,
      cliVersion: threadInfo.cliVersion,
      gitInfo: threadInfo.gitInfo,
    }
  }

  return JSON.stringify(data, null, 2)
}

/**
 * Triggers a browser download for the given content
 */
function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generates a filename for the export
 */
function generateFilename(threadInfo: ThreadInfo, format: ExportFormat): string {
  const title = threadInfo.preview || 'session'
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
  const date = new Date().toISOString().split('T')[0]
  return `codex_${sanitizedTitle}_${date}.${format === 'markdown' ? 'md' : 'json'}`
}

/**
 * Exports a session to the specified format
 *
 * @param sessionId - The session/thread ID to export
 * @param format - The export format ('markdown' or 'json')
 * @param options - Export options
 * @returns Promise that resolves when the export is complete
 */
export async function exportSession(
  sessionId: string,
  format: ExportFormat,
  options: ExportOptions = {}
): Promise<void> {
  try {
    // Fetch thread data
    const response = await threadApi.resume(sessionId)

    // Filter valid items
    const items: RawThreadItem[] = response.items.filter(
      (item): item is RawThreadItem =>
        !!item && typeof item === 'object' && 'id' in item && 'type' in item
    )

    // Convert to requested format
    let content: string
    let mimeType: string

    if (format === 'markdown') {
      content = convertToMarkdown(response.thread, items, options)
      mimeType = 'text/markdown'
    } else {
      content = convertToJSON(response.thread, items, options)
      mimeType = 'application/json'
    }

    // Trigger download
    const filename = generateFilename(response.thread, format)
    triggerDownload(content, filename, mimeType)
  } catch (error) {
    logError(error, {
      context: 'exportSession',
      source: 'sessionExporter',
      details: 'Failed to export session'
    })
    throw new Error(`Failed to export session: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
