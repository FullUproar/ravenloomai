/**
 * RavenService Unit Tests
 *
 * Tests the core Remember → Ask loop:
 * - Preview Remember (fact extraction + conflict detection)
 * - Confirm Remember (DB persistence + confirmation event logging)
 * - Cancel Remember
 * - Ask (query with source attribution)
 *
 * Critical path — these must pass before any deployment.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock dependencies
const mockDb = {
  query: jest.fn()
};

const mockAIService = {
  extractAtomicFacts: jest.fn(),
  generateEmbedding: jest.fn(),
  generateCompanyAnswer: jest.fn()
};

const mockKnowledgeService = {
  getKnowledgeContext: jest.fn(),
  getFacts: jest.fn(),
  searchFacts: jest.fn(),
  invalidateFact: jest.fn(),
  createFact: jest.fn()
};

const mockScopeService = {
  getScopeById: jest.fn(),
  getSearchScopeIds: jest.fn()
};

const mockConfirmationEventService = {
  logConfirmationEvent: jest.fn(),
  logConflictOverride: jest.fn()
};

const mockKnowledgeGraphService = {
  graphRAGSearch: jest.fn(),
  processDocument: jest.fn(),
  processFactIntoGraph: jest.fn()
};

const mockKnowledgeBaseService = {
  default: { searchDocuments: jest.fn() }
};

const mockGoogleDriveService = {
  getIntegration: jest.fn()
};

jest.unstable_mockModule('../../db.js', () => ({ default: mockDb }));
jest.unstable_mockModule('../../services/AIService.js', () => mockAIService);
jest.unstable_mockModule('../../services/KnowledgeService.js', () => mockKnowledgeService);
jest.unstable_mockModule('../../services/ScopeService.js', () => mockScopeService);
jest.unstable_mockModule('../../services/ConfirmationEventService.js', () => mockConfirmationEventService);
jest.unstable_mockModule('../../services/KnowledgeGraphService.js', () => mockKnowledgeGraphService);
jest.unstable_mockModule('../../services/KnowledgeBaseService.js', () => mockKnowledgeBaseService);
jest.unstable_mockModule('../../services/GoogleDriveService.js', () => mockGoogleDriveService);

const RavenService = await import('../../services/RavenService.js');

describe('RavenService', () => {
  const testScopeId = 'scope-uuid-1';
  const testTeamId = 'team-uuid-1';
  const testUserId = 'user-uid-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockReset();

    // Default scope mock
    mockScopeService.getScopeById.mockResolvedValue({
      id: testScopeId,
      teamId: testTeamId,
      type: 'team'
    });
  });

  describe('previewRemember', () => {
    it('should extract facts and store preview in database', async () => {
      mockAIService.extractAtomicFacts.mockResolvedValue([
        {
          statement: 'Launch date is June 15',
          category: 'decision',
          entities: [{ name: 'Launch', type: 'event' }],
          confidence: 0.9,
          contextTags: [],
          trustTier: 'tribal',
          contexts: [{ name: 'meeting notes', type: 'formality' }],
          intent: 'decision'
        }
      ]);

      mockKnowledgeService.searchFacts.mockResolvedValue([]);

      // Mock DB insert for preview
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'preview-uuid-1' }]
      });

      const result = await RavenService.previewRemember(
        testScopeId, testUserId, 'Launch date is June 15'
      );

      expect(result.previewId).toBe('preview-uuid-1');
      expect(result.extractedFacts).toHaveLength(1);
      expect(result.extractedFacts[0].content).toBe('Launch date is June 15');
      expect(result.extractedFacts[0].trustTier).toBe('tribal');

      // Should have inserted into remember_previews table
      const insertCall = mockDb.query.mock.calls[0];
      expect(insertCall[0]).toContain('INSERT INTO remember_previews');
    });

    it('should detect mismatch when statement is a question', async () => {
      mockAIService.extractAtomicFacts.mockResolvedValue([]);
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'p-1' }] });

      const result = await RavenService.previewRemember(
        testScopeId, testUserId, 'What is the launch date?'
      );

      expect(result.isMismatch).toBe(true);
      expect(result.mismatchSuggestion).toContain('question');
    });

    it('should detect conflicts with existing facts', async () => {
      mockAIService.extractAtomicFacts.mockResolvedValue([
        {
          statement: 'Budget is $10,000',
          category: 'decision',
          entities: [],
          confidence: 0.85,
          contextTags: [],
          trustTier: 'tribal',
          contexts: [],
          intent: 'decision'
        }
      ]);

      // Return a similar existing fact
      mockKnowledgeService.searchFacts.mockResolvedValue([
        {
          id: 'existing-fact-1',
          content: 'Budget is $5,000',
          similarity: 0.8,
          createdAt: new Date()
        }
      ]);

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'p-2' }] });

      const result = await RavenService.previewRemember(
        testScopeId, testUserId, 'Budget is $10,000'
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].conflictType).toBe('update');
    });
  });

  describe('confirmRemember', () => {
    it('should create facts and log confirmation events', async () => {
      // Mock reading the preview from DB
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'preview-1',
            scope_id: testScopeId,
            team_id: testTeamId,
            user_id: testUserId,
            source_text: 'Test statement',
            source_url: null,
            extracted_facts: [{
              content: 'Test fact',
              entityType: null,
              entityName: null,
              category: 'general',
              confidenceScore: 0.8,
              contextTags: [],
              trustTier: 'tribal',
              contexts: [],
              entities: [],
              intent: 'observation'
            }],
            conflicts: [],
            created_at: new Date()
          }]
        })
        // Mock fact INSERT
        .mockResolvedValueOnce({
          rows: [{
            id: 'fact-new-1',
            team_id: testTeamId,
            content: 'Test fact',
            category: 'general',
            created_at: new Date()
          }]
        })
        // Mock preview UPDATE
        .mockResolvedValueOnce({ rowCount: 1 });

      mockAIService.generateEmbedding.mockResolvedValue(new Array(1536).fill(0));
      mockConfirmationEventService.logConfirmationEvent.mockResolvedValue({});
      mockKnowledgeGraphService.processFactIntoGraph.mockResolvedValue({ nodesInvolved: 0 });

      const result = await RavenService.confirmRemember('preview-1', [], testUserId);

      expect(result.success).toBe(true);
      expect(result.factsCreated).toHaveLength(1);

      // Should have logged a confirmation event
      expect(mockConfirmationEventService.logConfirmationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: testTeamId,
          outcome: 'confirmed',
          confirmingUserId: testUserId
        })
      );

      // Should have processed fact into graph
      expect(mockKnowledgeGraphService.processFactIntoGraph).toHaveBeenCalled();
    });

    it('should throw when preview not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        RavenService.confirmRemember('nonexistent-preview', [])
      ).rejects.toThrow('Preview not found');
    });

    it('should handle conflict overrides and log them', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'preview-2',
            scope_id: testScopeId,
            team_id: testTeamId,
            user_id: testUserId,
            source_text: 'Budget is $10,000',
            source_url: null,
            extracted_facts: [{
              content: 'Budget is $10,000',
              category: 'decision',
              confidenceScore: 0.85,
              contextTags: [],
              trustTier: 'tribal',
              contexts: [],
              entities: [],
              intent: 'decision'
            }],
            conflicts: [{
              existingFact: { id: 'old-fact-1', content: 'Budget is $5,000' },
              conflictType: 'update',
              extractedFactContent: 'Budget is $10,000'
            }],
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 'fact-new-2', content: 'Budget is $10,000', team_id: testTeamId, created_at: new Date() }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      mockKnowledgeService.invalidateFact.mockResolvedValue({});
      mockAIService.generateEmbedding.mockResolvedValue(new Array(1536).fill(0));
      mockConfirmationEventService.logConfirmationEvent.mockResolvedValue({});
      mockConfirmationEventService.logConflictOverride.mockResolvedValue({});
      mockKnowledgeGraphService.processFactIntoGraph.mockResolvedValue({ nodesInvolved: 0 });

      const result = await RavenService.confirmRemember('preview-2', [], testUserId);

      expect(result.factsUpdated).toHaveLength(1);
      expect(mockKnowledgeService.invalidateFact).toHaveBeenCalledWith('old-fact-1');
      expect(mockConfirmationEventService.logConflictOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          existingFactId: 'old-fact-1',
          userDecision: 'override'
        })
      );
    });
  });

  describe('cancelRemember', () => {
    it('should mark preview as cancelled in database', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await RavenService.cancelRemember('preview-1');
      expect(result).toBe(true);

      const [sql] = mockDb.query.mock.calls[0];
      expect(sql).toContain("status = 'cancelled'");
    });

    it('should return false for non-existent preview', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await RavenService.cancelRemember('nonexistent');
      expect(result).toBe(false);
    });
  });
});
