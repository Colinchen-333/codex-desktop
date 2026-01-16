import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { cn } from '../../lib/utils'
import { log } from '../../lib/logger'
import { useServerConnectionStore } from '../../stores/server-connection'
import { CONNECTION_RETRY } from '../../constants'

export function ConnectionStatus() {
  const {
    isConnected,
    hasConnectedOnce,
    isReconnecting,
    retryCount,
    startMonitoring,
    stopMonitoring,
    attemptReconnect,
    markDisconnected,
    markConnected,
  } = useServerConnectionStore()

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    startMonitoring()

    // Listen for server disconnection and reconnection
    const setupListeners = async () => {
      const unlistenDisconnected = await listen('app-server-disconnected', async () => {
        log.debug('[ConnectionStatus] Server disconnected event received', 'ConnectionStatus')
        if (isMountedRef.current) {
          markDisconnected('app-server-disconnected')
          void attemptReconnect()
        }
      })

      const unlistenReconnected = await listen('app-server-reconnected', () => {
        log.debug('[ConnectionStatus] Server reconnected event received', 'ConnectionStatus')
        if (isMountedRef.current) {
          markConnected()
        }
      })

      return () => {
        unlistenDisconnected()
        unlistenReconnected()
      }
    }

    const cleanupPromise = setupListeners()
    return () => {
      isMountedRef.current = false
      stopMonitoring()
      void cleanupPromise.then((cleanup) => cleanup())
    }
  }, [attemptReconnect, markConnected, markDisconnected, startMonitoring, stopMonitoring])

  const shouldShow = !isConnected && (hasConnectedOnce || isReconnecting)

  if (!shouldShow) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-xl">
        <div className="text-center">
          {isReconnecting ? (
            <>
              <div className="mb-4 text-4xl animate-spin">⚙️</div>
              <h2 className="mb-2 text-xl font-semibold">Reconnecting...</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Attempting to reconnect to Codex engine
                {retryCount > 0 && ` (attempt ${retryCount}/${CONNECTION_RETRY.MAX_ATTEMPTS})`}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    'h-full bg-primary transition-all duration-500',
                    'animate-pulse'
                  )}
                  style={{ width: `${(retryCount / CONNECTION_RETRY.MAX_ATTEMPTS) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 text-4xl">❌</div>
              <h2 className="mb-2 text-xl font-semibold">Connection Lost</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Unable to connect to Codex engine after multiple attempts.
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
                  onClick={() => window.location.reload()}
                >
                  Reload App
                </button>
                <button
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  onClick={() => void attemptReconnect()}
                >
                  Try Again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
