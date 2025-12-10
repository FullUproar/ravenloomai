/**
 * TeamService Unit Tests
 *
 * Tests for team management functionality including:
 * - Team CRUD operations
 * - Team settings (proactive AI toggles)
 * - Member management
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the database module before importing the service
const mockDb = {
  query: jest.fn()
};

jest.unstable_mockModule('../../db.js', () => ({
  default: mockDb
}));

// Import the service after mocking
const TeamService = await import('../../services/TeamService.js');

describe('TeamService', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-firebase-uid';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('getTeamSettings', () => {
    it('should return team settings when they exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          settings: {
            proactiveAI: {
              enabled: true,
              morningFocusEnabled: true,
              smartNudgesEnabled: false,
              insightsEnabled: true,
              meetingPrepEnabled: true
            }
          }
        }],
        rowCount: 1
      });

      const settings = await TeamService.getTeamSettings(testTeamId);

      expect(settings).toBeDefined();
      expect(settings.proactiveAI.enabled).toBe(true);
      expect(settings.proactiveAI.smartNudgesEnabled).toBe(false);
    });

    it('should return default settings when team has no settings', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ settings: null }],
        rowCount: 1
      });

      const settings = await TeamService.getTeamSettings(testTeamId);

      expect(settings).toBeDefined();
      expect(settings.proactiveAI.enabled).toBe(true);
      expect(settings.proactiveAI.morningFocusEnabled).toBe(true);
      expect(settings.proactiveAI.smartNudgesEnabled).toBe(true);
      expect(settings.proactiveAI.insightsEnabled).toBe(true);
      expect(settings.proactiveAI.meetingPrepEnabled).toBe(true);
    });

    it('should return default settings when team does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const settings = await TeamService.getTeamSettings(testTeamId);

      expect(settings).toBeDefined();
      expect(settings.proactiveAI).toBeDefined();
    });
  });

  describe('updateTeamSettings', () => {
    it('should merge new settings with existing settings', async () => {
      // First call: get existing settings
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          settings: {
            proactiveAI: {
              enabled: true,
              morningFocusEnabled: true,
              smartNudgesEnabled: true,
              insightsEnabled: true,
              meetingPrepEnabled: true
            }
          }
        }],
        rowCount: 1
      });
      // Second call: update settings
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          settings: {
            proactiveAI: {
              enabled: true,
              morningFocusEnabled: true,
              smartNudgesEnabled: false,
              insightsEnabled: true,
              meetingPrepEnabled: true
            }
          }
        }],
        rowCount: 1
      });

      const updatedSettings = await TeamService.updateTeamSettings(testTeamId, {
        proactiveAI: { smartNudgesEnabled: false }
      });

      expect(updatedSettings.proactiveAI.smartNudgesEnabled).toBe(false);
      expect(updatedSettings.proactiveAI.enabled).toBe(true); // Unchanged
    });

    it('should disable all features when master toggle is off', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ settings: null }],
        rowCount: 1
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          settings: {
            proactiveAI: {
              enabled: false,
              morningFocusEnabled: true,
              smartNudgesEnabled: true,
              insightsEnabled: true,
              meetingPrepEnabled: true
            }
          }
        }],
        rowCount: 1
      });

      const updatedSettings = await TeamService.updateTeamSettings(testTeamId, {
        proactiveAI: { enabled: false }
      });

      expect(updatedSettings.proactiveAI.enabled).toBe(false);
    });
  });

  describe('isProactiveAIEnabled', () => {
    it('should return true when proactive AI is enabled', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          settings: {
            proactiveAI: { enabled: true }
          }
        }],
        rowCount: 1
      });

      const isEnabled = await TeamService.isProactiveAIEnabled(testTeamId);

      expect(isEnabled).toBe(true);
    });

    it('should return false when proactive AI is disabled', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          settings: {
            proactiveAI: { enabled: false }
          }
        }],
        rowCount: 1
      });

      const isEnabled = await TeamService.isProactiveAIEnabled(testTeamId);

      expect(isEnabled).toBe(false);
    });

    it('should return true by default when no settings exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ settings: null }],
        rowCount: 1
      });

      const isEnabled = await TeamService.isProactiveAIEnabled(testTeamId);

      expect(isEnabled).toBe(true);
    });
  });

  describe('getProactiveFeatureStatus', () => {
    it('should return true when feature is enabled and master toggle is on', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          settings: {
            proactiveAI: {
              enabled: true,
              morningFocusEnabled: true
            }
          }
        }],
        rowCount: 1
      });

      const isEnabled = await TeamService.getProactiveFeatureStatus(testTeamId, 'morningFocus');

      expect(isEnabled).toBe(true);
    });

    it('should return false when feature is disabled', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          settings: {
            proactiveAI: {
              enabled: true,
              morningFocusEnabled: false
            }
          }
        }],
        rowCount: 1
      });

      const isEnabled = await TeamService.getProactiveFeatureStatus(testTeamId, 'morningFocus');

      expect(isEnabled).toBe(false);
    });

    it('should return false when master toggle is off even if feature is enabled', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          settings: {
            proactiveAI: {
              enabled: false,
              morningFocusEnabled: true,
              smartNudgesEnabled: true
            }
          }
        }],
        rowCount: 1
      });

      const isMorningFocusEnabled = await TeamService.getProactiveFeatureStatus(testTeamId, 'morningFocus');

      expect(isMorningFocusEnabled).toBe(false);
    });

    it('should check correct feature key mapping', async () => {
      const features = ['morningFocus', 'smartNudges', 'insights', 'meetingPrep'];

      for (const feature of features) {
        mockDb.query.mockResolvedValueOnce({
          rows: [{
            settings: {
              proactiveAI: {
                enabled: true,
                [`${feature}Enabled`]: true
              }
            }
          }],
          rowCount: 1
        });

        const isEnabled = await TeamService.getProactiveFeatureStatus(testTeamId, feature);
        expect(isEnabled).toBe(true);
      }
    });
  });

  describe('getTeamById', () => {
    it('should return team when found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: testTeamId,
          name: 'Test Team',
          slug: 'test-team',
          created_at: new Date(),
          updated_at: new Date()
        }],
        rowCount: 1
      });

      const team = await TeamService.getTeamById(testTeamId);

      expect(team).toBeDefined();
      expect(team.id).toBe(testTeamId);
      expect(team.name).toBe('Test Team');
      expect(team.slug).toBe('test-team');
    });

    it('should return null when team not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const team = await TeamService.getTeamById('non-existent-team');

      expect(team).toBeNull();
    });
  });

  describe('getMemberRole', () => {
    it('should return member role when found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
        rowCount: 1
      });

      const role = await TeamService.getMemberRole(testTeamId, testUserId);

      expect(role).toBe('admin');
    });

    it('should return null when member not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const role = await TeamService.getMemberRole(testTeamId, 'non-member');

      expect(role).toBeNull();
    });

    it('should correctly identify owner role', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ role: 'owner' }],
        rowCount: 1
      });

      const role = await TeamService.getMemberRole(testTeamId, testUserId);

      expect(role).toBe('owner');
    });
  });

  describe('isTeamMember', () => {
    it('should return true when user is a member', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'member-123' }],
        rowCount: 1
      });

      const isMember = await TeamService.isTeamMember(testTeamId, testUserId);

      expect(isMember).toBe(true);
    });

    it('should return false when user is not a member', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const isMember = await TeamService.isTeamMember(testTeamId, 'non-member');

      expect(isMember).toBe(false);
    });
  });

  describe('createTeam', () => {
    it('should create team with unique slug', async () => {
      // Check slug uniqueness - none found
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Create team
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'new-team-id',
          name: 'New Team',
          slug: 'new-team',
          created_at: new Date(),
          updated_at: new Date()
        }],
        rowCount: 1
      });
      // Add owner as member
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Create default channel
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const team = await TeamService.createTeam('New Team', testUserId);

      expect(team).toBeDefined();
      expect(team.name).toBe('New Team');
      expect(team.slug).toBe('new-team');
    });

    it('should generate unique slug when conflicts exist', async () => {
      // First slug check - exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 });
      // Second slug check with counter - doesn't exist
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Create team
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'new-team-id',
          name: 'Test Team',
          slug: 'test-team-1',
          created_at: new Date(),
          updated_at: new Date()
        }],
        rowCount: 1
      });
      // Add owner
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Create channel
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const team = await TeamService.createTeam('Test Team', testUserId);

      expect(team.slug).toBe('test-team-1');
    });
  });

  describe('deleteTeam', () => {
    it('should return true when team is deleted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: testTeamId }],
        rowCount: 1
      });

      const result = await TeamService.deleteTeam(testTeamId);

      expect(result).toBe(true);
    });

    it('should return false when team does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const result = await TeamService.deleteTeam('non-existent-team');

      expect(result).toBe(false);
    });
  });
});
