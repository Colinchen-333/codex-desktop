import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

/**
 * Spinner Sizes
 */
export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * Spinner Props
 */
export interface SpinnerProps {
  /**
   * Size of the spinner
   * @default 'md'
   */
  size?: SpinnerSize

  /**
   * Custom className for styling
   */
  className?: string

  /**
   * Color variant
   * @default 'default'
   */
  variant?: 'default' | 'primary' | 'destructive' | 'success'
}

/**
 * Size configurations
 */
const SIZE_MAP: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
}

/**
 * Color variant configurations
 */
const VARIANT_MAP: Record<
  SpinnerProps['variant'],
  string
> = {
  default: 'text-muted-foreground',
  primary: 'text-primary',
  destructive: 'text-destructive',
  success: 'text-green-500',
}

/**
 * Spinner - Loading animation component
 *
 * A reusable spinner component for indicating loading states.
 * Uses lucide-react's Loader2 icon with spin animation.
 *
 * @example
 * // Default size
 * <Spinner />
 *
 * @example
 * // Custom size and color
 * <Spinner size="lg" variant="primary" />
 *
 * @example
 * // With custom className
 * <Spinner className="mr-2" />
 */
export function Spinner({
  size = 'md',
  className,
  variant = 'default',
}: SpinnerProps) {
  return (
    <Loader2
      className={cn(
        'animate-spin',
        SIZE_MAP[size],
        VARIANT_MAP[variant],
        className
      )}
    />
  )
}

/**
 * SpinnerWithText - Spinner with accompanying text
 */
export interface SpinnerWithTextProps extends SpinnerProps {
  text?: string
  textPosition?: 'left' | 'right' | 'top' | 'bottom'
}

/**
 * Spinner with text label
 *
 * @example
 * <SpinnerWithText text="Loading..." />
 */
export function SpinnerWithText({
  text,
  textPosition = 'right',
  size = 'md',
  className,
  variant = 'default',
}: SpinnerWithTextProps) {
  if (!text) {
    return <Spinner size={size} className={className} variant={variant} />
  }

  const orientationClasses = {
    left: 'flex-row-reverse',
    right: 'flex-row',
    top: 'flex-col-reverse',
    bottom: 'flex-col',
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        orientationClasses[textPosition],
        className
      )}
    >
      <Spinner size={size} variant={variant} />
      <span className={cn(
        'text-sm',
        variant === 'default' ? 'text-muted-foreground' : VARIANT_MAP[variant]
      )}>
        {text}
      </span>
    </div>
  )
}

/**
 * CenteredSpinner - Full-screen centered spinner
 */
export interface CenteredSpinnerProps extends SpinnerProps {
  /**
   * Background overlay
   * @default true
   */
  overlay?: boolean

  /**
   * Message to display below spinner
   */
  message?: string
}

/**
 * Centered spinner for full-screen loading states
 *
 * @example
 * <CenteredSpinner message="Loading data..." />
 */
export function CenteredSpinner({
  size = 'lg',
  className,
  variant = 'primary',
  overlay = true,
  message,
}: CenteredSpinnerProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        overlay && 'fixed inset-0 bg-background/80 backdrop-blur-sm',
        className
      )}
    >
      <Spinner size={size} variant={variant} />
      {message && (
        <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  )
}

/**
 * InlineSpinner - Compact spinner for inline loading states
 *
 * @example
 * <InlineSpinner /> Loading data...
 */
export function InlineSpinner({
  size = 'sm',
  className,
  variant = 'default',
}: SpinnerProps) {
  return (
    <Spinner
      size={size}
      className={cn('inline-block align-middle', className)}
      variant={variant}
    />
  )
}
