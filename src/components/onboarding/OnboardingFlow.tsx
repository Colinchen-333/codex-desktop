import { useState, useEffect, useRef } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Rocket, Lock, Folder, CheckCircle, ArrowRight, RefreshCcw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { serverApi, type AccountInfo } from '../../lib/api'
import { useProjectsStore } from '../../stores/projects'
import { logError } from '../../lib/errorUtils'

type OnboardingStep = 'welcome' | 'login' | 'project' | 'ready'

interface OnboardingFlowProps {
  onComplete: () => void
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { projects, addProject } = useProjectsStore()

  // Check login status
  useEffect(() => {
    let isMounted = true
    const checkLogin = async () => {
      try {
        const info = await serverApi.getAccountInfo()
        if (isMounted) {
          setAccountInfo(info)
        }
      } catch (err) {
        logError(err, {
          context: 'OnboardingFlow',
          source: 'onboarding',
          details: 'Failed to check login status'
        })
      }
    }
    void checkLogin()
    return () => {
      isMounted = false
    }
  }, [])

  const handleAddProject = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Your Project Folder',
      })
      if (selected && typeof selected === 'string') {
        await addProject(selected)
        setStep('ready')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleComplete = () => {
    localStorage.setItem('codex-desktop-onboarded', 'true')
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-card shadow-2xl border border-border/50 rounded-[2.5rem] p-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Progress indicator */}
        <div className="mb-10 flex justify-center gap-2">
          {(['welcome', 'login', 'project', 'ready'] as OnboardingStep[]).map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1.5 transition-all duration-300 rounded-full',
                step === s ? 'w-8 bg-primary' :
                (['welcome', 'login', 'project', 'ready'].indexOf(step) > i ? 'w-4 bg-primary/40' : 'w-4 bg-muted')
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[320px] flex flex-col justify-center">
          {step === 'welcome' && (
            <WelcomeStep onNext={() => setStep(accountInfo?.account ? 'project' : 'login')} />
          )}
          {step === 'login' && (
            <LoginStep
              accountInfo={accountInfo}
              onNext={() => setStep('project')}
              onRefresh={async () => {
                const info = await serverApi.getAccountInfo()
                setAccountInfo(info)
              }}
            />
          )}
          {step === 'project' && (
            <ProjectStep
              onAddProject={handleAddProject}
              hasProjects={projects.length > 0}
              isLoading={isLoading}
              error={error}
              onNext={() => setStep('ready')}
              onSkip={() => setStep('ready')}
            />
          )}
          {step === 'ready' && (
            <ReadyStep onComplete={handleComplete} />
          )}
        </div>
      </div>
    </div>
  )
}

// Welcome Step
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/5 text-primary">
        <Rocket size={40} />
      </div>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">Welcome to Codex</h1>
      <p className="mb-10 text-muted-foreground text-lg leading-relaxed px-4">
        The ultimate workbench for AI-powered coding.
        Let's get you set up in seconds.
      </p>
      <button
        className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 font-semibold text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]"
        onClick={onNext}
      >
        Get Started
        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  )
}

// Login Step
function LoginStep({
  accountInfo,
  onNext,
  onRefresh,
}: {
  accountInfo: AccountInfo | null
  onNext: () => void
  onRefresh: () => Promise<void>
}) {
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // P0 Fix: Track mounted state to prevent state updates after unmount
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

  const handleLogin = async () => {
    setIsLoggingIn(true)
    try {
      const response = await serverApi.startLogin('chatgpt')
      // Open auth URL in browser if provided
      if (response.authUrl) {
        const { open } = await import('@tauri-apps/plugin-shell')
        await open(response.authUrl)
      }
      // Poll for login completion
      pollIntervalRef.current = setInterval(async () => {
        // P0 Fix: Check if still mounted before performing any operations
        if (!isMountedRef.current) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          return
        }

        try {
          const info = await serverApi.getAccountInfo()
          // P0 Fix: Check mounted again after async operation
          if (!isMountedRef.current) return

          if (info.account) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            if (pollTimeoutRef.current) {
              clearTimeout(pollTimeoutRef.current)
              pollTimeoutRef.current = null
            }
            await onRefresh()
            if (isMountedRef.current) {
              setIsLoggingIn(false)
            }
          }
        } catch {
          // P0 Fix: Silently ignore errors during polling to prevent crashes
          // The timeout will handle eventual cleanup
        }
      }, 2000)
      // Stop polling after 60 seconds
      pollTimeoutRef.current = setTimeout(() => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        // P0 Fix: Check mounted before state update
        if (isMountedRef.current) {
          setIsLoggingIn(false)
        }
      }, 60000)
    } catch (error) {
      logError(error, {
        context: 'OnboardingFlow',
        source: 'onboarding',
        details: 'Login failed'
      })
      // P0 Fix: Check mounted before state update
      if (isMountedRef.current) {
        setIsLoggingIn(false)
      }
    }
  }

  if (accountInfo?.account) {
    return (
      <div className="text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-green-500/10 text-green-600">
          <CheckCircle size={40} />
        </div>
        <h2 className="mb-2 text-2xl font-bold">You're All Set!</h2>
        <p className="mb-1 text-muted-foreground text-lg">
          Connected as <span className="font-semibold text-foreground">{accountInfo.account.email}</span>
        </p>
        {accountInfo.account.planType && (
          <p className="mb-10 text-sm font-medium uppercase tracking-wider text-muted-foreground/60">
            {accountInfo.account.planType} Plan
          </p>
        )}
        <button
          className="w-full rounded-2xl bg-primary px-6 py-4 font-semibold text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]"
          onClick={onNext}
        >
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/5 text-primary">
        <Lock size={40} />
      </div>
      <h2 className="mb-4 text-2xl font-bold">Sign In to Codex</h2>
      <p className="mb-10 text-muted-foreground text-lg">
        Connect your ChatGPT account to start building with AI.
      </p>
      <div className="flex flex-col gap-3">
        <button
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
          onClick={handleLogin}
          disabled={isLoggingIn}
        >
          {isLoggingIn ? (
            <>
              <RefreshCcw size={18} className="animate-spin" />
              Waiting for login...
            </>
          ) : (
            <>
              Log In with Browser
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
        <button
          className="w-full rounded-2xl bg-secondary px-6 py-4 font-semibold text-secondary-foreground hover:bg-secondary/80 transition-all"
          onClick={onNext}
        >
          Skip for Now
        </button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground/60">
        Or use terminal: <code className="rounded bg-secondary/80 px-2 py-0.5 font-mono">codex login</code>
      </p>
    </div>
  )
}

// Project Step
function ProjectStep({
  onAddProject,
  hasProjects,
  isLoading,
  error,
  onNext,
  onSkip,
}: {
  onAddProject: () => void
  hasProjects: boolean
  isLoading: boolean
  error: string | null
  onNext: () => void
  onSkip: () => void
}) {
  return (
    <div className="text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/5 text-primary">
        <Folder size={40} />
      </div>
      <h2 className="mb-4 text-2xl font-bold">Your First Project</h2>
      <p className="mb-10 text-muted-foreground text-lg">
        Select a folder. Codex will help you understand and improve your code instantly.
      </p>

      {error && (
        <div className="mb-6 rounded-xl bg-destructive/5 p-4 text-sm text-destructive border border-destructive/10">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          className="w-full rounded-2xl bg-primary px-6 py-4 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98]"
          onClick={onAddProject}
          disabled={isLoading}
        >
          {isLoading ? 'Adding Project...' : 'Select Project Folder'}
        </button>

        {hasProjects ? (
          <button
            className="flex items-center justify-center gap-2 w-full rounded-2xl bg-secondary px-6 py-4 font-semibold text-secondary-foreground hover:bg-secondary/80 transition-all"
            onClick={onNext}
          >
            Continue
            <ArrowRight size={18} />
          </button>
        ) : (
          <button
            className="mt-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={onSkip}
          >
            I'll add it later
          </button>
        )}
      </div>
    </div>
  )
}

// Ready Step
function ReadyStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-green-500/10 text-green-600">
        <CheckCircle size={40} />
      </div>
      <h2 className="mb-4 text-2xl font-bold">Ready to Code!</h2>
      <p className="mb-10 text-muted-foreground text-lg">
        You're all set to experience the future of coding.
      </p>

      <div className="mb-10 rounded-2xl bg-secondary/30 p-6 text-left border border-border/50">
        <h3 className="mb-4 font-bold text-sm uppercase tracking-wider text-muted-foreground/80">Pro Tips:</h3>
        <ul className="space-y-3">
          {[
            'Select a project to start a session',
            'Review all file changes before applying',
            'Use snapshots to revert changes anytime'
          ].map((tip, i) => (
            <li key={i} className="flex items-center gap-3 text-sm font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <button
        className="w-full rounded-2xl bg-primary px-6 py-4 font-semibold text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
        onClick={onComplete}
      >
        Open Workbench
      </button>
    </div>
  )
}
