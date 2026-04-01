/**
 * GraphQL Resolvers - Clean slate for team-based knowledge hub
 */

import { GraphQLJSON } from 'graphql-type-json';
import { GraphQLDateTime } from 'graphql-scalars';

import pool from '../../db.js';
import UserService from '../../services/UserService.js';
import TeamService from '../../services/TeamService.js';
import ChannelService from '../../services/ChannelService.js';
import MessageService from '../../services/MessageService.js';
import KnowledgeService from '../../services/KnowledgeService.js';
import AlertService from '../../services/AlertService.js';
import ThreadService from '../../services/ThreadService.js';
import AIService from '../../services/AIService.js';
import * as QuestionService from '../../services/QuestionService.js';
import * as LearningObjectiveService from '../../services/LearningObjectiveService.js';
import GoogleDriveService from '../../services/GoogleDriveService.js';
import UploadService from '../../services/UploadService.js';

import KnowledgeBaseService from '../../services/KnowledgeBaseService.js';
import * as KnowledgeGraphService from '../../services/KnowledgeGraphService.js';
import * as ConversationImportService from '../../services/ConversationImportService.js';
import * as KnowledgeFreshnessService from '../../services/KnowledgeFreshnessService.js';
import * as RateLimiterService from '../../services/RateLimiterService.js';
import * as ScopeService from '../../services/ScopeService.js';
import * as RavenService from '../../services/RavenService.js';
import * as GraphGroomingService from '../../services/GraphGroomingService.js';
import * as TripleService from '../../services/TripleService.js';
import * as TripleGroomingService from '../../services/TripleGroomingService.js';
import * as SimulationService from '../../services/SimulationService.js';
import * as KnowledgeGapService from '../../services/KnowledgeGapService.js';
// SlackImportService temporarily disabled - needs adm-zip dependency
// import * as SlackImportService from '../../services/SlackImportService.js';

const resolvers = {
  JSON: GraphQLJSON,
  DateTime: GraphQLDateTime,

  // ============================================================================
  // QUERIES
  // ============================================================================

  Query: {
    // User
    me: async (_, __, { userId }) => {
      if (!userId) return null;
      return UserService.getUserById(userId);
    },

    // Teams
    getTeam: async (_, { teamId }, { userId }) => {
      // TODO: Check membership
      return TeamService.getTeamById(teamId);
    },

    getMyTeams: async (_, __, { userId }) => {
      if (!userId) return [];
      return TeamService.getTeamsForUser(userId);
    },

    getTeamBySlug: async (_, { slug }) => {
      return TeamService.getTeamBySlug(slug);
    },

    // Channels
    getChannel: async (_, { channelId }) => {
      return ChannelService.getChannelById(channelId);
    },

    getChannels: async (_, { teamId }) => {
      return ChannelService.getChannels(teamId);
    },

    getMyRavenChannel: async (_, { teamId }, context) => {
      const userId = context.userId;
      if (!userId) throw new Error('Must be authenticated');
      return ChannelService.getOrCreateRavenDM(teamId, userId);
    },

    // Threads
    getThread: async (_, { threadId }) => {
      return ThreadService.getThread(threadId);
    },

    getThreads: async (_, { channelId, limit }) => {
      return ThreadService.getThreads(channelId, { limit });
    },

    // Messages
    getMessages: async (_, { channelId, limit, before }) => {
      return MessageService.getMessages(channelId, { limit, before });
    },

    getThreadMessages: async (_, { threadId, limit }) => {
      return ThreadService.getThreadMessages(threadId, { limit });
    },

    // Knowledge
    getFactCount: async (_, { teamId }) => {
      const result = await pool.query(
        `SELECT COUNT(*) FROM facts
         WHERE team_id = $1
           AND (status IS NULL OR status = 'active')
           AND (valid_until IS NULL OR valid_until > NOW())`,
        [teamId]
      );
      return parseInt(result.rows[0].count, 10);
    },

    getFacts: async (_, { teamId, category, entityType, limit }) => {
      return KnowledgeService.getFacts(teamId, { category, entityType, limit });
    },

    getDecisions: async (_, { teamId, limit }) => {
      return KnowledgeService.getDecisions(teamId, limit);
    },

    searchKnowledge: async (_, { teamId, query }) => {
      return KnowledgeService.searchKnowledge(teamId, query);
    },

    // Ask the Company (AI Q&A) - GraphRAG-powered
    askCompany: async (_, { teamId, input }, { userId }) => {
      console.log(`[askCompany] Query: "${input.question}"`);

      // Get traditional knowledge (facts and decisions)
      const knowledge = await KnowledgeService.getKnowledgeContext(teamId, input.question);
      console.log(`[askCompany] Found ${knowledge.facts.length} facts, ${knowledge.decisions.length} decisions`);

      // GraphRAG search - vector search + graph traversal for richer context
      let graphContext = { entryNodes: [], relatedNodes: [], chunks: [] };
      try {
        graphContext = await graphRAGSearch(teamId, input.question, { topK: 5, hopDepth: 1 });
        console.log(`[askCompany] GraphRAG: ${graphContext.entryNodes.length} entry nodes, ${graphContext.relatedNodes.length} related nodes, ${graphContext.chunks.length} chunks`);
      } catch (err) {
        console.error('[askCompany] GraphRAG search error:', err);
      }

      // Fallback: Also search Knowledge Base documents directly (for non-graph-processed docs)
      let kbDocuments = [];
      try {
        kbDocuments = await KnowledgeBaseService.searchDocuments(teamId, input.question, 5);
        console.log(`[askCompany] KB documents: ${kbDocuments.length}`);
      } catch (err) {
        console.error('Error searching KB documents:', err);
      }

      // Generate AI answer with all context (facts, decisions, graph chunks, KB docs)
      const answer = await AIService.generateCompanyAnswer(
        input.question,
        knowledge.facts,
        knowledge.decisions,
        kbDocuments,
        graphContext  // Pass graph context to AI
      );

      // Log the query for analytics
      try {
        const db = (await import('../../db.js')).default;
        await db.query(
          `INSERT INTO knowledge_queries (team_id, user_id, query, answer, facts_used, confidence_score)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [teamId, userId, input.question, answer.answer,
           knowledge.facts.slice(0, 5).map(f => f.id),
           answer.confidence]
        );
      } catch (e) {
        console.error('Error logging query:', e);
      }

      return {
        answer: answer.answer,
        confidence: answer.confidence,
        factsUsed: knowledge.facts.slice(0, 5),
        decisionsUsed: knowledge.decisions.slice(0, 3),
        suggestedFollowups: answer.followups || []
      };
    },

    // Alerts
    getAlerts: async (_, { teamId, status }) => {
      return AlertService.getAlerts(teamId, { status });
    },

    getPendingAlerts: async (_, { teamId }) => {
      return AlertService.getPendingAlerts(teamId);
    },

    // Team Invites
    getTeamInvites: async (_, { teamId }) => {
      return TeamService.getTeamInvites(teamId);
    },

    validateInviteToken: async (_, { token }) => {
      return TeamService.validateInviteToken(token);
    },

    // Team Questions
    getTeamQuestions: async (_, { teamId, status, assignedTo }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return QuestionService.getQuestions(teamId, { status, assignedTo });
    },

    getTeamQuestion: async (_, { questionId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return QuestionService.getQuestionById(questionId);
    },

    getOpenQuestionCount: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return QuestionService.getOpenQuestionCount(teamId, userId);
    },

    getFollowUpQuestions: async (_, { questionId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return LearningObjectiveService.getFollowUpQuestions(questionId);
    },

    // Learning Objectives
    getLearningObjectives: async (_, { teamId, status, assignedTo }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return LearningObjectiveService.getObjectives(teamId, { status, assignedTo });
    },

    getLearningObjective: async (_, { objectiveId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return LearningObjectiveService.getObjectiveById(objectiveId);
    },

    // Site Admin
    getSiteInvites: async (_, __, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Site admin required');
      return UserService.getSiteInvites();
    },

    checkSiteInvite: async (_, { email }) => {
      const invite = await UserService.hasValidSiteInvite(email);
      return invite !== null;
    },

    amISiteAdmin: async (_, __, { userId }) => {
      if (!userId) return false;
      return UserService.isSiteAdmin(userId);
    },

    // Access Codes
    validateAccessCode: async (_, { code }) => {
      const accessCode = await UserService.validateAccessCode(code);
      if (!accessCode) {
        return { valid: false, message: 'Invalid or expired access code' };
      }
      return {
        valid: true,
        message: 'Access code is valid',
        teamId: accessCode.team_id,
        teamName: accessCode.team_name
      };
    },

    getAccessCodes: async (_, __, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Site admin required');
      return UserService.getAccessCodes();
    },

    getAccessCodeUses: async (_, { codeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Site admin required');
      return UserService.getAccessCodeUses(codeId);
    },

    getMySiteRole: async (_, __, { userId }) => {
      if (!userId) return 'user';
      return UserService.getUserSiteRole(userId);
    },

    // Super Admin Dashboard
    getAllUsers: async (_, __, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Super admin required');
      return UserService.getAllUsers();
    },

    getAllTeams: async (_, __, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Super admin required');
      return TeamService.getAllTeams();
    },

    // Integrations (team-level)
    getMyIntegrations: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      if (!teamId) throw new Error('Team ID required');
      const google = await GoogleDriveService.getIntegration(teamId);
      const integrations = [];
      if (google) {
        integrations.push({
          id: google.id,
          provider: 'google',
          providerEmail: google.providerEmail,
          isActive: google.isActive,
          createdAt: google.createdAt
        });
      }
      return integrations;
    },

    getDriveFiles: async (_, { teamId, folderId, pageSize, pageToken }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      if (!teamId) throw new Error('Team ID required');
      const result = await GoogleDriveService.listFiles(teamId, {
        folderId: folderId || 'root',
        pageSize: pageSize || 20,
        pageToken
      });
      return {
        files: result.files || [],
        nextPageToken: result.nextPageToken
      };
    },

    getDriveFileContent: async (_, { teamId, fileId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      if (!teamId) throw new Error('Team ID required');
      const metadata = await GoogleDriveService.getFileMetadata(teamId, fileId);
      const content = await GoogleDriveService.getFileContent(teamId, fileId, metadata.mimeType);
      return {
        id: metadata.id,
        name: metadata.name,
        mimeType: metadata.mimeType,
        content
      };
    },

    // Knowledge Base
    getKnowledgeBaseSources: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeBaseService.getSources(teamId);
    },

    getKnowledgeBaseDocuments: async (_, { teamId, sourceId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeBaseService.getDocuments(teamId, sourceId);
    },

    isInKnowledgeBase: async (_, { teamId, provider, sourceId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeBaseService.isInKnowledgeBase(teamId, provider, sourceId);
    },

    getGooglePickerConfig: async (_, __, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return GoogleDriveService.getPickerConfig(userId);
    },

    // Team Settings (admin only)
    getTeamSettings: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      // Check if user is admin or owner
      const role = await TeamService.getMemberRole(teamId, userId);
      if (!['admin', 'owner'].includes(role)) {
        throw new Error('Only admins can view team settings');
      }
      const settings = await TeamService.getTeamSettings(teamId);
      // Return simplified settings
      return {
        aiEnabled: settings?.proactiveAI?.enabled !== false
      };
    },

    getAIUsageStats: async (_, { teamId, period }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      // Check if user is admin or owner
      const role = await TeamService.getMemberRole(teamId, userId);
      if (!['admin', 'owner'].includes(role)) {
        throw new Error('Only admins can view AI usage stats');
      }
      const stats = await RateLimiterService.getUsageStats(teamId, period || 'day');
      if (!stats) return null;
      return {
        period: stats.period,
        byService: stats.byService.map(s => ({
          service: s.service,
          calls: parseInt(s.calls) || 0,
          tokens: parseInt(s.tokens) || 0
        })),
        totals: stats.totals ? {
          totalCalls: parseInt(stats.totals.total_calls) || 0,
          totalTokens: parseInt(stats.totals.total_tokens) || 0,
          avgDuration: parseFloat(stats.totals.avg_duration) || 0,
          failedCalls: parseInt(stats.totals.failed_calls) || 0
        } : null,
        rateLimits: stats.rateLimits
      };
    },

    // ============================================================================
    // SCOPES
    // ============================================================================

    getTeamScope: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return ScopeService.getTeamScope(teamId);
    },

    getScopeTree: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return ScopeService.getScopeTree(teamId);
    },

    getScope: async (_, { scopeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return ScopeService.getScopeById(scopeId);
    },

    getChildScopes: async (_, { scopeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return ScopeService.getChildScopes(scopeId);
    },

    getMyPrivateScope: async (_, { teamId, coupledScopeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return ScopeService.getUserPrivateScope(teamId, userId, coupledScopeId);
    },

    getMyPrivateScopes: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return ScopeService.getUserPrivateScopes(teamId, userId);
    },

    getScopeMessages: async (_, { scopeId, includePrivate, limit, before }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      // If includePrivate, get messages from user's private scope instead
      let targetScopeId = scopeId;
      if (includePrivate) {
        const scope = await ScopeService.getScopeById(scopeId);
        if (scope) {
          const privateScope = await ScopeService.getUserPrivateScope(scope.teamId, userId, scopeId);
          targetScopeId = privateScope.id;
        }
      }

      return ScopeService.getScopeMessages(targetScopeId, userId, { limit: limit || 50, before });
    },

    getScopeConversation: async (_, { scopeId, includePrivate }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      let targetScopeId = scopeId;
      if (includePrivate) {
        const scope = await ScopeService.getScopeById(scopeId);
        if (scope) {
          const privateScope = await ScopeService.getUserPrivateScope(scope.teamId, userId, scopeId);
          targetScopeId = privateScope.id;
        }
      }

      return ScopeService.getScopeConversation(targetScopeId, userId);
    },

    // ============================================================================
    // ASK/REMEMBER
    // ============================================================================

    askRaven: async (_, { scopeId, question, conversationHistory }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return RavenService.ask(scopeId, userId, question, conversationHistory || []);
    },

    searchKnowledge: async (_, { teamId, query, limit }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const maxResults = limit || 20;
      const q = query.toLowerCase();

      // Search legacy facts
      const factsResult = await pool.query(
        `SELECT id, content, category, entity_name, trust_tier, created_at
         FROM facts WHERE team_id = $1 AND status = 'active'
         AND (LOWER(content) LIKE $2 OR LOWER(COALESCE(entity_name,'')) LIKE $2 OR LOWER(COALESCE(source_quote,'')) LIKE $2)
         ORDER BY created_at DESC LIMIT $3`,
        [teamId, `%${q}%`, maxResults]
      );

      // Search triples (display_text + concept names + relationships + aliases)
      const triplesResult = await pool.query(
        `SELECT DISTINCT t.id, t.display_text, t.relationship, t.confidence, t.trust_tier, t.created_at,
                s.name as subject_name, o.name as object_name
         FROM triples t
         JOIN concepts s ON t.subject_id = s.id
         JOIN concepts o ON t.object_id = o.id
         WHERE t.team_id = $1 AND t.status = 'active'
         AND (LOWER(COALESCE(t.display_text,'')) LIKE $2 OR LOWER(s.name) LIKE $2 OR LOWER(o.name) LIKE $2
              OR LOWER(t.relationship) LIKE $2 OR LOWER(s.canonical_name) LIKE $2
              OR EXISTS (SELECT 1 FROM unnest(COALESCE(s.aliases, ARRAY[]::text[])) a WHERE LOWER(a) LIKE $2))
         ORDER BY t.created_at DESC LIMIT $3`,
        [teamId, `%${q}%`, maxResults]
      );

      // Merge and deduplicate
      const results = [];

      for (const f of factsResult.rows) {
        results.push({
          id: f.id,
          content: f.content,
          source: 'fact',
          conceptName: f.entity_name,
          category: f.category,
          trustTier: f.trust_tier,
          createdAt: f.created_at,
        });
      }

      for (const t of triplesResult.rows) {
        results.push({
          id: t.id,
          content: t.display_text || `${t.subject_name} ${t.relationship} ${t.object_name}`,
          source: 'triple',
          conceptName: t.subject_name,
          relationship: t.relationship,
          trustTier: t.trust_tier,
          confidence: t.confidence,
          createdAt: t.created_at,
        });
      }

      // Sort by created_at desc, limit
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return results.slice(0, maxResults);
    },

    // Graph topology analysis
    getGraphTopology: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      const [concepts, triples, degrees, orphans, components] = await Promise.all([
        pool.query('SELECT COUNT(*) as cnt FROM concepts WHERE team_id = $1', [teamId]),
        pool.query("SELECT COUNT(*) as cnt FROM triples WHERE team_id = $1 AND status = 'active'", [teamId]),
        pool.query(`
          SELECT c.id, c.name, c.type,
            COALESCE(out_deg.cnt, 0) + COALESCE(in_deg.cnt, 0) as degree,
            COALESCE(out_deg.cnt, 0) as out_degree,
            COALESCE(in_deg.cnt, 0) as in_degree
          FROM concepts c
          LEFT JOIN (SELECT subject_id, COUNT(*) as cnt FROM triples WHERE team_id = $1 AND status = 'active' GROUP BY subject_id) out_deg ON c.id = out_deg.subject_id
          LEFT JOIN (SELECT object_id, COUNT(*) as cnt FROM triples WHERE team_id = $1 AND status = 'active' GROUP BY object_id) in_deg ON c.id = in_deg.object_id
          WHERE c.team_id = $1
          ORDER BY degree DESC
        `, [teamId]),
        pool.query(`
          SELECT COUNT(*) as cnt FROM concepts c
          WHERE c.team_id = $1
            AND NOT EXISTS (SELECT 1 FROM triples t WHERE t.status = 'active' AND (t.subject_id = c.id OR t.object_id = c.id))
        `, [teamId]),
        // Connected components approximation: count isolated concepts (no edges at all)
        // True component counting requires graph traversal which is expensive in SQL
        pool.query(`SELECT 0 as cnt`),
      ]);

      const totalConcepts = parseInt(concepts.rows[0].cnt);
      const totalTriples = parseInt(triples.rows[0].cnt);
      const degreeRows = degrees.rows;
      const totalEdges = totalTriples; // each triple = one edge

      const avgDegree = totalConcepts > 0
        ? degreeRows.reduce((sum, r) => sum + parseInt(r.degree), 0) / totalConcepts
        : 0;
      const maxDegree = degreeRows.length > 0 ? parseInt(degreeRows[0].degree) : 0;

      // Hub nodes (top 10 by degree)
      const hubNodes = degreeRows.slice(0, 10).map(r => ({
        id: r.id, name: r.name, type: r.type,
        degree: parseInt(r.degree),
        inDegree: parseInt(r.in_degree),
        outDegree: parseInt(r.out_degree),
      }));

      // Degree distribution
      const degreeCounts = {};
      for (const r of degreeRows) {
        const d = parseInt(r.degree);
        degreeCounts[d] = (degreeCounts[d] || 0) + 1;
      }
      const degreeDistribution = Object.entries(degreeCounts)
        .map(([degree, count]) => ({ degree: parseInt(degree), count }))
        .sort((a, b) => a.degree - b.degree);

      return {
        totalConcepts, totalTriples, totalEdges,
        avgDegree: parseFloat(avgDegree.toFixed(2)),
        maxDegree,
        orphanCount: parseInt(orphans.rows[0].cnt),
        connectedComponents: parseInt(components.rows[0].cnt),
        avgPathLength: null, // expensive to compute, skip for now
        hubNodes,
        degreeDistribution,
      };
    },

    inspectNode: async (_, { teamId, conceptName }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      // Find concept by name (fuzzy)
      const conceptResult = await pool.query(
        `SELECT id, name, type, aliases, is_protected, canonical_name FROM concepts
         WHERE team_id = $1 AND (LOWER(canonical_name) = $2 OR LOWER(name) = $2
           OR $2 = ANY(SELECT LOWER(a) FROM unnest(COALESCE(aliases, ARRAY[]::text[])) a))
         LIMIT 1`,
        [teamId, conceptName.toLowerCase()]
      );

      if (!conceptResult.rows[0]) return null;
      const concept = conceptResult.rows[0];

      // Get all edges (outbound + inbound)
      const [outEdges, inEdges, recallResult] = await Promise.all([
        pool.query(`
          SELECT t.id as triple_id, t.relationship, t.display_text, t.confidence,
                 o.id as target_id, o.name as target_name, o.type as target_type
          FROM triples t JOIN concepts o ON t.object_id = o.id
          WHERE t.subject_id = $1 AND t.status = 'active'
          ORDER BY t.confidence DESC NULLS LAST
        `, [concept.id]),
        pool.query(`
          SELECT t.id as triple_id, t.relationship, t.display_text, t.confidence,
                 s.id as target_id, s.name as target_name, s.type as target_type
          FROM triples t JOIN concepts s ON t.subject_id = s.id
          WHERE t.object_id = $1 AND t.status = 'active'
          ORDER BY t.confidence DESC NULLS LAST
        `, [concept.id]),
        pool.query('SELECT COALESCE(SUM(recall_count), 0) as total FROM triples WHERE (subject_id = $1 OR object_id = $1) AND status = \'active\'', [concept.id]),
      ]);

      const edges = [
        ...outEdges.rows.map(e => ({
          tripleId: e.triple_id, direction: 'outbound', relationship: e.relationship,
          targetId: e.target_id, targetName: e.target_name, targetType: e.target_type,
          displayText: e.display_text, confidence: e.confidence,
        })),
        ...inEdges.rows.map(e => ({
          tripleId: e.triple_id, direction: 'inbound', relationship: e.relationship,
          targetId: e.target_id, targetName: e.target_name, targetType: e.target_type,
          displayText: e.display_text, confidence: e.confidence,
        })),
      ];

      // Neighbor concepts (unique targets with shared edge count)
      const neighborMap = new Map();
      for (const e of edges) {
        if (!neighborMap.has(e.targetId)) {
          neighborMap.set(e.targetId, { id: e.targetId, name: e.targetName, type: e.targetType, sharedEdgeCount: 0 });
        }
        neighborMap.get(e.targetId).sharedEdgeCount++;
      }

      // Clustering coefficient: how many of this node's neighbors are connected to each other?
      let clusteringCoefficient = null;
      const neighborIds = [...neighborMap.keys()];
      if (neighborIds.length >= 2) {
        const neighborEdges = await pool.query(`
          SELECT COUNT(*) as cnt FROM triples
          WHERE status = 'active'
            AND subject_id = ANY($1) AND object_id = ANY($1)
        `, [neighborIds]);
        const possibleEdges = neighborIds.length * (neighborIds.length - 1);
        clusteringCoefficient = possibleEdges > 0
          ? parseFloat(parseInt(neighborEdges.rows[0].cnt) / possibleEdges).toFixed(3)
          : 0;
      }

      return {
        id: concept.id,
        name: concept.name,
        type: concept.type,
        aliases: concept.aliases || [],
        degree: edges.length,
        inDegree: inEdges.rows.length,
        outDegree: outEdges.rows.length,
        clusteringCoefficient: clusteringCoefficient ? parseFloat(clusteringCoefficient) : null,
        isProtected: concept.is_protected || false,
        recallCount: parseInt(recallResult.rows[0].total),
        edges,
        neighborConcepts: [...neighborMap.values()].sort((a, b) => b.sharedEdgeCount - a.sharedEdgeCount),
      };
    },

    // Trust + usage queries
    getTrustScores: async (_, { teamId, sourceId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const TrustService = (await import('../../services/TrustService.js')).default;
      return TrustService.getSourceTrustProfile(teamId, sourceId || userId, 'user');
    },

    getTokenUsage: async (_, { teamId, startDate, endDate }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const TokenTrackingService = (await import('../../services/TokenTrackingService.js')).default;
      const summary = await TokenTrackingService.getUsageSummary(teamId, { startDate, endDate });
      const byOperation = await TokenTrackingService.getTokenUsage(teamId, { startDate, endDate, groupBy: 'operation' });
      return {
        totalInputTokens: parseInt(summary.total_input_tokens) || 0,
        totalOutputTokens: parseInt(summary.total_output_tokens) || 0,
        totalEstimatedCostUsd: parseFloat(summary.total_estimated_cost_usd) || 0,
        totalCalls: parseInt(summary.total_calls) || 0,
        byOperation: byOperation.map(r => ({
          operation: r.operation,
          inputTokens: parseInt(r.input_tokens) || 0,
          outputTokens: parseInt(r.output_tokens) || 0,
          estimatedCostUsd: parseFloat(r.estimated_cost_usd) || 0,
          callCount: parseInt(r.call_count) || 0,
        })),
      };
    },

    getUserModel: async (_, { teamId, userId: targetUserId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const UserModelService = (await import('../../services/UserModelService.js')).default;
      return UserModelService.getUserModel(teamId, targetUserId || userId);
    },

    // Triple-based queries
    getTriples: async (_, { teamId, scopeId, conceptId, limit }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      if (conceptId) {
        return TripleService.getTriplesByConcept(conceptId, { limit: limit || 50 });
      }
      return TripleService.getTriples(teamId, { scopeId, limit: limit || 100 });
    },

    getTriple: async (_, { tripleId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TripleService.getTriple(tripleId);
    },

    getConcepts: async (_, { teamId, type, limit }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TripleService.getConcepts(teamId, { type, limit: limit || 500 });
    },

    getConcept: async (_, { conceptId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TripleService.getConcept(conceptId);
    },

    getGraphData: async (_, { teamId, sstNodeId, limit }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      let query = `
        SELECT t.id, t.display_text, t.relationship, t.confidence, t.trust_tier, t.created_at,
               t.subject_id, t.object_id,
               s.name AS subject_name, s.type AS subject_type,
               s.mention_count AS subject_mentions, s.created_at AS subject_created,
               o.name AS object_name, o.type AS object_type,
               o.mention_count AS object_mentions, o.created_at AS object_created
        FROM triples t
        JOIN concepts s ON t.subject_id = s.id
        JOIN concepts o ON t.object_id = o.id
        WHERE t.team_id = $1 AND t.status = 'active'
      `;
      const params = [teamId];
      if (sstNodeId) { params.push(sstNodeId); query += ` AND t.sst_node_id = $${params.length}`; }
      params.push(limit || 200);
      query += ` ORDER BY s.mention_count DESC, t.created_at DESC LIMIT $${params.length}`;

      const result = await pool.query(query, params);
      const conceptMap = new Map();
      for (const row of result.rows) {
        for (const [id, name, type, mentions, created] of [
          [row.subject_id, row.subject_name, row.subject_type, row.subject_mentions, row.subject_created],
          [row.object_id, row.object_name, row.object_type, row.object_mentions, row.object_created]
        ]) {
          if (!conceptMap.has(id)) {
            conceptMap.set(id, {
              id, name, type,
              mentionCount: mentions || 0,
              connectionCount: 0,
              queryCount: 0,
              lastQueryAt: null,
              createdAt: created,
            });
          }
          conceptMap.get(id).connectionCount++;
        }
      }

      // Enrich with query frequency from SST route cache and concept aliases
      try {
        const conceptIds = Array.from(conceptMap.keys());
        if (conceptIds.length > 0) {
          // Get alias/query data from concepts table (mention_count tracks queries)
          const queryData = await pool.query(
            `SELECT id, mention_count, updated_at FROM concepts WHERE id = ANY($1)`,
            [conceptIds]
          );
          for (const row of queryData.rows) {
            const node = conceptMap.get(row.id);
            if (node) {
              node.queryCount = row.mention_count || 0;
              node.lastQueryAt = row.updated_at;
            }
          }
        }
      } catch {}

      return {
        nodes: Array.from(conceptMap.values()),
        edges: result.rows.map(r => ({
          id: r.id, sourceId: r.subject_id, targetId: r.object_id,
          relationship: r.relationship, displayText: r.display_text,
          confidence: r.confidence, trustTier: r.trust_tier,
          traversalCount: 0, // TODO: track per-edge traversal frequency
        })),
      };
    },

    getSSTTree: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const SSTService = await import('../../services/SSTService.js');
      const nodes = await SSTService.getTree(teamId);
      return nodes.map(n => ({
        id: n.id, name: n.name, description: n.description,
        parentId: n.parent_id, depth: n.depth, tripleCount: n.triple_count,
        queryCount: n.query_count, isRoot: n.is_root,
      }));
    },

    searchConcepts: async (_, { teamId, query, limit }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TripleService.searchConcepts(teamId, query, limit || 10);
    },

    getContextNodes: async (_, { teamId, type, parentId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TripleService.getContextNodes(teamId, { type, parentId });
    },

    getTripleGraphStats: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TripleService.getGraphStats(teamId);
    },

    getFactAttribution: async (_, { factId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      // Backward compat — try to find as triple
      const triple = await TripleService.getTriple(factId);
      if (triple) {
        return { sourceQuote: triple.sourceText, sourceUrl: triple.sourceUrl, sourceType: triple.sourceType, createdAt: triple.createdAt };
      }
      return null;
    },

    // ============================================================================
    // KNOWLEDGE GRAPH QUERIES
    // ============================================================================

    getKnowledgeTree: async (_, { teamId, parentId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeGraphService.getKnowledgeTree(teamId, parentId);
    },

    getKnowledgeNode: async (_, { nodeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeGraphService.getNodeWithChildren(nodeId, true);
    },

    getKnowledgeNodeAncestors: async (_, { nodeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeGraphService.getNodeAncestors(nodeId);
    },

    searchKnowledgeNodes: async (_, { teamId, query, limit = 20 }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const embedding = await AIService.generateEmbedding(query);
      if (!embedding) return [];

      const result = await pool.query(`
        SELECT n.*,
               (SELECT COUNT(*) FROM facts f WHERE f.kg_node_id = n.id AND f.valid_until IS NULL) as fact_count,
               1 - (n.embedding <=> $1) as similarity
        FROM kg_nodes n
        WHERE n.team_id = $2 AND n.embedding IS NOT NULL
        ORDER BY n.embedding <=> $1
        LIMIT $3
      `, [`[${embedding.join(',')}]`, teamId, limit]);

      return result.rows;
    },

    // ========================================================================
    // KNOWLEDGE FRESHNESS QUERIES
    // ========================================================================

    getFreshnessStats: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeFreshnessService.getFreshnessStats(teamId);
    },

    getFactsNeedingReview: async (_, { teamId, limit, offset, category }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeFreshnessService.getFactsNeedingReview(teamId, { limit, offset, category });
    },

    getTemporallyOutdatedFacts: async (_, { teamId, limit }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeFreshnessService.findTemporallyOutdated(teamId, { limit });
    },

    // Knowledge Gap Analysis
    getKnowledgeGaps: async (_, { teamId, focus, maxQuestions }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeGapService.detectGaps(teamId, { focus, maxQuestions });
    },

    getGapSummary: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeGapService.getGapSummary(teamId);
    }
  },

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  Mutation: {
    // User
    createOrUpdateUser: async (_, { email, displayName, avatarUrl }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return UserService.createOrUpdateUser(userId, email, displayName, avatarUrl);
    },

    updateUserPreferences: async (_, { input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return UserService.updatePreferences(userId, input);
    },

    // Teams
    createTeam: async (_, { input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      // Only team_creator or super_admin roles can create teams
      const canCreate = await UserService.canCreateTeams(userId);
      if (!canCreate) {
        throw new Error('Only team creators or super admins can create teams. Contact an admin for access.');
      }
      return TeamService.createTeam(input.name, userId);
    },

    updateTeam: async (_, { teamId, name }, { userId }) => {
      // TODO: Check admin/owner permission
      return TeamService.updateTeam(teamId, name);
    },


    updateTeamSettings: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      // Check if user is admin or owner
      const role = await TeamService.getMemberRole(teamId, userId);
      if (!['admin', 'owner'].includes(role)) {
        throw new Error('Only admins can update team settings');
      }
      // Convert simplified input to internal format
      const internalSettings = {
        proactiveAI: {
          enabled: input.aiEnabled
        }
      };
      const updatedSettings = await TeamService.updateTeamSettings(teamId, internalSettings);
      // Return simplified settings
      return {
        aiEnabled: updatedSettings?.proactiveAI?.enabled !== false
      };
    },

    // Team Members & Invites
    inviteTeamMember: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TeamService.createInvite(teamId, input.email, input.role, userId);
    },

    acceptInvite: async (_, { token }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TeamService.acceptInvite(token, userId);
    },

    removeTeamMember: async (_, { teamId, userId: targetUserId }) => {
      return TeamService.removeMember(teamId, targetUserId);
    },

    updateMemberRole: async (_, { teamId, userId: targetUserId, role }) => {
      return TeamService.updateMemberRole(teamId, targetUserId, role);
    },

    // Channels
    createChannel: async (_, { teamId, input }, { userId }) => {
      return ChannelService.createChannel(teamId, { ...input, createdBy: userId });
    },

    updateChannel: async (_, { channelId, input }) => {
      return ChannelService.updateChannel(channelId, input);
    },

    deleteChannel: async (_, { channelId }) => {
      return ChannelService.deleteChannel(channelId);
    },

    // Threads
    createThread: async (_, { channelId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return ThreadService.createThread(channelId, userId, {
        title: input.title,
        initialMessage: input.initialMessage
      });
    },

    resolveThread: async (_, { threadId }) => {
      return ThreadService.resolveThread(threadId);
    },

    // Messages & AI
    sendMessage: async (_, { channelId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return MessageService.sendMessage(channelId, userId, input.content, {
        replyToMessageId: input.replyToMessageId
      });
    },

    sendThreadMessage: async (_, { threadId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      // Get thread to find channel
      const thread = await ThreadService.getThread(threadId);
      if (!thread) throw new Error('Thread not found');

      // Use message service with thread context
      return MessageService.sendThreadMessage(threadId, userId, input.content, {
        replyToMessageId: input.replyToMessageId
      });
    },

    // Knowledge - Manual
    createFact: async (_, { teamId, input }, { userId }) => {
      return KnowledgeService.createFact(teamId, {
        ...input,
        sourceType: 'manual',
        createdBy: userId
      });
    },

    updateFact: async (_, { factId, content, category }) => {
      return KnowledgeService.updateFact(factId, { content, category });
    },

    invalidateFact: async (_, { factId }) => {
      return KnowledgeService.invalidateFact(factId);
    },

    createDecision: async (_, { teamId, input }, { userId }) => {
      return KnowledgeService.createDecision(teamId, {
        ...input,
        madeBy: userId
      });
    },

    // Alerts
    createAlert: async (_, { teamId, input }, { userId }) => {
      return AlertService.createAlert(teamId, { ...input, createdBy: userId });
    },

    snoozeAlert: async (_, { alertId, until }) => {
      return AlertService.snoozeAlert(alertId, until);
    },

    cancelAlert: async (_, { alertId }) => {
      return AlertService.cancelAlert(alertId);
    },

    // Team Questions
    createTeamQuestion: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return QuestionService.createQuestion(teamId, userId, input);
    },

    answerTeamQuestion: async (_, { questionId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const question = await QuestionService.getQuestionById(questionId);
      return QuestionService.answerQuestion(questionId, userId, input.answer, {
        addToKnowledge: input.addToKnowledge,
        teamId: question?.teamId
      });
    },

    assignTeamQuestion: async (_, { questionId, assigneeIds }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return QuestionService.assignQuestion(questionId, assigneeIds, userId);
    },

    closeTeamQuestion: async (_, { questionId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return QuestionService.closeQuestion(questionId);
    },

    askFollowUpQuestion: async (_, { questionId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const question = await QuestionService.getQuestionById(questionId);
      if (!question) throw new Error('Question not found');
      return LearningObjectiveService.askFollowUp(questionId, question.teamId, userId);
    },

    rejectQuestion: async (_, { questionId, reason }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return LearningObjectiveService.rejectAndReplace(questionId, reason, userId);
    },

    // Learning Objectives
    createLearningObjective: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return LearningObjectiveService.createObjective(teamId, userId, input);
    },

    updateLearningObjective: async (_, { objectiveId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return LearningObjectiveService.updateObjective(objectiveId, input);
    },

    deleteLearningObjective: async (_, { objectiveId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      // TODO: Add actual delete logic
      return true;
    },

    // Site Admin
    createSiteInvite: async (_, { email }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Site admin required');
      return UserService.createSiteInvite(userId, email);
    },

    revokeSiteInvite: async (_, { inviteId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Site admin required');
      return UserService.revokeSiteInvite(inviteId);
    },

    makeSiteAdmin: async (_, { userId: targetUserId, isAdmin }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const currentIsAdmin = await UserService.isSiteAdmin(userId);
      if (!currentIsAdmin) throw new Error('Not authorized: Site admin required');
      return UserService.makeSiteAdmin(targetUserId, isAdmin);
    },

    // Access Codes
    createAccessCode: async (_, { input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Site admin required');
      return UserService.createAccessCode(userId, input || {});
    },

    deactivateAccessCode: async (_, { codeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Site admin required');
      return UserService.deactivateAccessCode(codeId);
    },

    redeemAccessCode: async (_, { code, email }) => {
      // Public mutation - validates and stores access code for later use during signup
      const accessCode = await UserService.validateAccessCode(code);
      if (!accessCode) {
        return { valid: false, message: 'Invalid or expired access code' };
      }
      // Store the access code for this email to be used when they sign up
      UserService.storePendingAccessCode(email, accessCode);
      return {
        valid: true,
        message: 'Access code validated. You can now sign up.',
        teamId: accessCode.team_id,
        teamName: accessCode.team_name
      };
    },

    // Super Admin (site management)
    updateUserSiteRole: async (_, { userId: targetUserId, role }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Super admin required');
      return UserService.updateSiteRole(targetUserId, role);
    },

    deleteUser: async (_, { userId: targetUserId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Super admin required');
      if (targetUserId === userId) throw new Error('Cannot delete yourself');

      // Delete user from database (cascades handle related records)
      await pool.query('DELETE FROM users WHERE id = $1', [targetUserId]);
      return true;
    },

    deleteTeam: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Super admin required');

      // Delete team (cascades handle related records)
      await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
      return true;
    },

    // Integrations
    disconnectIntegration: async (_, { provider }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      if (provider === 'google') {
        return GoogleDriveService.disconnectIntegration(userId);
      }
      throw new Error(`Unknown provider: ${provider}`);
    },

    importDriveFileToKnowledge: async (_, { teamId, fileId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      // Get file content
      const metadata = await GoogleDriveService.getFileMetadata(userId, fileId);
      const content = await GoogleDriveService.getFileContent(userId, fileId, metadata.mimeType);

      // Create a fact from the document content
      const fact = await KnowledgeService.createFact(teamId, {
        content: content.substring(0, 10000), // Limit size for now
        category: 'document',
        sourceType: 'integration',
        createdBy: userId
      });

      return fact;
    },

    // Knowledge Base
    addToKnowledgeBase: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeBaseService.addSource(teamId, userId, input);
    },

    removeFromKnowledgeBase: async (_, { teamId, sourceId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeBaseService.removeSource(teamId, sourceId);
    },

    syncKnowledgeBaseSource: async (_, { teamId, sourceId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeBaseService.syncSource(teamId, sourceId, userId);
    },

    // Attachments
    attachToMessage: async (_, { attachmentId, messageId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      await UploadService.attachToMessage(attachmentId, messageId);
      const attachments = await UploadService.getMessageAttachments(messageId);
      return attachments.find(a => a.id === attachmentId);
    },

    attachToQuestion: async (_, { attachmentId, questionId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      await UploadService.attachToQuestion(attachmentId, questionId);
      const attachments = await UploadService.getQuestionAttachments(questionId);
      return attachments.find(a => a.id === attachmentId);
    },

    deleteAttachment: async (_, { attachmentId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return UploadService.deleteAttachment(attachmentId, userId);
    },

    // ============================================================================
    // DATA IMPORT (admin only)
    // ============================================================================

    parseImportFile: async (_, { teamId, source, fileData }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      // Check if user is admin
      const role = await TeamService.getMemberRole(teamId, userId);
      if (!['admin', 'owner'].includes(role)) {
        throw new Error('Only admins can import data');
      }

      // Decode base64 file data
      const buffer = Buffer.from(fileData, 'base64');

      // Slack import temporarily disabled
      throw new Error('Data import is temporarily disabled');
    },

    executeImport: async (_, { teamId, source, fileData, mappings }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      // Check if user is admin
      const role = await TeamService.getMemberRole(teamId, userId);
      if (!['admin', 'owner'].includes(role)) {
        throw new Error('Only admins can import data');
      }

      // Decode base64 file data
      const buffer = Buffer.from(fileData, 'base64');

      // Slack import temporarily disabled
      throw new Error('Data import is temporarily disabled');
    },

    // ============================================================================
    // SCOPES
    // ============================================================================

    createScope: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      // Get parent scope to determine the new scope's parent
      let parentScopeId = input.parentScopeId;
      if (!parentScopeId) {
        // Default to team scope as parent
        const teamScope = await ScopeService.getTeamScope(teamId);
        parentScopeId = teamScope?.id;
      }

      return ScopeService.createScope(teamId, {
        parentScopeId,
        type: 'project',
        name: input.name,
        description: input.description,
        createdBy: userId
      });
    },

    updateScope: async (_, { scopeId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return ScopeService.updateScope(scopeId, input);
    },

    deleteScope: async (_, { scopeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      await ScopeService.deleteScope(scopeId);
      return true;
    },

    sendScopeMessage: async (_, { scopeId, includePrivate, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      // Determine target scope (private or public)
      let targetScopeId = scopeId;
      let scope = await ScopeService.getScopeById(scopeId);

      if (includePrivate && scope) {
        const privateScope = await ScopeService.getUserPrivateScope(scope.teamId, userId, scopeId);
        targetScopeId = privateScope.id;
        scope = privateScope;
      }

      // Send user message
      const userMessage = await ScopeService.sendScopeMessage(targetScopeId, userId, input.content, {
        replyToMessageId: input.replyToMessageId
      });

      // Check if @raven is mentioned - if so, trigger AI response
      const mentionsRaven = input.content.toLowerCase().includes('@raven');

      if (mentionsRaven && scope) {
        // Get search scope IDs for knowledge retrieval
        const searchScopeIds = await ScopeService.getSearchScopeIds(scopeId, userId, includePrivate);

        // TODO: Process with AIService.processMessageWithScope()
        // For now, return just the user message
        // The AI integration will be added in the next phase
      }

      return {
        message: userMessage,
        factsCreated: [],
        alertsCreated: []
      };
    },

    // ============================================================================
    // ASK/REMEMBER
    // ============================================================================

    previewRemember: async (_, { scopeId, statement, sourceUrl }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const result = await RavenService.previewRemember(scopeId, userId, statement, sourceUrl);
      // Map subject/object from {name, type} objects to strings for GraphQL
      if (result.extractedTriples) {
        result.extractedTriples = result.extractedTriples.map(t => ({
          ...t,
          subject: typeof t.subject === 'object' ? t.subject.name : t.subject,
          subjectType: typeof t.subject === 'object' ? t.subject.type : (t.subjectType || ''),
          object: typeof t.object === 'object' ? t.object.name : t.object,
          objectType: typeof t.object === 'object' ? t.object.type : (t.objectType || ''),
        }));
      }
      return result;
    },

    confirmRemember: async (_, { previewId, skipConflictIds }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return RavenService.confirmRemember(previewId, skipConflictIds, userId);
    },

    cancelRemember: async (_, { previewId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return RavenService.cancelRemember(previewId);
    },

    logCorrection: async (_, { teamId, question, wrongAnswer, correctInfo, tripleIds }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return RavenService.logCorrection(teamId, userId, { question, wrongAnswer, correctInfo, triplesUsedIds: tripleIds });
    },

    processDocumentContent: async (_, { teamId, title, content, url }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return RavenService.processDocumentContent(teamId, userId, { title, content, url });
    },

    // ============================================================================
    // CONVERSATION IMPORT
    // ============================================================================

    importConversation: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return ConversationImportService.importConversation(teamId, userId, input);
    },

    // ============================================================================
    // KNOWLEDGE GRAPH MUTATIONS
    // ============================================================================

    createKnowledgeNode: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeGraphService.upsertNode(teamId, {
        name: input.name,
        type: input.type,
        description: input.description,
        parentNodeId: input.parentNodeId,
        scaleLevel: input.scaleLevel || 0
      }, { sourceType: 'manual' });
    },

    updateKnowledgeNode: async (_, { nodeId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const updates = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.summary !== undefined) updates.summary = input.summary;

      const result = await pool.query(`
        UPDATE kg_nodes SET
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          summary = COALESCE($4, summary),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [nodeId, input.name, input.description, input.summary]);

      return result.rows[0];
    },

    reparentKnowledgeNode: async (_, { nodeId, newParentId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeGraphService.reparentNode(nodeId, newParentId);
    },

    generateKnowledgeNodeSummary: async (_, { nodeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const node = await pool.query('SELECT team_id FROM kg_nodes WHERE id = $1', [nodeId]);
      if (node.rows.length === 0) throw new Error('Node not found');
      return KnowledgeGraphService.generateNodeSummary(node.rows[0].team_id, nodeId);
    },

    attachFactToNode: async (_, { factId, nodeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeGraphService.attachFactToNode(factId, nodeId);
    },

    deleteKnowledgeNode: async (_, { nodeId, deleteChildren }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      if (deleteChildren) {
        // Delete all descendants first (using path array)
        await pool.query(`
          DELETE FROM kg_nodes WHERE $1 = ANY(path)
        `, [nodeId]);
      } else {
        // Reparent children to this node's parent
        const node = await pool.query('SELECT parent_node_id FROM kg_nodes WHERE id = $1', [nodeId]);
        if (node.rows.length > 0) {
          await pool.query(`
            UPDATE kg_nodes SET parent_node_id = $2 WHERE parent_node_id = $1
          `, [nodeId, node.rows[0].parent_node_id]);
        }
      }

      // Delete the node itself
      await pool.query('DELETE FROM kg_nodes WHERE id = $1', [nodeId]);
      return true;
    },

    // ========================================================================
    // KNOWLEDGE FRESHNESS MUTATIONS
    // ========================================================================

    markStaleKnowledge: async (_, { teamId, staleThresholdDays = 90 }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return KnowledgeFreshnessService.markStaleKnowledge(teamId, staleThresholdDays);
    },

    validateFacts: async (_, { factIds }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const count = await KnowledgeFreshnessService.validateFacts(factIds, userId);
      return { factsValidated: count };
    },

    expireFact: async (_, { factId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      await KnowledgeFreshnessService.expireFact(factId);
      return true;
    },

    setFactValidRange: async (_, { factId, validFrom, validUntil }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const result = await KnowledgeFreshnessService.setFactValidRange(factId, validFrom, validUntil);
      // Return the full fact
      const factResult = await pool.query('SELECT * FROM facts WHERE id = $1', [factId]);
      return factResult.rows[0];
    },

    // Graph Grooming (on-demand)
    groomKnowledgeGraph: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      // Use new triple-based grooming
      return TripleGroomingService.groomGraph(teamId);
    },

    // Triple-based grooming
    groomTripleGraph: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TripleGroomingService.groomGraph(teamId);
    },

    mergeConcepts: async (_, { teamId, canonicalId, duplicateId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TripleService.mergeConcepts(teamId, canonicalId, duplicateId);
    },

    // PageRank computation
    computePageRank: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const { default: PageRankService } = await import('../services/PageRankService.js');
      return PageRankService.computePageRank(teamId);
    },

    // Procedural memory
    createProcedure: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const { default: ProceduralMemoryService } = await import('../services/ProceduralMemoryService.js');
      return ProceduralMemoryService.createProcedure(teamId, { ...input, createdBy: userId });
    },

    proposeRules: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const { default: ProceduralMemoryService } = await import('../services/ProceduralMemoryService.js');
      return ProceduralMemoryService.proposeRules(teamId);
    },

    detectCausalLinks: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const { default: ProceduralMemoryService } = await import('../services/ProceduralMemoryService.js');
      return ProceduralMemoryService.detectCausalLinks(teamId);
    },

    // Simulation
    runSimulation: async (_, { teamId, personas, cycles }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const scope = await ScopeService.getTeamScope(teamId);
      return SimulationService.runSimulation(teamId, scope.id, {
        personas: personas || ['dana', 'shawn', 'alex'],
        cycles: cycles || 1,
        groomBetweenCycles: true
      });
    },

    mergeNodes: async (_, { teamId, canonicalNodeId, duplicateNodeId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return GraphGroomingService.mergeNodes(teamId, canonicalNodeId, duplicateNodeId);
    },

    deleteOrphanNodes: async (_, { teamId, nodeIds }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return GraphGroomingService.deleteOrphanNodes(teamId, nodeIds);
    }
  },

  // ============================================================================
  // TYPE RESOLVERS
  // ============================================================================

  Team: {
    members: async (team) => {
      return TeamService.getTeamMembers(team.id);
    },

    channels: async (team) => {
      return ChannelService.getChannels(team.id);
    }
  },

  Scope: {
    parentScope: async (scope) => {
      if (!scope.parentScopeId) return null;
      return ScopeService.getScopeById(scope.parentScopeId);
    },

    coupledScope: async (scope) => {
      if (!scope.coupledScopeId) return null;
      return ScopeService.getScopeById(scope.coupledScopeId);
    },

    children: async (scope) => {
      return ScopeService.getChildScopes(scope.id);
    },

    path: async (scope) => {
      return ScopeService.getScopePath(scope.id);
    },

    createdByUser: async (scope) => {
      if (!scope.createdBy) return null;
      return UserService.getUserById(scope.createdBy);
    }
  },

  ScopeConversation: {
    scope: async (conversation) => {
      return ScopeService.getScopeById(conversation.scopeId);
    },

    messages: async (conversation, { limit, before }) => {
      return ScopeService.getScopeMessages(conversation.scopeId, conversation.userId, { limit: limit || 50, before });
    }
  },

  ScopeMessage: {
    user: async (message) => {
      if (!message.userId) return null;
      return UserService.getUserById(message.userId);
    },

    replyToMessage: async (message) => {
      if (!message.replyToMessageId) return null;
      // Need to implement getting a single scope message by ID
      return null; // TODO: Implement
    }
  },

  Channel: {
    messages: async (channel, { limit, before }) => {
      return MessageService.getMessages(channel.id, { limit: limit || 50, before });
    },

    threads: async (channel, { limit }) => {
      return ThreadService.getThreads(channel.id, { limit: limit || 50 });
    }
  },

  Thread: {
    messages: async (thread, { limit }) => {
      return ThreadService.getThreadMessages(thread.id, { limit: limit || 100 });
    },

    startedByUser: async (thread) => {
      if (!thread.startedBy) return null;
      return UserService.getUserById(thread.startedBy);
    }
  },

  Message: {
    thread: async (message) => {
      if (!message.threadId) return null;
      return ThreadService.getThread(message.threadId);
    },

    attachments: async (message) => {
      if (!message.hasAttachments) return [];
      return UploadService.getMessageAttachments(message.id);
    }
  },

  Fact: {
    createdByUser: async (fact) => {
      if (!fact.createdBy) return null;
      return UserService.getUserById(fact.createdBy);
    },

    scope: async (fact) => {
      if (!fact.scopeId) return null;
      return ScopeService.getScopeById(fact.scopeId);
    }
  },

  // Triple-based knowledge type resolvers
  Triple: {
    subject: async (triple) => {
      if (triple.subjectName) return { id: triple.subjectId, name: triple.subjectName, type: triple.subjectType, mentionCount: 0 };
      return TripleService.getConcept(triple.subjectId);
    },
    object: async (triple) => {
      if (triple.objectName) return { id: triple.objectId, name: triple.objectName, type: triple.objectType, mentionCount: 0 };
      return TripleService.getConcept(triple.objectId);
    },
    contexts: async (triple) => {
      return TripleService.getContextsForTriple(triple.id);
    },
    createdBy: async (triple) => {
      if (!triple.createdBy) return null;
      return UserService.getUserById(triple.createdBy);
    },
    teamId: (t) => t.team_id || t.teamId,
    scopeId: (t) => t.scope_id || t.scopeId,
    displayText: (t) => t.display_text || t.displayText,
    trustTier: (t) => t.trust_tier || t.trustTier,
    sourceText: (t) => t.source_text || t.sourceText,
    sourceUrl: (t) => t.source_url || t.sourceUrl,
    isChunky: (t) => t.is_chunky ?? t.isChunky ?? false,
    isUniversal: (t) => t.is_universal ?? t.isUniversal ?? false,
    createdAt: (t) => t.created_at || t.createdAt,
  },

  Concept: {
    teamId: (c) => c.team_id || c.teamId,
    mentionCount: (c) => c.mention_count ?? c.mentionCount ?? 0,
    createdAt: (c) => c.created_at || c.createdAt,
    updatedAt: (c) => c.updated_at || c.updatedAt,
  },

  ContextNode: {
    parent: async (ctx) => {
      const parentId = ctx.parent_id || ctx.parentId;
      if (!parentId) return null;
      const result = await pool.query('SELECT * FROM context_nodes WHERE id = $1', [parentId]);
      return result.rows[0] || null;
    },
    children: async (ctx) => {
      return TripleService.getContextChildren(ctx.id);
    },
    isDynamic: (ctx) => ctx.is_dynamic ?? ctx.isDynamic ?? false,
  },

  KnowledgeNode: {
    parentNode: async (node) => {
      if (!node.parent_node_id && !node.parentNodeId) return null;
      const parentId = node.parent_node_id || node.parentNodeId;
      const result = await pool.query('SELECT * FROM kg_nodes WHERE id = $1', [parentId]);
      return result.rows[0] || null;
    },

    children: async (node) => {
      const result = await pool.query(`
        SELECT * FROM kg_nodes
        WHERE parent_node_id = $1
        ORDER BY scale_level DESC, name ASC
      `, [node.id]);
      return result.rows;
    },

    facts: async (node) => {
      const result = await pool.query(`
        SELECT * FROM facts
        WHERE kg_node_id = $1 AND valid_until IS NULL
        ORDER BY created_at DESC
      `, [node.id]);
      return result.rows;
    },

    // Map snake_case DB columns to camelCase GraphQL fields
    teamId: (node) => node.team_id || node.teamId,
    scaleLevel: (node) => node.scale_level ?? node.scaleLevel ?? 0,
    childCount: (node) => node.child_count ?? node.childCount ?? 0,
    factCount: (node) => node.fact_count ?? node.factCount ?? 0,
    createdAt: (node) => node.created_at || node.createdAt,
    updatedAt: (node) => node.updated_at || node.updatedAt
  },

  TeamQuestion: {
    askedByUser: async (question) => {
      if (!question.askedBy) return null;
      return UserService.getUserById(question.askedBy);
    },

    askedByName: async (question) => {
      if (question.askedByRaven) return 'Raven';
      if (!question.askedBy) return null;
      const user = await UserService.getUserById(question.askedBy);
      return user?.displayName || user?.email || null;
    },

    answeredByUser: async (question) => {
      if (!question.answeredBy) return null;
      return UserService.getUserById(question.answeredBy);
    },

    answeredByName: async (question) => {
      if (!question.answeredBy) return null;
      const user = await UserService.getUserById(question.answeredBy);
      return user?.displayName || user?.email || null;
    },

    assignees: async (question) => {
      return QuestionService.getQuestionAssignees(question.id);
    },

    parentQuestion: async (question) => {
      if (!question.parentQuestionId) return null;
      return QuestionService.getQuestionById(question.parentQuestionId);
    },

    followUpQuestions: async (question) => {
      return LearningObjectiveService.getFollowUpQuestions(question.id);
    },

    learningObjective: async (question) => {
      if (!question.learningObjectiveId) return null;
      return LearningObjectiveService.getObjectiveById(question.learningObjectiveId);
    },

    attachments: async (question) => {
      return UploadService.getQuestionAttachments(question.id);
    },

    scope: async (question) => {
      if (!question.scopeId) return null;
      return ScopeService.getScopeById(question.scopeId);
    }
  },

  LearningObjective: {
    assignedToUser: async (objective) => {
      if (!objective.assignedTo) return null;
      return UserService.getUserById(objective.assignedTo);
    },

    createdByUser: async (objective) => {
      if (!objective.createdBy) return null;
      return UserService.getUserById(objective.createdBy);
    },

    questions: async (objective) => {
      return LearningObjectiveService.getObjectiveQuestions(objective.id);
    },

    scope: async (objective) => {
      if (!objective.scopeId) return null;
      return ScopeService.getScopeById(objective.scopeId);
    }
  },

  Alert: {
    scope: async (alert) => {
      if (!alert.scopeId) return null;
      return ScopeService.getScopeById(alert.scopeId);
    }
  }
};

export default resolvers;
