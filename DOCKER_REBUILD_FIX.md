# Docker Rebuild Fix - Missing Tailwind CSS Dependencies

## Problem
The error `Cannot find module 'tailwindcss'` occurs because:
- The Docker container was built before we added Tailwind CSS and related dependencies
- The container's `node_modules` doesn't include the new packages
- Volume mount preserves the old `node_modules` from the container

## Solution: Rebuild the Docker Container

You need to rebuild the container to install the new dependencies.

### Option 1: Stop and Rebuild (Recommended)

```bash
# Stop all containers
docker-compose down

# Rebuild and start
docker-compose up dev --build
```

### Option 2: Rebuild Without Cache

If Option 1 doesn't work, force a clean rebuild:

```bash
# Stop containers
docker-compose down

# Rebuild without cache
docker-compose build --no-cache dev

# Start
docker-compose up dev
```

### Option 3: Manual Install in Container (Quick Test)

If you want to test without full rebuild:

```bash
# Enter the running container
docker exec -it itin-analyzer-dev sh

# Inside container, install dependencies
npm install

# Exit container
exit

# Restart the container
docker-compose restart dev
```

**Note:** Option 3 is temporary - the changes will be lost when you rebuild. Option 1 or 2 is the proper solution.

## Why This Happens

1. Dockerfile runs `npm install` during the build
2. At build time, `package.json` didn't have `tailwindcss` yet
3. Volume mount `/app/node_modules` uses the container's node_modules
4. New dependencies in package.json aren't installed until rebuild

## Verification

After rebuilding, check the logs:

```bash
docker-compose logs dev
```

You should see Vite starting successfully without PostCSS errors.
