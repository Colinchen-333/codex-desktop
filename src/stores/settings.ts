import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  normalizeApprovalPolicy,
  normalizeReasoningEffort,
  normalizeReasoningSummary,
  normalizeSandboxMode,
} from '../lib/normalize'

// Reasoning effort levels supported by Codex (matches API schema)
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

// Reasoning summary levels
export type ReasoningSummary = 'none' | 'concise' | 'detailed'

// Sandbox modes matching Codex CLI
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

// Approval policies matching Codex CLI
export type ApprovalPolicy = 'on-request' | 'on-failure' | 'never' | 'untrusted'

export interface Settings {
  model: string
  sandboxMode: SandboxMode
  approvalPolicy: ApprovalPolicy
  reasoningEffort: ReasoningEffort
  reasoningSummary: ReasoningSummary
}

const defaultSettings: Settings = {
  model: '', // Empty means use API default
  sandboxMode: 'workspace-write',
  approvalPolicy: 'on-request', // Ask before changes
  reasoningEffort: 'medium',
  reasoningSummary: 'concise',
}

export interface SettingsState {
  settings: Settings

  // Actions
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  resetSettings: () => void
}

// Valid values for settings (used for migration)
const VALID_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']
const VALID_APPROVAL_POLICIES = ['on-request', 'on-failure', 'never', 'untrusted']

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,

      updateSetting: (key, value) => {
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        }))
      },

      resetSettings: () => {
        set({ settings: defaultSettings })
      },
    }),
    {
      name: 'codex-desktop-settings',
      version: 3, // Increment when settings format changes
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== 'object' || !('settings' in persistedState)) {
          return { settings: defaultSettings }
        }

        const state = persistedState as { settings?: Partial<Settings> }
        const settings: Settings = { ...defaultSettings, ...(state.settings ?? {}) }

        // Migrate from version 0/1 to version 2
        if (version < 2) {
          // Reset invalid sandbox mode
          if (!VALID_SANDBOX_MODES.includes(settings.sandboxMode)) {
            settings.sandboxMode = defaultSettings.sandboxMode
          }
          // Reset invalid approval policy
          if (!VALID_APPROVAL_POLICIES.includes(settings.approvalPolicy)) {
            settings.approvalPolicy = defaultSettings.approvalPolicy
          }
          // Reset invalid model (let API choose default)
          if (settings.model && !settings.model.includes('gpt') && !settings.model.includes('o1') && !settings.model.includes('o3')) {
            settings.model = ''
          }
        }

        if (version < 3) {
          settings.sandboxMode =
            (normalizeSandboxMode(settings.sandboxMode) as Settings['sandboxMode']) ||
            defaultSettings.sandboxMode
          settings.approvalPolicy =
            (normalizeApprovalPolicy(settings.approvalPolicy) as Settings['approvalPolicy']) ||
            defaultSettings.approvalPolicy
          settings.reasoningEffort =
            (normalizeReasoningEffort(settings.reasoningEffort) as Settings['reasoningEffort']) ||
            defaultSettings.reasoningEffort
          settings.reasoningSummary =
            (normalizeReasoningSummary(settings.reasoningSummary) as Settings['reasoningSummary']) ||
            defaultSettings.reasoningSummary
        }

        return { settings }
      },
    }
  )
)

// Helper to get settings for thread start
export function getThreadSettings(settings: Settings) {
  return {
    model: settings.model,
    sandbox: settings.sandboxMode,
    approvalPolicy: settings.approvalPolicy,
    reasoningEffort: settings.reasoningEffort,
    reasoningSummary: settings.reasoningSummary,
  }
}

// Project-specific settings interface (stored in project.settingsJson)
export interface ProjectSettings {
  cwd?: string
  envVars?: Record<string, string>
  model?: string
  sandboxMode?: string
  askForApproval?: string // maps to approvalPolicy
  [key: string]: unknown // Index signature to allow additional properties from JSON
}

// Helper to merge project settings with global settings
// Project settings override global settings when present
export function mergeProjectSettings(
  globalSettings: Settings,
  projectSettingsJson: string | null
): Settings {
  if (!projectSettingsJson) {
    return globalSettings
  }

  try {
    const projectSettings: ProjectSettings = JSON.parse(projectSettingsJson)
    return {
      ...globalSettings,
      // Override with project settings if they exist and are valid
      model: projectSettings.model || globalSettings.model,
      sandboxMode:
        (normalizeSandboxMode(projectSettings.sandboxMode) as SandboxMode) ||
        globalSettings.sandboxMode,
      approvalPolicy:
        (normalizeApprovalPolicy(projectSettings.askForApproval) as ApprovalPolicy) ||
        globalSettings.approvalPolicy,
    }
  } catch {
    // Invalid JSON, return global settings
    return globalSettings
  }
}

// Helper to get the effective working directory for a project
export function getEffectiveWorkingDirectory(
  projectPath: string,
  projectSettingsJson: string | null
): string {
  if (!projectSettingsJson) {
    return projectPath
  }

  try {
    const projectSettings: ProjectSettings = JSON.parse(projectSettingsJson)
    return projectSettings.cwd || projectPath
  } catch {
    return projectPath
  }
}

// Sandbox mode options for UI
export const SANDBOX_MODE_OPTIONS: { value: SandboxMode; label: string; description: string }[] = [
  { value: 'read-only', label: 'Read Only', description: 'Can only read files, no modifications' },
  { value: 'workspace-write', label: 'Workspace Write', description: 'Can modify files in workspace (Recommended)' },
  { value: 'danger-full-access', label: 'Full Access', description: 'Full system access (Use with caution)' },
]

// Approval policy options for UI
export const APPROVAL_POLICY_OPTIONS: { value: ApprovalPolicy; label: string; description: string }[] = [
  { value: 'on-request', label: 'On Request', description: 'Ask before any changes (Safest)' },
  { value: 'on-failure', label: 'On Failure', description: 'Auto-apply, ask only on failures' },
  { value: 'untrusted', label: 'Unless Trusted', description: 'Auto-apply only for trusted projects' },
  { value: 'never', label: 'Never', description: 'Apply all changes automatically (Risky)' },
]

// Reasoning effort descriptions (kept for reference, but API provides actual options)
export const REASONING_EFFORT_OPTIONS: { value: ReasoningEffort; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'No extended thinking' },
  { value: 'minimal', label: 'Minimal', description: 'Brief consideration' },
  { value: 'low', label: 'Low', description: 'Light reasoning' },
  { value: 'medium', label: 'Medium', description: 'Balanced thinking (Default)' },
  { value: 'high', label: 'High', description: 'Deep analysis' },
  { value: 'xhigh', label: 'Maximum', description: 'Extensive reasoning' },
]

export const REASONING_SUMMARY_OPTIONS: { value: ReasoningSummary; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'No reasoning summary' },
  { value: 'concise', label: 'Concise', description: 'Brief summary (Default)' },
  { value: 'detailed', label: 'Detailed', description: 'Comprehensive summary' },
]
