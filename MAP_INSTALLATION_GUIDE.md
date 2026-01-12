# Map Component Installation Guide

## Problem
The command `npx shadcn@latest add https://mapcn.vercel.app/maps/map.json` was failing because:
1. ❌ shadcn/ui was not initialized (no `components.json`)
2. ❌ Tailwind CSS was only available via CDN, not as a dependency
3. ❌ Missing required configuration files (tailwind.config.js, postcss.config.js)
4. ❌ Missing utility functions (lib/utils.ts)
5. ❌ Path encoding issues with Chinese characters in directory path

## Solution Applied

I've set up shadcn/ui for your project. The following files have been created/updated:

### ✅ Created Files:
- `components.json` - shadcn/ui configuration
- `tailwind.config.js` - Tailwind CSS configuration  
- `postcss.config.js` - PostCSS configuration
- `lib/utils.ts` - Utility functions for shadcn components
- `SHADCN_SETUP.md` - Setup documentation

### ✅ Updated Files:
- `package.json` - Added required dependencies
- `index.css` - Added Tailwind directives and CSS variables
- `index.html` - Removed Tailwind CDN (now using npm package)
- `vite.config.ts` - Already had path aliases configured ✓

## Next Steps

### 1. Install Dependencies

Run this command in your project directory:

```bash
npm install
```

This will install:
- Tailwind CSS and PostCSS
- shadcn/ui dependencies (class-variance-authority, clsx, tailwind-merge)
- Radix UI components
- Lucide React icons

### 2. Install the Map Component

After dependencies are installed, try the installation again:

```bash
npx shadcn@latest add https://mapcn.vercel.app/maps/map.json
```

### 3. If Installation Still Fails

If you still encounter path encoding issues with the Chinese characters in your directory path, you can:

#### Option A: Use a different terminal/code location
```bash
# Copy project to a path without special characters
# Then run: npx shadcn@latest add https://mapcn.vercel.app/maps/map.json
```

#### Option B: Manual Installation

1. Download the component JSON:
   ```bash
   curl https://mapcn.vercel.app/maps/map.json -o map-component.json
   ```

2. Check what files are needed:
   ```bash
   cat map-component.json
   ```

3. Create the component files manually based on the JSON structure

#### Option C: Use PowerShell with UTF-8 encoding

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:LC_ALL = "en_US.UTF-8"
npx shadcn@latest add https://mapcn.vercel.app/maps/map.json
```

## Verification

After installation, verify the setup:

1. Check if component was added:
   ```bash
   ls components/ui/
   ```

2. Check if dependencies are installed:
   ```bash
   npm list tailwindcss
   ```

3. Test the build:
   ```bash
   npm run build
   ```

## Additional Notes

- The Tailwind CDN has been removed from `index.html` - we now use the npm package
- Path aliases are already configured in `vite.config.ts` for `@/` imports
- The existing font configuration (Roboto Slab, Sarabun) is preserved in `tailwind.config.js`
- CSS variables for theming are added to `index.css`

## Troubleshooting

### "Cannot find module 'tailwindcss'"
```bash
npm install -D tailwindcss postcss autoprefixer
```

### "components.json not found"
The file should be in the project root. Verify with:
```bash
ls components.json
```

### Build errors after installation
1. Clear cache: `rm -rf node_modules/.vite`
2. Reinstall: `rm -rf node_modules && npm install`
3. Rebuild: `npm run build`

## References

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [MapCN Component](https://mapcn.vercel.app)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

