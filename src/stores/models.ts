import { create } from 'zustand'
import { serverApi, type Model } from '../lib/api'
import { logError } from '../lib/errorUtils'

// Cache TTL for models list
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// P0 Fix: In-flight promise to prevent concurrent API calls
let inFlightFetch: Promise<void> | null = null
let fetchSeq = 0

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
    // P0 Fix: If already fetching, wait for the in-flight request
    if (inFlightFetch) {
      return inFlightFetch
    }

    // Don't refetch if we already have models and fetched recently
    const { models, lastFetched, isLoading } = get()
    const now = Date.now()

    // P0 Fix: Also check isLoading as additional guard
    if (isLoading) {
      return inFlightFetch ?? Promise.resolve()
    }

    if (models.length > 0 && lastFetched && now - lastFetched < MODEL_CACHE_TTL_MS) {
      return Promise.resolve()
    }

    set({ isLoading: true, error: null })

    // P0 Fix: Create and store the in-flight promise
    const requestId = (fetchSeq += 1)
    inFlightFetch = (async () => {
      try {
        const response = await serverApi.getModels()
        if (requestId === fetchSeq) {
          set({
            models: response.data,
            isLoading: false,
            lastFetched: Date.now(), // Use actual completion time
          })
        }
      } catch (error) {
        logError(error, {
          context: 'fetchModels',
          source: 'models',
          details: 'Failed to fetch models'
        })
        if (requestId === fetchSeq) {
          set({
            error: error instanceof Error ? error.message : String(error),
            isLoading: false,
          })
        }
      } finally {
        // P0 Fix: Clear in-flight promise when done
        inFlightFetch = null
      }
    })()

    return inFlightFetch
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
