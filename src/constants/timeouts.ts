/**
 * Timeout Constants
 *
 * Centralized timeout values for async operations, polling intervals,
 * and delays throughout the application.
 */

/**
 * Polling intervals (in milliseconds)
 */
export const POLL_INTERVALS = {
  /** Git status polling interval */
  GIT_STATUS: 30_000, // 30 seconds

  /** Server status polling interval */
  SERVER_STATUS: 60_000, // 60 seconds

  /** Account info refresh interval */
  ACCOUNT_INFO: 60_000, // 60 seconds

  /** MCP OAuth login check interval */
  MCP_OAUTH_LOGIN_CHECK: 2_000, // 2 seconds
} as const

/**
 * Cache TTL (time-to-live) durations (in milliseconds)
 */
export const CACHE_TTL = {
  /** Models list cache duration */
  MODELS: 5 * 60 * 1000, // 5 minutes

  /** Skills cache duration */
  SKILLS: 60 * 1000, // 1 minute

  /** MCP servers cache duration */
  MCP_SERVERS: 2 * 60 * 1000, // 2 minutes

  /** Account info cache duration */
  ACCOUNT_INFO: 60 * 1000, // 1 minute

  /** Git info cache duration */
  GIT_INFO: 30 * 1000, // 30 seconds
} as const

/**
 * Operation timeouts (in milliseconds)
 */
export const TIMEOUTS = {
  /** Thread resume operation timeout */
  THREAD_RESUME: 30_000, // 30 seconds

  /** MCP OAuth login timeout */
  MCP_OAUTH_LOGIN: 60_000, // 60 seconds

  /** Async operation default timeout */
  DEFAULT_ASYNC: 10_000, // 10 seconds

  /** File operation timeout */
  FILE_OPERATION: 5_000, // 5 seconds

  /** Network request timeout */
  NETWORK_REQUEST: 15_000, // 15 seconds
} as const

/**
 * Delays (in milliseconds)
 */
export const DELAYS = {
  /** Debounce delay for search input */
  SEARCH_DEBOUNCE: 300,

  /** Debounce delay for auto-save */
  AUTO_SAVE_DEBOUNCE: 1_000,

  /** Delay before showing loading state */
  LOADING_DELAY: 200,

  /** Delay before hiding toast notifications */
  TOAST_HIDE_DELAY: 5_000,

  /** Delay for double-escape shortcut */
  DOUBLE_ESCAPE: 1_500, // 1.5 seconds
} as const

/**
 * Animation durations (in milliseconds)
 */
export const ANIMATION_DURATIONS = {
  /** Fast transition */
  FAST: 150,

  /** Default transition */
  DEFAULT: 200,

  /** Medium transition */
  MEDIUM: 300,

  /** Slow transition */
  SLOW: 500,

  /** Extra slow transition */
  EXTRA_SLOW: 1_000,
} as const
