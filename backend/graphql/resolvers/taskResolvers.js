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
          assigned_to, requires_approval, due_date, gtd_type, context,
          energy_level, time_estimate, config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
        JSON.stringify(input.config || {})
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
      const updates = [];
      const values = [];
      let paramCount = 1;

      const allowedFields = [
        'title', 'description', 'type', 'status', 'priority', 'assigned_to',
        'requires_approval', 'due_date', 'gtd_type', 'context', 'energy_level',
        'time_estimate', 'scheduled_for', 'config'
      ];

      Object.keys(input).forEach(key => {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();

        if (allowedFields.includes(dbKey)) {
          updates.push(`${dbKey} = $${paramCount}`);

          let value = input[key];
          if (key === 'config' && typeof value === 'object') {
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

      const result = await db.query(query, values);

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
    }
  }
};
