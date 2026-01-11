import { create } from 'zustand'
import { serverApi, type Model } from '../lib/api'
import { logError } from '../lib/errorUtils'

// Cache TTL for models list
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface ModelsState {
  models: Model[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null

  // Actions
  fetchModels: () => Promise<void>
  getDefaultModel: () => Model | undefined
  getModelById: (id: string) => Model | undefined
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchModels: async () => {
    // Don't refetch if we already have models and fetched recently
    const { models, lastFetched } = get()
    const now = Date.now()
    if (models.length > 0 && lastFetched && now - lastFetched < MODEL_CACHE_TTL_MS) {
      return
    }

    set({ isLoading: true, error: null })
    try {
      const response = await serverApi.getModels()
      set({
        models: response.data,
        isLoading: false,
        lastFetched: now,
      })
    } catch (error) {
      logError(error, {
        context: 'fetchModels',
        source: 'models',
        details: 'Failed to fetch models'
      })
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      })
    }
  },

  getDefaultModel: () => {
    const { models } = get()
    return models.find((m) => m.isDefault) || models[0]
  },

  getModelById: (id: string) => {
    const { models } = get()
    return models.find((m) => m.id === id || m.model === id)
  },
}))

// Helper to get model display info
export function getModelDisplayName(model: Model): string {
  return model.displayName || model.model
}

// Helper to check if model supports reasoning
export function modelSupportsReasoning(model: Model): boolean {
  return model.supportedReasoningEfforts.length > 1
}
