/**
 * Team Settings GraphQL Integration Tests
 *
 * Tests for team settings queries and mutations including:
 * - Getting team settings (admin only)
 * - Updating team settings (admin only)
 * - Proactive AI feature toggles
 * - AI usage statistics
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock services
const mockTeamService = {
  getMemberRole: jest.fn(),
  getTeamSettings: jest.fn(),
  updateTeamSettings: jest.fn()
};

const mockRateLimiterService = {
  getUsageStats: jest.fn()
};

// Mock modules
jest.unstable_mockModule('../../services/TeamService.js', () => ({
  default: mockTeamService,
  ...mockTeamService
}));

jest.unstable_mockModule('../../services/RateLimiterService.js', () => ({
  default: mockRateLimiterService,
  ...mockRateLimiterService
}));

// Import resolvers after mocking
const resolvers = (await import('../../graphql/resolvers/index.js')).default;

describe('Team Settings GraphQL Integration', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-uuid-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Query.getTeamSettings', () => {
    it('should throw error for unauthenticated users', async () => {
      await expect(
        resolvers.Query.getTeamSettings({}, { teamId: testTeamId }, { userId: null })
      ).rejects.toThrow('Not authenticated');
    });

    it('should throw error for non-admin users', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('member');

      await expect(
        resolvers.Query.getTeamSettings({}, { teamId: testTeamId }, { userId: testUserId })
      ).rejects.toThrow('Only admins can view team settings');
    });

    it('should return team settings for admin users', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('admin');
      mockTeamService.getTeamSettings.mockResolvedValueOnce({
        proactiveAI: {
          enabled: true,
          morningFocusEnabled: true,
          smartNudgesEnabled: false,
          insightsEnabled: true,
          meetingPrepEnabled: true
        }
      });

      const result = await resolvers.Query.getTeamSettings(
        {},
        { teamId: testTeamId },
        { userId: testUserId }
      );

      expect(result.proactiveAI).toBeDefined();
      expect(result.proactiveAI.enabled).toBe(true);
      expect(result.proactiveAI.smartNudgesEnabled).toBe(false);
    });

    it('should return team settings for owner users', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('owner');
      mockTeamService.getTeamSettings.mockResolvedValueOnce({
        proactiveAI: {
          enabled: false
        }
      });

      const result = await resolvers.Query.getTeamSettings(
        {},
        { teamId: testTeamId },
        { userId: testUserId }
      );

      expect(result.proactiveAI.enabled).toBe(false);
    });

    it('should provide default values for missing settings', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('admin');
      mockTeamService.getTeamSettings.mockResolvedValueOnce(null);

      const result = await resolvers.Query.getTeamSettings(
        {},
        { teamId: testTeamId },
        { userId: testUserId }
      );

      // Should default to enabled
      expect(result.proactiveAI.enabled).toBe(true);
      expect(result.proactiveAI.morningFocusEnabled).toBe(true);
      expect(result.proactiveAI.smartNudgesEnabled).toBe(true);
      expect(result.proactiveAI.insightsEnabled).toBe(true);
      expect(result.proactiveAI.meetingPrepEnabled).toBe(true);
    });
  });

  describe('Mutation.updateTeamSettings', () => {
    it('should throw error for unauthenticated users', async () => {
      await expect(
        resolvers.Mutation.updateTeamSettings(
          {},
          { teamId: testTeamId, input: {} },
          { userId: null }
        )
      ).rejects.toThrow('Not authenticated');
    });

    it('should throw error for non-admin users', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('member');

      await expect(
        resolvers.Mutation.updateTeamSettings(
          {},
          { teamId: testTeamId, input: {} },
          { userId: testUserId }
        )
      ).rejects.toThrow('Only admins can update team settings');
    });

    it('should update team settings for admin users', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('admin');
      mockTeamService.updateTeamSettings.mockResolvedValueOnce({
        proactiveAI: {
          enabled: true,
          morningFocusEnabled: true,
          smartNudgesEnabled: false,
          insightsEnabled: true,
          meetingPrepEnabled: false
        }
      });

      const result = await resolvers.Mutation.updateTeamSettings(
        {},
        {
          teamId: testTeamId,
          input: {
            proactiveAI: {
              smartNudgesEnabled: false,
              meetingPrepEnabled: false
            }
          }
        },
        { userId: testUserId }
      );

      expect(mockTeamService.updateTeamSettings).toHaveBeenCalledWith(
        testTeamId,
        expect.objectContaining({
          proactiveAI: expect.objectContaining({
            smartNudgesEnabled: false,
            meetingPrepEnabled: false
          })
        })
      );

      expect(result.proactiveAI.smartNudgesEnabled).toBe(false);
      expect(result.proactiveAI.meetingPrepEnabled).toBe(false);
    });

    it('should allow owner to update team settings', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('owner');
      mockTeamService.updateTeamSettings.mockResolvedValueOnce({
        proactiveAI: {
          enabled: false
        }
      });

      const result = await resolvers.Mutation.updateTeamSettings(
        {},
        {
          teamId: testTeamId,
          input: { proactiveAI: { enabled: false } }
        },
        { userId: testUserId }
      );

      expect(result.proactiveAI.enabled).toBe(false);
    });
  });

  describe('Query.getAIUsageStats', () => {
    it('should throw error for unauthenticated users', async () => {
      await expect(
        resolvers.Query.getAIUsageStats({}, { teamId: testTeamId }, { userId: null })
      ).rejects.toThrow('Not authenticated');
    });

    it('should throw error for non-admin users', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('member');

      await expect(
        resolvers.Query.getAIUsageStats({}, { teamId: testTeamId }, { userId: testUserId })
      ).rejects.toThrow('Only admins can view AI usage stats');
    });

    it('should return usage stats for admin users', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('admin');
      mockRateLimiterService.getUsageStats.mockResolvedValueOnce({
        period: 'day',
        byService: [
          { service: 'proactive', calls: '50', tokens: '25000' },
          { service: 'ceremony', calls: '20', tokens: '10000' }
        ],
        totals: {
          total_calls: '70',
          total_tokens: '35000',
          avg_duration: '450.5',
          failed_calls: '2'
        },
        rateLimits: [
          { windowType: 'hour', callCount: 50, limit: 200, remaining: 150 }
        ]
      });

      const result = await resolvers.Query.getAIUsageStats(
        {},
        { teamId: testTeamId, period: 'day' },
        { userId: testUserId }
      );

      expect(result.period).toBe('day');
      expect(result.byService).toHaveLength(2);
      expect(result.byService[0].service).toBe('proactive');
      expect(result.byService[0].calls).toBe(50);
      expect(result.totals.totalCalls).toBe(70);
      expect(result.totals.failedCalls).toBe(2);
    });

    it('should return null when no stats available', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('admin');
      mockRateLimiterService.getUsageStats.mockResolvedValueOnce(null);

      const result = await resolvers.Query.getAIUsageStats(
        {},
        { teamId: testTeamId },
        { userId: testUserId }
      );

      expect(result).toBeNull();
    });

    it('should use default period when not specified', async () => {
      mockTeamService.getMemberRole.mockResolvedValueOnce('owner');
      mockRateLimiterService.getUsageStats.mockResolvedValueOnce({
        period: 'day',
        byService: [],
        totals: { total_calls: '0', total_tokens: '0', avg_duration: '0', failed_calls: '0' },
        rateLimits: []
      });

      await resolvers.Query.getAIUsageStats(
        {},
        { teamId: testTeamId },
        { userId: testUserId }
      );

      expect(mockRateLimiterService.getUsageStats).toHaveBeenCalledWith(testTeamId, 'day');
    });
  });
});
