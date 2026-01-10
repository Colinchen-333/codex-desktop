import { useState, useEffect, useCallback, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { cn } from '../../lib/utils'
import { serverApi } from '../../lib/api'
import { log } from '../../lib/logger'

export function ConnectionStatus() {
  const [isConnected, setIsConnected] = useState(true)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true)

  // Wrap attemptReconnect in useCallback to ensure stable reference
  const attemptReconnect = useCallback(async () => {
    if (!isMountedRef.current) return

    log.debug('[ConnectionStatus] Starting reconnection attempts...', 'ConnectionStatus')
    setIsReconnecting(true)
    let attempts = 0
    const maxAttempts = 5

    while (attempts < maxAttempts && isMountedRef.current) {
      attempts++
      log.debug(`[ConnectionStatus] Reconnect attempt ${attempts}/${maxAttempts}`, 'ConnectionStatus')

      if (isMountedRef.current) {
        setRetryCount(attempts)
      }

      try {
        log.debug('[ConnectionStatus] Calling serverApi.restart()...', 'ConnectionStatus')
        await serverApi.restart()
        log.debug('[ConnectionStatus] Restart call completed, checking status...', 'ConnectionStatus')

        const status = await serverApi.getStatus()
        log.debug(`[ConnectionStatus] Server status: ${JSON.stringify(status)}`, 'ConnectionStatus')

        if (status.isRunning) {
          log.debug('[ConnectionStatus] Server is running, reconnection successful!', 'ConnectionStatus')
          if (isMountedRef.current) {
            setIsConnected(true)
            setIsReconnecting(false)
            setRetryCount(0)
          }
          return
        }
      } catch (error) {
        log.error(`[ConnectionStatus] Reconnect attempt ${attempts} failed: ${error}`, 'ConnectionStatus')
      }

      // Wait before next attempt (exponential backoff)
      const waitTime = Math.min(2000 * attempts, 10000)
      log.debug(`[ConnectionStatus] Waiting ${waitTime}ms before next attempt...`, 'ConnectionStatus')
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    log.error('[ConnectionStatus] All reconnection attempts failed', 'ConnectionStatus')
    if (isMountedRef.current) {
      setIsReconnecting(false)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    // Listen for server disconnection and reconnection
    const setupListeners = async () => {
      const unlistenDisconnected = await listen('app-server-disconnected', async () => {
        log.debug('[ConnectionStatus] Server disconnected event received', 'ConnectionStatus')
        if (isMountedRef.current) {
          setIsConnected(false)
          void attemptReconnect()
        }
      })

      const unlistenReconnected = await listen('app-server-reconnected', () => {
        log.debug('[ConnectionStatus] Server reconnected event received', 'ConnectionStatus')
        if (isMountedRef.current) {
          setIsConnected(true)
          setIsReconnecting(false)
          setRetryCount(0)
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
      void cleanupPromise.then((cleanup) => cleanup())
    }
  }, [attemptReconnect])

  if (isConnected) {
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
                {retryCount > 0 && ` (attempt ${retryCount}/5)`}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    'h-full bg-primary transition-all duration-500',
                    'animate-pulse'
                  )}
                  style={{ width: `${(retryCount / 5) * 100}%` }}
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
