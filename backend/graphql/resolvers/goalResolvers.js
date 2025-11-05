/**
 * Goal GraphQL Resolvers
 */

import db from '../../db.js';

/**
 * Map database row to GraphQL Goal type
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

export default {
  Query: {
    /**
     * Get all goals for a project
     */
    getGoals: async (_, { projectId }) => {
      const result = await db.query(
        'SELECT * FROM goals WHERE project_id = $1 ORDER BY priority DESC, created_at DESC',
        [projectId]
      );

      return result.rows.map(row => mapGoalFromDb(row));
    },

    /**
     * Get a single goal by ID
     */
    getGoal: async (_, { goalId }) => {
      const result = await db.query(
        'SELECT * FROM goals WHERE id = $1',
        [goalId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapGoalFromDb(result.rows[0]);
    }
  },

  Mutation: {
    /**
     * Create a new goal
     */
    createGoal: async (_, { projectId, input }) => {
      const query = `
        INSERT INTO goals (
          project_id, title, description, target_value, current_value,
          unit, priority, status, target_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        projectId,
        input.title,
        input.description || null,
        input.targetValue || null,
        input.currentValue || 0,
        input.unit || null,
        input.priority || 3,
        input.status || 'active',
        input.targetDate || null
      ];

      const result = await db.query(query, values);

      // Update project activity timestamp
      await db.query(
        'UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1',
        [projectId]
      );

      return mapGoalFromDb(result.rows[0]);
    },

    /**
     * Update a goal
     */
    updateGoal: async (_, { goalId, input }) => {
      const updates = [];
      const values = [];
      let paramCount = 1;

      const fieldMap = {
        title: 'title',
        description: 'description',
        targetValue: 'target_value',
        currentValue: 'current_value',
        unit: 'unit',
        priority: 'priority',
        status: 'status',
        targetDate: 'target_date'
      };

      Object.keys(input).forEach(key => {
        const dbKey = fieldMap[key];
        if (dbKey) {
          updates.push(`${dbKey} = $${paramCount}`);
          values.push(input[key]);
          paramCount++;
        }
      });

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(goalId);

      const query = `
        UPDATE goals
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Goal not found');
      }

      // Update project activity
      const goal = result.rows[0];
      await db.query(
        'UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1',
        [goal.project_id]
      );

      return mapGoalFromDb(goal);
    },

    /**
     * Update goal progress
     */
    updateGoalProgress: async (_, { goalId, currentValue }) => {
      const result = await db.query(
        `UPDATE goals
         SET current_value = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [currentValue, goalId]
      );

      if (result.rows.length === 0) {
        throw new Error('Goal not found');
      }

      const goal = result.rows[0];

      // Update project activity
      await db.query(
        'UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1',
        [goal.project_id]
      );

      return mapGoalFromDb(goal);
    },

    /**
     * Delete a goal
     */
    deleteGoal: async (_, { goalId }) => {
      const result = await db.query(
        'DELETE FROM goals WHERE id = $1',
        [goalId]
      );

      return result.rowCount > 0;
    }
  },

  Goal: {
    /**
     * Get metrics for a goal
     */
    metrics: async (parent) => {
      const result = await db.query(
        `SELECT * FROM metrics
         WHERE goal_id = $1
         ORDER BY recorded_at DESC`,
        [parent.id]
      );

      return result.rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        goalId: row.goal_id,
        name: row.name,
        value: row.value,
        unit: row.unit,
        recordedAt: row.recorded_at,
        source: row.source,
        metadata: row.metadata
      }));
    }
  }
};
