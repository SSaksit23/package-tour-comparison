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
    echo   GEMINI_API_KEY=your_gemini_api_key_here
    echo   NEO4J_URI=bolt://localhost:7687
    echo   NEO4J_USER=neo4j
    echo   NEO4J_PASSWORD=password123
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

REM Check if GEMINI_API_KEY is set
if "%GEMINI_API_KEY%"=="" (
    echo ❌ Error: GEMINI_API_KEY is not set in .env file!
    pause
    exit /b 1
)

echo.
echo ✅ Environment loaded successfully!
echo.
echo Select run mode:
echo   1. Docker (with Neo4j) - Full RAG pipeline
echo   2. Local (npm run dev) - Quick start, no Neo4j
echo.
set /p choice="Enter choice (1 or 2): "

if "%choice%"=="1" (
    echo.
    echo 🐳 Starting Docker containers...
    echo    - Neo4j Knowledge Graph: http://localhost:7474
    echo    - App: http://localhost:3000
    echo.
    docker-compose up dev --build
) else (
    echo.
    echo ⚡ Starting local development server...
    echo    - App: http://localhost:3000
    echo    - Note: Neo4j/RAG features won't be available
    echo.
    npm run dev
)

