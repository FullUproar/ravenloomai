/**
 * Jest Test Setup
 *
 * This file runs before each test suite and provides:
 * - Mock configuration
 * - Test utilities
 * - Database mock setup
 */

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-api-key';

// Global test timeout
jest.setTimeout(10000);

// Mock console.error to reduce noise in tests (can be re-enabled per test)
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

// Clean up mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
