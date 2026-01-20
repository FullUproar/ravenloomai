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
import GifService from '../../services/GifService.js';
import KnowledgeBaseService from '../../services/KnowledgeBaseService.js';
import { graphRAGSearch, getGraphStats } from '../../services/KnowledgeGraphService.js';
import * as RateLimiterService from '../../services/RateLimiterService.js';
import * as ScopeService from '../../services/ScopeService.js';
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

    // Integrations
    getMyIntegrations: async (_, __, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const google = await GoogleDriveService.getIntegration(userId);
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

    getDriveFiles: async (_, { folderId, pageSize, pageToken }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const result = await GoogleDriveService.listFiles(userId, {
        folderId: folderId || 'root',
        pageSize: pageSize || 20,
        pageToken
      });
      return {
        files: result.files || [],
        nextPageToken: result.nextPageToken
      };
    },

    getDriveFileContent: async (_, { fileId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      const metadata = await GoogleDriveService.getFileMetadata(userId, fileId);
      const content = await GoogleDriveService.getFileContent(userId, fileId, metadata.mimeType);
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

    // GIF Search (Tenor API)
    searchGifs: async (_, { query, limit }) => {
      return GifService.search(query, limit || 20);
    },

    getTrendingGifs: async (_, { limit }) => {
      return GifService.getTrending(limit || 20);
    },

    getGifCategories: async () => {
      return GifService.getCategories();
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

    deleteUser: async (_, { userId: targetUserId }, { userId, db }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Super admin required');
      if (targetUserId === userId) throw new Error('Cannot delete yourself');

      // Delete user from database (cascades handle related records)
      await db.query('DELETE FROM users WHERE id = $1', [targetUserId]);
      return true;
    },

    deleteTeam: async (_, { teamId }, { userId, db }) => {
      if (!userId) throw new Error('Not authenticated');
      const isAdmin = await UserService.isSiteAdmin(userId);
      if (!isAdmin) throw new Error('Not authorized: Super admin required');

      // Delete team (cascades handle related records)
      await db.query('DELETE FROM teams WHERE id = $1', [teamId]);
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
