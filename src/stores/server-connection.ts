import { create } from 'zustand'
import type { ServerStatus } from '../lib/api'
import { serverApi } from '../lib/api'
import { log } from '../lib/logger'
import { CONNECTION_RETRY, POLL_INTERVALS } from '../constants'

interface ServerConnectionState {
  status: ServerStatus | null
  isConnected: boolean
  hasConnectedOnce: boolean
  isReconnecting: boolean
  retryCount: number
  lastError: string | null
  lastCheckedAt: number | null
  consecutiveFailures: number

  startMonitoring: () => void
  stopMonitoring: () => void
  refreshStatus: () => Promise<void>
  attemptReconnect: (options?: { forceRestart?: boolean }) => Promise<void>
  markDisconnected: (reason?: string) => void
  markConnected: (status?: ServerStatus) => void
}

let monitorInterval: ReturnType<typeof setInterval> | null = null
let inFlightStatus: Promise<void> | null = null
let inFlightReconnect: Promise<void> | null = null

function backoffDelay(attempt: number): number {
  const base = Math.min(CONNECTION_RETRY.BASE_DELAY * attempt, CONNECTION_RETRY.MAX_DELAY)
  const jitter = Math.floor(Math.random() * CONNECTION_RETRY.JITTER)
  return base + jitter
}

export const useServerConnectionStore = create<ServerConnectionState>((set, get) => ({
  status: null,
  isConnected: true,
  hasConnectedOnce: false,
  isReconnecting: false,
  retryCount: 0,
  lastError: null,
  lastCheckedAt: null,
  consecutiveFailures: 0,

  startMonitoring: () => {
    if (monitorInterval) return
    void get().refreshStatus()
    monitorInterval = setInterval(() => {
      void get().refreshStatus()
    }, POLL_INTERVALS.SERVER_STATUS)
  },

  stopMonitoring: () => {
    if (!monitorInterval) return
    clearInterval(monitorInterval)
    monitorInterval = null
  },

  refreshStatus: async () => {
    if (inFlightStatus) return inFlightStatus

    inFlightStatus = (async () => {
      try {
        const status = await serverApi.getStatus()
        set((state) => ({
          status,
          isConnected: status.isRunning,
          hasConnectedOnce: state.hasConnectedOnce || status.isRunning,
          lastError: null,
          lastCheckedAt: Date.now(),
          consecutiveFailures: status.isRunning ? 0 : state.consecutiveFailures,
        }))

        if (!status.isRunning && get().hasConnectedOnce && !get().isReconnecting) {
          void get().attemptReconnect()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        set((state) => ({
          isConnected: false,
          lastError: message,
          lastCheckedAt: Date.now(),
          consecutiveFailures: state.consecutiveFailures + 1,
        }))

        if (
          get().hasConnectedOnce &&
          !get().isReconnecting &&
          get().consecutiveFailures >= CONNECTION_RETRY.FAILURE_THRESHOLD
        ) {
          void get().attemptReconnect()
        }
      } finally {
        inFlightStatus = null
      }
    })()

    return inFlightStatus
  },

  attemptReconnect: async (options) => {
    if (inFlightReconnect || get().isReconnecting) return inFlightReconnect ?? Promise.resolve()

    inFlightReconnect = (async () => {
      set({ isReconnecting: true, retryCount: 0 })
      let lastError: string | null = null

      for (let attempt = 1; attempt <= CONNECTION_RETRY.MAX_ATTEMPTS; attempt += 1) {
        set({ retryCount: attempt })
        try {
          const status = await serverApi.getStatus()
          if (status.isRunning) {
            get().markConnected(status)
            return
          }

          if (options?.forceRestart || attempt >= 1) {
            await serverApi.restart()
            const restartedStatus = await serverApi.getStatus()
            if (restartedStatus.isRunning) {
              get().markConnected(restartedStatus)
              return
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error)
          log.error(`[ServerConnection] Reconnect attempt ${attempt} failed: ${lastError}`, 'server-connection')
        }

        await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt)))
      }

      set({
        isReconnecting: false,
        lastError,
      })
    })()

    inFlightReconnect.finally(() => {
      inFlightReconnect = null
    })

    return inFlightReconnect
  },

  markDisconnected: (reason) => {
    set((state) => ({
      isConnected: false,
      lastError: reason || state.lastError,
    }))
  },

  markConnected: (status) => {
    set((state) => ({
      status: status ?? state.status,
      isConnected: true,
      hasConnectedOnce: true,
      isReconnecting: false,
      retryCount: 0,
      lastError: null,
      lastCheckedAt: Date.now(),
      consecutiveFailures: 0,
    }))
  },
}))
