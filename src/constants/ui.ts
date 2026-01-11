/**
 * UI Constants
 *
 * Centralized UI-related constants including sizes, breakpoints,
 * z-indexes, and other visual configuration values.
 */

/**
 * Z-index layers
 * Ensures proper stacking order for layered components
 */
export const Z_INDEX = {
  /** Base layer */
  BASE: 0,

  /** Dropdown menus */
  DROPDOWN: 10,

  /** Sticky headers */
  STICKY: 20,

  /** Fixed sidebars */
  SIDEBAR: 30,

  /** Modals and dialogs */
  MODAL: 40,

  /** Toast notifications */
  TOAST: 50,

  /** Tooltips */
  TOOLTIP: 60,

  /** Maximum z-index for overlays */
  MAX: 9999,
} as const

/**
 * Breakpoint values (in pixels)
 * Matches Tailwind CSS default breakpoints
 */
export const BREAKPOINTS = {
  /** Small screens */
  SM: 640,

  /** Medium screens */
  MD: 768,

  /** Large screens */
  LG: 1024,

  /** Extra large screens */
  XL: 1280,

  /** 2X large screens */
  XL2: 1536,
} as const

/**
 * Container sizes (in pixels)
 */
export const CONTAINER_SIZES = {
  /** Maximum width for modal dialogs */
  MODAL: 600,

  /** Maximum width for settings dialogs */
  SETTINGS_DIALOG: 1024,

  /** Maximum width for narrow dialogs */
  DIALOG_NARROW: 400,

  /** Maximum width for wide dialogs */
  DIALOG_WIDE: 800,

  /** Sidebar width */
  SIDEBAR: 280,

  /** Collapsed sidebar width */
  SIDEBAR_COLLAPSED: 60,
} as const

/**
 * Icon sizes (in pixels)
 */
export const ICON_SIZES = {
  /** Extra small icon */
  XS: 12,

  /** Small icon */
  SM: 14,

  /** Base icon size */
  BASE: 16,

  /** Medium icon */
  MD: 20,

  /** Large icon */
  LG: 24,

  /** Extra large icon */
  XL: 32,

  /** 2X large icon */
  XL2: 48,
} as const

/**
 * Font sizes (in pixels/tailwind classes)
 */
export const FONT_SIZES = {
  /** Extra small text */
  XS: '0.75rem', // 12px

  /** Small text */
  SM: '0.875rem', // 14px

  /** Base text size */
  BASE: '1rem', // 16px

  /** Large text */
  LG: '1.125rem', // 18px

  /** Extra large text */
  XL: '1.25rem', // 20px

  /** 2X large text */
  XL2: '1.5rem', // 24px

  /** 3X large text */
  XL3: '1.875rem', // 30px

  /** 4X large text */
  XL4: '2.25rem', // 36px
} as const

/**
 * Spacing values (in pixels/tailwind classes)
 */
export const SPACING = {
  /** Extra small spacing */
  XS: '0.5rem', // 8px

  /** Small spacing */
  SM: '0.75rem', // 12px

  /** Base spacing */
  BASE: '1rem', // 16px

  /** Medium spacing */
  MD: '1.5rem', // 24px

  /** Large spacing */
  LG: '2rem', // 32px

  /** Extra large spacing */
  XL: '3rem', // 48px

  /** 2X large spacing */
  XL2: '4rem', // 64px
} as const

/**
 * Border radius values
 */
export const BORDER_RADIUS = {
  /** Small border radius */
  SM: '0.25rem', // 4px

  /** Base border radius */
  BASE: '0.5rem', // 8px

  /** Medium border radius */
  MD: '0.75rem', // 12px

  /** Large border radius */
  LG: '1rem', // 16px

  /** Extra large border radius */
  XL: '1.5rem', // 24px

  /** Full pill shape */
  FULL: '9999px',
} as const

/**
 * Search relevance scores
 */
export const SEARCH_SCORES = {
  /** Exact title match */
  EXACT_TITLE_MATCH: 100,

  /** Title prefix match */
  TITLE_PREFIX_MATCH: 80,

  /** Title contains match */
  TITLE_CONTAINS_MATCH: 60,

  /** Exact description match */
  EXACT_DESCRIPTION_MATCH: 40,

  /** Description contains match */
  DESCRIPTION_CONTAINS_MATCH: 20,
} as const

/**
 * File path limits
 */
export const FILE_PATH_LIMITS = {
  /** Maximum characters for truncated file path */
  TRUNCATED: 80,

  /** Maximum characters for full file path in tooltip */
  TOOLTIP: 200,

  /** Maximum depth for folder display */
  MAX_DEPTH: 5,
} as const

/**
 * UI state thresholds
 */
export const UI_THRESHOLDS = {
  /** Maximum items before showing "show more" */
  MAX_VISIBLE_ITEMS: 10,

  /** Maximum items before virtual scrolling */
  VIRTUAL_SCROLL_THRESHOLD: 100,

  /** Minimum width for responsive layout */
  MIN_RESPONSIVE_WIDTH: 320,

  /** Touch device detection threshold (in pixels) */
  TOUCH_DEVICE: 768,
} as const
