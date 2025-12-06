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

    // Ask the Company (AI Q&A)
    askCompany: async (_, { teamId, input }, { userId }) => {
      // Get all relevant knowledge
      const knowledge = await KnowledgeService.getKnowledgeContext(teamId, input.question);

      // Generate AI answer
      const answer = await AIService.generateCompanyAnswer(
        input.question,
        knowledge.facts,
        knowledge.decisions
      );

      // Log the query for analytics
      try {
        const { Pool } = await import('pg');
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

    // Projects & Tasks
    getProjects: async (_, { teamId }) => {
      return ProjectService.getProjects(teamId);
    },

    getProject: async (_, { projectId }) => {
      return ProjectService.getProjectById(projectId);
    },

    getTasks: async (_, { teamId, projectId, status, assignedTo }) => {
      return TaskService.getTasks(teamId, { projectId, status, assignedTo });
    },

    getTask: async (_, { taskId }) => {
      return TaskService.getTaskById(taskId);
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

    updateTask: async (_, { taskId, input }) => {
      return TaskService.updateTask(taskId, input);
    },

    completeTask: async (_, { taskId }) => {
      return TaskService.completeTask(taskId);
    },

    deleteTask: async (_, { taskId }) => {
      return TaskService.deleteTask(taskId);
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
    }
  },

  Project: {
    tasks: async (project) => {
      return TaskService.getTasks(project.teamId, { projectId: project.id });
    }
  },

  Fact: {
    createdByUser: async (fact) => {
      if (!fact.createdBy) return null;
      return UserService.getUserById(fact.createdBy);
    }
  }
};

export default resolvers;
