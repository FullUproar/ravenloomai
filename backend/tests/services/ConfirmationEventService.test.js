/**
 * ConfirmationEventService Unit Tests
 *
 * Tests for trust model data collection:
 * - Logging confirmation events (confirmed, edited, rejected)
 * - Logging conflict overrides
 * - Querying confirmation stats for trust model
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockDb = {
  query: jest.fn()
};

jest.unstable_mockModule('../../db.js', () => ({
  default: mockDb
}));

const ConfirmationEventService = await import('../../services/ConfirmationEventService.js');

describe('ConfirmationEventService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();
  });

  describe('logConfirmationEvent', () => {
    it('should log a confirmed event with all fields', async () => {
      const event = {
        teamId: 'team-1',
        previewId: 'preview-1',
        factId: 'fact-1',
        confirmingUserId: 'user-confirmer',
        statingUserId: 'user-stater',
        outcome: 'confirmed',
        originalContent: 'Launch date is June 15',
        editedContent: null,
        responseTimeMs: 2500
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'event-1', ...event, created_at: new Date() }]
      });

      const result = await ConfirmationEventService.logConfirmationEvent(event);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO confirmation_events');
      expect(params).toContain('team-1');
      expect(params).toContain('confirmed');
      expect(params).toContain('user-confirmer');
      expect(params).toContain('user-stater');
      expect(result.id).toBe('event-1');
    });

    it('should log an edited event', async () => {
      const event = {
        teamId: 'team-1',
        previewId: 'preview-1',
        factId: 'fact-1',
        confirmingUserId: 'user-1',
        statingUserId: 'user-1',
        outcome: 'edited',
        originalContent: 'Budget is $5000',
        editedContent: 'Budget is $5,000 for Q2',
        responseTimeMs: 5000
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'event-2', ...event }]
      });

      const result = await ConfirmationEventService.logConfirmationEvent(event);
      const params = mockDb.query.mock.calls[0][1];
      expect(params).toContain('edited');
      expect(params).toContain('Budget is $5,000 for Q2');
    });

    it('should log a rejected event with null factId', async () => {
      const event = {
        teamId: 'team-1',
        previewId: 'preview-1',
        factId: null,
        confirmingUserId: 'user-1',
        statingUserId: 'user-1',
        outcome: 'rejected',
        originalContent: 'Inaccurate claim',
        editedContent: null,
        responseTimeMs: 800
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'event-3', ...event }]
      });

      await ConfirmationEventService.logConfirmationEvent(event);
      const params = mockDb.query.mock.calls[0][1];
      expect(params).toContain('rejected');
      expect(params).toContain(null); // factId
    });
  });

  describe('logConflictOverride', () => {
    it('should log an override decision', async () => {
      const override = {
        previewId: 'preview-1',
        existingFactId: 'old-fact-1',
        newFactId: 'new-fact-1',
        conflictType: 'update',
        userDecision: 'override',
        userId: 'user-1'
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'override-1', ...override }]
      });

      await ConfirmationEventService.logConflictOverride(override);
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO conflict_overrides');
      expect(params).toContain('override');
      expect(params).toContain('old-fact-1');
      expect(params).toContain('new-fact-1');
    });

    it('should log a keep_existing decision with null newFactId', async () => {
      const override = {
        previewId: 'preview-1',
        existingFactId: 'old-fact-1',
        newFactId: null,
        conflictType: 'update',
        userDecision: 'keep_existing',
        userId: 'user-1'
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'override-2', ...override }]
      });

      await ConfirmationEventService.logConflictOverride(override);
      const params = mockDb.query.mock.calls[0][1];
      expect(params).toContain('keep_existing');
    });
  });

  describe('getUserConfirmationStats', () => {
    it('should return confirmation stats for trust model', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          confirmed_count: '15',
          edited_count: '3',
          rejected_count: '2',
          total_count: '20'
        }]
      });

      const stats = await ConfirmationEventService.getUserConfirmationStats('team-1', 'user-1');
      expect(stats.confirmed_count).toBe('15');
      expect(stats.rejected_count).toBe('2');
      expect(stats.total_count).toBe('20');
    });
  });

  describe('getConfirmationEvents', () => {
    it('should return events with pagination', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'e1' }, { id: 'e2' }]
      });

      const events = await ConfirmationEventService.getConfirmationEvents('team-1', { limit: 10, offset: 0 });
      expect(events).toHaveLength(2);
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(params).toContain(10);
      expect(params).toContain(0);
    });
  });
});
