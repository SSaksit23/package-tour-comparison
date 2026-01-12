/**
 * Vitest Setup File
 * 
 * This file runs before all tests to set up the test environment.
 * It can be used to configure mocks, environment variables, and global test utilities.
 */

import { beforeAll, afterAll } from 'vitest';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-api-key';
process.env.VITE_GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || 'test-gemini-key';

// Increase timeout for async operations
beforeAll(() => {
  console.log('🧪 Test environment initialized');
});

afterAll(() => {
  console.log('🧪 Test environment cleaned up');
});

