import { memo, useEffect } from 'react'
import { cn } from '../../../lib/utils'
import { parseReasoningEffort } from '../../../lib/validation'
import {
  useSettingsStore,
  type Settings,
  REASONING_SUMMARY_OPTIONS,
} from '../../../stores/settings'
import { useModelsStore, modelSupportsReasoning } from '../../../stores/models'

interface ModelTabProps {
  settings: Settings
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

/**
 * Loading spinner component
 */
const LoadingSpinner = memo(function LoadingSpinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      Loading models...
    </div>
  )
})

/**
 * Model settings tab component
 * Handles model selection and reasoning settings
 */
export const ModelTab = memo(function ModelTab({
  settings,
  updateSetting,
}: ModelTabProps) {
  const { models, isLoading, error } = useModelsStore()

  // Fetch models on mount
  useEffect(() => {
    void useModelsStore.getState().fetchModels()
  }, [])

  // Auto-select default model if none is selected
  useEffect(() => {
    if (!settings.model && models.length > 0) {
      const defaultModel = useModelsStore.getState().getDefaultModel()
      if (defaultModel) {
        useSettingsStore.getState().updateSetting('model', defaultModel.model)
      }
    }
  }, [settings.model, models])

  const currentModel =
    useModelsStore.getState().getModelById(settings.model) ||
    useModelsStore.getState().getDefaultModel()
  const supportsReasoning = currentModel
    ? modelSupportsReasoning(currentModel)
    : false

  const reasoningEffortOptions = currentModel?.supportedReasoningEfforts || []

  const handleRetry = () => {
    void useModelsStore.getState().fetchModels()
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Model Settings</h3>

      {/* Model Selection */}
      <div>
        <label className="mb-2 block text-sm font-medium">Default Model</label>
        {isLoading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="text-sm text-destructive py-2">
            Failed to load models: {error}
            <button className="ml-2 text-primary underline" onClick={handleRetry}>
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
              const isSelected =
                settings.model === model.model ||
                (!settings.model && model.isDefault)
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
                    <div className="text-xs text-muted-foreground">
                      {model.description}
                    </div>
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
            <label className="mb-2 block text-sm font-medium">
              Reasoning Effort
            </label>
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
                  onClick={() => {
                    const validated = parseReasoningEffort(
                      option.reasoningEffort,
                      settings.reasoningEffort
                    )
                    updateSetting('reasoningEffort', validated)
                  }}
                >
                  <div className="text-sm font-medium capitalize">
                    {option.reasoningEffort.replace('_', ' ')}
                  </div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              How deeply the model should think before responding. Higher effort
              may improve quality but increases response time.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Reasoning Summary
            </label>
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
                  <div className="text-[10px] text-muted-foreground">
                    {option.description}
                  </div>
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
})
