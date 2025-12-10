/**
 * GraphQL Resolvers - Clean slate for team-based knowledge hub
 */

import { GraphQLJSON } from 'graphql-type-json';
import { GraphQLDateTime } from 'graphql-scalars';

import UserService from '../../services/UserService.js';
import TeamService from '../../services/TeamService.js';
import ChannelService from '../../services/ChannelService.js';
import MessageService from '../../services/MessageService.js';
import KnowledgeService from '../../services/KnowledgeService.js';
import AlertService from '../../services/AlertService.js';
import TaskService from '../../services/TaskService.js';
import ProjectService from '../../services/ProjectService.js';
import ThreadService from '../../services/ThreadService.js';
import DigestService from '../../services/DigestService.js';
import AIService from '../../services/AIService.js';
import * as GoalService from '../../services/GoalService.js';
import * as QuestionService from '../../services/QuestionService.js';
import * as LearningObjectiveService from '../../services/LearningObjectiveService.js';
import GoogleDriveService from '../../services/GoogleDriveService.js';
import UploadService from '../../services/UploadService.js';
import GifService from '../../services/GifService.js';
import KnowledgeBaseService from '../../services/KnowledgeBaseService.js';
import { graphRAGSearch, getGraphStats } from '../../services/KnowledgeGraphService.js';
import * as CalendarService from '../../services/CalendarService.js';
import * as GoogleCalendarService from '../../services/GoogleCalendarService.js';

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

    getMyCalendarChat: async (_, { teamId }, context) => {
      const userId = context.userId;
      if (!userId) throw new Error('Must be authenticated');
      return ChannelService.getOrCreateCalendarChat(teamId, userId);
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

    // Goals
    getGoals: async (_, { teamId, status }) => {
      console.log('[getGoals] teamId:', teamId, 'status:', status);
      const goals = await GoalService.getGoals(teamId, status);
      console.log('[getGoals] returning', goals.length, 'goals');
      return goals;
    },

    getGoal: async (_, { goalId }) => {
      return GoalService.getGoal(goalId);
    },

    getTasksForGoal: async (_, { teamId, goalId }) => {
      return GoalService.getTasksForGoal(goalId, teamId);
    },

    // Projects & Tasks
    getProjects: async (_, { teamId, goalId, status }) => {
      console.log('[getProjects] teamId:', teamId, 'goalId:', goalId, 'status:', status);
      const projects = await ProjectService.getProjects(teamId, { goalId, status });
      console.log('[getProjects] returning', projects.length, 'projects');
      return projects;
    },

    getProject: async (_, { projectId }) => {
      return ProjectService.getProjectById(projectId);
    },

    getTasks: async (_, { teamId, projectId, goalId, status, assignedTo }) => {
      console.log('[getTasks] teamId:', teamId, 'projectId:', projectId, 'goalId:', goalId, 'status:', status);
      const tasks = await TaskService.getTasks(teamId, { projectId, goalId, status, assignedTo });
      console.log('[getTasks] returning', tasks.length, 'tasks');
      return tasks;
    },

    getTask: async (_, { taskId }) => {
      return TaskService.getTaskById(taskId);
    },

    getTaskComments: async (_, { taskId }) => {
      return TaskService.getTaskComments(taskId);
    },

    getTaskActivity: async (_, { taskId }) => {
      return TaskService.getTaskActivity(taskId);
    },

    // Team Invites
    getTeamInvites: async (_, { teamId }) => {
      return TeamService.getTeamInvites(teamId);
    },

    validateInviteToken: async (_, { token }) => {
      return TeamService.validateInviteToken(token);
    },

    // Daily Digest
    getDailyDigest: async (_, { teamId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return DigestService.generateDigest(teamId, userId);
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

    // Calendar Events
    getEvents: async (_, { teamId, startDate, endDate, taskId, projectId }) => {
      return CalendarService.getEvents(teamId, { startDate, endDate, taskId, projectId });
    },

    getEvent: async (_, { eventId }) => {
      return CalendarService.getEventById(eventId);
    },

    getCalendarMonth: async (_, { teamId, year, month }) => {
      return CalendarService.getEventsByMonth(teamId, year, month);
    },

    exportCalendarICS: async (_, { teamId, startDate, endDate }) => {
      return CalendarService.exportToICS(teamId, startDate, endDate);
    },

    // Get calendar items including events AND task due dates
    getCalendarItems: async (_, { teamId, startDate, endDate }) => {
      // Get events
      const events = await CalendarService.getEvents(teamId, { startDate, endDate });

      // Get tasks with due dates in the range
      const tasksResult = await TaskService.getTasks(teamId, {});
      const tasksDue = tasksResult.filter(task => {
        if (!task.dueAt) return false;
        const dueDate = new Date(task.dueAt);
        return dueDate >= new Date(startDate) && dueDate <= new Date(endDate);
      });

      return { events, tasksDue };
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
      return TeamService.createTeam(input.name, userId);
    },

    updateTeam: async (_, { teamId, name }, { userId }) => {
      // TODO: Check admin/owner permission
      return TeamService.updateTeam(teamId, name);
    },

    deleteTeam: async (_, { teamId }, { userId }) => {
      // TODO: Check owner permission
      return TeamService.deleteTeam(teamId);
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

    // Goals
    createGoal: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return GoalService.createGoal(teamId, input, userId);
    },

    updateGoal: async (_, { goalId, input }, { userId }) => {
      return GoalService.updateGoal(goalId, input, userId);
    },

    deleteGoal: async (_, { goalId }) => {
      return GoalService.deleteGoal(goalId);
    },

    // Projects
    createProject: async (_, { teamId, input }, { userId }) => {
      return ProjectService.createProject(teamId, { ...input, createdBy: userId });
    },

    updateProject: async (_, { projectId, input }) => {
      return ProjectService.updateProject(projectId, input);
    },

    deleteProject: async (_, { projectId }) => {
      return ProjectService.deleteProject(projectId);
    },

    // Tasks
    createTask: async (_, { teamId, input }, { userId }) => {
      return TaskService.createTask(teamId, { ...input, createdBy: userId });
    },

    updateTask: async (_, { taskId, input }, { userId }) => {
      return TaskService.updateTask(taskId, input);
    },

    completeTask: async (_, { taskId }, { userId }) => {
      return TaskService.completeTask(taskId, userId);
    },

    reopenTask: async (_, { taskId }, { userId }) => {
      return TaskService.reopenTask(taskId, userId);
    },

    deleteTask: async (_, { taskId }) => {
      return TaskService.deleteTask(taskId);
    },

    reorderTasks: async (_, { projectId, taskIds }) => {
      return TaskService.reorderTasks(projectId, taskIds);
    },

    // Task Comments
    addTaskComment: async (_, { taskId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return TaskService.addTaskComment(taskId, userId, input.content, input.parentCommentId);
    },

    updateTaskComment: async (_, { commentId, content }) => {
      return TaskService.updateTaskComment(commentId, content);
    },

    deleteTaskComment: async (_, { commentId }) => {
      return TaskService.deleteTaskComment(commentId);
    },

    // Goal Associations
    linkGoalToProject: async (_, { goalId, projectId }) => {
      return GoalService.linkGoalToProject(goalId, projectId);
    },

    unlinkGoalFromProject: async (_, { goalId, projectId }) => {
      return GoalService.unlinkGoalFromProject(goalId, projectId);
    },

    setProjectGoals: async (_, { projectId, goalIds }) => {
      return GoalService.setProjectGoals(projectId, goalIds);
    },

    linkGoalToTask: async (_, { goalId, taskId }) => {
      return GoalService.linkGoalToTask(goalId, taskId);
    },

    unlinkGoalFromTask: async (_, { goalId, taskId }) => {
      return GoalService.unlinkGoalFromTask(goalId, taskId);
    },

    setTaskGoals: async (_, { taskId, goalIds }) => {
      return GoalService.setTaskGoals(taskId, goalIds);
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

    // Calendar Events
    createEvent: async (_, { teamId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return CalendarService.createEvent(teamId, { ...input, createdBy: userId });
    },

    updateEvent: async (_, { eventId, input }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return CalendarService.updateEvent(eventId, input);
    },

    deleteEvent: async (_, { eventId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return CalendarService.deleteEvent(eventId);
    },

    syncEventToGoogle: async (_, { eventId }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');
      return GoogleCalendarService.syncEventToGoogle(userId, eventId);
    },

    importCalendarFromGoogle: async (_, { teamId, calendarId, daysBack, daysForward }, { userId }) => {
      if (!userId) throw new Error('Not authenticated');

      const timeMin = new Date();
      timeMin.setDate(timeMin.getDate() - (daysBack || 30));

      const timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + (daysForward || 90));

      return GoogleCalendarService.importFromGoogle(
        userId,
        teamId,
        calendarId || 'primary',
        timeMin,
        timeMax
      );
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

  Goal: {
    owner: async (goal) => {
      if (!goal.ownerId) return null;
      return UserService.getUserById(goal.ownerId);
    },

    parentGoal: async (goal) => {
      if (!goal.parentGoalId) return null;
      return GoalService.getGoal(goal.parentGoalId);
    },

    childGoals: async (goal) => {
      return GoalService.getChildGoals(goal.id);
    },

    projects: async (goal) => {
      return GoalService.getProjectsForGoal(goal.id);
    },

    tasks: async (goal) => {
      return GoalService.getTasksForGoal(goal.id, goal.teamId);
    },

    taskCount: async (goal) => {
      const tasks = await GoalService.getTasksForGoal(goal.id, goal.teamId);
      return tasks.length;
    },

    completedTaskCount: async (goal) => {
      const tasks = await GoalService.getTasksForGoal(goal.id, goal.teamId);
      return tasks.filter(t => t.status === 'done').length;
    }
  },

  Project: {
    goals: async (project) => {
      return GoalService.getGoalsForProject(project.id);
    },

    owner: async (project) => {
      if (!project.ownerId) return null;
      return UserService.getUserById(project.ownerId);
    },

    tasks: async (project) => {
      return TaskService.getTasks(project.teamId, { projectId: project.id });
    },

    taskCount: async (project) => {
      const tasks = await TaskService.getTasks(project.teamId, { projectId: project.id });
      return tasks.length;
    },

    completedTaskCount: async (project) => {
      const tasks = await TaskService.getTasks(project.teamId, { projectId: project.id, status: 'done' });
      return tasks.length;
    }
  },

  Task: {
    project: async (task) => {
      if (!task.projectId) return null;
      return ProjectService.getProjectById(task.projectId);
    },

    assignedToUser: async (task) => {
      if (!task.assignedTo) return null;
      return UserService.getUserById(task.assignedTo);
    },

    createdByUser: async (task) => {
      if (!task.createdBy) return null;
      return UserService.getUserById(task.createdBy);
    },

    goals: async (task) => {
      const effectiveGoals = await GoalService.getEffectiveGoalsForTask(task.id);
      return effectiveGoals.map(g => ({
        id: g.id,
        title: g.title,
        status: g.status,
        linkType: g.linkType
      }));
    },

    directGoals: async (task) => {
      return GoalService.getDirectGoalsForTask(task.id);
    },

    comments: async (task) => {
      return TaskService.getTaskComments(task.id);
    },

    commentCount: async (task) => {
      return TaskService.getTaskCommentCount(task.id);
    },

    activity: async (task) => {
      return TaskService.getTaskActivity(task.id);
    }
  },

  TaskComment: {
    user: async (comment) => {
      if (!comment.userId) return null;
      return UserService.getUserById(comment.userId);
    },

    replies: async (comment) => {
      // Get replies to this comment
      const allComments = await TaskService.getTaskComments(comment.taskId);
      return allComments.filter(c => c.parentCommentId === comment.id);
    }
  },

  TaskActivity: {
    user: async (activity) => {
      if (!activity.userId) return null;
      return UserService.getUserById(activity.userId);
    }
  },

  Fact: {
    createdByUser: async (fact) => {
      if (!fact.createdBy) return null;
      return UserService.getUserById(fact.createdBy);
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
    }
  },

  Event: {
    createdByUser: async (event) => {
      if (!event.createdBy) return null;
      return UserService.getUserById(event.createdBy);
    },

    task: async (event) => {
      if (!event.taskId) return null;
      return TaskService.getTaskById(event.taskId);
    },

    project: async (event) => {
      if (!event.projectId) return null;
      return ProjectService.getProjectById(event.projectId);
    }
  }
};

export default resolvers;
