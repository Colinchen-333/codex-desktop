// Command Executor for Slash Commands
// Handles execution of slash commands with proper context

import { SLASH_COMMANDS, type SlashCommand } from './slashCommands'
import { normalizeApprovalPolicy } from './normalize'

export interface CommandContext {
  clearThread: () => void
  sendMessage: (text: string, images?: string[]) => Promise<void>
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void
  addInfoItem?: (title: string, details?: string) => void
  openSettingsTab?: (tab: 'model' | 'safety') => void
  openHelpDialog?: () => void
  openSessionsPanel?: () => void
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
  compactConversation?: (instructions?: string) => Promise<void>
  generateBugReport?: () => Promise<void>
  // Session overrides for /model and /approvals
  setModelOverride?: (model: string) => void
  setApprovalOverride?: (policy: string) => void
  getAvailableModels?: () => Promise<Array<{ id: string; displayName: string }>>
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

  // Clear command - like CLI, clears conversation
  if (command.name === 'clear') {
    context.clearThread()
    context.showToast?.('Conversation cleared', 'success')
    return { handled: true }
  }

  // Help command - open keyboard shortcuts / help dialog
  if (command.name === 'help') {
    if (context.openHelpDialog) {
      context.openHelpDialog()
    } else {
      context.addInfoItem?.('Help', 'Use ? key to open keyboard shortcuts dialog.')
    }
    return { handled: true }
  }

  // Sessions command - open sessions panel
  if (command.name === 'sessions') {
    if (context.openSessionsPanel) {
      context.openSessionsPanel()
    }
    return { handled: true }
  }

  // Settings commands - support CLI-style inline overrides
  if (command.name === 'model') {
    if (args.length > 0 && context.setModelOverride) {
      // /model <model-name> - set model override for this session
      const modelArg = args.join(' ')
      context.setModelOverride(modelArg)
      context.addInfoItem?.('Model Override', `Model set to "${modelArg}" for this session`)
      return { handled: true }
    }
    // No args - open settings to select model
    context.openSettingsTab?.('model')
    return { handled: true }
  }
  if (command.name === 'approvals') {
    if (args.length > 0 && context.setApprovalOverride) {
      // /approvals <policy> - set approval policy override for this session
      const policyArg = args[0]
      const normalized = normalizeApprovalPolicy(policyArg)
      if (normalized) {
        context.setApprovalOverride(normalized)
        context.addInfoItem?.('Approval Override', `Approval policy set to "${normalized}" for this session`)
        return { handled: true }
      }
      context.showToast?.(`Invalid policy: ${policyArg}. Valid: never, on-request, on-failure, unless-trusted`, 'error')
      return { handled: true }
    }
    // No args - open settings
    context.openSettingsTab?.('safety')
    return { handled: true }
  }

  // Compact command - like CLI, uses API to compact conversation
  if (command.name === 'compact') {
    if (context.compactConversation) {
      await context.compactConversation(args.join(' ') || undefined)
    } else {
      // Fallback: send as AI message if compactConversation not available
      const prompt = formatCommandForAI(command, args)
      await context.sendMessage(prompt)
    }
    return { handled: true }
  }

  // Bug report command - like CLI, generates GitHub issue URL
  if (command.name === 'bug') {
    if (context.generateBugReport) {
      await context.generateBugReport()
    } else {
      context.openUrl?.('https://github.com/anthropics/claude-code/issues/new')
    }
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
    context.openUrl?.('https://github.com/anthropics/claude-code/issues')
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

  // Fallback to AI for init command
  if (command.name === 'init') {
    const prompt = formatCommandForAI(command, args)
    await context.sendMessage(prompt)
    return { handled: true }
  }

  return { handled: false }
}
