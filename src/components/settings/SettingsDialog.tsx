import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { serverApi, allowlistApi, type AccountInfo } from '../../lib/api'
import { useProjectsStore } from '../../stores/projects'
import { useTheme } from '../../lib/theme'
import {
  useSettingsStore,
  type Settings,
  type SandboxMode,
  type ApprovalPolicy,
  SANDBOX_MODE_OPTIONS,
  APPROVAL_POLICY_OPTIONS,
  REASONING_SUMMARY_OPTIONS,
} from '../../stores/settings'
import { useModelsStore, modelSupportsReasoning } from '../../stores/models'
import { useAppStore } from '../../stores/app'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}


export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { settingsTab: activeTab, setSettingsTab } = useAppStore()
  const { settings, updateSetting } = useSettingsStore()
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Fetch account info when dialog opens
      serverApi.getAccountInfo().then(setAccountInfo).catch(console.error)
    }
  }, [isOpen])

  const handleSave = () => {
    // Settings are already saved via zustand persist
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-[400px]">
          {/* Sidebar */}
          <div className="w-48 border-r border-border p-2">
            {[
              { id: 'general' as const, label: 'General', icon: '⚙️' },
              { id: 'model' as const, label: 'Model', icon: '🤖' },
              { id: 'safety' as const, label: 'Safety', icon: '🛡️' },
              { id: 'allowlist' as const, label: 'Allowlist', icon: '✅' },
              { id: 'account' as const, label: 'Account', icon: '👤' },
            ].map((tab) => (
              <button
                key={tab.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
                  activeTab === tab.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
                onClick={() => setSettingsTab(tab.id)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-6">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'model' && (
              <ModelSettings settings={settings} updateSetting={updateSetting} />
            )}
            {activeTab === 'safety' && (
              <SafetySettings settings={settings} updateSetting={updateSetting} />
            )}
            {activeTab === 'allowlist' && <AllowlistSettings />}
            {activeTab === 'account' && (
              <AccountSettings
                accountInfo={accountInfo}
                onRefresh={async () => {
                  const info = await serverApi.getAccountInfo()
                  setAccountInfo(info)
                }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={handleSave}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// General Settings
function GeneralSettings() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">General Settings</h3>

      <div>
        <label className="mb-2 block text-sm font-medium">Theme</label>
        <div className="flex gap-2">
          {[
            { value: 'light' as const, label: 'Light', icon: '☀️' },
            { value: 'dark' as const, label: 'Dark', icon: '🌙' },
            { value: 'system' as const, label: 'System', icon: '💻' },
          ].map((option) => (
            <button
              key={option.value}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
                theme === option.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50 hover:bg-accent'
              )}
              onClick={() => setTheme(option.value)}
            >
              <span>{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Choose your preferred color theme. System will automatically match your OS settings.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Reset Onboarding</label>
        <button
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={() => {
            localStorage.removeItem('codex-desktop-onboarded')
            window.location.reload()
          }}
        >
          Show Onboarding Again
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          This will show the welcome flow on next launch
        </p>
      </div>
    </div>
  )
}

// Model Settings
function ModelSettings({
  settings,
  updateSetting,
}: {
  settings: Settings
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}) {
  const { models, isLoading, error, fetchModels, getModelById, getDefaultModel } = useModelsStore()

  // Fetch models on mount
  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // Auto-select default model if none is selected
  useEffect(() => {
    if (!settings.model && models.length > 0) {
      const defaultModel = getDefaultModel()
      if (defaultModel) {
        updateSetting('model', defaultModel.model)
      }
    }
  }, [settings.model, models, getDefaultModel, updateSetting])

  const currentModel = getModelById(settings.model) || getDefaultModel()
  const supportsReasoning = currentModel ? modelSupportsReasoning(currentModel) : false

  // Get reasoning effort options from current model
  const reasoningEffortOptions = currentModel?.supportedReasoningEfforts || []

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Model Settings</h3>

      <div>
        <label className="mb-2 block text-sm font-medium">Default Model</label>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading models...
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-2">
            Failed to load models: {error}
            <button
              className="ml-2 text-primary underline"
              onClick={() => fetchModels()}
            >
              Retry
            </button>
          </div>
        ) : models.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            No models available. Make sure Codex CLI is running.
          </div>
        ) : (
          <div className="space-y-2">
            {models.map((model) => {
              // Check if this model is selected (either explicitly or as default when no model is set)
              const isSelected = settings.model === model.model || (!settings.model && model.isDefault)
              return (
              <label
                key={model.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-3',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <input
                  type="radio"
                  name="model"
                  value={model.model}
                  checked={isSelected}
                  onChange={(e) => updateSetting('model', e.target.value)}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{model.displayName}</span>
                    {model.isDefault && (
                      <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    )}
                    {modelSupportsReasoning(model) && (
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">
                        Reasoning
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{model.description}</div>
                </div>
              </label>
              )
            })}
          </div>
        )}
      </div>

      {/* Reasoning Effort - only shown for models that support it */}
      {supportsReasoning && reasoningEffortOptions.length > 0 && (
        <>
          <div>
            <label className="mb-2 block text-sm font-medium">Reasoning Effort</label>
            <div className="grid grid-cols-3 gap-2">
              {reasoningEffortOptions.map((option) => (
                <button
                  key={option.reasoningEffort}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    settings.reasoningEffort === option.reasoningEffort
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  )}
                  onClick={() => updateSetting('reasoningEffort', option.reasoningEffort as Settings['reasoningEffort'])}
                >
                  <div className="text-sm font-medium capitalize">{option.reasoningEffort.replace('_', ' ')}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2">{option.description}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              How deeply the model should think before responding. Higher effort may improve quality but increases response time.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Reasoning Summary</label>
            <div className="flex gap-2">
              {REASONING_SUMMARY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-center transition-colors',
                    settings.reasoningSummary === option.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  )}
                  onClick={() => updateSetting('reasoningSummary', option.value)}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-[10px] text-muted-foreground">{option.description}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              How much of the model's reasoning process to include in responses.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// Safety Settings
function SafetySettings({
  settings,
  updateSetting,
}: {
  settings: Settings
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Safety Settings</h3>

      <div>
        <label className="mb-2 block text-sm font-medium">Sandbox Mode</label>
        <div className="space-y-2">
          {SANDBOX_MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3',
                settings.sandboxMode === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <input
                type="radio"
                name="sandboxMode"
                value={option.value}
                checked={settings.sandboxMode === option.value}
                onChange={(e) => updateSetting('sandboxMode', e.target.value as SandboxMode)}
                className="h-4 w-4"
              />
              <div>
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Controls how Codex interacts with your file system
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Approval Policy</label>
        <div className="space-y-2">
          {APPROVAL_POLICY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3',
                settings.approvalPolicy === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <input
                type="radio"
                name="approvalPolicy"
                value={option.value}
                checked={settings.approvalPolicy === option.value}
                onChange={(e) => updateSetting('approvalPolicy', e.target.value as ApprovalPolicy)}
                className="h-4 w-4"
              />
              <div>
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          When to ask for your confirmation before executing changes
        </p>
      </div>
    </div>
  )
}

// Account Settings
function AccountSettings({
  accountInfo,
  onRefresh,
}: {
  accountInfo: AccountInfo | null
  onRefresh: () => Promise<void>
}) {
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogin = async () => {
    setIsLoggingIn(true)
    try {
      const response = await serverApi.startLogin('chatgpt')
      // Open auth URL in browser if provided
      if (response.authUrl) {
        const { open } = await import('@tauri-apps/plugin-shell')
        await open(response.authUrl)
      }
      // Poll for login completion
      const checkLogin = setInterval(async () => {
        const info = await serverApi.getAccountInfo()
        if (info.account) {
          clearInterval(checkLogin)
          await onRefresh()
          setIsLoggingIn(false)
        }
      }, 2000)
      // Stop polling after 60 seconds
      setTimeout(() => {
        clearInterval(checkLogin)
        setIsLoggingIn(false)
      }, 60000)
    } catch (error) {
      console.error('Login failed:', error)
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await serverApi.logout()
      await onRefresh()
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Account</h3>

      {accountInfo?.account ? (
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg text-primary-foreground">
                {accountInfo.account.email?.charAt(0).toUpperCase() || '?'}
              </div>
              <div>
                <div className="font-medium">{accountInfo.account.email}</div>
                {accountInfo.account.planType && (
                  <div className="text-sm text-muted-foreground">
                    Plan: {accountInfo.account.planType}
                  </div>
                )}
              </div>
            </div>
            <button
              className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? 'Logging out...' : 'Log Out'}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border p-4">
          <p className="mb-4 text-muted-foreground">
            Log in to use Codex with your account.
          </p>
          <button
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? 'Opening browser...' : 'Log In with Browser'}
          </button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Or use terminal: <code className="rounded bg-secondary px-1.5 py-0.5">codex login</code>
          </p>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium">Data & Privacy</h4>
        <button
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={() => {
            localStorage.clear()
            window.location.reload()
          }}
        >
          Clear Local Data
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          This will clear all local settings and data
        </p>
      </div>
    </div>
  )
}

// Allowlist Settings
function AllowlistSettings() {
  const { selectedProjectId, projects } = useProjectsStore()
  const [commands, setCommands] = useState<string[]>([])
  const [newCommand, setNewCommand] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  // Fetch allowlist when project changes
  const fetchAllowlist = useCallback(async () => {
    if (!selectedProjectId) return
    setIsLoading(true)
    setError(null)
    try {
      const list = await allowlistApi.get(selectedProjectId)
      setCommands(list)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [selectedProjectId])

  useEffect(() => {
    fetchAllowlist()
  }, [fetchAllowlist])

  const handleAdd = async () => {
    if (!selectedProjectId || !newCommand.trim()) return
    try {
      await allowlistApi.add(selectedProjectId, newCommand.trim())
      setNewCommand('')
      await fetchAllowlist()
    } catch (err) {
      setError(String(err))
    }
  }

  const handleRemove = async (command: string) => {
    if (!selectedProjectId) return
    try {
      await allowlistApi.remove(selectedProjectId, command)
      await fetchAllowlist()
    } catch (err) {
      setError(String(err))
    }
  }

  if (!selectedProjectId) {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-medium">Command Allowlist</h3>
        <div className="text-muted-foreground text-sm">
          Please select a project first to manage its command allowlist.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Command Allowlist</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Project: <span className="font-medium text-foreground">{selectedProject?.displayName || selectedProject?.path}</span>
        </p>
      </div>

      <div>
        <p className="text-sm text-muted-foreground mb-4">
          Commands in the allowlist will be automatically approved without prompting.
          Use patterns like <code className="bg-secondary px-1 rounded">npm *</code> or exact commands.
        </p>

        {/* Add new command */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="e.g., npm install, git status"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleAdd}
            disabled={!newCommand.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus size={16} />
            Add
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="text-sm text-destructive mb-4">{error}</div>
        )}

        {/* Command list */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : commands.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
            No commands in allowlist. Add commands above.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {commands.map((cmd) => (
              <div
                key={cmd}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
              >
                <code className="text-sm font-mono truncate flex-1">{cmd}</code>
                <button
                  onClick={() => handleRemove(cmd)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  title="Remove from allowlist"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        <strong>Tips:</strong>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li>Use <code className="bg-secondary px-1 rounded">*</code> as a wildcard (e.g., <code className="bg-secondary px-1 rounded">npm *</code>)</li>
          <li>Each project has its own allowlist</li>
          <li>Commands are matched exactly or by pattern</li>
        </ul>
      </div>
    </div>
  )
}
