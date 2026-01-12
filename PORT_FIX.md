# Port Configuration Fix

## Issue
You're trying to access `localhost:3000`, but the Docker configuration maps the app to port **3001**.

## Solution

### 1. Use the Correct Port

Access the app at:
```
http://localhost:3001
```

NOT `localhost:3000`

### 2. Check if Containers are Running

Run these commands to check status:

```powershell
# Check container status
docker ps

# Or check all containers (including stopped)
docker ps -a

# Check docker-compose status
docker-compose ps
```

### 3. Start Containers (if not running)

If containers aren't running, start them:

```powershell
# Navigate to project directory first
cd "C:\Users\saksi\OneDrive\文档\itin-analyzer"

# Start containers
docker-compose up dev --build

# Or use the start script
.\start-docker.ps1
```

### 4. Check Logs for Errors

If containers are running but not working:

```powershell
# Check dev container logs
docker-compose logs dev

# Follow logs in real-time
docker-compose logs -f dev
```

## Port Mapping Explanation

From `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Host:Container
```

- **3001** = Port on your host machine (what you access in browser)
- **3000** = Port inside the container (where Vite runs)

So always use **http://localhost:3001** to access the app!
