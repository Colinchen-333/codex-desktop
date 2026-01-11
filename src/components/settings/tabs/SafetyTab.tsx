import { memo } from 'react'
import { cn } from '../../../lib/utils'
import { parseSandboxMode, parseApprovalPolicy } from '../../../lib/validation'
import {
  type Settings,
  SANDBOX_MODE_OPTIONS,
  APPROVAL_POLICY_OPTIONS,
} from '../../../stores/settings'

interface SafetyTabProps {
  settings: Settings
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

/**
 * Safety settings tab component
 * Handles sandbox mode and approval policy settings
 */
export const SafetyTab = memo(function SafetyTab({
  settings,
  updateSetting,
}: SafetyTabProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Safety Settings</h3>

      {/* Sandbox Mode */}
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
                onChange={(e) => {
                  const validated = parseSandboxMode(
                    e.target.value,
                    settings.sandboxMode
                  )
                  updateSetting('sandboxMode', validated)
                }}
                className="h-4 w-4"
              />
              <div>
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">
                  {option.description}
                </div>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Controls how Codex interacts with your file system
        </p>
      </div>

      {/* Approval Policy */}
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
                onChange={(e) => {
                  const validated = parseApprovalPolicy(
                    e.target.value,
                    settings.approvalPolicy
                  )
                  updateSetting('approvalPolicy', validated)
                }}
                className="h-4 w-4"
              />
              <div>
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">
                  {option.description}
                </div>
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
})
