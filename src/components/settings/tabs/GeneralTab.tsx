import { memo } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useTheme } from '../../../hooks/useTheme'

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Monitor },
] as const

/**
 * General settings tab component
 * Handles theme selection and onboarding reset
 */
export const GeneralTab = memo(function GeneralTab() {
  const { theme, setTheme } = useTheme()

  const handleResetOnboarding = () => {
    localStorage.removeItem('codex-desktop-onboarded')
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">General Settings</h3>

      {/* Theme Selection */}
      <div>
        <label className="mb-2 block text-sm font-medium">Theme</label>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.value}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all',
                  theme === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50 hover:bg-accent'
                )}
                onClick={() => setTheme(option.value)}
              >
                <Icon size={16} />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Choose your preferred color theme. System will automatically match your OS settings.
        </p>
      </div>

      {/* Reset Onboarding */}
      <div>
        <label className="mb-2 block text-sm font-medium">Reset Onboarding</label>
        <button
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={handleResetOnboarding}
        >
          Show Onboarding Again
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          This will show the welcome flow on next launch
        </p>
      </div>
    </div>
  )
})
