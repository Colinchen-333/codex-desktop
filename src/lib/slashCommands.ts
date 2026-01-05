// Slash Commands Configuration
// Based on Codex CLI slash commands

export interface SlashCommand {
  name: string
  description: string
  aliases?: string[]
  icon?: string
  category: 'general' | 'tools' | 'settings' | 'workflow'
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // General commands
  {
    name: 'help',
    description: 'Show help and available commands',
    category: 'general',
    icon: '❓',
  },
  {
    name: 'clear',
    description: 'Clear the conversation history',
    category: 'general',
    icon: '🗑️',
  },
  {
    name: 'compact',
    description: 'Summarize and compact conversation context',
    category: 'general',
    icon: '📦',
  },
  {
    name: 'undo',
    description: 'Undo the last action',
    category: 'general',
    icon: '↩️',
  },

  // Tools commands
  {
    name: 'bash',
    description: 'Execute a shell command',
    category: 'tools',
    icon: '💻',
  },
  {
    name: 'browser',
    description: 'Open a URL in the browser',
    category: 'tools',
    icon: '🌐',
  },
  {
    name: 'search',
    description: 'Search codebase or web',
    category: 'tools',
    icon: '🔍',
  },

  // Settings commands
  {
    name: 'model',
    description: 'Switch to a different model',
    category: 'settings',
    icon: '🤖',
  },
  {
    name: 'provider',
    description: 'Switch model provider',
    category: 'settings',
    icon: '🔄',
  },
  {
    name: 'approval',
    description: 'Change approval policy',
    aliases: ['approval-mode'],
    category: 'settings',
    icon: '✅',
  },
  {
    name: 'sandbox',
    description: 'Change sandbox mode',
    category: 'settings',
    icon: '📦',
  },

  // Workflow commands
  {
    name: 'commit',
    description: 'Create a git commit',
    category: 'workflow',
    icon: '📝',
  },
  {
    name: 'pr',
    description: 'Create a pull request',
    aliases: ['pull-request'],
    category: 'workflow',
    icon: '🔀',
  },
  {
    name: 'review',
    description: 'Review code changes',
    category: 'workflow',
    icon: '👀',
  },
  {
    name: 'test',
    description: 'Run tests',
    category: 'workflow',
    icon: '🧪',
  },
  {
    name: 'lint',
    description: 'Run linter',
    category: 'workflow',
    icon: '✨',
  },
  {
    name: 'format',
    description: 'Format code',
    category: 'workflow',
    icon: '🎨',
  },
]

/**
 * Filter commands based on input
 */
export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return []

  const query = input.slice(1).toLowerCase()
  if (!query) return SLASH_COMMANDS

  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query) ||
      cmd.aliases?.some((alias) => alias.toLowerCase().includes(query)) ||
      cmd.description.toLowerCase().includes(query)
  )
}

/**
 * Check if input is a complete slash command
 */
export function isCompleteCommand(input: string): SlashCommand | null {
  if (!input.startsWith('/')) return null

  const parts = input.slice(1).split(/\s+/)
  const cmdName = parts[0]?.toLowerCase()

  return (
    SLASH_COMMANDS.find(
      (cmd) =>
        cmd.name.toLowerCase() === cmdName ||
        cmd.aliases?.some((alias) => alias.toLowerCase() === cmdName)
    ) || null
  )
}

/**
 * Get command categories
 */
export const COMMAND_CATEGORIES: Record<SlashCommand['category'], string> = {
  general: 'General',
  tools: 'Tools',
  settings: 'Settings',
  workflow: 'Workflow',
}
