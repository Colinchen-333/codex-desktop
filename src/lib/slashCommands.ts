// Slash Commands Configuration
// Based on Codex CLI slash commands
// Uses Lucide icon names for consistent styling

export interface SlashCommand {
  name: string
  description: string
  aliases?: string[]
  icon: string // Lucide icon name
  category: 'general' | 'tools' | 'settings' | 'workflow'
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Settings commands
  {
    name: 'model',
    description: 'Switch to a different model',
    category: 'settings',
    icon: 'cpu',
  },
  {
    name: 'approvals',
    description: 'Change approval policy and safety settings',
    category: 'settings',
    icon: 'shield-check',
  },

  // Tools commands
  {
    name: 'skills',
    description: 'List available skills and usage',
    category: 'tools',
    icon: 'wrench',
  },
  {
    name: 'review',
    description: 'Review current changes',
    category: 'workflow',
    icon: 'eye',
  },
  {
    name: 'new',
    description: 'Start a new chat session',
    category: 'general',
    icon: 'plus-circle',
  },
  {
    name: 'resume',
    description: 'Resume a saved chat session',
    category: 'general',
    icon: 'history',
  },
  {
    name: 'init',
    description: 'Create an AGENTS.md guide',
    category: 'workflow',
    icon: 'compass',
  },
  {
    name: 'compact',
    description: 'Summarize and compact conversation context',
    category: 'general',
    icon: 'package',
  },
  {
    name: 'diff',
    description: 'Show git diff (including untracked files)',
    category: 'tools',
    icon: 'git-compare',
  },
  {
    name: 'mention',
    description: 'Mention a file (insert @)',
    category: 'tools',
    icon: 'at-sign',
  },
  {
    name: 'status',
    description: 'Show current session status',
    category: 'general',
    icon: 'activity',
  },
  {
    name: 'mcp',
    description: 'List configured MCP tools',
    category: 'tools',
    icon: 'plug',
  },

  // General commands
  {
    name: 'logout',
    description: 'Log out of Codex',
    category: 'general',
    icon: 'log-out',
  },
  {
    name: 'quit',
    description: 'Quit Codex Desktop',
    category: 'general',
    icon: 'power',
  },
  {
    name: 'exit',
    description: 'Quit Codex Desktop',
    category: 'general',
    icon: 'power',
  },
  // Workflow commands
  {
    name: 'feedback',
    description: 'Send feedback to maintainers',
    category: 'workflow',
    icon: 'message-circle',
  },
  {
    name: 'rollout',
    description: 'Show rollout file path',
    category: 'workflow',
    icon: 'flask-conical',
  },
  {
    name: 'test-approval',
    description: 'Test approval request',
    category: 'workflow',
    icon: 'test-tube-2',
  },
  {
    name: 'help',
    description: 'Show available commands',
    category: 'general',
    icon: 'help-circle',
  },
  {
    name: 'clear',
    description: 'Clear the conversation',
    category: 'general',
    icon: 'trash-2',
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
 * Get command categories with icons
 */
export const COMMAND_CATEGORIES: Record<SlashCommand['category'], { label: string; icon: string }> = {
  general: { label: 'General', icon: 'layout-grid' },
  tools: { label: 'Tools', icon: 'wrench' },
  settings: { label: 'Settings', icon: 'settings' },
  workflow: { label: 'Workflow', icon: 'git-branch' },
}
