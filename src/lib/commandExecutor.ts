// Command Executor for Slash Commands
// Handles execution of slash commands with proper context

import { SLASH_COMMANDS, type SlashCommand } from './slashCommands'

export interface CommandContext {
  clearThread: () => void
  sendMessage: (text: string, images?: string[]) => Promise<void>
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void
  addInfoItem?: (title: string, details?: string) => void
  openSettingsTab?: (tab: 'model' | 'safety') => void
  startNewSession?: () => Promise<void>
  resumeSession?: (sessionId?: string) => Promise<void>
  showStatus?: () => void
  showDiff?: () => Promise<void>
  listSkills?: () => Promise<void>
  listMcp?: () => Promise<void>
  startReview?: (args: string[]) => Promise<void>
  logout?: () => Promise<void>
  quit?: () => void
  insertText?: (text: string) => void
  openUrl?: (url: string) => void
}

export interface CommandResult {
  executed: boolean
  message?: string
  error?: string
}

// Commands that can be executed immediately without sending to the AI
const IMMEDIATE_COMMANDS = ['new', 'resume', 'mention', 'status', 'diff', 'skills', 'mcp']

/**
 * Parse a slash command from input text
 */
export function parseCommand(input: string): { command: SlashCommand | null; args: string[] } {
  if (!input.startsWith('/')) {
    return { command: null, args: [] }
  }

  const parts = input.slice(1).split(/\s+/)
  const cmdName = parts[0]?.toLowerCase()
  const args = parts.slice(1)

  const command = SLASH_COMMANDS.find(
    (cmd) =>
      cmd.name.toLowerCase() === cmdName ||
      cmd.aliases?.some((alias) => alias.toLowerCase() === cmdName)
  )

  return { command: command || null, args }
}

/**
 * Check if a command can be executed immediately (without AI)
 */
export function canExecuteImmediately(command: SlashCommand): boolean {
  return IMMEDIATE_COMMANDS.includes(command.name)
}

/**
 * Execute an immediate command
 */
export async function executeImmediateCommand(
  command: SlashCommand,
  args: string[],
  context: CommandContext
): Promise<CommandResult> {
  switch (command.name) {
    case 'new':
      if (context.startNewSession) {
        await context.startNewSession()
        return { executed: true }
      }
      return { executed: false }

    case 'resume':
      if (context.resumeSession) {
        await context.resumeSession(args[0])
        return { executed: true }
      }
      return { executed: false }

    case 'mention':
      context.insertText?.('@')
      return { executed: true }

    case 'status':
      context.showStatus?.()
      return { executed: true }

    case 'diff':
      if (context.showDiff) {
        await context.showDiff()
        return { executed: true }
      }
      return { executed: false }

    case 'skills':
      context.insertText?.('$')
      if (context.listSkills) {
        await context.listSkills()
      }
      return { executed: true }

    case 'mcp':
      if (context.listMcp) {
        await context.listMcp()
        return { executed: true }
      }
      return { executed: false }

    default:
      return { executed: false, error: `Unknown immediate command: ${command.name}` }
  }
}

/**
 * Format a command for sending to AI
 * Converts slash commands to natural language prompts
 */
export function formatCommandForAI(command: SlashCommand, args: string[]): string {
  const argsStr = args.join(' ')

  switch (command.name) {
    case 'compact':
      return 'Please summarize our conversation so far and compact the context.'

    case 'review':
      return argsStr
        ? `Review the code changes in: ${argsStr}`
        : 'Please review the recent code changes.'

    case 'init':
      return 'Create an AGENTS.md contributor guide for this repository.'

    default:
      return `/${command.name} ${argsStr}`.trim()
  }
}

/**
 * Execute a slash command
 * Returns true if the command was handled (either executed or sent to AI)
 */
export async function executeCommand(
  input: string,
  context: CommandContext
): Promise<{ handled: boolean; insertText?: string }> {
  const { command, args } = parseCommand(input)

  if (!command) {
    return { handled: false }
  }

  // Handle immediate commands
  if (canExecuteImmediately(command)) {
    await executeImmediateCommand(command, args, context)
    return { handled: true }
  }

  // Settings commands
  if (command.name === 'model') {
    context.openSettingsTab?.('model')
    return { handled: true }
  }
  if (command.name === 'approvals') {
    context.openSettingsTab?.('safety')
    return { handled: true }
  }

  // Native actions
  if (command.name === 'review') {
    if (context.startReview) {
      await context.startReview(args)
      return { handled: true }
    }
  }
  if (command.name === 'logout') {
    await context.logout?.()
    return { handled: true }
  }
  if (command.name === 'quit' || command.name === 'exit') {
    context.quit?.()
    return { handled: true }
  }
  if (command.name === 'feedback') {
    context.openUrl?.('https://github.com/openai/codex/issues')
    return { handled: true }
  }
  if (command.name === 'rollout') {
    context.addInfoItem?.('Rollout path', 'Rollout path is not exposed in Codex Desktop yet.')
    return { handled: true }
  }
  if (command.name === 'test-approval') {
    context.addInfoItem?.('Approval test', 'Approval testing is not wired in Codex Desktop yet.')
    return { handled: true }
  }

  // Fallback to AI for supported prompts
  if (['compact', 'init'].includes(command.name)) {
    const prompt = formatCommandForAI(command, args)
    await context.sendMessage(prompt)
    return { handled: true }
  }

  return { handled: false }
}
