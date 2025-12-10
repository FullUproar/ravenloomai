/**
 * ProactiveService Unit Tests
 *
 * Tests for proactive AI functionality including:
 * - Task health calculation
 * - Smart nudges generation
 * - Workload analysis
 * - Team insights
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
jest.unstable_mockModule('../../services/KnowledgeService.js', () => mockKnowledgeService);
jest.unstable_mockModule('../../services/TeamService.js', () => mockTeamService);
jest.unstable_mockModule('../../services/RateLimiterService.js', () => mockRateLimiterService);

jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => mockOpenAI)
}));

// Import service after mocking
const ProactiveService = await import('../../services/ProactiveService.js');

describe('ProactiveService', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-uuid-456';
  const testTaskId = 'task-uuid-789';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('calculateTaskHealth', () => {
    it('should return null for completed tasks', async () => {
      mockTaskService.getTaskById.mockResolvedValueOnce({
        id: testTaskId,
        status: 'done',
        title: 'Completed Task'
      });

      const health = await ProactiveService.calculateTaskHealth(testTaskId);

      expect(health).toBeNull();
    });

    it('should return null for non-existent tasks', async () => {
      mockTaskService.getTaskById.mockResolvedValueOnce(null);

      const health = await ProactiveService.calculateTaskHealth(testTaskId);

      expect(health).toBeNull();
    });

    it('should calculate healthy score for task with no issues', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10); // Due in 10 days

      mockTaskService.getTaskById.mockResolvedValueOnce({
        id: testTaskId,
        title: 'Future Task',
        status: 'in_progress',
        priority: 'medium',
        dueAt: futureDate.toISOString(),
        createdAt: new Date().toISOString()
      });

      // Mock activity query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ created_at: new Date() }],
        rowCount: 1
      });

      // Mock health metrics insert
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const health = await ProactiveService.calculateTaskHealth(testTaskId);

      expect(health).toBeDefined();
      expect(health.healthScore).toBeGreaterThan(0.7);
      expect(health.riskLevel).toBe('low');
      expect(health.riskFactors).toHaveLength(0);
    });

    it('should reduce score for overdue tasks', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3); // 3 days overdue

      mockTaskService.getTaskById.mockResolvedValueOnce({
        id: testTaskId,
        title: 'Overdue Task',
        status: 'todo',
        priority: 'medium',
        dueAt: pastDate.toISOString(),
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      });

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const health = await ProactiveService.calculateTaskHealth(testTaskId);

      expect(health.healthScore).toBeLessThan(0.7);
      expect(health.riskFactors).toContainEqual(expect.stringContaining('Overdue'));
    });

    it('should reduce score for stale tasks', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20); // 20 days old

      mockTaskService.getTaskById.mockResolvedValueOnce({
        id: testTaskId,
        title: 'Stale Task',
        status: 'todo',
        priority: 'medium',
        dueAt: null,
        createdAt: oldDate.toISOString()
      });

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const health = await ProactiveService.calculateTaskHealth(testTaskId);

      expect(health.riskFactors).toContainEqual(expect.stringContaining('No progress'));
    });

    it('should reduce score for urgent aging tasks', async () => {
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

      mockTaskService.getTaskById.mockResolvedValueOnce({
        id: testTaskId,
        title: 'Urgent Task',
        status: 'todo',
        priority: 'urgent',
        dueAt: null,
        createdAt: fourDaysAgo.toISOString()
      });

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const health = await ProactiveService.calculateTaskHealth(testTaskId);

      expect(health.riskFactors).toContainEqual('Urgent task aging');
    });

    it('should classify risk levels correctly', async () => {
      const criticalTask = {
        id: testTaskId,
        title: 'Critical Task',
        status: 'todo',
        priority: 'urgent',
        dueAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days overdue
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
      };

      mockTaskService.getTaskById.mockResolvedValueOnce(criticalTask);
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const health = await ProactiveService.calculateTaskHealth(testTaskId);

      expect(['high', 'critical']).toContain(health.riskLevel);
    });
  });

  describe('generateNudgesForUser', () => {
    it('should return empty array when smart nudges are disabled', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(false);

      const nudges = await ProactiveService.generateNudgesForUser(testTeamId, testUserId);

      expect(nudges).toEqual([]);
      expect(mockTeamService.getProactiveFeatureStatus).toHaveBeenCalledWith(testTeamId, 'smartNudges');
    });

    it('should generate nudges for overdue tasks', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(true);

      // User preferences
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          nudge_overdue_tasks: true,
          nudge_stale_tasks: true,
          nudge_upcoming_deadlines: true
        }],
        rowCount: 1
      });

      // Overdue tasks
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: testTaskId,
          title: 'Overdue Task',
          due_at: pastDate
        }],
        rowCount: 1
      });

      // Upcoming tasks - empty
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Stale tasks - empty
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Upcoming meetings - empty
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Check existing nudge
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Insert nudge
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const nudges = await ProactiveService.generateNudgesForUser(testTeamId, testUserId);

      expect(nudges.length).toBeGreaterThan(0);
      expect(nudges[0].nudgeType).toBe('overdue_task');
      expect(nudges[0].relatedTaskId).toBe(testTaskId);
    });

    it('should prioritize nudges by urgency', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(true);

      // User preferences
      mockDb.query.mockResolvedValueOnce({
        rows: [{ nudge_overdue_tasks: true, nudge_stale_tasks: true, nudge_upcoming_deadlines: true }],
        rowCount: 1
      });

      // Multiple overdue tasks with different ages
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'task-1', title: 'Recent Overdue', due_at: twoDaysAgo },
          { id: 'task-2', title: 'Old Overdue', due_at: eightDaysAgo }
        ],
        rowCount: 2
      });

      // Other queries return empty
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Insert nudges
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const nudges = await ProactiveService.generateNudgesForUser(testTeamId, testUserId);

      const urgentNudge = nudges.find(n => n.priority === 'urgent');
      expect(urgentNudge).toBeDefined();
    });
  });

  describe('getPendingNudges', () => {
    it('should return pending nudges ordered by priority', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'nudge-1',
            nudge_type: 'overdue_task',
            title: 'Urgent Nudge',
            message: 'Task is overdue',
            priority: 'urgent',
            related_task_id: testTaskId,
            related_event_id: null,
            suggested_actions: [],
            created_at: new Date()
          },
          {
            id: 'nudge-2',
            nudge_type: 'stale_task',
            title: 'Medium Nudge',
            message: 'Task is stale',
            priority: 'medium',
            related_task_id: 'task-2',
            related_event_id: null,
            suggested_actions: [],
            created_at: new Date()
          }
        ],
        rowCount: 2
      });

      const nudges = await ProactiveService.getPendingNudges(testTeamId, testUserId);

      expect(nudges).toHaveLength(2);
      expect(nudges[0].priority).toBe('urgent');
      expect(nudges[1].priority).toBe('medium');
    });

    it('should filter out expired nudges', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const nudges = await ProactiveService.getPendingNudges(testTeamId, testUserId);

      expect(nudges).toHaveLength(0);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('expires_at IS NULL OR expires_at > NOW()'),
        expect.any(Array)
      );
    });
  });

  describe('updateNudgeStatus', () => {
    it('should update nudge to acted status', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await ProactiveService.updateNudgeStatus('nudge-123', 'acted', testUserId);

      expect(result.success).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('acted_at'),
        expect.any(Array)
      );
    });

    it('should update nudge to dismissed status', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await ProactiveService.updateNudgeStatus('nudge-123', 'dismissed', testUserId);

      expect(result.success).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('dismissed_at'),
        expect.any(Array)
      );
    });

    it('should reject invalid status', async () => {
      await expect(
        ProactiveService.updateNudgeStatus('nudge-123', 'invalid', testUserId)
      ).rejects.toThrow('Invalid status');
    });
  });

  describe('actOnNudge', () => {
    it('should mark nudge as acted and return details', async () => {
      // Update status call
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Get nudge details call
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          nudge_type: 'overdue_task',
          related_task_id: testTaskId,
          related_event_id: null
        }],
        rowCount: 1
      });

      const result = await ProactiveService.actOnNudge('nudge-123', 'complete', testUserId);

      expect(result.success).toBe(true);
      expect(result.action).toBe('complete');
      expect(result.nudgeType).toBe('overdue_task');
      expect(result.relatedTaskId).toBe(testTaskId);
    });

    it('should return error for non-existent nudge', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await ProactiveService.actOnNudge('non-existent', 'complete', testUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nudge not found');
    });
  });

  describe('analyzeWorkload', () => {
    it('should calculate workload metrics for a user', async () => {
      // Tasks due this week
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'task-1', title: 'Task 1', estimated_hours: 4 },
          { id: 'task-2', title: 'Task 2', estimated_hours: 2 }
        ],
        rowCount: 2
      });

      // Events this week
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'event-1',
            title: 'Meeting',
            is_all_day: false,
            start_at: new Date(),
            end_at: new Date(Date.now() + 60 * 60 * 1000)
          }
        ],
        rowCount: 1
      });

      const workload = await ProactiveService.analyzeWorkload(testTeamId, testUserId);

      expect(workload).toBeDefined();
      expect(workload.tasksDue).toBe(2);
      expect(workload.estimatedTaskHours).toBe(6);
      expect(workload.meetingHours).toBe(1);
      expect(workload.workloadLevel).toBeDefined();
      expect(workload.recommendation).toBeDefined();
    });

    it('should use default estimate when tasks have no estimate', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'task-1', title: 'Task 1', estimated_hours: null }
        ],
        rowCount: 1
      });

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const workload = await ProactiveService.analyzeWorkload(testTeamId, testUserId);

      expect(workload.estimatedTaskHours).toBe(2); // Default 2 hours
    });

    it('should identify overloaded workload', async () => {
      // Many tasks with high hours
      mockDb.query.mockResolvedValueOnce({
        rows: Array(10).fill(null).map((_, i) => ({
          id: `task-${i}`,
          title: `Task ${i}`,
          estimated_hours: 8
        })),
        rowCount: 10
      });

      // Many meetings
      const meetingStart = new Date();
      mockDb.query.mockResolvedValueOnce({
        rows: Array(20).fill(null).map((_, i) => ({
          id: `event-${i}`,
          title: `Meeting ${i}`,
          is_all_day: false,
          start_at: new Date(meetingStart.getTime() + i * 60 * 60 * 1000),
          end_at: new Date(meetingStart.getTime() + (i + 1) * 60 * 60 * 1000)
        })),
        rowCount: 20
      });

      const workload = await ProactiveService.analyzeWorkload(testTeamId, testUserId);

      expect(workload.workloadLevel).toBe('overloaded');
    });
  });

  describe('getAtRiskTasks', () => {
    it('should return tasks below health threshold', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            task_id: testTaskId,
            title: 'At Risk Task',
            status: 'in_progress',
            priority: 'high',
            due_at: new Date(),
            assigned_to: testUserId,
            health_score: 0.4,
            risk_level: 'high',
            suggested_interventions: []
          }
        ],
        rowCount: 1
      });

      const atRiskTasks = await ProactiveService.getAtRiskTasks(testTeamId, 0.6);

      expect(atRiskTasks).toHaveLength(1);
      expect(atRiskTasks[0].healthScore).toBe(0.4);
      expect(atRiskTasks[0].riskLevel).toBe('high');
    });

    it('should use default threshold of 0.6', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await ProactiveService.getAtRiskTasks(testTeamId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('health_score <= $2'),
        [testTeamId, 0.6]
      );
    });
  });

  describe('generateTeamInsights', () => {
    it('should return disabled message when insights are disabled', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(false);

      const insights = await ProactiveService.generateTeamInsights(testTeamId);

      expect(insights.disabled).toBe(true);
      expect(insights.summary).toContain('disabled');
    });

    it('should return rate limited message when rate limited', async () => {
      mockTeamService.getProactiveFeatureStatus.mockResolvedValueOnce(true);
      mockRateLimiterService.enforceRateLimit.mockRejectedValueOnce(new Error('Rate limited'));

      const insights = await ProactiveService.generateTeamInsights(testTeamId);

      expect(insights.rateLimited).toBe(true);
      expect(insights.summary).toContain('Rate limit');
    });
  });

  describe('getTeamInsights', () => {
    it('should return cached insights when available', async () => {
      const cachedInsights = {
        insights: [{ title: 'Cached Insight', description: 'From cache' }],
        summary: 'Cached summary',
        metrics: { tasksCompleted: 5 },
        created_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [cachedInsights],
        rowCount: 1
      });

      const insights = await ProactiveService.getTeamInsights(testTeamId);

      expect(insights.cached).toBe(true);
      expect(insights.insights).toEqual(cachedInsights.insights);
    });
  });

  describe('dismissNudge', () => {
    it('should call updateNudgeStatus with dismissed status', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await ProactiveService.dismissNudge('nudge-123', testUserId);

      expect(result.success).toBe(true);
    });
  });

  describe('refreshTeamTaskHealth', () => {
    it('should calculate health for all team tasks', async () => {
      mockTaskService.getTasks.mockResolvedValueOnce([
        { id: 'task-1', status: 'todo' },
        { id: 'task-2', status: 'in_progress' }
      ]);

      // Mock calculateTaskHealth for each task
      mockTaskService.getTaskById.mockResolvedValue({
        id: 'task-1',
        title: 'Test Task',
        status: 'todo',
        priority: 'medium',
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      });

      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const healthReports = await ProactiveService.refreshTeamTaskHealth(testTeamId);

      expect(healthReports).toBeDefined();
      expect(Array.isArray(healthReports)).toBe(true);
    });
  });
});
