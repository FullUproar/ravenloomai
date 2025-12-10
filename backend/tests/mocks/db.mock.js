/**
 * Database Mock
 *
 * Provides a mock implementation of the database for unit tests.
 * This allows testing services without hitting a real database.
 */

import { jest } from '@jest/globals';

// Default mock query implementation
const createMockQuery = () => {
  return jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
};

// Create a fresh mock database for each test
export const createMockDb = () => ({
  query: createMockQuery(),
  connect: jest.fn().mockResolvedValue({
    query: createMockQuery(),
    release: jest.fn()
  }),
  end: jest.fn().mockResolvedValue(undefined)
});

// Shared mock database instance
export const mockDb = createMockDb();

// Helper to set up mock query responses
export const mockQueryResponse = (rows, rowCount = null) => {
  return {
    rows: Array.isArray(rows) ? rows : [rows],
    rowCount: rowCount ?? (Array.isArray(rows) ? rows.length : 1)
  };
};

// Helper to mock a sequence of query responses
export const mockQuerySequence = (db, responses) => {
  let callIndex = 0;
  db.query.mockImplementation(() => {
    if (callIndex < responses.length) {
      return Promise.resolve(responses[callIndex++]);
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
};

// Reset all mocks
export const resetMocks = () => {
  mockDb.query.mockReset();
  mockDb.connect.mockReset();
  mockDb.end.mockReset();
};

export default mockDb;
