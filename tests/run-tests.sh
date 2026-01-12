#!/bin/bash
# Simple script to run tests in Docker

set -e

echo "🧪 Starting Docker-based test environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Run tests using docker-compose
docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit

# Exit with the test runner's exit code
exit $?

