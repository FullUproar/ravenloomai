/**
 * Proactivity Features GraphQL Integration Tests
 *
 * Tests for proactive AI features including:
 * - Morning Focus
 * - Standups
 * - Weekly Review
 * - Nudges
 * - Task Health
 * - Workload Analysis
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock services
const mockCeremonyService = {
  getMorningFocus: jest.fn(),
  generateMorningFocus: jest.fn(),
  getOrCreateStandup: jest.fn(),
  submitStandup: jest.fn(),
  getTeamStandups: jest.fn(),
  getWeeklyReview: jest.fn(),
  generateWeeklyReview: jest.fn(),
  getFocusPreferences: jest.fn(),
  updateFocusPreferences: jest.fn()
};

const mockProactiveService = {
  analyzeWorkload: jest.fn(),
  getPendingNudges: jest.fn(),
  dismissNudge: jest.fn(),
  actOnNudge: jest.fn(),
  calculateTaskHealth: jest.fn(),
  getAtRiskTasks: jest.fn(),
  getTeamInsights: jest.fn(),
  generateTeamInsights: jest.fn(),
  generateNudgesForUser: jest.fn(),
  refreshTeamTaskHealth: jest.fn()
};

const mockMeetingPrepService = {
  getMeetingPrep: jest.fn(),
  getUpcomingMeetingsNeedingPrep: jest.fn(),
  generateMeetingPrep: jest.fn(),
  markPrepViewed: jest.fn()
};

// Mock modules
jest.unstable_mockModule('../../services/CeremonyService.js', () => ({
  default: mockCeremonyService,
  ...mockCeremonyService
}));

jest.unstable_mockModule('../../services/ProactiveService.js', () => ({
  default: mockProactiveService,
  ...mockProactiveService
}));

jest.unstable_mockModule('../../services/MeetingPrepService.js', () => ({
  default: mockMeetingPrepService,
  ...mockMeetingPrepService
}));

// Import resolvers after mocking
const resolvers = (await import('../../graphql/resolvers/index.js')).default;

describe('Proactivity Features GraphQL Integration', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-uuid-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Morning Focus', () => {
    describe('Query.getMorningFocus', () => {
      it('should throw error for unauthenticated users', async () => {
        await expect(
          resolvers.Query.getMorningFocus({}, { teamId: testTeamId }, { userId: null })
        ).rejects.toThrow('Not authenticated');
      });

      it('should return morning focus for authenticated user', async () => {
        const mockFocus = {
          id: 'focus-123',
          status: 'completed',
          aiPlan: { greeting: 'Good morning!' }
        };

        mockCeremonyService.getMorningFocus.mockResolvedValueOnce(mockFocus);

        const result = await resolvers.Query.getMorningFocus(
          {},
          { teamId: testTeamId },
          { userId: testUserId }
        );

        expect(result).toEqual(mockFocus);
        expect(mockCeremonyService.getMorningFocus).toHaveBeenCalledWith(
          testTeamId,
          testUserId,
          undefined
        );
      });

      it('should pass date parameter when provided', async () => {
        mockCeremonyService.getMorningFocus.mockResolvedValueOnce(null);

        await resolvers.Query.getMorningFocus(
          {},
          { teamId: testTeamId, date: '2024-01-15' },
          { userId: testUserId }
        );

        expect(mockCeremonyService.getMorningFocus).toHaveBeenCalledWith(
          testTeamId,
          testUserId,
          '2024-01-15'
        );
      });
    });

    describe('Mutation.generateMorningFocus', () => {
      it('should throw error for unauthenticated users', async () => {
        await expect(
          resolvers.Mutation.generateMorningFocus({}, { teamId: testTeamId }, { userId: null })
        ).rejects.toThrow('Not authenticated');
      });

      it('should generate morning focus for authenticated user', async () => {
        const mockResult = {
          id: 'focus-456',
          status: 'generated',
          aiPlan: {
            greeting: 'Good morning!',
            topPriority: 'Finish tests'
          }
        };

        mockCeremonyService.generateMorningFocus.mockResolvedValueOnce(mockResult);

        const result = await resolvers.Mutation.generateMorningFocus(
          {},
          { teamId: testTeamId },
          { userId: testUserId }
        );

        expect(result.status).toBe('generated');
        expect(result.aiPlan.topPriority).toBe('Finish tests');
      });
    });
  });

  describe('Daily Standup', () => {
    describe('Query.getMyStandup', () => {
      it('should throw error for unauthenticated users', async () => {
        await expect(
          resolvers.Query.getMyStandup({}, { teamId: testTeamId }, { userId: null })
        ).rejects.toThrow('Not authenticated');
      });

      it('should return or create standup for authenticated user', async () => {
        const mockStandup = {
          id: 'standup-123',
          status: 'pending',
          responses: {},
          questions: [{ id: 'yesterday', question: 'What did you do?' }]
        };

        mockCeremonyService.getOrCreateStandup.mockResolvedValueOnce(mockStandup);

        const result = await resolvers.Query.getMyStandup(
          {},
          { teamId: testTeamId },
          { userId: testUserId }
        );

        expect(result.id).toBe('standup-123');
        expect(result.status).toBe('pending');
      });
    });

    describe('Query.getTeamStandups', () => {
      it('should return team standups', async () => {
        const mockStandups = [
          { id: 'standup-1', userName: 'Alice', aiSummary: 'Working on tests' },
          { id: 'standup-2', userName: 'Bob', aiSummary: 'Fixing bugs' }
        ];

        mockCeremonyService.getTeamStandups.mockResolvedValueOnce(mockStandups);

        const result = await resolvers.Query.getTeamStandups(
          {},
          { teamId: testTeamId },
          {}
        );

        expect(result).toHaveLength(2);
        expect(result[0].userName).toBe('Alice');
      });
    });

    describe('Mutation.submitStandup', () => {
      it('should throw error for unauthenticated users', async () => {
        await expect(
          resolvers.Mutation.submitStandup(
            {},
            { teamId: testTeamId, responses: {} },
            { userId: null }
          )
        ).rejects.toThrow('Not authenticated');
      });

      it('should submit standup for authenticated user', async () => {
        const responses = {
          yesterday: 'Completed tests',
          today: 'Working on deployment',
          blockers: 'None'
        };

        const mockResult = {
          id: 'standup-123',
          status: 'completed',
          responses,
          aiSummary: 'Completed tests, now deploying'
        };

        mockCeremonyService.submitStandup.mockResolvedValueOnce(mockResult);

        const result = await resolvers.Mutation.submitStandup(
          {},
          { teamId: testTeamId, responses },
          { userId: testUserId }
        );

        expect(result.status).toBe('completed');
        expect(result.aiSummary).toBeDefined();
      });
    });
  });

  describe('Workload Analysis', () => {
    describe('Query.getMyWorkload', () => {
      it('should throw error for unauthenticated users', async () => {
        await expect(
          resolvers.Query.getMyWorkload({}, { teamId: testTeamId }, { userId: null })
        ).rejects.toThrow('Not authenticated');
      });

      it('should return workload analysis for authenticated user', async () => {
        const mockWorkload = {
          tasksDue: 5,
          estimatedTaskHours: 10,
          meetingHours: 3,
          availableHours: 37,
          workloadLevel: 'balanced',
          recommendation: 'Looking good!'
        };

        mockProactiveService.analyzeWorkload.mockResolvedValueOnce(mockWorkload);

        const result = await resolvers.Query.getMyWorkload(
          {},
          { teamId: testTeamId },
          { userId: testUserId }
        );

        expect(result.workloadLevel).toBe('balanced');
        expect(result.tasksDue).toBe(5);
      });
    });
  });

  describe('Proactive Nudges', () => {
    describe('Query.getMyNudges', () => {
      it('should throw error for unauthenticated users', async () => {
        await expect(
          resolvers.Query.getMyNudges({}, { teamId: testTeamId }, { userId: null })
        ).rejects.toThrow('Not authenticated');
      });

      it('should return pending nudges for authenticated user', async () => {
        const mockNudges = [
          { id: 'nudge-1', nudgeType: 'overdue_task', priority: 'high' },
          { id: 'nudge-2', nudgeType: 'stale_task', priority: 'medium' }
        ];

        mockProactiveService.getPendingNudges.mockResolvedValueOnce(mockNudges);

        const result = await resolvers.Query.getMyNudges(
          {},
          { teamId: testTeamId },
          { userId: testUserId }
        );

        expect(result).toHaveLength(2);
        expect(result[0].priority).toBe('high');
      });
    });

    describe('Mutation.dismissNudge', () => {
      it('should throw error for unauthenticated users', async () => {
        await expect(
          resolvers.Mutation.dismissNudge({}, { nudgeId: 'nudge-1' }, { userId: null })
        ).rejects.toThrow('Not authenticated');
      });

      it('should dismiss nudge for authenticated user', async () => {
        mockProactiveService.dismissNudge.mockResolvedValueOnce({ success: true });

        const result = await resolvers.Mutation.dismissNudge(
          {},
          { nudgeId: 'nudge-1' },
          { userId: testUserId }
        );

        expect(result.success).toBe(true);
        expect(mockProactiveService.dismissNudge).toHaveBeenCalledWith('nudge-1', testUserId);
      });
    });

    describe('Mutation.actOnNudge', () => {
      it('should act on nudge for authenticated user', async () => {
        mockProactiveService.actOnNudge.mockResolvedValueOnce({
          success: true,
          action: 'complete',
          nudgeType: 'overdue_task'
        });

        const result = await resolvers.Mutation.actOnNudge(
          {},
          { nudgeId: 'nudge-1', action: 'complete' },
          { userId: testUserId }
        );

        expect(result.success).toBe(true);
        expect(result.action).toBe('complete');
      });
    });
  });

  describe('Task Health', () => {
    describe('Query.getTaskHealth', () => {
      it('should return task health', async () => {
        const mockHealth = {
          taskId: 'task-123',
          healthScore: 0.8,
          riskLevel: 'low',
          riskFactors: []
        };

        mockProactiveService.calculateTaskHealth.mockResolvedValueOnce(mockHealth);

        const result = await resolvers.Query.getTaskHealth(
          {},
          { taskId: 'task-123' },
          {}
        );

        expect(result.healthScore).toBe(0.8);
        expect(result.riskLevel).toBe('low');
      });
    });

    describe('Query.getAtRiskTasks', () => {
      it('should return at-risk tasks', async () => {
        const mockTasks = [
          { taskId: 'task-1', healthScore: 0.3, riskLevel: 'high' },
          { taskId: 'task-2', healthScore: 0.4, riskLevel: 'high' }
        ];

        mockProactiveService.getAtRiskTasks.mockResolvedValueOnce(mockTasks);

        const result = await resolvers.Query.getAtRiskTasks(
          {},
          { teamId: testTeamId },
          {}
        );

        expect(result).toHaveLength(2);
        expect(result[0].riskLevel).toBe('high');
      });
    });

    describe('Mutation.refreshTaskHealth', () => {
      it('should refresh task health', async () => {
        const mockHealth = {
          taskId: 'task-123',
          healthScore: 0.5,
          riskLevel: 'medium'
        };

        mockProactiveService.calculateTaskHealth.mockResolvedValueOnce(mockHealth);

        const result = await resolvers.Mutation.refreshTaskHealth(
          {},
          { taskId: 'task-123' },
          {}
        );

        expect(result.healthScore).toBe(0.5);
      });
    });
  });

  describe('Team Insights', () => {
    describe('Query.getTeamInsights', () => {
      it('should return team insights', async () => {
        const mockInsights = {
          insights: [{ title: 'Productivity up', sentiment: 'positive' }],
          summary: 'Good week overall',
          metrics: { tasksCompleted: 10 }
        };

        mockProactiveService.getTeamInsights.mockResolvedValueOnce(mockInsights);

        const result = await resolvers.Query.getTeamInsights(
          {},
          { teamId: testTeamId },
          {}
        );

        expect(result.insights).toHaveLength(1);
        expect(result.metrics.tasksCompleted).toBe(10);
      });
    });

    describe('Mutation.refreshTeamInsights', () => {
      it('should refresh team insights', async () => {
        const mockInsights = {
          insights: [{ title: 'New insight', sentiment: 'neutral' }],
          summary: 'Refreshed insights'
        };

        mockProactiveService.generateTeamInsights.mockResolvedValueOnce(mockInsights);

        const result = await resolvers.Mutation.refreshTeamInsights(
          {},
          { teamId: testTeamId },
          {}
        );

        expect(result.summary).toBe('Refreshed insights');
      });
    });
  });

  describe('Meeting Prep', () => {
    describe('Query.getMeetingPrep', () => {
      it('should throw error for unauthenticated users', async () => {
        await expect(
          resolvers.Query.getMeetingPrep({}, { eventId: 'event-123' }, { userId: null })
        ).rejects.toThrow('Not authenticated');
      });

      it('should return meeting prep for authenticated user', async () => {
        const mockPrep = {
          id: 'prep-123',
          eventId: 'event-123',
          context: 'Meeting context',
          agenda: ['Item 1', 'Item 2']
        };

        mockMeetingPrepService.getMeetingPrep.mockResolvedValueOnce(mockPrep);

        const result = await resolvers.Query.getMeetingPrep(
          {},
          { eventId: 'event-123' },
          { userId: testUserId }
        );

        expect(result.id).toBe('prep-123');
        expect(result.agenda).toHaveLength(2);
      });
    });

    describe('Mutation.generateMeetingPrep', () => {
      it('should generate meeting prep for authenticated user', async () => {
        const mockPrep = {
          id: 'prep-456',
          status: 'generated'
        };

        mockMeetingPrepService.generateMeetingPrep.mockResolvedValueOnce(mockPrep);

        const result = await resolvers.Mutation.generateMeetingPrep(
          {},
          { teamId: testTeamId, eventId: 'event-123' },
          { userId: testUserId }
        );

        expect(result.status).toBe('generated');
      });
    });
  });

  describe('Focus Preferences', () => {
    describe('Query.getMyFocusPreferences', () => {
      it('should throw error for unauthenticated users', async () => {
        await expect(
          resolvers.Query.getMyFocusPreferences({}, { teamId: testTeamId }, { userId: null })
        ).rejects.toThrow('Not authenticated');
      });

      it('should return focus preferences for authenticated user', async () => {
        const mockPrefs = {
          preferredFocusHours: 4,
          morningFocusEnabled: true,
          dailyStandupEnabled: true
        };

        mockCeremonyService.getFocusPreferences.mockResolvedValueOnce(mockPrefs);

        const result = await resolvers.Query.getMyFocusPreferences(
          {},
          { teamId: testTeamId },
          { userId: testUserId }
        );

        expect(result.preferredFocusHours).toBe(4);
        expect(result.morningFocusEnabled).toBe(true);
      });
    });

    describe('Mutation.updateFocusPreferences', () => {
      it('should update focus preferences for authenticated user', async () => {
        const input = {
          preferredFocusHours: 6,
          morningFocusEnabled: false
        };

        mockCeremonyService.updateFocusPreferences.mockResolvedValueOnce({
          ...input,
          id: 'prefs-123'
        });

        const result = await resolvers.Mutation.updateFocusPreferences(
          {},
          { teamId: testTeamId, input },
          { userId: testUserId }
        );

        expect(result.preferredFocusHours).toBe(6);
        expect(result.morningFocusEnabled).toBe(false);
      });
    });
  });
});
