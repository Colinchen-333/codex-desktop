/**
 * Centralized logging utility for the application
 *
 * Features:
 * - Log levels: debug, info, warn, error
 * - In-memory log storage for debugging (max 1000 entries)
 * - Development-only console output
 * - Context-aware logging with timestamps
 * - Emoji indicators for quick visual scanning
 */

/* eslint-disable no-console -- This is the logger implementation that uses console methods */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
  context?: string
}

class Logger {
  private isDev = import.meta.env.DEV
  private logs: LogEntry[] = []
  private maxLogs = 1000

  private log(level: LogLevel, message: string, context?: string) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context
    }

    // Store in memory for debugging
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // Console output in development
    if (this.isDev) {
      const timestamp = new Date(entry.timestamp).toISOString()
      const prefix = context ? `[${context}]` : ''
      const emoji = { debug: '🐛', info: 'ℹ️', warn: '⚠️', error: '❌' }[level]

      console[level](`${timestamp} ${emoji} ${prefix}`, message)
    }
  }

  debug(message: string, context?: string) {
    this.log('debug', message, context)
  }

  info(message: string, context?: string) {
    this.log('info', message, context)
  }

  warn(message: string, context?: string) {
    this.log('warn', message, context)
  }

  error(message: string, context?: string) {
    this.log('error', message, context)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs = []
  }
}

export const logger = new Logger()

// Convenience functions for cleaner imports
export const log = {
  debug: (msg: string, ctx?: string) => logger.debug(msg, ctx),
  info: (msg: string, ctx?: string) => logger.info(msg, ctx),
  warn: (msg: string, ctx?: string) => logger.warn(msg, ctx),
  error: (msg: string, ctx?: string) => logger.error(msg, ctx),
}
