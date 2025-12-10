/**
 * CeremonyService Unit Tests
 *
 * Tests for productivity ceremonies including:
 * - Morning Focus generation
 * - Daily Standup management
 * - Weekly Review generation
 * - Focus time preferences
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock dependencies before importing the service
const mockDb = {
  query: jest.fn()
};

const mockTaskService = {
  getTaskById: jest.fn(),
  getTasks: jest.fn()
};

const mockCalendarService = {
  getEvents: jest.fn()
};

const mockProactiveService = {
  analyzeWorkload: jest.fn(),
  getPendingNudges: jest.fn()
};

const mockKnowledgeService = {
  getDecisions: jest.fn()
};

const mockTeamService = {
  getProactiveFeatureStatus: jest.fn()
};

const mockRateLimiterService = {
  enforceRateLimit: jest.fn(),
  incrementRateLimit: jest.fn(),
  logApiCall: jest.fn()
};

const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn()
    }
  }
};

// Mock all modules
jest.unstable_mockModule('../../db.js', () => ({
  default: mockDb
}));

jest.unstable_mockModule('../../services/TaskService.js', () => mockTaskService);
jest.unstable_mockModule('../../services/CalendarService.js', () => mockCalendarService);
jest.unstable_mockModule('../../services/ProactiveService.js', () => mockProactiveService);
jest.unstable_mockModule('../../services/KnowledgeService.js', () => mockKnowledgeService);
jest.unstable_mockModule('../../services/TeamService.js', () => mockTeamService);
jest.unstable_mockModule('../../services/RateLimiterService.js', () => mockRateLimiterService);

jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => mockOpenAI)
}));

// Import service after mocking
const CeremonyService = await import('../../services/CeremonyService.js');

describe('CeremonyService', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-uuid-456';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('generateMorningFocus', () => {
    it('should return disabled status when Morning Focus is disabled', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(false);

      const result = await CeremonyService.generateMorningFocus(testTeamId, testUserId);

      expect(result.status).toBe('disabled');
      expect(result.message).toContain('disabled');
      expect(mockTeamService.getProactiveFeatureStatus).toHaveBeenCalledWith(testTeamId, 'morningFocus');
    });

    it('should return rate limited status when rate limited', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(true);
      mockRateLimiterService.enforceRateLimit.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const result = await CeremonyService.generateMorningFocus(testTeamId, testUserId);

      expect(result.status).toBe('rate_limited');
      expect(result.message).toContain('Rate limit');
    });

    it('should return already_completed when Morning Focus already generated today', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(true);
      mockRateLimiterService.enforceRateLimit.mockResolvedValueOnce({ allowed: true });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'ceremony-123',
          status: 'completed',
          ai_plan: { greeting: 'Good morning!' },
          ai_summary: 'Focus on task X'
        }],
        rowCount: 1
      });

      const result = await CeremonyService.generateMorningFocus(testTeamId, testUserId);

      expect(result.status).toBe('already_completed');
      expect(result.id).toBe('ceremony-123');
      expect(result.aiPlan).toBeDefined();
    });

    it('should generate new Morning Focus with AI', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(true);
      mockRateLimiterService.enforceRateLimit.mockResolvedValueOnce({ allowed: true });

      // No existing ceremony
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Tasks query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'task-1', title: 'Write tests', priority: 'high', due_at: new Date() }
        ],
        rowCount: 1
      });

      // Calendar events
      mockCalendarService.getEvents.mockResolvedValueOnce([
        { id: 'event-1', title: 'Team Meeting', startAt: new Date(), isAllDay: false }
      ]);

      // Workload
      mockProactiveService.analyzeWorkload.mockResolvedValueOnce({
        workloadLevel: 'balanced',
        tasksDue: 5,
        meetingHours: 2,
        recommendation: 'Looking good!'
      });

      // Nudges
      mockProactiveService.getPendingNudges.mockResolvedValueOnce([]);

      // AI response
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              greeting: 'Good morning! Ready to tackle the day.',
              topPriority: 'Complete the test suite',
              scheduledBlocks: [
                { time: '9:00 AM', activity: 'Focus work', duration: '2h', type: 'focus' }
              ],
              tasksToComplete: ['Write tests'],
              warnings: [],
              tip: 'Take breaks every 90 minutes'
            })
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      });

      // Insert ceremony
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'new-ceremony-123' }],
        rowCount: 1
      });

      const result = await CeremonyService.generateMorningFocus(testTeamId, testUserId);

      expect(result.status).toBe('generated');
      expect(result.aiPlan).toBeDefined();
      expect(result.aiPlan.greeting).toContain('morning');
      expect(mockRateLimiterService.incrementRateLimit).toHaveBeenCalled();
      expect(mockRateLimiterService.logApiCall).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'ceremony',
          operation: 'morning_focus',
          success: true
        })
      );
    });

    it('should handle AI API errors gracefully', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(true);
      mockRateLimiterService.enforceRateLimit.mockResolvedValueOnce({ allowed: true });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockCalendarService.getEvents.mockResolvedValueOnce([]);
      mockProactiveService.analyzeWorkload.mockResolvedValueOnce({ workloadLevel: 'balanced', tasksDue: 0, meetingHours: 0, recommendation: '' });
      mockProactiveService.getPendingNudges.mockResolvedValueOnce([]);

      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('API Error'));

      const result = await CeremonyService.generateMorningFocus(testTeamId, testUserId);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(mockRateLimiterService.logApiCall).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorMessage: 'API Error'
        })
      );
    });
  });

  describe('getMorningFocus', () => {
    it('should return null when no Morning Focus exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await CeremonyService.getMorningFocus(testTeamId, testUserId);

      expect(result).toBeNull();
    });

    it('should return existing Morning Focus', async () => {
      const mockCeremony = {
        id: 'ceremony-123',
        status: 'completed',
        ai_plan: { greeting: 'Hello!' },
        ai_summary: 'Focus on X',
        created_at: new Date(),
        completed_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockCeremony],
        rowCount: 1
      });

      const result = await CeremonyService.getMorningFocus(testTeamId, testUserId);

      expect(result).toBeDefined();
      expect(result.id).toBe('ceremony-123');
      expect(result.status).toBe('completed');
      expect(result.aiPlan).toEqual(mockCeremony.ai_plan);
    });
  });

  describe('getStandupQuestions', () => {
    it('should return standard standup questions', () => {
      const questions = CeremonyService.getStandupQuestions();

      expect(questions).toHaveLength(3);
      expect(questions.find(q => q.id === 'yesterday')).toBeDefined();
      expect(questions.find(q => q.id === 'today')).toBeDefined();
      expect(questions.find(q => q.id === 'blockers')).toBeDefined();
    });
  });

  describe('getOrCreateStandup', () => {
    it('should return existing standup for today', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'standup-123',
          responses: { yesterday: 'Did stuff', today: 'More stuff', blockers: 'None' },
          status: 'completed'
        }],
        rowCount: 1
      });

      const result = await CeremonyService.getOrCreateStandup(testTeamId, testUserId);

      expect(result.id).toBe('standup-123');
      expect(result.status).toBe('completed');
      expect(result.questions).toHaveLength(3);
    });

    it('should create new standup when none exists', async () => {
      // No existing standup
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Create new standup
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'new-standup-456',
          status: 'pending'
        }],
        rowCount: 1
      });

      const result = await CeremonyService.getOrCreateStandup(testTeamId, testUserId);

      expect(result.id).toBe('new-standup-456');
      expect(result.status).toBe('pending');
      expect(result.responses).toEqual({});
    });
  });

  describe('submitStandup', () => {
    it('should throw error for non-existent ceremony', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        CeremonyService.submitStandup('non-existent', testUserId, {})
      ).rejects.toThrow('Ceremony not found');
    });

    it('should submit standup and generate AI summary', async () => {
      // Verify ownership
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'standup-123' }],
        rowCount: 1
      });

      // AI summary generation
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: { content: 'Completed tests, working on deployment, no blockers.' }
        }]
      });

      // Update standup
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const responses = {
        yesterday: 'Completed unit tests',
        today: 'Working on deployment',
        blockers: 'None'
      };

      const result = await CeremonyService.submitStandup('standup-123', testUserId, responses);

      expect(result.id).toBe('standup-123');
      expect(result.status).toBe('completed');
      expect(result.aiSummary).toBeDefined();
      expect(result.responses).toEqual(responses);
    });

    it('should use fallback summary when AI fails', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'standup-123' }],
        rowCount: 1
      });

      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('AI Error'));

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const responses = {
        yesterday: 'Completed tests',
        today: 'Working on new feature implementation for the dashboard',
        blockers: 'None'
      };

      const result = await CeremonyService.submitStandup('standup-123', testUserId, responses);

      expect(result.aiSummary).toContain('Working on:');
    });
  });

  describe('getTeamStandups', () => {
    it('should return completed standups for today', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'standup-1',
            user_id: 'user-1',
            display_name: 'Alice',
            avatar_url: 'https://example.com/alice.jpg',
            responses: { today: 'Working on tests' },
            ai_summary: 'Focused on testing',
            completed_at: new Date()
          },
          {
            id: 'standup-2',
            user_id: 'user-2',
            display_name: 'Bob',
            avatar_url: 'https://example.com/bob.jpg',
            responses: { today: 'Fixing bugs' },
            ai_summary: 'Bug fixing day',
            completed_at: new Date()
          }
        ],
        rowCount: 2
      });

      const standups = await CeremonyService.getTeamStandups(testTeamId);

      expect(standups).toHaveLength(2);
      expect(standups[0].userName).toBe('Alice');
      expect(standups[1].userName).toBe('Bob');
    });
  });

  describe('generateWeeklyReview', () => {
    it('should return already_completed when review exists', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'review-123',
          status: 'completed',
          ai_summary: 'Great week!',
          responses: {}
        }],
        rowCount: 1
      });

      const result = await CeremonyService.generateWeeklyReview(testTeamId, testUserId);

      expect(result.status).toBe('already_completed');
      expect(result.id).toBe('review-123');
    });

    it('should generate weekly review with AI', async () => {
      // No existing review
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Completed tasks
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'task-1', title: 'Task 1' },
          { id: 'task-2', title: 'Task 2' }
        ],
        rowCount: 2
      });

      // Created tasks
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'task-3', title: 'Task 3' }],
        rowCount: 1
      });

      // Standups
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { ai_summary: 'Monday was productive' },
          { ai_summary: 'Tuesday was productive' }
        ],
        rowCount: 2
      });

      // Messages
      mockDb.query.mockResolvedValueOnce({
        rows: [{ count: '25' }],
        rowCount: 1
      });

      // Events
      mockCalendarService.getEvents.mockResolvedValueOnce([
        { id: 'event-1', title: 'Meeting 1' }
      ]);

      // AI response
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              headline: 'Productive week with great progress!',
              highlights: ['Completed 2 key tasks', 'Active in standups'],
              metrics: { productivity: 'high', collaboration: 'high' },
              areasOfFocus: ['Continue momentum'],
              celebration: 'Great job on completing all tasks!'
            })
          }
        }]
      });

      // Insert review
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'review-456' }],
        rowCount: 1
      });

      const result = await CeremonyService.generateWeeklyReview(testTeamId, testUserId);

      expect(result.status).toBe('generated');
      expect(result.review).toBeDefined();
      expect(result.stats.tasksCompleted).toBe(2);
      expect(result.stats.standupsCompleted).toBe(2);
    });
  });

  describe('getWeeklyReview', () => {
    it('should return null when no review exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await CeremonyService.getWeeklyReview(testTeamId, testUserId);

      expect(result).toBeNull();
    });

    it('should return existing weekly review', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'review-123',
          status: 'completed',
          ai_plan: { headline: 'Great week!' },
          ai_summary: 'Summary',
          created_at: new Date(),
          completed_at: new Date()
        }],
        rowCount: 1
      });

      const result = await CeremonyService.getWeeklyReview(testTeamId, testUserId);

      expect(result).toBeDefined();
      expect(result.id).toBe('review-123');
      expect(result.status).toBe('completed');
    });
  });

  describe('getFocusPreferences', () => {
    it('should return existing preferences', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'prefs-123',
          team_id: testTeamId,
          user_id: testUserId,
          preferred_focus_hours: 4,
          min_focus_block_minutes: 60,
          max_meetings_per_day: 5,
          work_start_hour: 9,
          work_end_hour: 17,
          work_days: [1, 2, 3, 4, 5],
          morning_focus_enabled: true,
          morning_focus_time: '09:00',
          daily_standup_enabled: true,
          daily_standup_time: '10:00',
          weekly_review_enabled: true,
          weekly_review_day: 5,
          weekly_review_time: '16:00',
          end_of_day_enabled: false,
          end_of_day_time: '17:00',
          nudge_overdue_tasks: true,
          nudge_stale_tasks: true,
          nudge_upcoming_deadlines: true
        }],
        rowCount: 1
      });

      const prefs = await CeremonyService.getFocusPreferences(testTeamId, testUserId);

      expect(prefs).toBeDefined();
      expect(prefs.preferredFocusHours).toBe(4);
      expect(prefs.morningFocusEnabled).toBe(true);
      expect(prefs.workDays).toEqual([1, 2, 3, 4, 5]);
    });

    it('should create default preferences when none exist', async () => {
      // No existing prefs
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Insert defaults
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'new-prefs-123',
          team_id: testTeamId,
          user_id: testUserId,
          preferred_focus_hours: 2,
          min_focus_block_minutes: 30,
          max_meetings_per_day: 8,
          work_start_hour: 9,
          work_end_hour: 17,
          work_days: [1, 2, 3, 4, 5],
          morning_focus_enabled: true,
          daily_standup_enabled: true,
          weekly_review_enabled: true,
          end_of_day_enabled: false,
          nudge_overdue_tasks: true,
          nudge_stale_tasks: true,
          nudge_upcoming_deadlines: true
        }],
        rowCount: 1
      });

      const prefs = await CeremonyService.getFocusPreferences(testTeamId, testUserId);

      expect(prefs).toBeDefined();
      expect(prefs.id).toBe('new-prefs-123');
    });
  });

  describe('updateFocusPreferences', () => {
    it('should update preferences correctly', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Return updated prefs
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'prefs-123',
          team_id: testTeamId,
          user_id: testUserId,
          preferred_focus_hours: 6,
          min_focus_block_minutes: 90,
          max_meetings_per_day: 3,
          work_start_hour: 8,
          work_end_hour: 18,
          work_days: [1, 2, 3, 4, 5],
          morning_focus_enabled: true,
          daily_standup_enabled: false,
          weekly_review_enabled: true,
          end_of_day_enabled: true,
          nudge_overdue_tasks: true,
          nudge_stale_tasks: false,
          nudge_upcoming_deadlines: true
        }],
        rowCount: 1
      });

      const updated = await CeremonyService.updateFocusPreferences(testTeamId, testUserId, {
        preferredFocusHours: 6,
        minFocusBlockMinutes: 90,
        maxMeetingsPerDay: 3
      });

      expect(updated.preferredFocusHours).toBe(6);
      expect(updated.minFocusBlockMinutes).toBe(90);
    });

    it('should return current preferences when no valid fields provided', async () => {
      // Return existing prefs
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'prefs-123',
          team_id: testTeamId,
          user_id: testUserId,
          preferred_focus_hours: 2
        }],
        rowCount: 1
      });

      const result = await CeremonyService.updateFocusPreferences(testTeamId, testUserId, {
        invalidField: 'value'
      });

      expect(result).toBeDefined();
    });
  });
});
