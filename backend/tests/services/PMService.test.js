/**
 * PM Service Unit Tests
 *
 * Tests for the Project Management feature functionality including:
 * - WBS Drafts CRUD operations
 * - Feature Flags management
 * - Eisenhower Matrix operations
 * - Time Off management
 * - Milestones management
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
const PMService = await import('../../services/PMService.js');

describe('PMService - WBS Drafts', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-firebase-uid';
  const testDraftId = 'draft-uuid-456';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('getWBSDrafts', () => {
    it('should return all drafts for a team', async () => {
      const mockDrafts = [
        {
          id: 'draft-1',
          team_id: testTeamId,
          name: 'Project Alpha Draft',
          description: 'A draft',
          tree_data: { nodes: [] },
          materialized_project_id: null,
          materialized_at: null,
          created_by: testUserId,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 'draft-2',
          team_id: testTeamId,
          name: 'Project Beta Draft',
          description: 'Another draft',
          tree_data: { nodes: [{ id: 'node-1', label: 'Test', children: [] }] },
          materialized_project_id: 'proj-123',
          materialized_at: new Date(),
          created_by: testUserId,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockDrafts,
        rowCount: 2
      });

      const drafts = await PMService.getWBSDrafts(testTeamId);

      expect(drafts).toHaveLength(2);
      expect(drafts[0].name).toBe('Project Alpha Draft');
      expect(drafts[1].name).toBe('Project Beta Draft');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [testTeamId]
      );
    });

    it('should return empty array when no drafts exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const drafts = await PMService.getWBSDrafts(testTeamId);

      expect(drafts).toHaveLength(0);
    });
  });

  describe('getWBSDraft', () => {
    it('should return a single draft by ID', async () => {
      const mockDraft = {
        id: testDraftId,
        team_id: testTeamId,
        name: 'Test Draft',
        description: 'Description',
        tree_data: { nodes: [] },
        materialized_project_id: null,
        materialized_at: null,
        created_by: testUserId,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockDraft],
        rowCount: 1
      });

      const draft = await PMService.getWBSDraft(testDraftId);

      expect(draft).toBeDefined();
      expect(draft.id).toBe(testDraftId);
      expect(draft.name).toBe('Test Draft');
    });

    it('should return null when draft does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const draft = await PMService.getWBSDraft('non-existent-id');

      expect(draft).toBeNull();
    });
  });

  describe('createWBSDraft', () => {
    it('should create a new draft with provided data', async () => {
      const input = {
        name: 'New Draft',
        description: 'New draft description',
        treeData: { nodes: [{ id: 'root', label: 'Root', children: [] }] }
      };

      const mockCreatedDraft = {
        id: 'new-draft-id',
        team_id: testTeamId,
        name: input.name,
        description: input.description,
        tree_data: input.treeData,
        created_by: testUserId,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockCreatedDraft],
        rowCount: 1
      });

      const draft = await PMService.createWBSDraft(testTeamId, testUserId, input);

      expect(draft).toBeDefined();
      expect(draft.name).toBe('New Draft');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO wbs_drafts'),
        expect.arrayContaining([testTeamId, testUserId, input.name])
      );
    });

    it('should create draft with default tree_data if not provided', async () => {
      const input = {
        name: 'Empty Draft'
      };

      const mockCreatedDraft = {
        id: 'new-draft-id',
        team_id: testTeamId,
        name: input.name,
        description: null,
        tree_data: { nodes: [] },
        created_by: testUserId,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockCreatedDraft],
        rowCount: 1
      });

      const draft = await PMService.createWBSDraft(testTeamId, testUserId, input);

      expect(draft).toBeDefined();
      expect(draft.treeData).toEqual({ nodes: [] });
    });
  });

  describe('updateWBSDraft', () => {
    it('should update draft name and tree data', async () => {
      const input = {
        name: 'Updated Name',
        treeData: { nodes: [{ id: 'updated', label: 'Updated Node' }] }
      };

      const mockUpdatedDraft = {
        id: testDraftId,
        team_id: testTeamId,
        name: input.name,
        description: 'Existing description',
        tree_data: input.treeData,
        created_by: testUserId,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUpdatedDraft],
        rowCount: 1
      });

      const draft = await PMService.updateWBSDraft(testDraftId, input);

      expect(draft).toBeDefined();
      expect(draft.name).toBe('Updated Name');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wbs_drafts'),
        expect.arrayContaining([testDraftId])
      );
    });

    it('should return null when updating non-existent draft', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const draft = await PMService.updateWBSDraft('non-existent', { name: 'Test' });

      expect(draft).toBeNull();
    });
  });

  describe('deleteWBSDraft', () => {
    it('should delete draft and return true', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: testDraftId }],
        rowCount: 1
      });

      const result = await PMService.deleteWBSDraft(testDraftId);

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM wbs_drafts'),
        [testDraftId]
      );
    });

    it('should return true even when draft does not exist (delete is idempotent)', async () => {
      // The implementation always returns true after delete
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const result = await PMService.deleteWBSDraft('non-existent');

      // The actual implementation returns true unconditionally
      expect(result).toBe(true);
    });
  });
});

describe('PMService - Feature Flags', () => {
  const testUserId = 'user-firebase-uid';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('getMyFeatureFlags', () => {
    it('should return user feature flags', async () => {
      const mockFlags = {
        user_id: testUserId,
        pro_mode_enabled: true,
        show_gantt_chart: true,
        show_wbs: true,
        show_time_tracking: false,
        show_dependencies_graph: false,
        show_resource_allocation: false,
        show_critical_path: false,
        show_eisenhower_matrix: true,
        show_workload_histogram: true,
        show_milestones: true,
        show_time_blocking: true,
        show_contexts: false,
        preferred_productivity_method: 'gtd'
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockFlags],
        rowCount: 1
      });

      const flags = await PMService.getMyFeatureFlags(testUserId);

      expect(flags).toBeDefined();
      expect(flags.proModeEnabled).toBe(true);
      expect(flags.showGanttChart).toBe(true);
      expect(flags.showWBS).toBe(true);
      expect(flags.preferredProductivityMethod).toBe('gtd');
    });

    it('should return default flags when user has none', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const flags = await PMService.getMyFeatureFlags(testUserId);

      expect(flags).toBeDefined();
      expect(flags.proModeEnabled).toBe(false);
    });
  });

  describe('enableProMode', () => {
    it('should enable pro mode and set default features', async () => {
      // First call: check if user has existing flags
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'existing-id' }],
        rowCount: 1
      });

      // Second call: update with pro mode enabled
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          user_id: testUserId,
          pro_mode_enabled: true,
          show_gantt_chart: true,
          show_time_tracking: true,
          show_dependencies_graph: true,
          show_resource_allocation: true,
          show_critical_path: true,
          show_eisenhower_matrix: true,
          show_workload_histogram: true,
          show_milestones: true,
          show_time_blocking: true,
          show_contexts: true,
          preferred_productivity_method: 'gtd',
          workflow_persona: 'contributor'
        }],
        rowCount: 1
      });

      const flags = await PMService.enableProMode(testUserId);

      expect(flags).toBeDefined();
      expect(flags.proModeEnabled).toBe(true);
    });
  });

  describe('disableProMode', () => {
    it('should disable pro mode', async () => {
      // First call: check if user has existing flags
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'existing-id' }],
        rowCount: 1
      });

      // Second call: update with pro mode disabled
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          user_id: testUserId,
          pro_mode_enabled: false,
          show_gantt_chart: true,
          show_time_tracking: true,
          show_dependencies_graph: true,
          show_resource_allocation: true,
          show_critical_path: true,
          show_eisenhower_matrix: true,
          show_workload_histogram: true,
          show_milestones: true,
          show_time_blocking: true,
          show_contexts: true,
          preferred_productivity_method: 'gtd',
          workflow_persona: 'contributor'
        }],
        rowCount: 1
      });

      const flags = await PMService.disableProMode(testUserId);

      expect(flags).toBeDefined();
      expect(flags.proModeEnabled).toBe(false);
    });
  });

  describe('updateMyFeatureFlags', () => {
    it('should update specific feature flags for existing user', async () => {
      const input = {
        showGanttChart: false,
        showWBS: true
      };

      // First call: check if user has existing flags (SELECT id)
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'existing-flags-id' }],
        rowCount: 1
      });

      // Second call: update flags (UPDATE ... RETURNING *)
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          user_id: testUserId,
          pro_mode_enabled: true,
          show_gantt_chart: false,
          show_wbs: true,
          show_time_tracking: false,
          show_dependencies_graph: false,
          show_resource_allocation: false,
          show_critical_path: false,
          show_eisenhower_matrix: true,
          show_workload_histogram: true,
          show_milestones: true,
          show_time_blocking: true,
          show_contexts: false,
          preferred_productivity_method: 'gtd',
          workflow_persona: 'contributor'
        }],
        rowCount: 1
      });

      const flags = await PMService.updateMyFeatureFlags(testUserId, input);

      expect(flags).toBeDefined();
    });

    it('should create new feature flags for new user', async () => {
      const input = {
        showGanttChart: true,
        proModeEnabled: true
      };

      // First call: check if user has existing flags - none found
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      // Second call: insert new flags
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          user_id: testUserId,
          pro_mode_enabled: true,
          show_gantt_chart: true,
          show_wbs: false,
          show_time_tracking: false,
          show_dependencies_graph: false,
          show_resource_allocation: false,
          show_critical_path: false,
          show_eisenhower_matrix: false,
          show_workload_histogram: false,
          show_milestones: false,
          show_time_blocking: false,
          show_contexts: false,
          preferred_productivity_method: 'gtd',
          workflow_persona: 'contributor'
        }],
        rowCount: 1
      });

      const flags = await PMService.updateMyFeatureFlags(testUserId, input);

      expect(flags).toBeDefined();
      expect(flags.proModeEnabled).toBe(true);
    });
  });
});

describe('PMService - Eisenhower Matrix', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-firebase-uid';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('getEisenhowerMatrix', () => {
    it('should return tasks categorized by quadrant', async () => {
      const mockTasks = [
        { id: 'task-1', title: 'Urgent Important', is_urgent: true, importance: 'high', status: 'todo', priority: 'high' },
        { id: 'task-2', title: 'Not Urgent Important', is_urgent: false, importance: 'high', status: 'todo', priority: 'high' },
        { id: 'task-3', title: 'Urgent Not Important', is_urgent: true, importance: 'low', status: 'todo', priority: 'low' },
        { id: 'task-4', title: 'Not Urgent Not Important', is_urgent: false, importance: 'low', status: 'todo', priority: 'low' }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockTasks,
        rowCount: 4
      });

      const matrix = await PMService.getEisenhowerMatrix(testTeamId, testUserId);

      expect(matrix).toBeDefined();
      // The implementation uses doNow, not doFirst
      expect(matrix.doNow).toBeDefined();
      expect(matrix.schedule).toBeDefined();
      expect(matrix.delegate).toBeDefined();
      expect(matrix.eliminate).toBeDefined();
    });
  });

  describe('setTaskUrgency', () => {
    it('should update task urgency flag', async () => {
      const taskId = 'task-123';

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: taskId,
          is_urgent: true
        }],
        rowCount: 1
      });

      const task = await PMService.setTaskUrgency(taskId, true);

      expect(task).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks'),
        expect.arrayContaining([taskId, true])
      );
    });
  });

  describe('setTaskImportance', () => {
    it('should update task importance level', async () => {
      const taskId = 'task-123';

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: taskId,
          importance: 'high'
        }],
        rowCount: 1
      });

      const task = await PMService.setTaskImportance(taskId, 'high');

      expect(task).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks'),
        expect.arrayContaining([taskId, 'high'])
      );
    });
  });
});

describe('PMService - Time Off', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-firebase-uid';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('getMyTimeOff', () => {
    it('should return user time off entries', async () => {
      const mockTimeOff = [
        {
          id: 'to-1',
          user_id: testUserId,
          team_id: testTeamId,
          start_date: '2024-12-20',
          end_date: '2024-12-25',
          type: 'vacation',
          description: 'Holiday',
          status: 'approved'
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockTimeOff,
        rowCount: 1
      });

      const timeOff = await PMService.getMyTimeOff(testUserId, testTeamId);

      expect(timeOff).toHaveLength(1);
      expect(timeOff[0].type).toBe('vacation');
    });
  });

  describe('createTimeOff', () => {
    it('should create a new time off entry', async () => {
      const input = {
        startDate: '2024-12-20',
        endDate: '2024-12-25',
        type: 'vacation',
        description: 'Holiday break'
      };

      const mockCreated = {
        id: 'new-to-id',
        user_id: testUserId,
        team_id: testTeamId,
        start_date: input.startDate,
        end_date: input.endDate,
        type: input.type,
        description: input.description,
        status: 'pending'
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockCreated],
        rowCount: 1
      });

      const timeOff = await PMService.createTimeOff(testUserId, testTeamId, input);

      expect(timeOff).toBeDefined();
      expect(timeOff.type).toBe('vacation');
    });
  });
});

describe('PMService - Milestones', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-firebase-uid';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('getMilestones', () => {
    it('should return milestones for a team', async () => {
      const mockMilestones = [
        {
          id: 'ms-1',
          team_id: testTeamId,
          name: 'Alpha Release',
          description: 'First release',
          due_date: '2024-12-31',
          status: 'active'
        },
        {
          id: 'ms-2',
          team_id: testTeamId,
          name: 'Beta Release',
          description: 'Second release',
          due_date: '2025-01-31',
          status: 'active'
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockMilestones,
        rowCount: 2
      });

      const milestones = await PMService.getMilestones(testTeamId);

      expect(milestones).toHaveLength(2);
      expect(milestones[0].name).toBe('Alpha Release');
    });

    it('should filter by projectId if provided', async () => {
      const projectId = 'proj-123';

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'ms-1',
          team_id: testTeamId,
          project_id: projectId,
          name: 'Project Milestone',
          due_date: '2024-12-31'
        }],
        rowCount: 1
      });

      const milestones = await PMService.getMilestones(testTeamId, projectId);

      expect(milestones).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('project_id'),
        expect.arrayContaining([testTeamId, projectId])
      );
    });
  });

  describe('createMilestone', () => {
    it('should create a new milestone', async () => {
      const input = {
        name: 'New Milestone',
        description: 'Milestone description',
        dueDate: '2024-12-31'
      };

      const mockCreated = {
        id: 'new-ms-id',
        team_id: testTeamId,
        name: input.name,
        description: input.description,
        due_date: input.dueDate,
        status: 'active',
        created_by: testUserId
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockCreated],
        rowCount: 1
      });

      const milestone = await PMService.createMilestone(testTeamId, testUserId, input);

      expect(milestone).toBeDefined();
      expect(milestone.name).toBe('New Milestone');
    });
  });

  describe('completeMilestone', () => {
    it('should mark milestone as complete', async () => {
      const milestoneId = 'ms-123';

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: milestoneId,
          status: 'completed',
          completed_at: new Date()
        }],
        rowCount: 1
      });

      const milestone = await PMService.completeMilestone(milestoneId);

      expect(milestone).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE milestones'),
        expect.arrayContaining([milestoneId])
      );
    });
  });
});

describe('PMService - Time Blocks', () => {
  const testTeamId = 'team-uuid-123';
  const testUserId = 'user-firebase-uid';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('getMyTimeBlocks', () => {
    it('should return user time blocks within date range', async () => {
      const mockBlocks = [
        {
          id: 'block-1',
          user_id: testUserId,
          team_id: testTeamId,
          start_time: '2024-12-10T09:00:00Z',
          end_time: '2024-12-10T11:00:00Z',
          title: 'Deep Work',
          type: 'focus',
          status: 'scheduled'
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockBlocks,
        rowCount: 1
      });

      const blocks = await PMService.getMyTimeBlocks(testUserId, testTeamId, '2024-12-01', '2024-12-31');

      expect(blocks).toHaveLength(1);
      expect(blocks[0].title).toBe('Deep Work');
    });
  });

  describe('createTimeBlock', () => {
    it('should create a new time block', async () => {
      const input = {
        startTime: '2024-12-10T09:00:00Z',
        endTime: '2024-12-10T11:00:00Z',
        title: 'Focus Time',
        type: 'focus'
      };

      const mockCreated = {
        id: 'new-block-id',
        user_id: testUserId,
        team_id: testTeamId,
        ...input,
        status: 'scheduled'
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockCreated],
        rowCount: 1
      });

      const block = await PMService.createTimeBlock(testUserId, testTeamId, input);

      expect(block).toBeDefined();
      expect(block.title).toBe('Focus Time');
    });
  });

  describe('startTimeBlock', () => {
    it('should mark time block as started', async () => {
      const blockId = 'block-123';

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: blockId,
          status: 'in_progress',
          actual_start: new Date()
        }],
        rowCount: 1
      });

      const block = await PMService.startTimeBlock(blockId);

      expect(block).toBeDefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE time_blocks'),
        expect.arrayContaining([blockId])
      );
    });
  });

  describe('completeTimeBlock', () => {
    it('should mark time block as complete with focus score', async () => {
      const blockId = 'block-123';
      const focusScore = 8;
      const notes = 'Productive session';

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: blockId,
          status: 'completed',
          focus_score: focusScore,
          notes: notes
        }],
        rowCount: 1
      });

      const block = await PMService.completeTimeBlock(blockId, focusScore, notes);

      expect(block).toBeDefined();
    });
  });
});
