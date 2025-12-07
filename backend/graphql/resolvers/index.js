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

    answeredByUser: async (question) => {
      if (!question.answeredBy) return null;
      return UserService.getUserById(question.answeredBy);
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
  }
};

export default resolvers;
