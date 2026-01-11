/**
 * ServerStatusIndicator - Server connection status component
 *
 * Displays server running/stopped status with restart functionality.
 * Memoized to prevent unnecessary re-renders.
 */
import { memo, useCallback, useState, useEffect } from 'react'
import { Activity } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { serverApi, type ServerStatus } from '../../../lib/api'
import { logError } from '../../../lib/errorUtils'

export interface ServerStatusIndicatorProps {
  onRestart?: () => void
}

export const ServerStatusIndicator = memo(function ServerStatusIndicator({
  onRestart,
}: ServerStatusIndicatorProps) {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchStatus = async () => {
      try {
        const status = await serverApi.getStatus()
        if (isMounted) {
          setServerStatus(status)
        }
      } catch (error) {
        logError(error, {
          context: 'ServerStatusIndicator',
          source: 'status-bar',
          details: 'Failed to fetch server status'
        })
      }
    }

    void fetchStatus()

    // Poll every 60 seconds
    const interval = setInterval(fetchStatus, 60000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  const handleRestart = useCallback(async () => {
    try {
      await serverApi.restart()
      const status = await serverApi.getStatus()
      setServerStatus(status)
      onRestart?.()
    } catch (error) {
      logError(error, {
        context: 'ServerStatusIndicator',
        source: 'status-bar',
        details: 'Failed to restart server'
      })
    }
  }, [onRestart])

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex h-2.5 w-2.5">
          {serverStatus?.isRunning && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          )}
          <span
            className={cn(
              'relative inline-flex h-2.5 w-2.5 rounded-full',
              serverStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'
            )}
          />
        </div>
        <span className="flex items-center gap-1.5 uppercase tracking-widest text-xs">
          <Activity size={12} strokeWidth={2.5} />
          Engine: {serverStatus?.isRunning ? 'Running' : 'Stopped'}
        </span>
      </div>

      {!serverStatus?.isRunning && (
        <button
          className="text-primary hover:text-primary/80 transition-colors uppercase tracking-widest text-xs font-bold"
          onClick={() => void handleRestart()}
        >
          Restart
        </button>
      )}
    </>
  )
})
