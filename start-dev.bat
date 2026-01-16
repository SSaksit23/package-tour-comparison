@echo off
REM ===========================================
REM Itinerary Analyzer - Development Start Script
REM ===========================================

echo.
echo 🚀 Starting Itinerary Analyzer...
echo.

REM Check if .env file exists
if not exist ".env" (
    echo ❌ Error: .env file not found!
    echo.
    echo Please create a .env file with your API keys:
    echo   OPENAI_API_KEY=sk-your_openai_api_key_here
    echo   or
    echo   VITE_GEMINI_API_KEY=your_gemini_api_key_here
    echo.
    pause
    exit /b 1
)

echo 📁 Loading environment variables from .env...

REM Load environment variables from .env file
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    REM Skip comments
    echo %%a | findstr /r "^#" >nul || (
        set "%%a=%%b"
        echo   ✓ %%a loaded
    )
)

echo.
echo ✅ Environment loaded successfully!
echo.
echo Select run mode:
echo   1. Docker (Full Stack) - ArangoDB + ChromaDB + Backend + Frontend
echo   2. Local (npm run dev) - Quick start, frontend only
echo.
set /p choice="Enter choice (1 or 2): "

if "%choice%"=="1" (
    echo.
    echo 🐳 Starting Docker containers...
    echo    - ArangoDB: http://localhost:8529
    echo    - ChromaDB: http://localhost:8000
    echo    - Backend: http://localhost:5001
    echo    - Frontend: http://localhost:3001
    echo.
    docker-compose up dev --build
) else (
    echo.
    echo ⚡ Starting local development server...
    echo    - App: http://localhost:3000
    echo    - Note: Backend services won't be available
    echo.
    npm run dev
)
