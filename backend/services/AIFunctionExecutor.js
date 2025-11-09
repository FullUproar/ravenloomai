/**
 * AI Function Executor
 *
 * Executes functions called by the AI to perform actions in the system.
 */

import db from '../db.js';
import { mapGoalFromDb } from '../graphql/resolvers/projectResolvers.js';

class AIFunctionExecutor {
  /**
   * Execute a function call from the AI
   *
   * @param {string} functionName - Name of the function to execute
   * @param {Object} args - Function arguments
   * @param {number} projectId - Current project ID
   * @returns {Promise<Object>} - Result of the function execution
   */
  async execute(functionName, args, projectId) {
    console.log(`🤖 [AI Function] Executing: ${functionName}`, args);

    try {
      switch (functionName) {
        case 'createGoal':
          return await this.createGoal(projectId, args);
        case 'createTask':
          return await this.createTask(projectId, args);
        case 'recordMetric':
          return await this.recordMetric(projectId, args);
        case 'updateGoalProgress':
          return await this.updateGoalProgress(args);
        case 'updateTaskStatus':
          return await this.updateTaskStatus(args);
        case 'getGoals':
          return await this.getGoals(projectId);
        case 'getTasks':
          return await this.getTasks(projectId, args);
        case 'getMetrics':
          return await this.getMetrics(projectId, args);
        case 'highlightUIElement':
          return await this.highlightUIElement(args);
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
    } catch (error) {
      console.error(`❌ [AI Function] Error executing ${functionName}:`, error);
      throw error;
    }
  }

  /**
   * Create a new goal
   */
  async createGoal(projectId, args) {
    const query = `
      INSERT INTO goals (
        project_id, title, description, target_value, current_value,
        unit, priority, status, target_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      projectId,
      args.title,
      args.description || null,
      args.targetValue || null,
      args.currentValue || 0,
      args.unit || null,
      args.priority || 2,
      'active',
      args.targetDate || null
    ];

    const result = await db.query(query, values);

    console.log(`✅ [AI Function] Created goal: "${args.title}"`);

    return {
      success: true,
      goal: mapGoalFromDb(result.rows[0]),
      message: `Created goal: ${args.title}`
    };
  }

  /**
   * Create a new task
   */
  async createTask(projectId, args) {
    const query = `
      INSERT INTO tasks (
        project_id, goal_id, title, description, type, status, priority,
        assigned_to, requires_approval, due_datetime, gtd_type, context,
        energy_level, time_estimate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      projectId,
      args.goalId || null,
      args.title,
      args.description || null,
      args.type || 'manual',
      'not_started',
      args.priority || 2,
      'user',
      args.requiresApproval || false,
      args.dueDate || null,
      args.gtdType || 'next_action',
      args.context || '@anywhere',
      args.energyLevel || 'medium',
      args.timeEstimate || null
    ];

    const result = await db.query(query, values);

    console.log(`✅ [AI Function] Created task: "${args.title}"`);

    return {
      success: true,
      task: result.rows[0],
      message: `Created task: ${args.title}`
    };
  }

  /**
   * Record a metric
   */
  async recordMetric(projectId, args) {
    const query = `
      INSERT INTO metrics (
        project_id, goal_id, name, value, unit, source, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const values = [
      projectId,
      args.goalId || null,
      args.name,
      args.value,
      args.unit || null,
      args.source || 'user_reported'
    ];

    const result = await db.query(query, values);

    console.log(`📊 [AI Function] Recorded metric: ${args.name} = ${args.value} ${args.unit || ''}`);

    return {
      success: true,
      metric: result.rows[0],
      message: `Recorded ${args.name}: ${args.value} ${args.unit || ''}`
    };
  }

  /**
   * Update goal progress
   */
  async updateGoalProgress(args) {
    const query = `
      UPDATE goals
      SET current_value = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(query, [args.currentValue, args.goalId]);

    if (result.rows.length === 0) {
      throw new Error(`Goal not found: ${args.goalId}`);
    }

    const goal = result.rows[0];

    console.log(`📈 [AI Function] Updated goal progress: "${goal.title}" -> ${args.currentValue}`);

    return {
      success: true,
      goal: mapGoalFromDb(goal),
      message: `Updated progress to ${args.currentValue} ${goal.unit || ''}`
    };
  }

  /**
   * Update task status
   */
  async updateTaskStatus(args) {
    const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [args.status];
    let paramCount = 2;

    if (args.status === 'done') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (args.result) {
      updates.push(`result = $${paramCount}`);
      values.push(JSON.stringify(args.result));
      paramCount++;
    }

    values.push(args.taskId);

    const query = `
      UPDATE tasks
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error(`Task not found: ${args.taskId}`);
    }

    const task = result.rows[0];

    console.log(`✅ [AI Function] Updated task status: "${task.title}" -> ${args.status}`);

    return {
      success: true,
      task: task,
      message: `Updated task to ${args.status}`
    };
  }

  /**
   * Get all goals for project
   */
  async getGoals(projectId) {
    const result = await db.query(
      'SELECT * FROM goals WHERE project_id = $1 ORDER BY priority DESC, created_at DESC',
      [projectId]
    );

    const goals = result.rows.map(row => mapGoalFromDb(row));

    console.log(`📋 [AI Function] Retrieved ${goals.length} goals`);

    return {
      success: true,
      goals: goals,
      count: goals.length
    };
  }

  /**
   * Get tasks for project
   */
  async getTasks(projectId, args) {
    let query = 'SELECT * FROM tasks WHERE project_id = $1';
    const values = [projectId];

    if (args.status) {
      query += ' AND status = $2';
      values.push(args.status);
    }

    query += ' ORDER BY priority, created_at';

    const result = await db.query(query, values);

    console.log(`📋 [AI Function] Retrieved ${result.rows.length} tasks`);

    return {
      success: true,
      tasks: result.rows,
      count: result.rows.length
    };
  }

  /**
   * Get metrics
   */
  async getMetrics(projectId, args) {
    let query = 'SELECT * FROM metrics WHERE project_id = $1';
    const values = [projectId];
    let paramCount = 2;

    if (args.goalId) {
      query += ` AND goal_id = $${paramCount}`;
      values.push(args.goalId);
      paramCount++;
    }

    query += ' ORDER BY recorded_at DESC';

    if (args.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(args.limit);
    } else {
      query += ' LIMIT 10';
    }

    const result = await db.query(query, values);

    console.log(`📊 [AI Function] Retrieved ${result.rows.length} metrics`);

    return {
      success: true,
      metrics: result.rows,
      count: result.rows.length
    };
  }

  /**
   * Highlight a UI element for the user
   * This returns metadata that the frontend will use to trigger the highlight
   */
  async highlightUIElement(args) {
    console.log(`💡 [AI Function] Highlighting UI element: ${args.elementId}`);

    // Return metadata that will be sent to frontend
    // The frontend will receive this and call window.aiHighlight()
    return {
      success: true,
      highlight: {
        elementId: args.elementId,
        message: args.message,
        duration: args.duration || 10000
      },
      message: `Highlighting ${args.elementId}`
    };
  }
}

export default new AIFunctionExecutor();
