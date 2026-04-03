# Fix for MIME Type Module Loading Errors

## Problem
Browser error: "Expected a JavaScript module but server responded with MIME type of 'text/html'"

## Quick Fix (When You See This Error)

### Option 1: Use the Script
```bash
npm run fresh-start
```

### Option 2: Manual Steps
```bash
# 1. Stop the dev server (Ctrl+C)

# 2. Clear Vite cache
rm -rf node_modules/.vite dist .vite

# 3. Clear browser cache (IMPORTANT!)
# Chrome/Edge: Ctrl+Shift+Delete → Clear cached images and files
# Firefox: Ctrl+Shift+Delete → Cached Web Content
# Safari: Cmd+Shift+Delete → All cached data

# 4. Restart dev server
npm run dev

# 5. Hard refresh browser
# Chrome/Edge/Firefox: Ctrl+Shift+R
# Safari: Cmd+Shift+R
```

### Option 3: Use Incognito/Private Mode
- Open a new incognito/private window
- This bypasses browser cache completely

## Why This Happens
1. Browser caches JavaScript modules aggressively
2. Vite dev server may serve different files after restart
3. Browser tries to load cached files that no longer exist
4. Server returns HTML (404 page) instead of JavaScript
5. Browser expects JavaScript but gets HTML → MIME type error

## Prevention

### Updated Vite Config
The `vite.config.ts` has been updated with:
- `Cache-Control: no-store` headers to prevent aggressive caching
- Better hash-based file naming for cache busting
- Module preload polyfill for better compatibility

### Development Workflow
1. Always hard refresh after pulling new code: `Ctrl+Shift+R`
2. If you see the error, run: `npm run fresh-start`
3. Consider using incognito mode during active development

## Additional Solutions

### Browser Cache Settings (for Development)
**Chrome DevTools:**
1. Open DevTools (F12)
2. Go to Network tab
3. Check "Disable cache" while DevTools is open

**Firefox:**
1. Open DevTools (F12)
2. Click Settings (gear icon)
3. Check "Disable HTTP Cache (when toolbox is open)"

## Files Modified
- `vite.config.ts` - Updated with caching headers and build config
- `clear-cache.sh` - Script to clear all caches
- `package.json` - Added `fresh-start` and `clear-cache` commands
