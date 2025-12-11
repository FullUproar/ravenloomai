/**
 * Channel Service Unit Tests - AI Focus Feature
 *
 * Tests for the AI Focus functionality in channels:
 * - Setting AI Focus (goal, project, task)
 * - Clearing AI Focus
 * - Getting AI Focus context
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the database module before importing the service
const mockDb = {
  query: jest.fn()
};

jest.unstable_mockModule('../../db.js', () => ({
  default: mockDb
}));

// Import the service after mocking
const ChannelService = await import('../../services/ChannelService.js');

describe('ChannelService - AI Focus', () => {
  const testChannelId = 'channel-uuid-123';
  const testGoalId = 'goal-uuid-456';
  const testProjectId = 'project-uuid-789';
  const testTaskId = 'task-uuid-012';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('setChannelAIFocus', () => {
    it('should set focus with goalId only', async () => {
      const mockChannel = {
        id: testChannelId,
        name: 'general',
        team_id: 'team-123',
        focus_goal_id: testGoalId,
        focus_project_id: null,
        focus_task_id: null,
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockChannel],
        rowCount: 1
      });

      const channel = await ChannelService.setChannelAIFocus(testChannelId, {
        goalId: testGoalId,
        projectId: null,
        taskId: null
      });

      expect(channel).toBeDefined();
      expect(channel.focusGoalId).toBe(testGoalId);
      expect(channel.focusProjectId).toBeNull();
      expect(channel.focusTaskId).toBeNull();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE channels'),
        expect.arrayContaining([testChannelId, testGoalId, null, null])
      );
    });

    it('should set focus with projectId only', async () => {
      const mockChannel = {
        id: testChannelId,
        name: 'general',
        team_id: 'team-123',
        focus_goal_id: null,
        focus_project_id: testProjectId,
        focus_task_id: null,
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockChannel],
        rowCount: 1
      });

      const channel = await ChannelService.setChannelAIFocus(testChannelId, {
        goalId: null,
        projectId: testProjectId,
        taskId: null
      });

      expect(channel).toBeDefined();
      expect(channel.focusGoalId).toBeNull();
      expect(channel.focusProjectId).toBe(testProjectId);
      expect(channel.focusTaskId).toBeNull();
    });

    it('should set focus with taskId only', async () => {
      const mockChannel = {
        id: testChannelId,
        name: 'general',
        team_id: 'team-123',
        focus_goal_id: null,
        focus_project_id: null,
        focus_task_id: testTaskId,
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockChannel],
        rowCount: 1
      });

      const channel = await ChannelService.setChannelAIFocus(testChannelId, {
        goalId: null,
        projectId: null,
        taskId: testTaskId
      });

      expect(channel).toBeDefined();
      expect(channel.focusGoalId).toBeNull();
      expect(channel.focusProjectId).toBeNull();
      expect(channel.focusTaskId).toBe(testTaskId);
    });

    it('should set multiple focus items simultaneously', async () => {
      const mockChannel = {
        id: testChannelId,
        name: 'general',
        team_id: 'team-123',
        focus_goal_id: testGoalId,
        focus_project_id: testProjectId,
        focus_task_id: testTaskId,
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockChannel],
        rowCount: 1
      });

      const channel = await ChannelService.setChannelAIFocus(testChannelId, {
        goalId: testGoalId,
        projectId: testProjectId,
        taskId: testTaskId
      });

      expect(channel).toBeDefined();
      expect(channel.focusGoalId).toBe(testGoalId);
      expect(channel.focusProjectId).toBe(testProjectId);
      expect(channel.focusTaskId).toBe(testTaskId);
    });

    it('should return null when channel does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const channel = await ChannelService.setChannelAIFocus('non-existent', {
        goalId: testGoalId
      });

      expect(channel).toBeNull();
    });

    it('should convert undefined to null for focus fields', async () => {
      const mockChannel = {
        id: testChannelId,
        name: 'general',
        team_id: 'team-123',
        focus_goal_id: testGoalId,
        focus_project_id: null,
        focus_task_id: null,
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockChannel],
        rowCount: 1
      });

      await ChannelService.setChannelAIFocus(testChannelId, {
        goalId: testGoalId
        // projectId and taskId are undefined
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([testChannelId, testGoalId, null, null])
      );
    });
  });

  describe('clearChannelAIFocus', () => {
    it('should clear all focus fields', async () => {
      const mockChannel = {
        id: testChannelId,
        name: 'general',
        team_id: 'team-123',
        focus_goal_id: null,
        focus_project_id: null,
        focus_task_id: null,
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockChannel],
        rowCount: 1
      });

      const channel = await ChannelService.clearChannelAIFocus(testChannelId);

      expect(channel).toBeDefined();
      expect(channel.focusGoalId).toBeNull();
      expect(channel.focusProjectId).toBeNull();
      expect(channel.focusTaskId).toBeNull();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE channels'),
        [testChannelId]
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('focus_goal_id = NULL'),
        expect.any(Array)
      );
    });

    it('should return null when channel does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const channel = await ChannelService.clearChannelAIFocus('non-existent');

      expect(channel).toBeNull();
    });
  });

  describe('getChannelAIFocusContext', () => {
    it('should return full context when all focus items set', async () => {
      const mockResult = {
        id: testChannelId,
        goal_id: testGoalId,
        goal_title: 'Q1 Revenue Target',
        goal_description: 'Increase revenue by 20%',
        project_id: testProjectId,
        project_name: 'Website Redesign',
        project_description: 'Modernize the website',
        task_id: testTaskId,
        task_title: 'Create mockups',
        task_description: 'Design initial mockups',
        task_status: 'in_progress'
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockResult],
        rowCount: 1
      });

      const context = await ChannelService.getChannelAIFocusContext(testChannelId);

      expect(context).toBeDefined();
      expect(context.goal).toEqual({
        id: testGoalId,
        title: 'Q1 Revenue Target',
        description: 'Increase revenue by 20%'
      });
      expect(context.project).toEqual({
        id: testProjectId,
        name: 'Website Redesign',
        description: 'Modernize the website'
      });
      expect(context.task).toEqual({
        id: testTaskId,
        title: 'Create mockups',
        description: 'Design initial mockups',
        status: 'in_progress'
      });
    });

    it('should return goal only when only goal is set', async () => {
      const mockResult = {
        id: testChannelId,
        goal_id: testGoalId,
        goal_title: 'Q1 Revenue Target',
        goal_description: 'Increase revenue by 20%',
        project_id: null,
        project_name: null,
        project_description: null,
        task_id: null,
        task_title: null,
        task_description: null,
        task_status: null
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockResult],
        rowCount: 1
      });

      const context = await ChannelService.getChannelAIFocusContext(testChannelId);

      expect(context).toBeDefined();
      expect(context.goal).toEqual({
        id: testGoalId,
        title: 'Q1 Revenue Target',
        description: 'Increase revenue by 20%'
      });
      expect(context.project).toBeNull();
      expect(context.task).toBeNull();
    });

    it('should return project only when only project is set', async () => {
      const mockResult = {
        id: testChannelId,
        goal_id: null,
        goal_title: null,
        goal_description: null,
        project_id: testProjectId,
        project_name: 'Website Redesign',
        project_description: 'Modernize the website',
        task_id: null,
        task_title: null,
        task_description: null,
        task_status: null
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockResult],
        rowCount: 1
      });

      const context = await ChannelService.getChannelAIFocusContext(testChannelId);

      expect(context).toBeDefined();
      expect(context.goal).toBeNull();
      expect(context.project).toEqual({
        id: testProjectId,
        name: 'Website Redesign',
        description: 'Modernize the website'
      });
      expect(context.task).toBeNull();
    });

    it('should return task only when only task is set', async () => {
      const mockResult = {
        id: testChannelId,
        goal_id: null,
        goal_title: null,
        goal_description: null,
        project_id: null,
        project_name: null,
        project_description: null,
        task_id: testTaskId,
        task_title: 'Create mockups',
        task_description: 'Design initial mockups',
        task_status: 'in_progress'
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockResult],
        rowCount: 1
      });

      const context = await ChannelService.getChannelAIFocusContext(testChannelId);

      expect(context).toBeDefined();
      expect(context.goal).toBeNull();
      expect(context.project).toBeNull();
      expect(context.task).toEqual({
        id: testTaskId,
        title: 'Create mockups',
        description: 'Design initial mockups',
        status: 'in_progress'
      });
    });

    it('should return null when no focus is set', async () => {
      const mockResult = {
        id: testChannelId,
        goal_id: null,
        goal_title: null,
        goal_description: null,
        project_id: null,
        project_name: null,
        project_description: null,
        task_id: null,
        task_title: null,
        task_description: null,
        task_status: null
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockResult],
        rowCount: 1
      });

      const context = await ChannelService.getChannelAIFocusContext(testChannelId);

      expect(context).toBeDefined();
      expect(context.goal).toBeNull();
      expect(context.project).toBeNull();
      expect(context.task).toBeNull();
    });

    it('should return null when channel does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const context = await ChannelService.getChannelAIFocusContext('non-existent');

      expect(context).toBeNull();
    });

    it('should use correct SQL JOIN structure', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: testChannelId,
          goal_id: null,
          project_id: null,
          task_id: null
        }],
        rowCount: 1
      });

      await ChannelService.getChannelAIFocusContext(testChannelId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN goals'),
        [testChannelId]
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN projects'),
        [testChannelId]
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN tasks'),
        [testChannelId]
      );
    });
  });
});

describe('ChannelService - mapChannel with Focus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  it('should correctly map focus fields from database row', async () => {
    const testChannelId = 'channel-123';
    const mockRow = {
      id: testChannelId,
      team_id: 'team-123',
      name: 'general',
      description: 'General channel',
      ai_mode: 'mentions_only',
      channel_type: 'public',
      owner_id: null,
      is_default: true,
      created_by: 'user-123',
      focus_goal_id: 'goal-123',
      focus_project_id: 'project-456',
      focus_task_id: null,
      created_at: new Date(),
      updated_at: new Date()
    };

    mockDb.query.mockResolvedValueOnce({
      rows: [mockRow],
      rowCount: 1
    });

    const channel = await ChannelService.getChannelById(testChannelId);

    expect(channel.focusGoalId).toBe('goal-123');
    expect(channel.focusProjectId).toBe('project-456');
    expect(channel.focusTaskId).toBeNull();
  });
});
