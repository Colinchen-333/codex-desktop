/**
 * Animation Constants
 *
 * Centralized animation configuration for consistent motion design
 * across the application.
 */

/**
 * Animation easings
 * Corresponds to common Tailwind CSS easings
 */
export const EASING = {
  /** Linear easing */
  LINEAR: 'linear',

  /** Ease in */
  EASE_IN: 'ease-in',

  /** Ease out */
  EASE_OUT: 'ease-out',

  /** Ease in and out */
  EASE_IN_OUT: 'ease-in-out',

  /** Custom cubic bezier for smooth animations */
  SMOOTH: 'cubic-bezier(0.4, 0, 0.2, 1)',

  /** Bouncy easing for playful animations */
  BOUNCE: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',

  /** Sharp easing for snappy transitions */
  SHARP: 'cubic-bezier(0.4, 0, 0.6, 1)',
} as const

/**
 * Animation durations (in milliseconds)
 */
export const DURATIONS = {
  /** Instant transition (no animation) */
  INSTANT: 0,

  /** Fast transition for subtle feedback */
  FAST: 150,

  /** Default transition speed */
  DEFAULT: 200,

  /** Medium transition for noticeable animations */
  MEDIUM: 300,

  /** Slow transition for emphasis */
  SLOW: 500,

  /** Extra slow for major state changes */
  EXTRA_SLOW: 1000,
} as const

/**
 * Animation delays (in milliseconds)
 */
export const DELAYS = {
  /** No delay */
  NONE: 0,

  /** Short delay for sequential animations */
  SHORT: 50,

  /** Default delay */
  DEFAULT: 100,

  /** Medium delay */
  MEDIUM: 200,

  /** Long delay for staggered animations */
  LONG: 300,
} as const

/**
 * Stagger delays for list animations (in milliseconds)
 */
export const STAGGER = {
  /** Fast stagger for many items */
  FAST: 25,

  /** Default stagger */
  DEFAULT: 50,

  /** Slow stagger for emphasis */
  SLOW: 100,

  /** Extra slow for dramatic effect */
  EXTRA_SLOW: 150,
} as const

/**
 * Spring animation configurations
 * For physics-based animations
 */
export const SPRINGS = {
  /** Gentle spring for subtle movements */
  GENTLE: {
    stiffness: 300,
    damping: 30,
  },

  /** Default spring */
  DEFAULT: {
    stiffness: 400,
    damping: 25,
  },

  /** Snappy spring for quick movements */
  SNAPPY: {
    stiffness: 500,
    damping: 20,
  },

  /** Bouncy spring for playful interactions */
  BOUNCY: {
    stiffness: 400,
    damping: 10,
  },
} as const

/**
 * Keyframe animation names
 */
export const KEYFRAMES = {
  /** Fade in animation */
  FADE_IN: 'fade-in',

  /** Fade out animation */
  FADE_OUT: 'fade-out',

  /** Slide in from top */
  SLIDE_IN_TOP: 'slide-in-from-top',

  /** Slide in from bottom */
  SLIDE_IN_BOTTOM: 'slide-in-from-bottom',

  /** Slide in from left */
  SLIDE_IN_LEFT: 'slide-in-from-left',

  /** Slide in from right */
  SLIDE_IN_RIGHT: 'slide-in-from-right',

  /** Zoom in animation */
  ZOOM_IN: 'zoom-in',

  /** Zoom out animation */
  ZOOM_OUT: 'zoom-out',

  /** Spin animation */
  SPIN: 'spin',

  /** Ping animation */
  PING: 'ping',

  /** Pulse animation */
  PULSE: 'pulse',

  /** Bounce animation */
  BOUNCE: 'bounce',
} as const

/**
 * Animation presets
 * Pre-configured animation combinations
 */
export const PRESETS = {
  /** Fade in with slide from bottom */
  FADE_SLIDE_UP: {
    duration: DURATIONS.MEDIUM,
    easing: EASING.EASE_OUT,
    keyframes: [KEYFRAMES.FADE_IN, KEYFRAMES.SLIDE_IN_BOTTOM],
  },

  /** Fade in with zoom */
  FADE_ZOOM_IN: {
    duration: DURATIONS.DEFAULT,
    easing: EASING.EASE_OUT,
    keyframes: [KEYFRAMES.FADE_IN, KEYFRAMES.ZOOM_IN],
  },

  /** Quick fade transition */
  FADE: {
    duration: DURATIONS.FAST,
    easing: EASING.LINEAR,
    keyframes: [KEYFRAMES.FADE_IN],
  },

  /** Slide in from right */
  SLIDE_IN: {
    duration: DURATIONS.DEFAULT,
    easing: EASING.EASE_OUT,
    keyframes: [KEYFRAMES.SLIDE_IN_RIGHT],
  },

  /** Bouncy entrance */
  BOUNCE_IN: {
    duration: DURATIONS.SLOW,
    easing: EASING.BOUNCE,
    keyframes: [KEYFRAMES.ZOOM_IN],
  },

  /** Continuous loading animation */
  LOADING: {
    duration: 1000,
    easing: EASING.LINEAR,
    keyframes: [KEYFRAMES.SPIN],
    infinite: true,
  },
} as const

/**
 * Transition properties
 * Common CSS transition property combinations
 */
export const TRANSITIONS = {
  /** Fade opacity transition */
  FADE: 'opacity 150ms ease-in-out',

  /** Transform transition */
  TRANSFORM: 'transform 200ms ease-out',

  /** Color transition */
  COLOR: 'color 150ms ease-in-out, background-color 150ms ease-in-out, border-color 150ms ease-in-out',

  /** All properties transition */
  ALL: 'all 200ms ease-out',

  /** Layout transition */
  LAYOUT: 'transform 200ms ease-out, opacity 200ms ease-in-out',
} as const

/**
 * Reduced motion preferences
 * For users who prefer reduced motion
 */
export const REDUCED_MOTION = {
  /** Duration when reduced motion is preferred */
  DURATION: 0,

  /** Easing when reduced motion is preferred */
  EASING: EASING.LINEAR,

  /** Whether to disable animations when reduced motion is preferred */
  DISABLE_ANIMATIONS: true,
} as const
