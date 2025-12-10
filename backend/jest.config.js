/**
 * Jest Configuration for RavenLoom Backend
 *
 * Configured for ES modules and comprehensive test coverage
 */

export default {
  // Use Node.js environment
  testEnvironment: 'node',

  // Enable ES modules support
  transform: {},

  // File extensions to consider
  moduleFileExtensions: ['js', 'mjs', 'json'],

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/__tests__/**/*.js'
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'services/**/*.js',
    'graphql/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],

  // Coverage thresholds (start conservative, increase over time)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage directory
  coverageDirectory: 'coverage',

  // Setup files to run before tests
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Verbose output
  verbose: true,

  // Force exit after tests complete (useful for async cleanup)
  forceExit: true,

  // Detect open handles (helps find async leaks)
  detectOpenHandles: true,

  // Timeout for tests (10 seconds)
  testTimeout: 10000
};
