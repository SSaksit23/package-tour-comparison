# Testing Guide

This directory contains tests for the ITIN Analyzer application.

## Running Tests

### Local Testing (without Docker)

```bash
# Install dependencies (includes test dependencies)
npm install

# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Docker-Based Testing

#### Prerequisites

1. Docker and Docker Compose installed
2. `.env` file with optional API keys (for integration tests)

#### Running Tests in Docker

```bash
# Run all tests in Docker
npm run test:docker

# Stop test containers
npm run test:docker:stop

# Or use docker-compose directly
docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

## Test Structure

- `setup.ts` - Global test setup and configuration
- `*.test.ts` - Test files (one per module/service)

## Writing Tests

### Unit Tests

Test individual functions and modules in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../services/myService';

describe('My Service', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### Integration Tests

Test with actual services (ChromaDB, APIs):

```typescript
import { describe, it, expect, beforeAll } from 'vitest';

describe('Integration Tests', () => {
  let serviceAvailable: boolean;

  beforeAll(async () => {
    serviceAvailable = await checkService();
  });

  it.skipIf(!serviceAvailable)('should work with real service', async () => {
    // Test implementation
  });
});
```

## Test Coverage

Coverage reports are generated in the `coverage/` directory. View HTML reports:

```bash
# After running test:coverage
open coverage/index.html
```

## CI/CD Integration

The Docker test setup can be easily integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: npm run test:docker
```

## Notes

- Integration tests require ChromaDB to be running
- Some tests may skip if API keys are not available
- Test timeouts are set to 30 seconds for async operations

