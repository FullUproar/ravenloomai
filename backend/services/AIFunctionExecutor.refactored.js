/**
 * AI Function Executor (Refactored)
 *
 * Executes functions called by the AI to perform actions in the system.
 * Includes comprehensive error handling, input validation, and logging.
 *
 * @module AIFunctionExecutor
 */

import { insertOne, updateOne, queryMany } from '../utils/database.js';
import {
  validateId,
  validateOptionalId,
  validateString,
  validateOptionalString,
  validateNumber,
  validateOptionalNumber,
  validateEnum,
  validatePriority,
  validateStatus,
  ValidationError
} from '../utils/validation.js';
import { safeJsonStringify } from '../utils/json.js';
import logger from '../utils/logger.js';
import {
  PRIORITY,
  TASK_STATUS,
  GOAL_STATUS,
  GTD_TYPE,
  CONTEXT,
  ENERGY_LEVEL,
  METRIC_SOURCE,
  VALIDATION
} from '../config/constants.js';
import { mapGoalFromDb } from '../graphql/resolvers/projectResolvers.js';

/**
 * AI Function Executor Class
 *
 * Handles execution of AI function calls with proper validation,
 * error handling, and logging.
 */
class AIFunctionExecutor {
  /**
   * Execute a function call from the AI
   *
   * @param {string} functionName - Name of the function to execute
   * @param {Object} args - Function arguments
   * @param {number} projectId - Current project ID
   * @returns {Promise<Object>} - Result of the function execution with success, data, and message
   * @throws {ValidationError} If inputs are invalid
   * @throws {Error} If function execution fails
   *
   * @example
   * const result = await executor.execute('createGoal', {
   *   title: 'Lose 10 pounds',
   *   targetValue: 10,
   *   unit: 'pounds'
   * }, 123);
   */
  async execute(functionName, args, projectId) {
    logger.aiFunction(functionName, args);

    try {
      // Validate projectId for functions that need it
      if (this._requiresProjectId(functionName)) {
        validateId(projectId, 'projectId');
      }

      // Route to appropriate handler
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

        default:
          throw new Error(`Unknown AI function: ${functionName}`);
      }
    } catch (error) {
      logger.error(`Failed to execute AI function: ${functionName}`, error);

      // Rethrow validation errors as-is for better error messages
      if (error instanceof ValidationError) {
        throw error;
      }

      // Wrap other errors with context
      throw new Error(`Function ${functionName} failed: ${error.message}`);
    }
  }

  /**
   * Create a new goal
   *
   * @param {number} projectId - Project ID
   * @param {Object} args - Goal arguments
   * @param {string} args.title - Goal title (required, 3-200 chars)
   * @param {string} [args.description] - Goal description (optional, max 2000 chars)
   * @param {number} [args.targetValue] - Target numeric value (optional)
   * @param {number} [args.currentValue=0] - Starting value (optional)
   * @param {string} [args.unit] - Unit of measurement (optional)
   * @param {number} [args.priority=2] - Priority 1-3 (optional)
   * @param {string} [args.targetDate] - Target date ISO string (optional)
   * @returns {Promise<Object>} - Success response with created goal
   * @throws {ValidationError} If validation fails
   */
  async createGoal(projectId, args) {
    logger.debug('Creating goal', { projectId, title: args.title });

    // Validate inputs
    validateId(projectId, 'projectId');
    const title = validateString(args.title, 'title', {
      minLength: VALIDATION.TITLE_MIN_LENGTH,
      maxLength: VALIDATION.TITLE_MAX_LENGTH
    });
    const description = validateOptionalString(args.description, 'description', {
      maxLength: VALIDATION.DESCRIPTION_MAX_LENGTH
    });
    const targetValue = validateOptionalNumber(args.targetValue, 'targetValue');
    const currentValue = validateOptionalNumber(args.currentValue, 'currentValue') ?? 0;
    const unit = validateOptionalString(args.unit, 'unit', { maxLength: 50 });
    const priority = args.priority !== undefined
      ? validatePriority(args.priority)
      : PRIORITY.MEDIUM;
    const targetDate = args.targetDate || null;

    // Build query
    const query = `
      INSERT INTO goals (
        project_id, title, description, target_value, current_value,
        unit, priority, status, target_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      projectId,
      title,
      description,
      targetValue,
      currentValue,
      unit,
      priority,
      GOAL_STATUS.ACTIVE,
      targetDate
    ];

    // Execute with error handling
    const goal = await insertOne(query, values, 'Failed to create goal');
    const mappedGoal = mapGoalFromDb(goal);

    logger.info(`Created goal: "${title}"`, { goalId: goal.id });

    return {
      success: true,
      goal: mappedGoal,
      message: `Created goal: ${title}`
    };
  }

  /**
   * Create a new task
   *
   * @param {number} projectId - Project ID
   * @param {Object} args - Task arguments
   * @param {string} args.title - Task title (required, 3-200 chars)
   * @param {string} [args.description] - Task description (optional)
   * @param {number} [args.goalId] - Related goal ID (optional)
   * @param {string} [args.type='manual'] - Task type (optional)
   * @param {number} [args.priority=2] - Priority 1-3 (optional)
   * @param {string} [args.gtdType='next_action'] - GTD type (optional)
   * @param {string} [args.context='@anywhere'] - Task context (optional)
   * @param {string} [args.energyLevel='medium'] - Energy level (optional)
   * @param {number} [args.timeEstimate] - Time in minutes (optional)
   * @param {string} [args.dueDate] - Due date ISO string (optional)
   * @returns {Promise<Object>} - Success response with created task
   * @throws {ValidationError} If validation fails
   */
  async createTask(projectId, args) {
    logger.debug('Creating task', { projectId, title: args.title });

    // Validate inputs
    validateId(projectId, 'projectId');
    const title = validateString(args.title, 'title', {
      minLength: VALIDATION.TITLE_MIN_LENGTH,
      maxLength: VALIDATION.TITLE_MAX_LENGTH
    });
    const description = validateOptionalString(args.description, 'description', {
      maxLength: VALIDATION.DESCRIPTION_MAX_LENGTH
    });
    const goalId = validateOptionalId(args.goalId, 'goalId');
    const type = args.type || 'manual';
    const priority = args.priority !== undefined
      ? validatePriority(args.priority)
      : PRIORITY.MEDIUM;
    const gtdType = args.gtdType
      ? validateEnum(args.gtdType, Object.values(GTD_TYPE), 'gtdType')
      : GTD_TYPE.NEXT_ACTION;
    const context = args.context
      ? validateEnum(args.context, Object.values(CONTEXT), 'context')
      : CONTEXT.ANYWHERE;
    const energyLevel = args.energyLevel
      ? validateEnum(args.energyLevel, Object.values(ENERGY_LEVEL), 'energyLevel')
      : ENERGY_LEVEL.MEDIUM;
    const timeEstimate = validateOptionalNumber(args.timeEstimate, 'timeEstimate', {
      min: VALIDATION.MIN_TIME_ESTIMATE,
      max: VALIDATION.MAX_TIME_ESTIMATE,
      integer: true
    });
    const dueDate = args.dueDate || null;

    // Build query
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
      goalId,
      title,
      description,
      type,
      TASK_STATUS.NOT_STARTED,
      priority,
      'user',
      false,
      dueDate,
      gtdType,
      context,
      energyLevel,
      timeEstimate
    ];

    // Execute with error handling
    const task = await insertOne(query, values, 'Failed to create task');

    logger.info(`Created task: "${title}"`, { taskId: task.id });

    return {
      success: true,
      task,
      message: `Created task: ${title}`
    };
  }

  /**
   * Record a metric value
   *
   * @param {number} projectId - Project ID
   * @param {Object} args - Metric arguments
   * @param {string} args.name - Metric name (required)
   * @param {number} args.value - Metric value (required)
   * @param {string} [args.unit] - Unit of measurement (optional)
   * @param {number} [args.goalId] - Related goal ID (optional)
   * @param {string} [args.source='user_reported'] - Data source (optional)
   * @returns {Promise<Object>} - Success response with recorded metric
   * @throws {ValidationError} If validation fails
   */
  async recordMetric(projectId, args) {
    logger.debug('Recording metric', { projectId, name: args.name, value: args.value });

    // Validate inputs
    validateId(projectId, 'projectId');
    const name = validateString(args.name, 'name', { maxLength: 100 });
    const value = validateNumber(args.value, 'value');
    const unit = validateOptionalString(args.unit, 'unit', { maxLength: 50 });
    const goalId = validateOptionalId(args.goalId, 'goalId');
    const source = args.source
      ? validateEnum(args.source, Object.values(METRIC_SOURCE), 'source')
      : METRIC_SOURCE.USER_REPORTED;

    // Build query
    const query = `
      INSERT INTO metrics (
        project_id, goal_id, name, value, unit, source, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const values = [projectId, goalId, name, value, unit, source];

    // Execute with error handling
    const metric = await insertOne(query, values, 'Failed to record metric');

    logger.info(`Recorded metric: ${name} = ${value} ${unit || ''}`, { metricId: metric.id });

    return {
      success: true,
      metric,
      message: `Recorded ${name}: ${value} ${unit || ''}`
    };
  }

  /**
   * Update goal current value (progress)
   *
   * @param {Object} args - Update arguments
   * @param {number} args.goalId - Goal ID (required)
   * @param {number} args.currentValue - New current value (required)
   * @returns {Promise<Object>} - Success response with updated goal
   * @throws {ValidationError} If validation fails
   * @throws {Error} If goal not found
   */
  async updateGoalProgress(args) {
    logger.debug('Updating goal progress', { goalId: args.goalId, value: args.currentValue });

    // Validate inputs
    const goalId = validateId(args.goalId, 'goalId');
    const currentValue = validateNumber(args.currentValue, 'currentValue');

    // Build query
    const query = `
      UPDATE goals
      SET current_value = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    // Execute with error handling
    const goal = await updateOne(
      query,
      [currentValue, goalId],
      `Goal ${goalId} not found`
    );
    const mappedGoal = mapGoalFromDb(goal);

    logger.info(`Updated goal progress: "${goal.title}" -> ${currentValue}`, { goalId });

    return {
      success: true,
      goal: mappedGoal,
      message: `Updated progress to ${currentValue} ${goal.unit || ''}`
    };
  }

  /**
   * Update task status
   *
   * @param {Object} args - Update arguments
   * @param {number} args.taskId - Task ID (required)
   * @param {string} args.status - New status (required)
   * @param {Object} [args.result] - Task result data (optional)
   * @returns {Promise<Object>} - Success response with updated task
   * @throws {ValidationError} If validation fails
   * @throws {Error} If task not found
   */
  async updateTaskStatus(args) {
    logger.debug('Updating task status', { taskId: args.taskId, status: args.status });

    // Validate inputs
    const taskId = validateId(args.taskId, 'taskId');
    const status = validateStatus(args.status);

    // Build dynamic query
    const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];
    let paramCount = 2;

    // Add completed_at if marking as done
    if (status === TASK_STATUS.DONE) {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    // Add result if provided
    if (args.result) {
      updates.push(`result = $${paramCount}`);
      values.push(safeJsonStringify(args.result));
      paramCount++;
    }

    values.push(taskId);

    const query = `
      UPDATE tasks
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    // Execute with error handling
    const task = await updateOne(query, values, `Task ${taskId} not found`);

    logger.info(`Updated task status: "${task.title}" -> ${status}`, { taskId });

    return {
      success: true,
      task,
      message: `Updated task to ${status}`
    };
  }

  /**
   * Get all goals for a project
   *
   * @param {number} projectId - Project ID
   * @returns {Promise<Object>} - Success response with goals array
   * @throws {ValidationError} If projectId invalid
   */
  async getGoals(projectId) {
    logger.debug('Fetching goals', { projectId });

    validateId(projectId, 'projectId');

    const query = 'SELECT * FROM goals WHERE project_id = $1 ORDER BY priority DESC, created_at DESC';
    const rows = await queryMany(query, [projectId]);
    const goals = rows.map(row => mapGoalFromDb(row));

    logger.debug(`Retrieved ${goals.length} goals`, { projectId });

    return {
      success: true,
      goals,
      count: goals.length
    };
  }

  /**
   * Get tasks for a project
   *
   * @param {number} projectId - Project ID
   * @param {Object} args - Query arguments
   * @param {string} [args.status] - Filter by status (optional)
   * @returns {Promise<Object>} - Success response with tasks array
   * @throws {ValidationError} If inputs invalid
   */
  async getTasks(projectId, args = {}) {
    logger.debug('Fetching tasks', { projectId, status: args.status });

    validateId(projectId, 'projectId');

    let query = 'SELECT * FROM tasks WHERE project_id = $1';
    const values = [projectId];

    if (args.status) {
      const status = validateStatus(args.status);
      query += ' AND status = $2';
      values.push(status);
    }

    query += ' ORDER BY priority, created_at';

    const tasks = await queryMany(query, values);

    logger.debug(`Retrieved ${tasks.length} tasks`, { projectId });

    return {
      success: true,
      tasks,
      count: tasks.length
    };
  }

  /**
   * Get metrics for a project
   *
   * @param {number} projectId - Project ID
   * @param {Object} args - Query arguments
   * @param {number} [args.goalId] - Filter by goal (optional)
   * @param {number} [args.limit=10] - Max metrics to return (optional)
   * @returns {Promise<Object>} - Success response with metrics array
   * @throws {ValidationError} If inputs invalid
   */
  async getMetrics(projectId, args = {}) {
    logger.debug('Fetching metrics', { projectId, goalId: args.goalId });

    validateId(projectId, 'projectId');

    let query = 'SELECT * FROM metrics WHERE project_id = $1';
    const values = [projectId];
    let paramCount = 2;

    if (args.goalId) {
      const goalId = validateId(args.goalId, 'goalId');
      query += ` AND goal_id = $${paramCount}`;
      values.push(goalId);
      paramCount++;
    }

    query += ' ORDER BY recorded_at DESC';

    // Add limit
    const limit = args.limit
      ? validateNumber(args.limit, 'limit', { min: 1, max: 100, integer: true })
      : 10;
    query += ` LIMIT $${paramCount}`;
    values.push(limit);

    const metrics = await queryMany(query, values);

    logger.debug(`Retrieved ${metrics.length} metrics`, { projectId });

    return {
      success: true,
      metrics,
      count: metrics.length
    };
  }

  /**
   * Check if function requires projectId parameter
   *
   * @private
   * @param {string} functionName - Function name
   * @returns {boolean} - True if function needs projectId
   */
  _requiresProjectId(functionName) {
    const needsProjectId = ['createGoal', 'createTask', 'recordMetric', 'getGoals', 'getTasks', 'getMetrics'];
    return needsProjectId.includes(functionName);
  }
}

// Export singleton instance
export default new AIFunctionExecutor();
