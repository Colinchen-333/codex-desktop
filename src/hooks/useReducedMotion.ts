import { useState, useEffect } from 'react'

/**
 * Media query for detecting user's motion preference
 */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Hook to detect if the user prefers reduced motion.
 * Respects the `prefers-reduced-motion` media query for accessibility.
 *
 * This is useful for:
 * - Disabling or simplifying animations
 * - Providing alternative transitions
 * - Improving accessibility for users with vestibular motion disorders
 *
 * @returns `true` if user prefers reduced motion, `false` otherwise
 *
 * @example
 * ```tsx
 * function AnimatedComponent() {
 *   const prefersReducedMotion = useReducedMotion()
 *
 *   return (
 *     <div
 *       className={prefersReducedMotion ? 'no-animation' : 'animate-fade-in'}
 *     >
 *       Content
 *     </div>
 *   )
 * }
 * ```
 */
export function useReducedMotion(): boolean {
  // Initialize with the current preference if available
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(
    () => {
      // Check if window is available (SSR safety)
      if (typeof window === 'undefined') {
        return false
      }
      return window.matchMedia(REDUCED_MOTION_QUERY).matches
    }
  )

  useEffect(() => {
    // SSR safety check
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)

    // Handler for media query changes - this is called by the event listener
    // which is an external system (browser media query API), so setState is appropriate
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    // Modern browsers use addEventListener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      // Fallback for older browsers (Safari < 14)
      mediaQuery.addListener(handleChange)
      return () => mediaQuery.removeListener(handleChange)
    }
  }, [])

  return prefersReducedMotion
}

/**
 * Get animation duration based on user's motion preference.
 * Returns 0 or a reduced duration when user prefers reduced motion.
 *
 * @param normalDuration - Duration in milliseconds for normal motion
 * @param reducedDuration - Duration in milliseconds for reduced motion (default: 0)
 * @returns The appropriate duration based on user preference
 *
 * @example
 * ```tsx
 * function AnimatedComponent() {
 *   const duration = useAnimationDuration(300, 50)
 *   return <div style={{ transitionDuration: `${duration}ms` }}>Content</div>
 * }
 * ```
 */
export function useAnimationDuration(
  normalDuration: number,
  reducedDuration = 0
): number {
  const prefersReducedMotion = useReducedMotion()
  return prefersReducedMotion ? reducedDuration : normalDuration
}

/**
 * Configuration object for animations
 */
export interface AnimationConfig {
  duration?: number
  delay?: number
  [key: string]: unknown
}

/**
 * Get animation configuration based on user's motion preference.
 * Merges reduced motion config when user prefers reduced motion.
 *
 * @param config - Normal animation configuration
 * @param reducedConfig - Configuration to use when motion is reduced (optional)
 * @returns The appropriate configuration based on user preference
 *
 * @example
 * ```tsx
 * function AnimatedComponent() {
 *   const config = useAnimationConfig(
 *     { duration: 300, scale: 1.1 },
 *     { duration: 0, scale: 1 }
 *   )
 *   return <motion.div animate={config}>Content</motion.div>
 * }
 * ```
 */
export function useAnimationConfig<T extends AnimationConfig>(
  config: T,
  reducedConfig?: Partial<T>
): T {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    if (reducedConfig) {
      return { ...config, ...reducedConfig }
    }
    // Default: set duration and delay to 0
    return {
      ...config,
      duration: 0,
      delay: 0,
    }
  }

  return config
}

export default useReducedMotion
