# ===========================================
# Itinerary Analyzer - Development Start Script
# ===========================================
# This script loads environment variables from .env and starts the app

Write-Host "🚀 Starting Itinerary Analyzer..." -ForegroundColor Cyan

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "❌ Error: .env file not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please create a .env file with your API keys:" -ForegroundColor Yellow
    Write-Host "  OPENAI_API_KEY=sk-your_openai_api_key_here" -ForegroundColor Gray
    Write-Host "  or" -ForegroundColor Gray
    Write-Host "  VITE_GEMINI_API_KEY=your_gemini_api_key_here" -ForegroundColor Gray
    Write-Host ""
    Write-Host "You can copy env.example to .env as a starting point." -ForegroundColor Yellow
    exit 1
}

# Load environment variables from .env file
Write-Host "📁 Loading environment variables from .env..." -ForegroundColor Yellow
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
        
        # Show loaded vars (hide sensitive values)
        if ($name -like "*KEY*" -or $name -like "*PASSWORD*") {
            Write-Host "  ✓ $name = ****" -ForegroundColor Gray
        } else {
            Write-Host "  ✓ $name = $value" -ForegroundColor Gray
        }
    }
}

Write-Host ""
Write-Host "✅ Environment loaded successfully!" -ForegroundColor Green
Write-Host ""

# Ask user which mode to run
Write-Host "Select run mode:" -ForegroundColor Cyan
Write-Host "  1. Docker (Full Stack) - ArangoDB + ChromaDB + Backend + Frontend" -ForegroundColor White
Write-Host "  2. Local (npm run dev) - Quick start, frontend only" -ForegroundColor White
Write-Host ""
$choice = Read-Host "Enter choice (1 or 2)"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "🐳 Starting Docker containers..." -ForegroundColor Cyan
    Write-Host "   - ArangoDB: http://localhost:8529" -ForegroundColor Gray
    Write-Host "   - ChromaDB: http://localhost:8000" -ForegroundColor Gray
    Write-Host "   - Backend: http://localhost:5001" -ForegroundColor Gray
    Write-Host "   - Frontend: http://localhost:3001" -ForegroundColor Gray
    Write-Host ""
    docker-compose up dev --build
} else {
    Write-Host ""
    Write-Host "⚡ Starting local development server..." -ForegroundColor Cyan
    Write-Host "   - App: http://localhost:3000" -ForegroundColor Gray
    Write-Host "   - Note: Backend services won't be available" -ForegroundColor Yellow
    Write-Host ""
    npm run dev
}
