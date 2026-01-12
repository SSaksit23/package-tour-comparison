# Stop Itinerary Analyzer Docker containers

Write-Host "🛑 Stopping Itinerary Analyzer..." -ForegroundColor Yellow
docker-compose -f docker-compose.local.yml down

Write-Host "✅ Containers stopped." -ForegroundColor Green

