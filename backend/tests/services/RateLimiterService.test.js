/**
 * RateLimiterService Unit Tests
 *
 * Tests for API rate limiting functionality including:
 * - Rate limit checks (minute, hour, day)
 * - Rate limit enforcement
 * - API call logging
 * - Usage statistics
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockQueryResponse, mockQuerySequence } from '../mocks/db.mock.js';

// Mock the database module before importing the service
const mockDb = {
  query: jest.fn()
};

jest.unstable_mockModule('../../db.js', () => ({
  default: mockDb
}));

// Import the service after mocking
const RateLimiterService = await import('../../services/RateLimiterService.js');

// Default limits (copied from service for test verification)
const DEFAULT_LIMITS = {
  minute: 20,
  hour: 200,
  day: 2000
};

describe('RateLimiterService', () => {
  const testTeamId = 'test-team-123';
  const testUserId = 'test-user-456';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('checkRateLimit', () => {
    it('should allow calls when no rate limit record exists', async () => {
      // First call: check for existing record (none found)
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Second call: insert new record
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await RateLimiterService.checkRateLimit(testTeamId, 'hour');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_LIMITS.hour);
    });

    it('should allow calls when under the limit', async () => {
      const now = new Date();
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          team_id: testTeamId,
          window_type: 'hour',
          window_start: now.toISOString(),
          call_count: 50,
          token_count: 10000
        }],
        rowCount: 1
      });

      const result = await RateLimiterService.checkRateLimit(testTeamId, 'hour');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_LIMITS.hour - 50);
    });

    it('should deny calls when at the limit', async () => {
      const now = new Date();
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          team_id: testTeamId,
          window_type: 'hour',
          window_start: now.toISOString(),
          call_count: 200, // At the hour limit
          token_count: 50000
        }],
        rowCount: 1
      });

      const result = await RateLimiterService.checkRateLimit(testTeamId, 'hour');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('should reset the window when it expires', async () => {
      const oldWindowStart = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          team_id: testTeamId,
          window_type: 'hour',
          window_start: oldWindowStart.toISOString(),
          call_count: 200, // Would be at limit, but window expired
          token_count: 50000
        }],
        rowCount: 1
      });
      // Second call: reset the window
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await RateLimiterService.checkRateLimit(testTeamId, 'hour');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_LIMITS.hour);
    });

    it('should handle minute rate limits', async () => {
      const now = new Date();
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          team_id: testTeamId,
          window_type: 'minute',
          window_start: now.toISOString(),
          call_count: 20, // At the minute limit
          token_count: 5000
        }],
        rowCount: 1
      });

      const result = await RateLimiterService.checkRateLimit(testTeamId, 'minute');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should handle day rate limits', async () => {
      const now = new Date();
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          team_id: testTeamId,
          window_type: 'day',
          window_start: now.toISOString(),
          call_count: 1000, // Half the day limit
          token_count: 1000000
        }],
        rowCount: 1
      });

      const result = await RateLimiterService.checkRateLimit(testTeamId, 'day');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_LIMITS.day - 1000);
    });

    it('should handle database errors gracefully', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await RateLimiterService.checkRateLimit(testTeamId, 'hour');

      // On error, allow the call but report error
      expect(result.allowed).toBe(true);
      expect(result.error).toBeDefined();
    });
  });

  describe('incrementRateLimit', () => {
    it('should increment counters for all window types', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await RateLimiterService.incrementRateLimit(testTeamId, 500);

      // Should be called for minute, hour, and day
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('should include token count in increment', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await RateLimiterService.incrementRateLimit(testTeamId, 1000);

      // Check that the query includes the token count
      const calls = mockDb.query.mock.calls;
      expect(calls.some(call => call[1] && call[1].includes(1000))).toBe(true);
    });
  });

  describe('logApiCall', () => {
    it('should log successful API calls', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await RateLimiterService.logApiCall({
        teamId: testTeamId,
        userId: testUserId,
        service: 'proactive',
        operation: 'generate_insights',
        model: 'gpt-4o',
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700,
        durationMs: 1500,
        success: true
      });

      expect(mockDb.query).toHaveBeenCalled();
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain('INSERT INTO ai_api_calls');
    });

    it('should log failed API calls with error message', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await RateLimiterService.logApiCall({
        teamId: testTeamId,
        service: 'ceremony',
        operation: 'morning_focus',
        model: 'gpt-4o',
        durationMs: 5000,
        success: false,
        errorMessage: 'API timeout'
      });

      expect(mockDb.query).toHaveBeenCalled();
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[1]).toContain('API timeout');
    });

    it('should handle logging errors silently', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Insert failed'));

      // Should not throw
      await expect(RateLimiterService.logApiCall({
        teamId: testTeamId,
        service: 'test',
        operation: 'test',
        model: 'gpt-4o',
        success: true
      })).resolves.not.toThrow();
    });
  });

  describe('enforceRateLimit', () => {
    it('should pass when all limits are under threshold', async () => {
      const now = new Date();
      // Mock responses for minute, hour, day checks
      mockDb.query.mockResolvedValue({
        rows: [{
          window_start: now.toISOString(),
          call_count: 5,
          token_count: 1000
        }],
        rowCount: 1
      });

      await expect(RateLimiterService.enforceRateLimit(testTeamId))
        .resolves.toEqual({ allowed: true });
    });

    it('should throw when minute limit is exceeded', async () => {
      const now = new Date();
      // Minute limit exceeded
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          window_start: now.toISOString(),
          call_count: 25, // Over minute limit of 20
          token_count: 5000
        }],
        rowCount: 1
      });

      await expect(RateLimiterService.enforceRateLimit(testTeamId))
        .rejects.toThrow('Rate limited');
    });

    it('should throw when hour limit is exceeded', async () => {
      const now = new Date();
      // Minute OK, hour exceeded
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            window_start: now.toISOString(),
            call_count: 5, // Under minute limit
            token_count: 1000
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [{
            window_start: now.toISOString(),
            call_count: 250, // Over hour limit of 200
            token_count: 100000
          }],
          rowCount: 1
        });

      await expect(RateLimiterService.enforceRateLimit(testTeamId))
        .rejects.toThrow('Rate limited');
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics for a team', async () => {
      // byService query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { service: 'proactive', calls: '50', tokens: '25000' },
          { service: 'ceremony', calls: '30', tokens: '15000' }
        ],
        rowCount: 2
      });
      // totals query
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          total_calls: '80',
          total_tokens: '40000',
          avg_duration: '1500.5',
          failed_calls: '2'
        }],
        rowCount: 1
      });
      // rate limits query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { window_type: 'hour', call_count: 80, token_count: 40000 }
        ],
        rowCount: 1
      });

      const stats = await RateLimiterService.getUsageStats(testTeamId, 'day');

      expect(stats).not.toBeNull();
      expect(stats.period).toBe('day');
      expect(stats.byService).toHaveLength(2);
      expect(stats.byService[0].service).toBe('proactive');
      expect(parseInt(stats.byService[0].calls)).toBe(50);
    });

    it('should handle empty stats gracefully', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const stats = await RateLimiterService.getUsageStats(testTeamId, 'day');

      expect(stats).not.toBeNull();
      expect(stats.byService).toEqual([]);
    });
  });

  // Note: DEFAULT_LIMITS and TOKEN_LIMITS are exported constants
  // and their values are implicitly tested through the behavior tests above
});
