import { useState, useEffect, useCallback, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { cn } from '../../lib/utils'
import { serverApi } from '../../lib/api'

export function ConnectionStatus() {
  const [isConnected, setIsConnected] = useState(true)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true)

  // Wrap attemptReconnect in useCallback to ensure stable reference
  const attemptReconnect = useCallback(async () => {
    if (!isMountedRef.current) return

    setIsReconnecting(true)
    let attempts = 0
    const maxAttempts = 5

    while (attempts < maxAttempts && isMountedRef.current) {
      try {
        await serverApi.restart()
        const status = await serverApi.getStatus()
        if (status.isRunning) {
          if (isMountedRef.current) {
            setIsConnected(true)
            setIsReconnecting(false)
            setRetryCount(0)
          }
          return
        }
      } catch (error) {
        console.error('Reconnect attempt failed:', error)
      }

      attempts++
      if (isMountedRef.current) {
        setRetryCount(attempts)
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempts))
    }

    if (isMountedRef.current) {
      setIsReconnecting(false)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    // Listen for server disconnection
    const setupListener = async () => {
      const unlisten = await listen('app-server-disconnected', () => {
        if (isMountedRef.current) {
          setIsConnected(false)
          attemptReconnect()
        }
      })
      return unlisten
    }

    const unlistenPromise = setupListener()
    return () => {
      isMountedRef.current = false
      unlistenPromise.then((unlisten) => unlisten())
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
                  onClick={attemptReconnect}
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
