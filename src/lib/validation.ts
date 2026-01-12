/**
 * Type guards and validation utilities for runtime type checking
 *
 * These functions provide type-safe validation of user input and localStorage values,
 * preventing unsafe type assertions that could lead to runtime errors.
 */

import type { Theme } from './ThemeContext'
import type { SandboxMode, ApprovalPolicy, ReasoningEffort, ReasoningSummary } from '../stores/settings'

/**
 * Validates if a value is a valid Theme
 */
export function isValidTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

/**
 * Validates if a value is a valid SandboxMode
 */
export function isValidSandboxMode(value: unknown): value is SandboxMode {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access'
}

/**
 * Validates if a value is a valid ApprovalPolicy
 */
export function isValidApprovalPolicy(value: unknown): value is ApprovalPolicy {
  return value === 'on-request' || value === 'on-failure' || value === 'never' || value === 'untrusted'
}

/**
 * Validates if a value is a valid ReasoningEffort
 */
export function isValidReasoningEffort(value: unknown): value is ReasoningEffort {
  return value === 'none' || value === 'minimal' || value === 'low' ||
         value === 'medium' || value === 'high' || value === 'xhigh'
}

/**
 * Validates if a value is a valid ReasoningSummary
 */
export function isValidReasoningSummary(value: unknown): value is ReasoningSummary {
  return value === 'none' || value === 'concise' || value === 'detailed'
}

/**
 * Safely parses and validates a Theme from localStorage
 * @param value The value from localStorage
 * @param fallback The default value if validation fails
 */
export function parseTheme(value: unknown, fallback: Theme = 'system'): Theme {
  if (typeof value !== 'string') return fallback
  return isValidTheme(value) ? value : fallback
}

/**
 * Safely parses and validates a SandboxMode from user input
 * @param value The value from user input
 * @param fallback The default value if validation fails
 */
export function parseSandboxMode(value: unknown, fallback: SandboxMode): SandboxMode {
  return isValidSandboxMode(value) ? value : fallback
}

/**
 * Safely parses and validates an ApprovalPolicy from user input
 * @param value The value from user input
 * @param fallback The default value if validation fails
 */
export function parseApprovalPolicy(value: unknown, fallback: ApprovalPolicy): ApprovalPolicy {
  return isValidApprovalPolicy(value) ? value : fallback
}

/**
 * Safely parses and validates a ReasoningEffort from user input
 * @param value The value from user input
 * @param fallback The default value if validation fails
 */
export function parseReasoningEffort(value: unknown, fallback: ReasoningEffort): ReasoningEffort {
  return isValidReasoningEffort(value) ? value : fallback
}

/**
 * Safely parses and validates a ReasoningSummary from user input
 * @param value The value from user input
 * @param fallback The default value if validation fails
 */
export function parseReasoningSummary(value: unknown, fallback: ReasoningSummary): ReasoningSummary {
  return isValidReasoningSummary(value) ? value : fallback
}
