# Testing Guide

This document explains how to run tests for the ITIN Analyzer application using Docker.

## Quick Start

### Using npm scripts (Recommended)

```bash
# Run tests in Docker
npm run test:docker

# Stop test containers
npm run test:docker:stop
```

### Using Docker Compose directly

```bash
# Run tests
docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit

# Stop and remove containers
docker-compose -f docker-compose.test.yml down

# Run with logs
docker-compose -f docker-compose.test.yml up --build
```

### Using helper scripts

**Windows (PowerShell):**
```powershell
.\tests\run-tests.ps1
```

**Linux/Mac (Bash):**
```bash
chmod +x tests/run-tests.sh
./tests/run-tests.sh
```

## Local Testing (Without Docker)

If you want to run tests locally without Docker:

```bash
# Install dependencies
npm install

# Run tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# With UI
npm run test:ui
```

**Note:** Local testing requires:
- ChromaDB running on `http://localhost:8000` (or configured via `CHROMA_URL`)
- Optional: AI API keys for embedding tests

## Test Structure

```
tests/
├── setup.ts                    # Global test setup
├── retrievalService.test.ts    # Retrieval service tests
└── README.md                   # Detailed testing documentation
```

## What Gets Tested

### Retrieval Service Tests

- ✅ Query embedding functionality
- ✅ Vector similarity search
- ✅ Chunk retrieval and formatting
- ✅ Metadata filtering
- ✅ Integration with ChromaDB

### Test Types

1. **Unit Tests** - Test individual functions in isolation
2. **Integration Tests** - Test with actual services (ChromaDB, APIs)

## Docker Test Environment

The Docker test setup includes:

1. **ChromaDB Test Container** (`chromadb-test`)
   - Runs on port `8001` (host) / `8000` (container)
   - Isolated test data volume
   - Health checks enabled

2. **Test Runner Container** (`test-runner`)
   - Contains test dependencies
   - Runs Vitest test suite
   - Mounts source code for live updates
   - Generates coverage reports

## Environment Variables

Optional environment variables for tests:

```bash
# ChromaDB (handled by docker-compose)
CHROMA_URL=http://chromadb-test:8000

# AI API Keys (for embedding tests)
OPENAI_API_KEY=your-key
VITE_GEMINI_API_KEY=your-key
VITE_VERTEX_API_KEY=your-key
```

## Test Results

After running tests, you'll find:

- **Coverage Reports**: `./coverage/` directory
- **Test Results**: Console output
- **Test Logs**: Docker Compose logs

## Troubleshooting

### ChromaDB not starting

If ChromaDB fails to start:
```bash
# Check logs
docker-compose -f docker-compose.test.yml logs chromadb-test

# Restart
docker-compose -f docker-compose.test.yml restart chromadb-test
```

### Tests timing out

If tests timeout:
- Check if ChromaDB is healthy: `docker-compose -f docker-compose.test.yml ps`
- Increase timeout in `vitest.config.ts` (currently 30 seconds)

### API key errors

Some tests require API keys. They will skip gracefully if keys are not provided:
```
⚠️ Skipping embedding test - API key may not be available
```

### Port conflicts

If port 8001 is already in use:
1. Change port in `docker-compose.test.yml`:
   ```yaml
   ports:
     - "8002:8000"  # Changed from 8001
   ```
2. Update `CHROMA_URL` environment variable accordingly

## Continuous Integration

The Docker test setup is CI-ready. Example GitHub Actions:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: npm run test:docker
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## Adding New Tests

1. Create a test file: `tests/yourService.test.ts`
2. Follow existing test patterns
3. Use `describe` and `it` blocks
4. Use `skipIf` for conditional tests:
   ```typescript
   it.skipIf(!serviceAvailable)('integration test', async () => {
     // test code
   });
   ```

## Best Practices

- ✅ Write both unit and integration tests
- ✅ Use descriptive test names
- ✅ Skip integration tests if services aren't available
- ✅ Mock external APIs for unit tests
- ✅ Keep tests fast and isolated
- ✅ Test error cases, not just happy paths

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [ChromaDB Documentation](https://docs.trychroma.com/)

