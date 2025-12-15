/**
 * PM Feature Resolvers (Modular - can be removed by deleting this file)
 *
 * Import and spread into main resolvers:
 *   import { pmQueryResolvers, pmMutationResolvers } from './pmResolvers.js';
 *   Query: { ...pmQueryResolvers, ...otherQueries },
 *   Mutation: { ...pmMutationResolvers, ...otherMutations },
 */

import * as PMService from '../../services/PMService.js';
import * as UXPreferencesService from '../../services/UXPreferencesService.js';

export const pmQueryResolvers = {
  // User Availability
  getMyAvailability: async (_, { teamId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getMyAvailability(userId, teamId);
  },
  getTeamAvailability: async (_, { teamId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getTeamAvailability(teamId);
  },

  // Time Off
  getMyTimeOff: async (_, { teamId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getMyTimeOff(userId, teamId);
  },
  getTeamTimeOff: async (_, { teamId, startDate, endDate }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getTeamTimeOff(teamId, startDate, endDate);
  },

  // GTD Contexts
  getTaskContexts: async (_, { teamId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getTaskContexts(teamId);
  },

  // Milestones
  getMilestones: async (_, { teamId, projectId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getMilestones(teamId, projectId);
  },
  getMilestone: async (_, { milestoneId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getMilestone(milestoneId);
  },

  // Project Templates
  getProjectTemplates: async (_, { teamId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getProjectTemplates(teamId);
  },
  getProjectTemplate: async (_, { templateId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getProjectTemplate(templateId);
  },

  // Time Blocks
  getMyTimeBlocks: async (_, { teamId, startDate, endDate }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getMyTimeBlocks(userId, teamId, startDate, endDate);
  },

  // Team Workload
  getTeamWorkload: async (_, { teamId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getTeamWorkload(teamId);
  },
  getUserWorkload: async (_, { teamId, userId: targetUserId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getUserWorkload(teamId, targetUserId);
  },

  // Meeting Preferences
  getMyMeetingPreferences: async (_, __, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getMyMeetingPreferences(userId);
  },

  // Smart Scheduling
  findMeetingTimes: async (_, { teamId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.findMeetingTimes(teamId, input);
  },

  // Feature Flags
  getMyFeatureFlags: async (_, __, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getMyFeatureFlags(userId);
  },

  // UX Preferences (AI-controlled personalization)
  getMyUXPreferences: async (_, { teamId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return UXPreferencesService.getEffectivePreferences(teamId, userId);
  },

  // Eisenhower Matrix
  getEisenhowerMatrix: async (_, { teamId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getEisenhowerMatrix(teamId, userId);
  },

  // Gantt Chart
  getGanttData: async (_, { teamId, projectId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getGanttData(teamId, projectId);
  },

  // Workload Histogram
  getWorkloadHistogram: async (_, { teamId, startDate, endDate }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getWorkloadHistogram(teamId, startDate, endDate);
  },

  // Work Breakdown Structure
  getWBSData: async (_, { projectId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getWBSData(projectId);
  },

  // WBS Drafts (Generic Ephemeral Trees)
  getWBSDrafts: async (_, { teamId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getWBSDrafts(teamId);
  },
  getWBSDraft: async (_, { draftId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.getWBSDraft(draftId);
  },
};

export const pmMutationResolvers = {
  // User Availability
  updateMyAvailability: async (_, { teamId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateMyAvailability(userId, teamId, input);
  },

  // Time Off
  createTimeOff: async (_, { teamId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.createTimeOff(userId, teamId, input);
  },
  updateTimeOff: async (_, { timeOffId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateTimeOff(timeOffId, input);
  },
  deleteTimeOff: async (_, { timeOffId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.deleteTimeOff(timeOffId);
  },
  approveTimeOff: async (_, { timeOffId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.approveTimeOff(timeOffId, userId);
  },
  rejectTimeOff: async (_, { timeOffId, reason }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.rejectTimeOff(timeOffId, reason);
  },

  // GTD Contexts
  createTaskContext: async (_, { teamId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.createTaskContext(teamId, input);
  },
  updateTaskContext: async (_, { contextId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateTaskContext(contextId, input);
  },
  deleteTaskContext: async (_, { contextId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.deleteTaskContext(contextId);
  },
  setTaskContext: async (_, { taskId, context }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.setTaskContext(taskId, context);
  },

  // Milestones
  createMilestone: async (_, { teamId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.createMilestone(teamId, userId, input);
  },
  updateMilestone: async (_, { milestoneId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateMilestone(milestoneId, input);
  },
  completeMilestone: async (_, { milestoneId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.completeMilestone(milestoneId);
  },
  deleteMilestone: async (_, { milestoneId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.deleteMilestone(milestoneId);
  },

  // Project Templates
  createProjectTemplate: async (_, { teamId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.createProjectTemplate(teamId, userId, input);
  },
  updateProjectTemplate: async (_, { templateId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateProjectTemplate(templateId, input);
  },
  deleteProjectTemplate: async (_, { templateId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.deleteProjectTemplate(templateId);
  },
  createProjectFromTemplate: async (_, { teamId, templateId, name }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    const template = await PMService.getProjectTemplate(templateId);
    const { default: ProjectService } = await import('../../services/ProjectService.js');
    return ProjectService.createProject(teamId, userId, { name, description: template?.description });
  },

  // Project Stage
  updateProjectStage: async (_, { projectId, stage }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateProjectStage(projectId, stage);
  },

  // Time Blocks
  createTimeBlock: async (_, { teamId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.createTimeBlock(userId, teamId, input);
  },
  updateTimeBlock: async (_, { blockId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateTimeBlock(blockId, input);
  },
  deleteTimeBlock: async (_, { blockId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.deleteTimeBlock(blockId);
  },
  startTimeBlock: async (_, { blockId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.startTimeBlock(blockId);
  },
  completeTimeBlock: async (_, { blockId, focusScore, notes }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.completeTimeBlock(blockId, focusScore, notes);
  },

  // Meeting Preferences
  updateMyMeetingPreferences: async (_, { input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateMyMeetingPreferences(userId, input);
  },

  // Feature Flags (Pro Mode)
  updateMyFeatureFlags: async (_, { input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateMyFeatureFlags(userId, input);
  },
  enableProMode: async (_, __, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.enableProMode(userId);
  },
  disableProMode: async (_, __, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.disableProMode(userId);
  },
  setWorkflowPersona: async (_, { persona }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.setWorkflowPersona(userId, persona);
  },

  // Task Eisenhower Fields
  setTaskUrgency: async (_, { taskId, isUrgent }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.setTaskUrgency(taskId, isUrgent);
  },
  setTaskImportance: async (_, { taskId, importance }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.setTaskImportance(taskId, importance);
  },

  // Quick Task
  markAsQuickTask: async (_, { taskId, isQuick }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.markAsQuickTask(taskId, isQuick);
  },

  // Work Breakdown Structure
  createWBSTask: async (_, { projectId, teamId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.createWBSTask(projectId, input.parentTaskId, input, userId, teamId);
  },
  updateWBSTask: async (_, { taskId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateWBSTask(taskId, input);
  },

  // WBS Drafts (Generic Ephemeral Trees)
  createWBSDraft: async (_, { teamId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.createWBSDraft(teamId, userId, input);
  },
  updateWBSDraft: async (_, { draftId, input }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.updateWBSDraft(draftId, input);
  },
  deleteWBSDraft: async (_, { draftId }, { userId }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.deleteWBSDraft(draftId);
  },

  // AI Materialization - Convert WBS draft to real project/tasks
  materializeWBSDraft: async (_, { draftId, teamId, projectName }, { userId, aiService }) => {
    if (!userId) throw new Error('Not authenticated');
    return PMService.materializeWBSDraft(draftId, teamId, userId, projectName, aiService);
  },
};

// Type resolvers for PM types
export const pmTypeResolvers = {
  TimeOff: {
    user: async (timeOff) => {
      const { default: UserService } = await import('../../services/UserService.js');
      return UserService.getUserById(timeOff.userId);
    },
    approvedByUser: async (timeOff) => {
      if (!timeOff.approvedBy) return null;
      const { default: UserService } = await import('../../services/UserService.js');
      return UserService.getUserById(timeOff.approvedBy);
    }
  },
  Milestone: {
    project: async (milestone) => {
      if (!milestone.projectId) return null;
      const { default: ProjectService } = await import('../../services/ProjectService.js');
      return ProjectService.getProjectById(milestone.projectId);
    },
    goal: async (milestone) => {
      if (!milestone.goalId) return null;
      const GoalService = await import('../../services/GoalService.js');
      return GoalService.getGoalById(milestone.goalId);
    },
    createdByUser: async (milestone) => {
      if (!milestone.createdBy) return null;
      const { default: UserService } = await import('../../services/UserService.js');
      return UserService.getUserById(milestone.createdBy);
    }
  },
  ProjectTemplate: {
    createdByUser: async (template) => {
      if (!template.createdBy) return null;
      const { default: UserService } = await import('../../services/UserService.js');
      return UserService.getUserById(template.createdBy);
    }
  },
  TimeBlock: {
    user: async (block) => {
      const { default: UserService } = await import('../../services/UserService.js');
      return UserService.getUserById(block.userId);
    },
    task: async (block) => {
      if (!block.taskId) return null;
      const { default: TaskService } = await import('../../services/TaskService.js');
      return TaskService.getTaskById(block.taskId);
    }
  },
  UserWorkload: {
    user: async (workload) => {
      const { default: UserService } = await import('../../services/UserService.js');
      return UserService.getUserById(workload.userId);
    }
  },
  GanttTask: {
    assignee: async (task) => {
      if (!task.assignedTo) return null;
      const { default: UserService } = await import('../../services/UserService.js');
      return UserService.getUserById(task.assignedTo);
    }
  },
  WBSDraft: {
    createdByUser: async (draft) => {
      if (!draft.createdBy) return null;
      const { default: UserService } = await import('../../services/UserService.js');
      return UserService.getUserById(draft.createdBy);
    },
    materializedProject: async (draft) => {
      if (!draft.materializedProjectId) return null;
      const { default: ProjectService } = await import('../../services/ProjectService.js');
      return ProjectService.getProjectById(draft.materializedProjectId);
    }
  }
};
