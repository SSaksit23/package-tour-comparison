# Docker App Fix - CSS Import Issue

## Problem
The app was showing only a huge icon with nothing else when running in Docker because:
1. ❌ `index.css` was not imported in the JavaScript entry point
2. ❌ Tailwind CSS directives (`@tailwind`) need to be processed by Vite/PostCSS
3. ❌ CSS was only linked in HTML, not imported in JS

## Solution Applied

### 1. Added CSS Import to `index.tsx`
```typescript
import './index.css';
```

This allows Vite to process the Tailwind directives during the build.

### 2. Removed CSS Link from `index.html`
Removed `<link rel="stylesheet" href="/index.css">` since Vite will handle CSS injection automatically when imported in JS.

### 3. Fixed CSS Syntax Errors
Fixed maplibregl popup styles that had incorrect `!` syntax in `@apply` directives.

### 4. Added Legacy Color Support
Added custom color classes (`surface`, `on-surface`, etc.) to `tailwind.config.js` to maintain compatibility with existing components.

## Next Steps

1. **Rebuild the Docker container:**
   ```bash
   docker-compose down
   docker-compose up dev --build
   ```

2. **Or restart if already running:**
   ```bash
   docker-compose restart dev
   ```

3. **Verify the fix:**
   - Open http://localhost:3001 (or 3000 if using different port)
   - The app should now display properly with all styles

## Why This Happened

When we migrated from Tailwind CDN to npm package:
- Tailwind CDN processes CSS on the client side
- npm package requires build-time processing via PostCSS
- Vite needs to see the CSS import to process it
- Linking CSS in HTML doesn't trigger Vite's processing pipeline

## Files Changed
- ✅ `index.tsx` - Added CSS import
- ✅ `index.html` - Removed CSS link (Vite handles it)
- ✅ `index.css` - Fixed syntax errors
- ✅ `tailwind.config.js` - Added legacy color support
