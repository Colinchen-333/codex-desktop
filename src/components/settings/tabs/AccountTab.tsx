import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { serverApi, type AccountInfo } from '../../../lib/api'
import { log } from '../../../lib/logger'
import { ConfirmDialog } from '../../ui/ConfirmDialog'

interface AccountTabProps {
  accountInfo: AccountInfo | null
  onRefresh: () => Promise<void>
}

/**
 * Login form component for API key authentication
 */
const ApiKeyLoginForm = memo(function ApiKeyLoginForm({
  isLoggingIn,
  onLogin,
  onCancel,
}: {
  isLoggingIn: boolean
  onLogin: (apiKey: string) => Promise<void>
  onCancel: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!apiKey.trim()) {
      setApiKeyError('Please enter an API key')
      return
    }
    setApiKeyError(null)
    try {
      await onLogin(apiKey.trim())
    } catch {
      setApiKeyError('Invalid API key or login failed')
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="Enter your API key"
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        autoFocus
      />
      {apiKeyError && <p className="text-xs text-destructive">{apiKeyError}</p>}
      <div className="flex gap-2">
        <button
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={handleSubmit}
          disabled={isLoggingIn || !apiKey.trim()}
        >
          {isLoggingIn ? 'Verifying...' : 'Login with API Key'}
        </button>
        <button
          className="rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
})

/**
 * Logged in user info display
 */
const LoggedInView = memo(function LoggedInView({
  accountInfo,
  isLoggingOut,
  onLogout,
}: {
  accountInfo: AccountInfo
  isLoggingOut: boolean
  onLogout: () => void
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg text-primary-foreground">
            {accountInfo.account?.email?.charAt(0).toUpperCase() || '?'}
          </div>
          <div>
            <div className="font-medium">{accountInfo.account?.email}</div>
            {accountInfo.account?.planType && (
              <div className="text-sm text-muted-foreground">
                Plan: {accountInfo.account.planType}
              </div>
            )}
          </div>
        </div>
        <button
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          onClick={onLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? 'Logging out...' : 'Log Out'}
        </button>
      </div>
    </div>
  )
})

/**
 * Login view with browser OAuth and API key options
 */
const LoginView = memo(function LoginView({
  isLoggingIn,
  showApiKeyInput,
  onBrowserLogin,
  onApiKeyLogin,
  onShowApiKeyInput,
  onHideApiKeyInput,
}: {
  isLoggingIn: boolean
  showApiKeyInput: boolean
  onBrowserLogin: () => void
  onApiKeyLogin: (apiKey: string) => Promise<void>
  onShowApiKeyInput: () => void
  onHideApiKeyInput: () => void
}) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <p className="text-muted-foreground">
        Log in to use Codex with your account.
      </p>

      {/* Browser OAuth Login */}
      <button
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        onClick={onBrowserLogin}
        disabled={isLoggingIn}
      >
        {isLoggingIn && !showApiKeyInput
          ? 'Opening browser...'
          : 'Log In with Browser'}
      </button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      {/* API Key Login */}
      {showApiKeyInput ? (
        <ApiKeyLoginForm
          isLoggingIn={isLoggingIn}
          onLogin={onApiKeyLogin}
          onCancel={onHideApiKeyInput}
        />
      ) : (
        <button
          className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          onClick={onShowApiKeyInput}
          disabled={isLoggingIn}
        >
          Use API Key
        </button>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Or use terminal:{' '}
        <code className="rounded bg-secondary px-1.5 py-0.5">codex login</code>
      </p>
    </div>
  )
})

/**
 * Account settings tab component
 * Handles login/logout and account information display
 */
export const AccountTab = memo(function AccountTab({
  accountInfo,
  onRefresh,
}: AccountTabProps) {
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // P1 Fix: Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true)

  // Cleanup polling on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = null
      }
    }
  }, [])

  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  const handleBrowserLogin = useCallback(async () => {
    clearPolling()
    setIsLoggingIn(true)
    try {
      const response = await serverApi.startLogin('chatgpt')
      if (response.authUrl) {
        const { open } = await import('@tauri-apps/plugin-shell')
        await open(response.authUrl)
      }
      // Poll for login completion
      pollIntervalRef.current = setInterval(async () => {
        // P1 Fix: Check if still mounted before performing any operations
        if (!isMountedRef.current) {
          clearPolling()
          return
        }

        try {
          const info = await serverApi.getAccountInfo()
          // P1 Fix: Check mounted again after async operation
          if (!isMountedRef.current) return

          if (info.account) {
            clearPolling()
            await onRefresh()
            if (isMountedRef.current) {
              setIsLoggingIn(false)
            }
          }
        } catch (pollError) {
          log.error(`Polling error: ${pollError}`, 'AccountTab')
        }
      }, 2000)
      // Stop polling after 60 seconds
      pollTimeoutRef.current = setTimeout(() => {
        clearPolling()
        // P1 Fix: Check mounted before state update
        if (isMountedRef.current) {
          setIsLoggingIn(false)
        }
      }, 60000)
    } catch (error) {
      log.error(`Login failed: ${error}`, 'AccountTab')
      // P1 Fix: Check mounted before state update
      if (isMountedRef.current) {
        setIsLoggingIn(false)
      }
    }
  }, [clearPolling, onRefresh])

  const handleApiKeyLogin = useCallback(
    async (apiKey: string) => {
      setIsLoggingIn(true)
      try {
        await serverApi.startLogin('apiKey', apiKey)
        await onRefresh()
        setShowApiKeyInput(false)
      } catch (error) {
        log.error(`API key login failed: ${error}`, 'AccountTab')
        throw error
      } finally {
        setIsLoggingIn(false)
      }
    },
    [onRefresh]
  )

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true)
    try {
      await serverApi.logout()
      await onRefresh()
    } catch (error) {
      log.error(`Logout failed: ${error}`, 'AccountTab')
    } finally {
      setIsLoggingOut(false)
    }
  }, [onRefresh])

  const handleClearData = useCallback(() => {
    localStorage.clear()
    window.location.reload()
  }, [])

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Account</h3>

      {accountInfo?.account ? (
        <LoggedInView
          accountInfo={accountInfo}
          isLoggingOut={isLoggingOut}
          onLogout={handleLogout}
        />
      ) : (
        <LoginView
          isLoggingIn={isLoggingIn}
          showApiKeyInput={showApiKeyInput}
          onBrowserLogin={handleBrowserLogin}
          onApiKeyLogin={handleApiKeyLogin}
          onShowApiKeyInput={() => setShowApiKeyInput(true)}
          onHideApiKeyInput={() => setShowApiKeyInput(false)}
        />
      )}

      {/* Data & Privacy */}
      <div>
        <h4 className="mb-2 text-sm font-medium">Data & Privacy</h4>
        <button
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={() => setShowClearDataConfirm(true)}
        >
          Clear Local Data
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          This will clear all local settings and data
        </p>
      </div>

      {/* Clear Local Data Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showClearDataConfirm}
        title="Clear Local Data"
        message="Are you sure you want to clear all local settings and data? This action cannot be undone and will reload the application."
        confirmText="Clear Data"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleClearData}
        onCancel={() => setShowClearDataConfirm(false)}
      />
    </div>
  )
})
