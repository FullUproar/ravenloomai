/**
 * Project GraphQL Resolvers
 */

import db from '../../db.js';
import PersonaService from '../../services/PersonaService.js';

export default {
  Query: {
    /**
     * Get project by ID
     */
    getProject: async (_, { userId, projectId }) => {
      const query = `
        SELECT * FROM projects
        WHERE id = $1 AND user_id = $2
      `;

      const result = await db.query(query, [projectId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return mapProjectFromDb(result.rows[0]);
    },

    /**
     * Get all projects for user
     */
    getProjects: async (_, { userId }) => {
      const query = `
        SELECT * FROM projects
        WHERE user_id = $1
        ORDER BY created_at DESC
      `;

      const result = await db.query(query, [userId]);

      return result.rows.map(row => mapProjectFromDb(row));
    }
  },

  Mutation: {
    /**
     * Create new project
     */
    createProject: async (_, { userId, input }) => {
      const query = `
        INSERT INTO projects (
          user_id, title, description, completion_type, outcome, status, onboarding_state
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        userId,
        input.title,
        input.description || null,
        input.completionType || 'milestone',
        input.outcome || null,
        'active',
        input.onboardingState || null
      ];

      const result = await db.query(query, values);

      return mapProjectFromDb(result.rows[0]);
    },

    /**
     * Update project
     */
    updateProject: async (_, { projectId, input }) => {
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (input.title) {
        updates.push(`title = $${paramCount}`);
        values.push(input.title);
        paramCount++;
      }

      if (input.description !== undefined) {
        updates.push(`description = $${paramCount}`);
        values.push(input.description);
        paramCount++;
      }

      if (input.completionType) {
        updates.push(`completion_type = $${paramCount}`);
        values.push(input.completionType);
        paramCount++;
      }

      if (input.outcome) {
        updates.push(`outcome = $${paramCount}`);
        values.push(input.outcome);
        paramCount++;
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(projectId);

      const query = `
        UPDATE projects
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Project not found');
      }

      return mapProjectFromDb(result.rows[0]);
    },

    /**
     * Delete project
     */
    deleteProject: async (_, { projectId }) => {
      const query = 'DELETE FROM projects WHERE id = $1';
      const result = await db.query(query, [projectId]);

      return result.rowCount > 0;
    },

    /**
     * Enable debug mode for project
     */
    enableDebugMode: async (_, { projectId, passcode }) => {
      try {
        // Use simpler passcode
        const validPasscode = process.env.DEBUG_MODE_PASSCODE || '0000';

        // Normalize both strings to avoid whitespace/encoding issues
        const normalizedPasscode = String(passcode).trim();
        const normalizedValidPasscode = String(validPasscode).trim();

        console.log(`🐛 [Debug Mode] Attempting to enable for project ${projectId}`);
        console.log(`🐛 [Debug Mode] Received passcode: "${normalizedPasscode}" (length: ${normalizedPasscode.length})`);
        console.log(`🐛 [Debug Mode] Expected passcode: "${normalizedValidPasscode}" (length: ${normalizedValidPasscode.length})`);
        console.log(`🐛 [Debug Mode] Match: ${normalizedPasscode === normalizedValidPasscode}`);

        if (normalizedPasscode !== normalizedValidPasscode) {
          throw new Error('Invalid passcode');
        }

        const result = await db.query(
          `UPDATE projects
           SET debug_mode_enabled = true, debug_mode_activated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [projectId]
        );

        if (result.rows.length === 0) {
          throw new Error('Project not found');
        }

        const project = result.rows[0];
        console.log(`🐛 [Debug Mode] Enabled successfully`, {
          id: project.id,
          debug_mode_enabled: project.debug_mode_enabled,
          debug_mode_activated_at: project.debug_mode_activated_at
        });

        return mapProjectFromDb(project);
      } catch (error) {
        console.error('🐛 [Debug Mode] Error:', error);
        throw error;
      }
    },

    /**
     * Disable debug mode for project
     */
    disableDebugMode: async (_, { projectId }) => {
      const result = await db.query(
        `UPDATE projects
         SET debug_mode_enabled = false
         WHERE id = $1
         RETURNING *`,
        [projectId]
      );

      if (result.rows.length === 0) {
        throw new Error('Project not found');
      }

      console.log(`🐛 [Debug Mode] Disabled for project ${projectId}`);
      return mapProjectFromDb(result.rows[0]);
    }
  },

  Project: {
    /**
     * Resolve persona relationship
     */
    persona: async (project) => {
      return await PersonaService.getActivePersona(project.id);
    },

    /**
     * Resolve goals relationship
     */
    goals: async (project) => {
      const query = `
        SELECT * FROM goals
        WHERE project_id = $1
        ORDER BY priority DESC, created_at DESC
      `;

      const result = await db.query(query, [project.id]);

      return result.rows.map(row => mapGoalFromDb(row));
    },

    /**
     * Resolve tasks relationship
     */
    tasks: async (project) => {
      const query = `
        SELECT * FROM tasks
        WHERE project_id = $1
        ORDER BY priority, created_at
      `;

      const result = await db.query(query, [project.id]);

      return result.rows.map(row => mapTaskFromDb(row));
    },

    /**
     * Resolve metrics relationship
     */
    metrics: async (project) => {
      const query = `
        SELECT * FROM metrics
        WHERE project_id = $1
        ORDER BY recorded_at DESC
        LIMIT 100
      `;

      const result = await db.query(query, [project.id]);

      return result.rows.map(row => mapMetricFromDb(row));
    }
  }
};

/**
 * Map database row to Project object
 */
function mapProjectFromDb(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    status: row.status,
    completionType: row.completion_type,
    outcome: row.outcome,
    healthScore: row.health_score,
    lastActivityAt: row.last_activity_at,
    habitStreakCurrent: row.habit_streak_current,
    habitStreakLongest: row.habit_streak_longest,
    habitStreakTarget: row.habit_streak_target,
    recurringGoal: typeof row.recurring_goal === 'string'
      ? JSON.parse(row.recurring_goal)
      : row.recurring_goal,
    debugModeEnabled: row.debug_mode_enabled || false,
    debugModeActivatedAt: row.debug_mode_activated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Map database row to Task object
 */
function mapTaskFromDb(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    goalId: row.goal_id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    requiresApproval: row.requires_approval,
    gtdType: row.gtd_type,
    context: row.context,
    energyLevel: row.energy_level,
    timeEstimate: row.time_estimate,
    dependsOn: typeof row.depends_on === 'string'
      ? JSON.parse(row.depends_on)
      : row.depends_on,
    blockedBy: row.blocked_by,
    dueDate: row.due_datetime,
    scheduledFor: row.scheduled_for,
    completedAt: row.completed_at,
    autoScheduled: row.auto_scheduled,
    createdBy: row.created_by,
    isRecurring: row.is_recurring,
    parentTaskId: row.parent_task_id,
    recurrenceType: row.recurrence_type,
    recurrenceInterval: row.recurrence_interval,
    recurrenceDays: typeof row.recurrence_days === 'string'
      ? JSON.parse(row.recurrence_days)
      : row.recurrence_days,
    recurrenceEndType: row.recurrence_end_type,
    recurrenceEndDate: row.recurrence_end_date,
    recurrenceEndCount: row.recurrence_end_count,
    recurrenceInstancesGenerated: row.recurrence_instances_generated,
    lastInstanceGeneratedAt: row.last_instance_generated_at,
    recurrencePaused: row.recurrence_paused,
    config: typeof row.config === 'string'
      ? JSON.parse(row.config)
      : row.config,
    result: typeof row.result === 'string'
      ? JSON.parse(row.result)
      : row.result,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Map database row to Goal object
 */
function mapGoalFromDb(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    targetValue: row.target_value,
    currentValue: row.current_value,
    unit: row.unit,
    priority: row.priority,
    status: row.status,
    targetDate: row.target_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Map database row to Metric object
 */
function mapMetricFromDb(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    goalId: row.goal_id,
    name: row.name,
    value: parseFloat(row.value),
    unit: row.unit,
    recordedAt: row.recorded_at,
    source: row.source,
    metadata: typeof row.metadata === 'string'
      ? JSON.parse(row.metadata)
      : row.metadata
  };
}

export { mapProjectFromDb, mapTaskFromDb, mapGoalFromDb, mapMetricFromDb };
