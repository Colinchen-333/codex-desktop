import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'
import { serverApi, type ServerStatus, type AccountInfo } from '../../lib/api'
import { SettingsDialog } from '../settings/SettingsDialog'
import { useAppStore } from '../../stores/app'

export function StatusBar() {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null)
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null)
  const { settingsOpen, setSettingsOpen } = useAppStore()

  useEffect(() => {
    // Fetch status on mount
    const fetchStatus = async () => {
      try {
        const status = await serverApi.getStatus()
        setServerStatus(status)
      } catch (error) {
        console.error('Failed to fetch server status:', error)
      }
    }

    const fetchAccount = async () => {
      try {
        const info = await serverApi.getAccountInfo()
        setAccountInfo(info)
      } catch (error) {
        console.error('Failed to fetch account info:', error)
      }
    }

    fetchStatus()
    fetchAccount()

    // Poll status every 10 seconds
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleRestartServer = async () => {
    try {
      await serverApi.restart()
      const status = await serverApi.getStatus()
      setServerStatus(status)
    } catch (error) {
      console.error('Failed to restart server:', error)
    }
  }

  return (
    <>
      <div className="flex h-7 items-center justify-between border-t border-border bg-card px-3 text-xs">
        {/* Left side - Server status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                serverStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'
              )}
            />
            <span className="text-muted-foreground">
              Engine: {serverStatus?.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>

          {!serverStatus?.isRunning && (
            <button
              className="text-primary hover:underline"
              onClick={handleRestartServer}
            >
              Restart
            </button>
          )}
        </div>

        {/* Right side - Account info & Settings */}
        <div className="flex items-center gap-4">
          {accountInfo?.loggedIn ? (
            <span className="text-muted-foreground">
              {accountInfo.email || 'Logged in'}
              {accountInfo.planType && ` (${accountInfo.planType})`}
            </span>
          ) : (
            <span className="text-yellow-500">Not logged in</span>
          )}

          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setSettingsOpen(true)}
            title="Settings (⌘,)"
          >
            ⚙️
          </button>
        </div>
      </div>

      <SettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
