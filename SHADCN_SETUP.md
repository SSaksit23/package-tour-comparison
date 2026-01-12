# Setting up shadcn/ui for Map Component

## Issue
The project doesn't have shadcn/ui properly configured. shadcn/ui requires:
1. Tailwind CSS as a dependency (not CDN)
2. PostCSS configuration
3. Proper path aliases
4. Utility functions

## Setup Steps

### 1. Install Required Dependencies

Run these commands in your project directory:

```bash
npm install -D tailwindcss postcss autoprefixer
npm install class-variance-authority clsx tailwind-merge
npm install @radix-ui/react-slot lucide-react
```

### 2. Initialize Tailwind CSS

```bash
npx tailwindcss init -p
```

### 3. Configuration Files

The following files have been created/updated:
- `components.json` - shadcn/ui configuration
- `tailwind.config.js` - Tailwind configuration
- `postcss.config.js` - PostCSS configuration
- `lib/utils.ts` - Utility functions
- Updated `index.css` - Added Tailwind directives

### 4. Install the Map Component

After completing the setup, run:

```bash
npx shadcn@latest add https://mapcn.vercel.app/maps/map.json
```

## Alternative: Manual Installation

If the automated installation doesn't work due to path encoding issues, you can:

1. Download the map component JSON manually
2. Extract the component files manually
3. Install dependencies manually

