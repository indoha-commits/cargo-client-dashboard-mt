#!/bin/bash

# Script to clear Vite cache and fix MIME type issues
# Run this whenever you encounter "Expected a JavaScript module" errors

echo "🧹 Clearing Vite cache and build artifacts..."

# Kill any running dev servers
pkill -f "vite" 2>/dev/null || true

# Clear Vite cache
rm -rf node_modules/.vite
rm -rf dist
rm -rf .vite

# Clear npm cache for this project
npm cache clean --force 2>/dev/null || true

echo "✅ Cache cleared!"
echo ""
echo "Now run: npm run dev"
echo ""
echo "📝 Also clear your browser cache:"
echo "   - Chrome/Edge: Ctrl+Shift+Delete → Clear cached images and files"
echo "   - Firefox: Ctrl+Shift+Delete → Cached Web Content"
echo "   - Or use Incognito/Private mode for testing"
