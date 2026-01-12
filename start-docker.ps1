# Start Itinerary Analyzer with Docker
# Usage: .\start-docker.ps1

Write-Host "🚀 Starting Itinerary Analyzer..." -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  No .env file found. Creating from env.example..." -ForegroundColor Yellow
    if (Test-Path "env.example") {
        Copy-Item "env.example" ".env"
        Write-Host "✅ Created .env file. Please edit it with your API keys." -ForegroundColor Green
        Write-Host ""
        Write-Host "Required keys:" -ForegroundColor White
        Write-Host "  - VITE_GEMINI_API_KEY or OPENAI_API_KEY (for AI analysis)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Optional keys:" -ForegroundColor White
        Write-Host "  - EXA_API_KEY (for web search)" -ForegroundColor Gray
        Write-Host ""
        
        # Open .env in default editor
        $editNow = Read-Host "Do you want to edit .env now? (y/n)"
        if ($editNow -eq "y" -or $editNow -eq "Y") {
            Start-Process notepad.exe ".env"
            Write-Host "Press Enter after saving .env to continue..."
            Read-Host
        }
    } else {
        Write-Host "❌ env.example not found!" -ForegroundColor Red
        exit 1
    }
}

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

Write-Host "🐳 Building and starting containers..." -ForegroundColor Cyan
Write-Host ""

# Start Docker Compose
docker-compose -f docker-compose.local.yml up --build -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Itinerary Analyzer is starting!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📱 Frontend:  http://localhost:3000" -ForegroundColor White
    Write-Host "🔧 Backend:   http://localhost:5001" -ForegroundColor White
    Write-Host "📊 API Docs:  http://localhost:5001/docs" -ForegroundColor White
    Write-Host ""
    Write-Host "To view logs:  docker-compose -f docker-compose.local.yml logs -f" -ForegroundColor Gray
    Write-Host "To stop:       docker-compose -f docker-compose.local.yml down" -ForegroundColor Gray
    Write-Host ""
    
    # Wait for services to be ready
    Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    # Open browser
    Start-Process "http://localhost:3000"
} else {
    Write-Host "❌ Failed to start containers. Check the error above." -ForegroundColor Red
}

