# Application Constants

This directory contains centralized constants for the Codex Desktop application. Using constants instead of magic numbers improves code maintainability and consistency.

## Structure

### `timeouts.ts`
Timing-related constants for async operations, caching, polling, and delays.

- `POLL_INTERVALS` - Intervals for polling operations (git status, server status, etc.)
- `CACHE_TTL` - Cache durations for various data types
- `TIMEOUTS` - Maximum wait times for operations
- `DELAYS` - Debounce and delay durations
- `ANIMATION_DURATIONS` - Animation timing values

### `ui.ts`
User interface constants for consistent design and layout.

- `Z_INDEX` - Stacking order layers
- `BREAKPOINTS` - Responsive design breakpoints
- `CONTAINER_SIZES` - Standard container widths
- `ICON_SIZES` - Icon dimension presets
- `FONT_SIZES` - Typography scale
- `SPACING` - Layout spacing values
- `BORDER_RADIUS` - Corner radius values
- `SEARCH_SCORES` - Search relevance scoring
- `FILE_PATH_LIMITS` - File path display limits
- `UI_THRESHOLDS` - UI state thresholds

### `animations.ts`
Animation and motion design constants.

- `EASING` - Animation easing functions
- `DURATIONS` - Animation timing
- `DELAYS` - Animation delays
- `STAGGER` - Stagger animation timings
- `SPRINGS` - Physics-based spring configurations
- `KEYFRAMES` - Named animation keyframes
- `PRESETS` - Pre-configured animation combinations
- `TRANSITIONS` - CSS transition shortcuts
- `REDUCED_MOTION` - Accessibility preferences

## Usage

### Importing Constants

```typescript
// Import specific constants
import { POLL_INTERVALS, Z_INDEX, DURATIONS } from '@/constants'

// Import from specific module
import { CACHE_TTL } from '@/constants/timeouts'
import { FONT_SIZES } from '@/constants/ui'
```

### Examples

#### Using Timeout Constants

```typescript
// ❌ Before: Magic number
setInterval(fetchStatus, 30000)

// ✅ After: Named constant
import { POLL_INTERVALS } from '@/constants'

setInterval(fetchStatus, POLL_INTERVALS.GIT_STATUS)
```

#### Using UI Constants

```typescript
// ❌ Before: Magic number
const maxWidth = 600
const zIndex = 40

// ✅ After: Named constant
import { CONTAINER_SIZES, Z_INDEX } from '@/constants'

const maxWidth = CONTAINER_SIZES.MODAL
const zIndex = Z_INDEX.MODAL
```

#### Using Animation Constants

```typescript
// ❌ Before: Magic number
<div style={{ transitionDuration: '300ms' }}>

// ✅ After: Named constant
import { DURATIONS, TRANSITIONS } from '@/constants'

<div style={{ transitionDuration: `${DURATIONS.MEDIUM}ms` }}>

// Or use preset
<div style={{ transition: TRANSITIONS.FADE }}>
```

## Benefits

1. **Maintainability** - Update values in one place
2. **Consistency** - Use the same values across the app
3. **Readability** - Self-documenting code
4. **Type Safety** - Full TypeScript support
5. **Scalability** - Easy to add new constants

## Adding New Constants

When adding new constants:

1. **Choose the right file**:
   - Time-related → `timeouts.ts`
   - Visual/layout → `ui.ts`
   - Animation → `animations.ts`

2. **Follow the pattern**:
   ```typescript
   export const CATEGORY = {
     /** Description of the constant */
     CONSTANT_NAME: value,
   } as const
   ```

3. **Add JSDoc comments** explaining the purpose
4. **Export from index.ts** if it's a commonly used constant
5. **Update this README** if adding a new category

## Migration Guide

To migrate existing magic numbers:

1. Find magic numbers in the code
2. Determine if a constant already exists
3. If not, add it to the appropriate file
4. Replace the magic number with the constant
5. Test to ensure behavior is unchanged

### Example Migration

```typescript
// Before
setTimeout(() => {
  setIsLoading(false)
}, 5000)

// After
import { DELAYS } from '@/constants'

setTimeout(() => {
  setIsLoading(false)
}, DELAYS.TOAST_HIDE_DELAY)
```

## Best Practices

1. **Use constants for any value that appears more than once**
2. **Use constants for values with specific meaning** (even if used once)
3. **Keep constants descriptive and self-documenting**
4. **Use `as const` for object literals to prevent mutation**
5. **Group related constants together**
6. **Provide JSDoc comments for clarity**

## Related Documentation

- [Tailwind CSS Configuration](../tailwind.config.js)
- [Animation Utilities](../components/ui/loading/)
- [Error Handling](../lib/errorUtils.ts)
