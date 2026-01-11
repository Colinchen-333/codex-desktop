import { Component, type ReactNode } from 'react'
import { logError } from '../../lib/errorUtils'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logError(error, {
      context: 'ErrorBoundary',
      source: 'ui',
      details: errorInfo.componentStack
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
          <div className="max-w-md text-center">
            <div className="mb-6 text-6xl">😵</div>
            <h1 className="mb-4 text-2xl font-bold">Something went wrong</h1>
            <p className="mb-6 text-muted-foreground">
              The application encountered an unexpected error.
            </p>
            <div className="mb-6 rounded-lg bg-destructive/10 p-4 text-left">
              <p className="font-mono text-sm text-destructive">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>
            <button
              className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => window.location.reload()}
            >
              Reload Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
