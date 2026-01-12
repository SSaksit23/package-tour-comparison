# 🐳 Docker Setup for Itinerary Analyzer

This guide explains how to run the Itinerary Analyzer using Docker.

## Quick Start

### Windows (Easy Way)

**Option 1: Double-click**
```
start-docker.bat
```

**Option 2: PowerShell**
```powershell
.\start-docker.ps1
```

### Manual Start

```bash
# Build and start
docker-compose -f docker-compose.local.yml up --build

# Or run in background
docker-compose -f docker-compose.local.yml up --build -d
```

## URLs

Once running, access the app at:

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:3000 |
| **Backend API** | http://localhost:5001 |
| **API Documentation** | http://localhost:5001/docs |

## Configuration

### Required: Create `.env` file

Copy `env.example` to `.env` and add your API keys:

```bash
cp env.example .env
```

### Minimum Required Keys

At least one AI provider is needed:

```env
# Option 1: Gemini (recommended - free tier available)
VITE_GEMINI_API_KEY=your_gemini_key

# Option 2: OpenAI
OPENAI_API_KEY=your_openai_key
```

### Optional Keys (for enhanced features)

```env
# Web search for real-time travel data
EXA_API_KEY=your_exa_key

# Agent monitoring
AGENTOPS_API_KEY=your_agentops_key
```

## Commands

### Start
```bash
docker-compose -f docker-compose.local.yml up --build -d
```

### Stop
```bash
docker-compose -f docker-compose.local.yml down
```

### View Logs
```bash
# All services
docker-compose -f docker-compose.local.yml logs -f

# Frontend only
docker-compose -f docker-compose.local.yml logs -f frontend

# Backend only
docker-compose -f docker-compose.local.yml logs -f backend
```

### Rebuild (after code changes)
```bash
docker-compose -f docker-compose.local.yml up --build
```

### Clean Restart
```bash
docker-compose -f docker-compose.local.yml down
docker-compose -f docker-compose.local.yml up --build -d
```

## Services

### Frontend Container
- **Image**: Node 20 Alpine
- **Port**: 3000
- **Features**: 
  - React + Vite with hot reload
  - PDF/DOCX/Image upload
  - AI-powered analysis

### Backend Container
- **Image**: Python 3.11 Slim
- **Port**: 5001
- **Features**:
  - PDF extraction (PyMuPDF)
  - AI Agents (CrewAI)
  - Memory (Mem0)
  - Web Search (EXA)

## Troubleshooting

### "Docker is not running"
- Make sure Docker Desktop is running
- On Windows, check the system tray for Docker icon

### "Port already in use"
```bash
# Check what's using port 3000
netstat -ano | findstr :3000

# Or change the port in docker-compose.local.yml
ports:
  - "3001:3000"  # Use port 3001 instead
```

### "Build failed"
```bash
# Clean Docker cache and rebuild
docker-compose -f docker-compose.local.yml down
docker system prune -f
docker-compose -f docker-compose.local.yml up --build
```

### Backend health check failing
- Check if all required environment variables are set
- View logs: `docker-compose -f docker-compose.local.yml logs backend`

## Full Stack with Databases

For the complete stack with ArangoDB and ChromaDB:

```bash
docker-compose up --build
```

This includes:
- Frontend (port 3000)
- Backend (port 5001)
- ArangoDB (port 8529)
- ChromaDB (port 8000)

