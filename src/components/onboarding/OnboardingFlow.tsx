import { useState, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { cn } from '../../lib/utils'
import { serverApi, type AccountInfo } from '../../lib/api'
import { useProjectsStore } from '../../stores/projects'

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
    const checkLogin = async () => {
      try {
        const info = await serverApi.getAccountInfo()
        setAccountInfo(info)
      } catch (err) {
        console.error('Failed to check login status:', err)
      }
    }
    checkLogin()
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-lg p-8">
        {/* Progress indicator */}
        <div className="mb-8 flex justify-center gap-2">
          {(['welcome', 'login', 'project', 'ready'] as OnboardingStep[]).map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-2 w-8 rounded-full transition-colors',
                step === s ? 'bg-primary' :
                (['welcome', 'login', 'project', 'ready'].indexOf(step) > i ? 'bg-primary/50' : 'bg-muted')
              )}
            />
          ))}
        </div>

        {/* Step content */}
        {step === 'welcome' && (
          <WelcomeStep onNext={() => setStep(accountInfo?.loggedIn ? 'project' : 'login')} />
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
  )
}

// Welcome Step
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mb-6 text-6xl">🚀</div>
      <h1 className="mb-4 text-3xl font-bold">Welcome to Codex Desktop</h1>
      <p className="mb-8 text-muted-foreground">
        A beautiful desktop interface for the Codex AI coding assistant.
        Let's get you set up in just a few steps.
      </p>
      <button
        className="w-full rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
        onClick={onNext}
      >
        Get Started
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
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await onRefresh()
    setIsRefreshing(false)
  }

  if (accountInfo?.loggedIn) {
    return (
      <div className="text-center">
        <div className="mb-6 text-6xl">✅</div>
        <h2 className="mb-4 text-2xl font-bold">You're Logged In!</h2>
        <p className="mb-2 text-muted-foreground">
          Connected as <span className="font-medium text-foreground">{accountInfo.email}</span>
        </p>
        {accountInfo.planType && (
          <p className="mb-8 text-sm text-muted-foreground">
            Plan: {accountInfo.planType}
          </p>
        )}
        <button
          className="w-full rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
          onClick={onNext}
        >
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mb-6 text-6xl">🔐</div>
      <h2 className="mb-4 text-2xl font-bold">Login Required</h2>
      <p className="mb-6 text-muted-foreground">
        Please log in to Codex CLI in your terminal first:
      </p>
      <div className="mb-6 rounded-lg bg-secondary p-4">
        <code className="text-sm">codex login</code>
      </div>
      <p className="mb-8 text-sm text-muted-foreground">
        After logging in, click the button below to refresh.
      </p>
      <div className="flex gap-3">
        <button
          className="flex-1 rounded-lg bg-secondary px-6 py-3 font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Checking...' : 'Refresh Status'}
        </button>
        <button
          className="flex-1 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
          onClick={onNext}
        >
          Skip for Now
        </button>
      </div>
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
    <div className="text-center">
      <div className="mb-6 text-6xl">📁</div>
      <h2 className="mb-4 text-2xl font-bold">Add Your First Project</h2>
      <p className="mb-8 text-muted-foreground">
        Select a folder containing your code. Codex will help you understand,
        modify, and improve your project.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          className="w-full rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={onAddProject}
          disabled={isLoading}
        >
          {isLoading ? 'Adding Project...' : 'Select Project Folder'}
        </button>

        {hasProjects ? (
          <button
            className="w-full rounded-lg bg-secondary px-6 py-3 font-medium text-secondary-foreground hover:bg-secondary/80"
            onClick={onNext}
          >
            Continue with Added Project
          </button>
        ) : (
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onSkip}
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}

// Ready Step
function ReadyStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="text-center">
      <div className="mb-6 text-6xl">🎉</div>
      <h2 className="mb-4 text-2xl font-bold">You're All Set!</h2>
      <p className="mb-8 text-muted-foreground">
        Start chatting with Codex to get help with your code.
        You can add more projects anytime from the sidebar.
      </p>

      <div className="mb-8 rounded-lg border border-border bg-card p-4 text-left">
        <h3 className="mb-3 font-semibold">Quick Tips:</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            Select a project and click "Start New Session" to begin
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            Review file changes before applying them
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            Use snapshots to safely revert changes
          </li>
        </ul>
      </div>

      <button
        className="w-full rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
        onClick={onComplete}
      >
        Start Using Codex Desktop
      </button>
    </div>
  )
}

// Check if onboarding is needed
export function useNeedsOnboarding(): boolean {
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    const onboarded = localStorage.getItem('codex-desktop-onboarded')
    setNeedsOnboarding(!onboarded)
  }, [])

  return needsOnboarding
}
