@echo off
REM Stop Itinerary Analyzer Docker containers

echo Stopping Itinerary Analyzer containers...
docker-compose -f docker-compose.local.yml down

echo.
echo Containers stopped.
pause

