@echo off
REM Start Itinerary Analyzer with Docker
REM Double-click this file or run from command prompt

echo.
echo ========================================
echo   Itinerary Analyzer - Docker Start
echo ========================================
echo.

REM Check if .env exists
if not exist ".env" (
    echo [WARNING] No .env file found.
    if exist "env.example" (
        echo Creating .env from env.example...
        copy "env.example" ".env" >nul
        echo.
        echo [IMPORTANT] Please edit .env with your API keys:
        echo   - VITE_GEMINI_API_KEY or OPENAI_API_KEY
        echo.
        notepad .env
        echo Press any key after saving .env...
        pause >nul
    ) else (
        echo [ERROR] env.example not found!
        pause
        exit /b 1
    )
)

REM Check Docker
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running!
    echo Please start Docker Desktop first.
    pause
    exit /b 1
)

echo Building and starting containers...
echo.

docker-compose -f docker-compose.local.yml up --build -d

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start containers.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Itinerary Analyzer Started!
echo ========================================
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:5001
echo   API Docs:  http://localhost:5001/docs
echo.
echo   To stop: docker-compose -f docker-compose.local.yml down
echo.

REM Wait and open browser
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo Press any key to exit...
pause >nul

