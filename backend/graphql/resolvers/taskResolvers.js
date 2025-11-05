/**
 * Task GraphQL Resolvers
 */

import db from '../../db.js';
import { mapTaskFromDb } from './projectResolvers.js';

export default {
  Query: {
    /**
     * Get tasks for a project
     */
    getTasks: async (_, { projectId, status }) => {
      let query = `
        SELECT * FROM tasks
        WHERE project_id = $1
      `;

      const values = [projectId];

      if (status) {
        query += ' AND status = $2';
        values.push(status);
      }

      query += ' ORDER BY priority, created_at';

      const result = await db.query(query, values);

      return result.rows.map(row => mapTaskFromDb(row));
    }
  },

  Mutation: {
    /**
     * Create task
     */
    createTask: async (_, { projectId, input }) => {
      const query = `
        INSERT INTO tasks (
          project_id, goal_id, title, description, type, status, priority,
          assigned_to, requires_approval, due_datetime, gtd_type, context,
          energy_level, time_estimate, config,
          is_recurring, recurrence_type, recurrence_interval, recurrence_days,
          recurrence_end_type, recurrence_end_date, recurrence_end_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING *
      `;

      const values = [
        projectId,
        input.goalId || null,
        input.title,
        input.description || null,
        input.type,
        'not_started',
        input.priority || 3,
        input.assignedTo || 'user',
        input.requiresApproval || false,
        input.dueDate || null,
        input.gtdType || 'next_action',
        input.context || null,
        input.energyLevel || null,
        input.timeEstimate || null,
        JSON.stringify(input.config || {}),
        input.isRecurring || false,
        input.recurrenceType || null,
        input.recurrenceInterval || 1,
        input.recurrenceDays ? JSON.stringify(input.recurrenceDays) : null,
        input.recurrenceEndType || 'never',
        input.recurrenceEndDate || null,
        input.recurrenceEndCount || null
      ];

      const result = await db.query(query, values);

      // Update project activity timestamp
      await db.query(
        'UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1',
        [projectId]
      );

      return mapTaskFromDb(result.rows[0]);
    },

    /**
     * Update task
     */
    updateTask: async (_, { taskId, input }) => {
      console.log('📝 [updateTask] Received:', { taskId, input });

      const updates = [];
      const values = [];
      let paramCount = 1;

      const allowedFields = [
        'title', 'description', 'type', 'status', 'priority', 'assigned_to',
        'requires_approval', 'due_datetime', 'gtd_type', 'context', 'energy_level',
        'time_estimate', 'scheduled_for', 'config',
        'is_recurring', 'recurrence_type', 'recurrence_interval', 'recurrence_days',
        'recurrence_end_type', 'recurrence_end_date', 'recurrence_end_count'
      ];

      Object.keys(input).forEach(key => {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();

        if (allowedFields.includes(dbKey)) {
          updates.push(`${dbKey} = $${paramCount}`);

          let value = input[key];
          if (key === 'config' && typeof value === 'object') {
            value = JSON.stringify(value);
          }
          if (key === 'recurrenceDays' && Array.isArray(value)) {
            value = JSON.stringify(value);
          }

          values.push(value);
          paramCount++;
        }
      });

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(taskId);

      const query = `
        UPDATE tasks
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      console.log('🔍 [updateTask] Query:', query);
      console.log('🔍 [updateTask] Values:', values);

      const result = await db.query(query, values);
      console.log('✅ [updateTask] Updated rows:', result.rowCount);

      if (result.rows.length === 0) {
        throw new Error('Task not found');
      }

      // Update project activity
      const task = result.rows[0];
      await db.query(
        'UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1',
        [task.project_id]
      );

      return mapTaskFromDb(task);
    },

    /**
     * Update task status
     */
    updateTaskStatus: async (_, { taskId, status, result }) => {
      const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
      const values = [status];
      let paramCount = 2;

      if (status === 'done') {
        updates.push('completed_at = CURRENT_TIMESTAMP');
      }

      if (result) {
        updates.push(`result = $${paramCount}`);
        values.push(JSON.stringify(result));
        paramCount++;
      }

      values.push(taskId);

      const query = `
        UPDATE tasks
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const queryResult = await db.query(query, values);

      if (queryResult.rows.length === 0) {
        throw new Error('Task not found');
      }

      // Update project activity
      const task = queryResult.rows[0];
      await db.query(
        'UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1',
        [task.project_id]
      );

      return mapTaskFromDb(task);
    },

    /**
     * Delete task
     */
    deleteTask: async (_, { taskId }) => {
      const query = 'DELETE FROM tasks WHERE id = $1';
      const result = await db.query(query, [taskId]);

      return result.rowCount > 0;
    },

    /**
     * Generate instances for a recurring task
     * Creates task instances for the next N occurrences
     */
    generateRecurringTaskInstances: async (_, { taskId }) => {
      // Get the recurring task template
      const templateResult = await db.query(
        'SELECT * FROM tasks WHERE id = $1 AND is_recurring = true',
        [taskId]
      );

      if (templateResult.rows.length === 0) {
        throw new Error('Recurring task not found');
      }

      const template = templateResult.rows[0];
      const instances = [];
      const now = new Date();

      // Calculate next instances based on recurrence pattern
      const nextDates = calculateNextOccurrences(template, now, 10); // Generate next 10 instances

      for (const dueDate of nextDates) {
        const query = `
          INSERT INTO tasks (
            project_id, goal_id, title, description, type, status, priority,
            assigned_to, requires_approval, due_datetime, gtd_type, context,
            energy_level, time_estimate, config, parent_task_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING *
        `;

        const values = [
          template.project_id,
          template.goal_id,
          template.title,
          template.description,
          template.type,
          'not_started',
          template.priority,
          template.assigned_to,
          template.requires_approval,
          dueDate,
          template.gtd_type,
          template.context,
          template.energy_level,
          template.time_estimate,
          template.config,
          taskId // Link back to parent recurring task
        ];

        const result = await db.query(query, values);
        instances.push(mapTaskFromDb(result.rows[0]));
      }

      // Update the recurring task with generation stats
      await db.query(
        `UPDATE tasks
         SET recurrence_instances_generated = recurrence_instances_generated + $1,
             last_instance_generated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [instances.length, taskId]
      );

      return instances;
    },

    /**
     * Update recurring task settings
     */
    updateRecurringTask: async (_, { taskId, input }) => {
      const updates = [];
      const values = [];
      let paramCount = 1;

      const fieldMap = {
        recurrenceType: 'recurrence_type',
        recurrenceInterval: 'recurrence_interval',
        recurrenceDays: 'recurrence_days',
        recurrenceEndType: 'recurrence_end_type',
        recurrenceEndDate: 'recurrence_end_date',
        recurrenceEndCount: 'recurrence_end_count'
      };

      Object.keys(input).forEach(key => {
        const dbKey = fieldMap[key];
        if (dbKey) {
          updates.push(`${dbKey} = $${paramCount}`);

          let value = input[key];
          if (key === 'recurrenceDays' && Array.isArray(value)) {
            value = JSON.stringify(value);
          }

          values.push(value);
          paramCount++;
        }
      });

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(taskId);

      const query = `
        UPDATE tasks
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount} AND is_recurring = true
        RETURNING *
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Recurring task not found');
      }

      return mapTaskFromDb(result.rows[0]);
    },

    /**
     * Pause a recurring task (stop generating new instances)
     */
    pauseRecurringTask: async (_, { taskId }) => {
      const result = await db.query(
        `UPDATE tasks
         SET recurrence_paused = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND is_recurring = true
         RETURNING *`,
        [taskId]
      );

      if (result.rows.length === 0) {
        throw new Error('Recurring task not found');
      }

      return mapTaskFromDb(result.rows[0]);
    },

    /**
     * Resume a paused recurring task
     */
    resumeRecurringTask: async (_, { taskId }) => {
      const result = await db.query(
        `UPDATE tasks
         SET recurrence_paused = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND is_recurring = true
         RETURNING *`,
        [taskId]
      );

      if (result.rows.length === 0) {
        throw new Error('Recurring task not found');
      }

      return mapTaskFromDb(result.rows[0]);
    }
  }
};

/**
 * Calculate next N occurrences for a recurring task
 */
function calculateNextOccurrences(template, startDate, count = 10) {
  const dates = [];
  let currentDate = new Date(startDate);
  const interval = template.recurrence_interval || 1;
  const recurrenceDays = template.recurrence_days ? JSON.parse(template.recurrence_days) : [];

  switch (template.recurrence_type) {
    case 'daily':
      for (let i = 0; i < count; i++) {
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + interval);

        if (shouldStopGenerating(template, currentDate, i)) break;
        dates.push(new Date(currentDate));
      }
      break;

    case 'weekly':
      // Generate for specific days of week
      let weekCount = 0;
      while (dates.length < count) {
        const weekStart = new Date(currentDate);
        weekStart.setDate(weekStart.getDate() + (weekCount * interval * 7));

        // For each day in recurrenceDays
        for (const dayOfWeek of recurrenceDays.sort()) {
          const date = new Date(weekStart);
          const currentDay = date.getDay() || 7; // Convert Sunday (0) to 7
          const daysToAdd = dayOfWeek - currentDay;
          date.setDate(date.getDate() + daysToAdd);

          if (date > currentDate && !shouldStopGenerating(template, date, dates.length)) {
            dates.push(new Date(date));
            if (dates.length >= count) break;
          }
        }

        weekCount++;
        if (weekCount > 100) break; // Safety limit
      }
      break;

    case 'monthly':
      for (let i = 0; i < count; i++) {
        currentDate = new Date(currentDate);
        currentDate.setMonth(currentDate.getMonth() + interval);

        if (shouldStopGenerating(template, currentDate, i)) break;
        dates.push(new Date(currentDate));
      }
      break;

    case 'yearly':
      for (let i = 0; i < count; i++) {
        currentDate = new Date(currentDate);
        currentDate.setFullYear(currentDate.getFullYear() + interval);

        if (shouldStopGenerating(template, currentDate, i)) break;
        dates.push(new Date(currentDate));
      }
      break;
  }

  return dates;
}

/**
 * Check if we should stop generating instances
 */
function shouldStopGenerating(template, date, instanceCount) {
  if (template.recurrence_end_type === 'after_date' && template.recurrence_end_date) {
    if (date > new Date(template.recurrence_end_date)) {
      return true;
    }
  }

  if (template.recurrence_end_type === 'after_count' && template.recurrence_end_count) {
    if (instanceCount >= template.recurrence_end_count) {
      return true;
    }
  }

  return false;
}
