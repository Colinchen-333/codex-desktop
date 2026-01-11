import { useEffect, useState, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { projectApi } from '../../lib/api'
import { useProjectsStore } from '../../stores/projects'
import { useModelsStore } from '../../stores/models'
import {
  SANDBOX_MODE_OPTIONS,
  APPROVAL_POLICY_OPTIONS,
} from '../../stores/settings'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { logError } from '../../lib/errorUtils'
import { useToast } from '../ui/Toast'
import { useDialogKeyboardShortcut } from '../../hooks/useDialogKeyboardShortcut'

interface ProjectSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  projectId: string | null
}

interface ProjectSettings {
  cwd?: string
  envVars?: Record<string, string>
  model?: string
  sandboxMode?: string
  askForApproval?: string
}

export function ProjectSettingsDialog({
  isOpen,
  onClose,
  projectId,
}: ProjectSettingsDialogProps) {
  const { projects } = useProjectsStore()
  // fetchProjects, fetchModels are called via getState() to avoid dependency issues
  const { models } = useModelsStore()
  const { showToast } = useToast()
  const [settings, setSettings] = useState<ProjectSettings>({})
  const [isSaving, setIsSaving] = useState(false)
  const [newEnvKey, setNewEnvKey] = useState('')
  const [newEnvValue, setNewEnvValue] = useState('')
  const [clearSettingConfirm, setClearSettingConfirm] = useState<{
    isOpen: boolean
    settingKey: keyof ProjectSettings | null
    settingName: string
  }>({ isOpen: false, settingKey: null, settingName: '' })
  const saveButtonRef = useRef<HTMLButtonElement>(null)

  const project = projects.find((p) => p.id === projectId)

  // Use keyboard shortcut hook for Cmd+Enter (or Ctrl+Enter on Windows/Linux)
  useDialogKeyboardShortcut({
    isOpen,
    onConfirm: () => {
      if (!isSaving) {
        saveButtonRef.current?.click()
      }
    },
    onCancel: onClose,
    requireModifierKey: true, // Require Cmd/Ctrl key since there are inputs
  })

  // Load settings from project
  useEffect(() => {
    if (!project) return
    try {
      const parsed = project.settingsJson
        ? JSON.parse(project.settingsJson)
        : {}
      setSettings(parsed)
    } catch {
      setSettings({})
    }
  }, [project])

  // Fetch models on mount
  useEffect(() => {
    if (isOpen) {
      void useModelsStore.getState().fetchModels()
    }
  }, [isOpen]) // No fetchModels dependency - called via getState()

  const handleSave = async () => {
    if (!projectId) return
    setIsSaving(true)
    try {
      await projectApi.update(projectId, undefined, settings as Record<string, unknown>)
      await useProjectsStore.getState().fetchProjects()
      showToast('Project settings saved successfully', 'success')
      onClose()
    } catch (error) {
      logError(error, {
        context: 'ProjectSettingsDialog',
        source: 'dialogs',
        details: 'Failed to save project settings'
      })
      showToast('Failed to save project settings', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddEnvVar = () => {
    if (!newEnvKey.trim()) return
    setSettings((prev) => ({
      ...prev,
      envVars: {
        ...(prev.envVars || {}),
        [newEnvKey.trim()]: newEnvValue,
      },
    }))
    setNewEnvKey('')
    setNewEnvValue('')
  }

  const handleRemoveEnvVar = (key: string) => {
    setSettings((prev) => {
      const newEnvVars = { ...(prev.envVars || {}) }
      delete newEnvVars[key]
      return { ...prev, envVars: newEnvVars }
    })
  }

  const clearSetting = <K extends keyof ProjectSettings>(key: K, name: string) => {
    setClearSettingConfirm({
      isOpen: true,
      settingKey: key,
      settingName: name,
    })
  }

  const confirmClearSetting = () => {
    if (clearSettingConfirm.settingKey) {
      setSettings((prev) => {
        const next = { ...prev }
        delete next[clearSettingConfirm.settingKey!]
        return next
      })
      setClearSettingConfirm({ isOpen: false, settingKey: null, settingName: '' })
    }
  }

  if (!isOpen || !project) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Project Settings</h2>
            <p className="text-sm text-muted-foreground truncate max-w-[300px]">
              {project.displayName || project.path}
            </p>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Model Override */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Model</label>
              {settings.model && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => clearSetting('model', 'Model')}
                >
                  Use default
                </button>
              )}
            </div>
            <select
              value={settings.model || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  model: e.target.value || undefined,
                }))
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Inherit from global settings</option>
              {models.map((model) => (
                <option key={model.id} value={model.model}>
                  {model.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Sandbox Mode Override */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Sandbox Mode</label>
              {settings.sandboxMode && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => clearSetting('sandboxMode', 'Sandbox Mode')}
                >
                  Use default
                </button>
              )}
            </div>
            <select
              value={settings.sandboxMode || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  sandboxMode: e.target.value || undefined,
                }))
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Inherit from global settings</option>
              {SANDBOX_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Approval Policy Override */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Approval Policy</label>
              {settings.askForApproval && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => clearSetting('askForApproval', 'Approval Policy')}
                >
                  Use default
                </button>
              )}
            </div>
            <select
              value={settings.askForApproval || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  askForApproval: e.target.value || undefined,
                }))
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Inherit from global settings</option>
              {APPROVAL_POLICY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Working Directory Override */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Working Directory</label>
              {settings.cwd && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => clearSetting('cwd', 'Working Directory')}
                >
                  Use default
                </button>
              )}
            </div>
            <input
              type="text"
              value={settings.cwd || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  cwd: e.target.value || undefined,
                }))
              }
              placeholder={project.path}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty to use project root
            </p>
          </div>

          {/* Environment Variables */}
          <div>
            <label className="text-sm font-medium block mb-2">
              Environment Variables
            </label>
            <div className="space-y-2 mb-2">
              {Object.entries(settings.envVars || {}).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
                >
                  <code className="text-sm font-mono">{key}</code>
                  <span className="text-muted-foreground">=</span>
                  <code className="text-sm font-mono flex-1 truncate">{value}</code>
                  <button
                    onClick={() => handleRemoveEnvVar(key)}
                    className="text-muted-foreground hover:text-destructive text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                placeholder="KEY"
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="text"
                value={newEnvValue}
                onChange={(e) => setNewEnvValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddEnvVar()}
                placeholder="value"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleAddEnvVar}
                disabled={!newEnvKey.trim()}
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                Add
              </button>
            </div>
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
            ref={saveButtonRef}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Clear Setting Confirmation Dialog */}
        <ConfirmDialog
          isOpen={clearSettingConfirm.isOpen}
          title="Clear Setting"
          message={`Are you sure you want to clear the "${clearSettingConfirm.settingName}" setting and use the default value?`}
          confirmText="Clear"
          cancelText="Cancel"
          variant="warning"
          onConfirm={confirmClearSetting}
          onCancel={() => setClearSettingConfirm({ isOpen: false, settingKey: null, settingName: '' })}
        />
      </div>
    </div>
  )
}
