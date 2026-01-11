import { cn } from '../../lib/utils'

/**
 * Progress bar size variants
 */
export type ProgressBarSize = 'sm' | 'md' | 'lg'

/**
 * Progress bar variants
 */
export type ProgressBarVariant = 'default' | 'primary' | 'success' | 'warning' | 'destructive'

/**
 * ProgressBar Props
 */
export interface ProgressBarProps {
  /**
   * Progress value (0-100)
   * If undefined, shows indeterminate loading state
   */
  value?: number

  /**
   * Size of the progress bar
   * @default 'md'
   */
  size?: ProgressBarSize

  /**
   * Visual variant
   * @default 'default'
   */
  variant?: ProgressBarVariant

  /**
   * Custom className for styling
   */
  className?: string

  /**
   * Whether to show percentage label
   * @default false
   */
  showLabel?: boolean

  /**
   * Custom label text
   * If provided, overrides percentage label
   */
  label?: string

  /**
   * Whether to animate the progress
   * @default true
   */
  animate?: boolean
}

/**
 * Size configurations
 */
const SIZE_MAP: Record<ProgressBarSize, { container: string; bar: string }> = {
  sm: { container: 'h-1', bar: 'h-full' },
  md: { container: 'h-2', bar: 'h-full' },
  lg: { container: 'h-3', bar: 'h-full' },
}

/**
 * Variant configurations
 */
const VARIANT_MAP: Record<ProgressBarVariant, string> = {
  default: 'bg-primary',
  primary: 'bg-primary',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  destructive: 'bg-destructive',
}

/**
 * Background variant configurations (for the track)
 */
const BG_VARIANT_MAP: Record<ProgressBarVariant, string> = {
  default: 'bg-secondary',
  primary: 'bg-primary/20',
  success: 'bg-green-500/20',
  warning: 'bg-yellow-500/20',
  destructive: 'bg-destructive/20',
}

/**
 * ProgressBar - Linear progress indicator
 *
 * A reusable progress bar component for displaying completion status.
 * Supports determinate (specific value) and indeterminate (loading) states.
 *
 * @example
 * // Determinate progress
 * <ProgressBar value={75} />
 *
 * @example
 * // With label
 * <ProgressBar value={50} showLabel />
 *
 * @example
 * // Custom label
 * <ProgressBar value={30} label="Processing..." />
 *
 * @example
 * // Indeterminate (loading) state
 * <ProgressBar />
 *
 * @example
 * // Success variant
 * <ProgressBar value={100} variant="success" />
 */
export function ProgressBar({
  value,
  size = 'md',
  variant = 'default',
  className,
  showLabel = false,
  label,
  animate = true,
}: ProgressBarProps) {
  const percentage = value !== undefined ? Math.min(100, Math.max(0, value)) : undefined
  const isIndeterminate = percentage === undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Progress bar track */}
      <div
        className={cn(
          'relative w-full rounded-full overflow-hidden',
          SIZE_MAP[size].container,
          BG_VARIANT_MAP[variant]
        )}
      >
        {/* Progress bar fill */}
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            VARIANT_MAP[variant],
            isIndeterminate && animate && 'animate-pulse',
            isIndeterminate && 'w-1/3'
          )}
          style={
            !isIndeterminate
              ? {
                  width: `${percentage}%`,
                  transition: animate ? 'width 0.3s ease-out' : 'none',
                }
              : undefined
          }
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          aria-valuetext={label}
        />
      </div>

      {/* Label */}
      {(showLabel || label) && (
        <div className="flex justify-between items-center text-xs">
          {label && (
            <span className="text-muted-foreground">{label}</span>
          )}
          {showLabel && !label && percentage !== undefined && (
            <span className="text-muted-foreground font-medium">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * CircularProgressProps - Circular progress indicator
 */
export interface CircularProgressProps {
  /**
   * Progress value (0-100)
   * If undefined, shows indeterminate loading state
   */
  value?: number

  /**
   * Size in pixels
   * @default 40
   */
  size?: number

  /**
   * Stroke width in pixels
   * @default 4
   */
  strokeWidth?: number

  /**
   * Visual variant
   * @default 'default'
   */
  variant?: ProgressBarVariant

  /**
   * Custom className for styling
   */
  className?: string

  /**
   * Whether to show percentage label in center
   * @default false
   */
  showLabel?: boolean
}

/**
 * CircularProgress - Circular progress indicator
 *
 * A circular progress indicator for displaying completion status.
 *
 * @example
 * // Circular progress
 * <CircularProgress value={75} />
 *
 * @example
 * // With label
 * <CircularProgress value={50} showLabel size={60} />
 *
 * @example
 * // Indeterminate state
 * <CircularProgress size={40} />
 */
export function CircularProgress({
  value,
  size = 40,
  strokeWidth = 4,
  variant = 'default',
  className,
  showLabel = false,
}: CircularProgressProps) {
  const percentage = value !== undefined ? Math.min(100, Math.max(0, value)) : undefined
  const isIndeterminate = percentage === undefined

  // Calculate circle properties
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = circumference
  const strokeDashoffset = isIndeterminate
    ? circumference * 0.75 // Show 25% for indeterminate
    : circumference - (percentage / 100) * circumference

  const center = size / 2

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className={cn(isIndeterminate && 'animate-spin')}
        style={{ animationDuration: '2s' }}
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={cn(
            'opacity-20',
            variant === 'default' ? 'text-foreground' : `text-${variant}`
          )}
          style={{ color: VARIANT_MAP[variant].replace('bg-', 'text-') }}
        />

        {/* Progress circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={cn(
            'transition-all duration-300 ease-out',
            isIndeterminate && 'animate-pulse',
            VARIANT_MAP[variant].replace('bg-', 'text-')
          )}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
            color: VARIANT_MAP[variant].replace('bg-', 'text-'),
          }}
        />
      </svg>

      {/* Center label */}
      {showLabel && percentage !== undefined && (
        <div
          className="absolute inset-0 flex items-center justify-center text-xs font-medium"
          style={{ fontSize: size * 0.3 }}
        >
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  )
}

/**
 * ProgressSteps - Step-by-step progress indicator
 */
export interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'completed' | 'error'
}

export interface ProgressStepsProps {
  steps: ProgressStep[]
  className?: string
}

/**
 * ProgressSteps - Multi-step progress indicator
 *
 * Displays progress through a series of steps.
 *
 * @example
 * const steps = [
 *   { id: '1', label: 'Upload', status: 'completed' },
 *   { id: '2', label: 'Process', status: 'active' },
 *   { id: '3', label: 'Complete', status: 'pending' }
 * ]
 * <ProgressSteps steps={steps} />
 */
export function ProgressSteps({ steps, className }: ProgressStepsProps) {
  return (
    <div className={cn('flex items-center w-full', className)}>
      {steps.map((step, index) => (
        <div key={step.id} className="flex-1 flex items-center">
          {/* Step */}
          <div className="flex flex-col items-center flex-1">
            {/* Step circle */}
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors',
                step.status === 'completed' && 'bg-green-500 border-green-500 text-white',
                step.status === 'active' && 'bg-primary border-primary text-primary-foreground',
                step.status === 'error' && 'bg-destructive border-destructive text-white',
                step.status === 'pending' && 'bg-background border-border text-muted-foreground'
              )}
            >
              {step.status === 'completed' ? '✓' : index + 1}
            </div>

            {/* Step label */}
            <span
              className={cn(
                'mt-2 text-xs text-center',
                step.status === 'active' ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
          </div>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <div
              className={cn(
                'flex-1 h-0.5 mx-2 transition-colors',
                step.status === 'completed' ? 'bg-green-500' : 'bg-border'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
