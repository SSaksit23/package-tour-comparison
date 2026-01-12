# PowerShell script to run tests in Docker
# Run this script from the project root: .\tests\run-tests.ps1

Write-Host "🧪 Starting Docker-based test environment..." -ForegroundColor Cyan

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

# Run tests using docker-compose
docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit

# Exit with the test runner's exit code
exit $LASTEXITCODE

