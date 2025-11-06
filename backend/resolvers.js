import db from './db.js';
import { ChatLLM } from './llm/chat.js';
import { GraphQLScalarType } from 'graphql';
import { Kind } from 'graphql/language/index.js';

// Helper function to get local timestamp adjusted for Eastern timezone
// This handles both EST (UTC-5) and EDT (UTC-4) automatically
function getLocalTimestamp() {
  const now = new Date();
  // Get the actual local timezone offset (automatically handles EST/EDT)
  const offsetMinutes = now.getTimezoneOffset(); // Minutes behind UTC
  const localTime = new Date(now.getTime() - (offsetMinutes * 60 * 1000));
  return localTime.toISOString();
}

// Custom scalar types
const DateTimeType = new GraphQLScalarType({
  name: 'DateTime',
  serialize: (value) => value instanceof Date ? value.toISOString() : value,
  parseValue: (value) => new Date(value),
  parseLiteral: (ast) => ast.kind === Kind.STRING ? new Date(ast.value) : null,
});

const JSONType = new GraphQLScalarType({
  name: 'JSON',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => {
    switch (ast.kind) {
      case Kind.STRING: return JSON.parse(ast.value);
      case Kind.OBJECT: return parseObject(ast);
      default: return null;
    }
  },
});

function parseLiteral(ast) {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT:
      return parseObject(ast);
    case Kind.LIST:
      return ast.values.map(parseLiteral);
    default:
      return null;
  }
}

function parseObject(ast) {
  const value = Object.create(null);
  ast.fields.forEach((field) => {
    value[field.name.value] = parseLiteral(field.value);
  });
  return value;
}

export default {
  DateTime: DateTimeType,
  JSON: JSONType,

  Query: {
    getProject: async (_, { userId, projectId }) => {
      if (projectId) {
        const result = await db.query(
          'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
          [projectId, userId]
        );
        return result.rows[0];
      } else {
        // Return first project if no projectId specified (for backward compatibility)
        const result = await db.query(
          'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [userId]
        );
        return result.rows[0];
      }
    },

    getProjects: async (_, { userId }) => {
      const result = await db.query(
        'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows;
    },

    getTasks: async (_, { projectId, status }) => {
      let query = 'SELECT * FROM tasks WHERE project_id = $1';
      let params = [projectId];
      
      if (status) {
        query += ' AND status = $2';
        params.push(status);
      }
      
      query += ' ORDER BY priority ASC, created_at ASC';
      
      const result = await db.query(query, params);
      return result.rows;
    },

    getMetrics: async (_, { projectId, goalId, dateFrom, dateTo }) => {
      let query = 'SELECT * FROM metrics WHERE project_id = $1';
      let params = [projectId];
      let paramCount = 1;

      if (goalId) {
        paramCount++;
        query += ` AND goal_id = $${paramCount}`;
        params.push(goalId);
      }

      if (dateFrom) {
        paramCount++;
        query += ` AND recorded_at >= $${paramCount}`;
        params.push(dateFrom);
      }

      if (dateTo) {
        paramCount++;
        query += ` AND recorded_at <= $${paramCount}`;
        params.push(dateTo);
      }

      query += ' ORDER BY recorded_at DESC';

      const result = await db.query(query, params);
      return result.rows;
    },

    getReminders: async (_, { userId, projectId, status }) => {
      let query = 'SELECT * FROM reminders WHERE user_id = $1';
      let params = [userId];
      let paramCount = 1;

      if (projectId) {
        paramCount++;
        query += ` AND project_id = $${paramCount}`;
        params.push(projectId);
      }

      if (status) {
        paramCount++;
        query += ` AND status = $${paramCount}`;
        params.push(status);
      }

      query += ' ORDER BY due_at ASC';

      const result = await db.query(query, params);
      return result.rows;
    },

    getUpcomingReminders: async (_, { userId, limit = 10 }) => {
      const result = await db.query(
        `SELECT * FROM reminders 
         WHERE user_id = $1 
         AND status IN ('pending', 'snoozed') 
         AND (snoozed_until IS NULL OR snoozed_until <= CURRENT_TIMESTAMP)
         AND due_at <= CURRENT_TIMESTAMP + INTERVAL '7 days'
         ORDER BY 
           CASE WHEN due_at <= CURRENT_TIMESTAMP THEN 0 ELSE 1 END,
           due_at ASC
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    },

    getChatMessages: async (_, { userId, projectId }) => {
      const result = await db.query(
        `SELECT * FROM chat_messages
         WHERE user_id = $1 AND project_id = $2
         ORDER BY created_at ASC`,
        [userId, projectId]
      );
      return result.rows;
    },

    // Memory - Episodic & Semantic
    getMemoryContext: async (_, { userId, projectId, currentContext }) => {
      const MemoryService = (await import('./services/MemoryService.js')).default;
      return await MemoryService.getMemoryContext(userId, projectId, currentContext);
    },

    getConversationEpisodes: async (_, { projectId, limit = 10 }) => {
      const result = await db.query(
        `SELECT * FROM conversation_episodes
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [projectId, limit]
      );
      return result.rows.map(row => ({
        id: row.id,
        conversationId: row.conversation_id,
        projectId: row.project_id,
        userId: row.user_id,
        startMessageId: row.start_message_id,
        endMessageId: row.end_message_id,
        messageCount: row.message_count,
        topic: row.topic,
        summary: row.summary,
        keyPoints: typeof row.key_points === 'string' ? JSON.parse(row.key_points) : row.key_points,
        decisionsMade: row.decisions_made,
        emotionsDetected: row.emotions_detected,
        userState: row.user_state,
        createdAt: row.created_at
      }));
    },

    getKnowledgeNodes: async (_, { userId, projectId, nodeTypes }) => {
      let query = `
        SELECT * FROM knowledge_nodes
        WHERE user_id = $1
          AND (project_id = $2 OR project_id IS NULL)
          AND is_active = true
      `;
      const params = [userId, projectId];

      if (nodeTypes && nodeTypes.length > 0) {
        query += ` AND node_type = ANY($3)`;
        params.push(nodeTypes);
      }

      query += ` ORDER BY confidence DESC, last_reinforced_at DESC LIMIT 20`;

      const result = await db.query(query, params);
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        projectId: row.project_id,
        nodeType: row.node_type,
        label: row.label,
        properties: row.properties,
        sourceEpisodeId: row.source_episode_id,
        sourceMessageId: row.source_message_id,
        confidence: parseFloat(row.confidence),
        lastReinforcedAt: row.last_reinforced_at,
        timesMentioned: row.times_mentioned,
        contradictedBy: row.contradicted_by,
        isActive: row.is_active,
        createdAt: row.created_at
      }));
    },

    searchMemory: async (_, { userId, projectId, query }) => {
      const MemoryService = (await import('./services/MemoryService.js')).default;
      return await MemoryService.getMemoryContext(userId, projectId, query);
    }
  },

  Project: {
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
    userId: (parent) => parent.user_id,
    
    goals: async (parent) => {
      const result = await db.query(
        'SELECT * FROM goals WHERE project_id = $1 ORDER BY priority ASC',
        [parent.id]
      );
      return result.rows;
    },

    tasks: async (parent) => {
      const result = await db.query(
        'SELECT * FROM tasks WHERE project_id = $1 ORDER BY priority ASC, created_at ASC',
        [parent.id]
      );
      return result.rows;
    },

    metrics: async (parent) => {
      const result = await db.query(
        'SELECT * FROM metrics WHERE project_id = $1 ORDER BY recorded_at DESC LIMIT 50',
        [parent.id]
      );
      return result.rows;
    }
  },

  Goal: {
    projectId: (parent) => parent.project_id,
    targetValue: (parent) => parent.target_value,
    currentValue: (parent) => parent.current_value,
    targetDate: (parent) => parent.target_date,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
    
    tasks: async (parent) => {
      const result = await db.query(
        'SELECT * FROM tasks WHERE goal_id = $1 ORDER BY priority ASC',
        [parent.id]
      );
      return result.rows;
    },

    metrics: async (parent) => {
      const result = await db.query(
        'SELECT * FROM metrics WHERE goal_id = $1 ORDER BY recorded_at DESC',
        [parent.id]
      );
      return result.rows;
    }
  },

  Task: {
    projectId: (parent) => parent.project_id,
    goalId: (parent) => parent.goal_id,
    assignedTo: (parent) => parent.assigned_to,
    requiresApproval: (parent) => parent.requires_approval,
    dueDate: (parent) => parent.due_datetime,
    completedAt: (parent) => parent.completed_at,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
  },

  Metric: {
    projectId: (parent) => parent.project_id,
    goalId: (parent) => parent.goal_id,
    recordedAt: (parent) => parent.recorded_at,
  },

  Reminder: {
    projectId: (parent) => parent.project_id,
    userId: (parent) => parent.user_id,
    dueAt: (parent) => parent.due_at,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
    isRecurring: (parent) => parent.is_recurring,
    recurrencePattern: (parent) => parent.recurrence_pattern,
    recurrenceInterval: (parent) => parent.recurrence_interval,
    recurrenceDays: (parent) => parent.recurrence_days,
    recurrenceEndDate: (parent) => parent.recurrence_end_date,
    completedAt: (parent) => parent.completed_at,
    snoozedUntil: (parent) => parent.snoozed_until,
    taskId: (parent) => parent.task_id,
    goalId: (parent) => parent.goal_id,
    metricName: (parent) => parent.metric_name,
    notificationMethods: (parent) => parent.notification_methods,
    notificationAdvanceMinutes: (parent) => parent.notification_advance_minutes,
  },

  ChatMessage: {
    projectId: (parent) => parent.project_id,
    userId: (parent) => parent.user_id,
    createdAt: (parent) => parent.created_at,
  },

  Mutation: {
    createProject: async (_, { userId, input }) => {
      const { title, description, domain, config, metadata } = input;
      const result = await db.query(
        `INSERT INTO projects (user_id, title, description, domain, config, metadata)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, title, description, domain, config || {}, metadata || {}]
      );
      return result.rows[0];
    },

    updateProject: async (_, { projectId, input }) => {
      const { title, description, domain, config, metadata } = input;
      const result = await db.query(
        `UPDATE projects SET 
         title = $2, description = $3, domain = $4, config = $5, metadata = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [projectId, title, description, domain, config, metadata]
      );
      return result.rows[0];
    },

    deleteProject: async (_, { projectId }) => {
      await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
      return true;
    },

    createGoal: async (_, { projectId, input }) => {
      const { title, description, targetValue, unit, priority, targetDate } = input;
      const result = await db.query(
        `INSERT INTO goals (project_id, title, description, target_value, unit, priority, target_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [projectId, title, description, targetValue, unit, priority || 2, targetDate]
      );
      return result.rows[0];
    },

    updateGoal: async (_, { goalId, input }) => {
      const { title, description, targetValue, unit, priority, targetDate } = input;
      const result = await db.query(
        `UPDATE goals SET 
         title = $2, description = $3, target_value = $4, unit = $5, priority = $6, target_date = $7, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [goalId, title, description, targetValue, unit, priority, targetDate]
      );
      return result.rows[0];
    },

    deleteGoal: async (_, { goalId }) => {
      await db.query('DELETE FROM goals WHERE id = $1', [goalId]);
      return true;
    },

    createTask: async (_, { projectId, input }) => {
      const { goalId, title, description, type, priority, assignedTo, requiresApproval, dueDate, config } = input;
      const result = await db.query(
        `INSERT INTO tasks (project_id, goal_id, title, description, type, priority, assigned_to, requires_approval, due_datetime, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [projectId, goalId, title, description, type, priority || 2, assignedTo || 'ai', requiresApproval || false, dueDate, config || {}]
      );
      return result.rows[0];
    },

    updateTask: async (_, { taskId, input }) => {
      const { goalId, title, description, type, priority, assignedTo, requiresApproval, dueDate, config } = input;
      const result = await db.query(
        `UPDATE tasks SET
         goal_id = $2, title = $3, description = $4, type = $5, priority = $6, assigned_to = $7, requires_approval = $8, due_datetime = $9, config = $10, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [taskId, goalId, title, description, type, priority, assignedTo, requiresApproval, dueDate, config]
      );
      return result.rows[0];
    },

    updateTaskStatus: async (_, { taskId, status, result }) => {
      const completedAt = status === 'completed' ? new Date() : null;
      const queryResult = await db.query(
        `UPDATE tasks SET 
         status = $2, result = $3, completed_at = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [taskId, status, result || {}, completedAt]
      );
      return queryResult.rows[0];
    },

    deleteTask: async (_, { taskId }) => {
      await db.query('DELETE FROM tasks WHERE id = $1', [taskId]);
      return true;
    },

    recordMetric: async (_, { projectId, input }) => {
      const { goalId, name, value, unit, source, metadata } = input;
      const result = await db.query(
        `INSERT INTO metrics (project_id, goal_id, name, value, unit, source, metadata, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [projectId, goalId, name, value, unit, source || 'manual', metadata || {}, getLocalTimestamp()]
      );
      return result.rows[0];
    },

    updateMetric: async (_, { metricId, input }) => {
      const { goalId, name, value, unit, source, metadata } = input;
      const result = await db.query(
        `UPDATE metrics SET 
         goal_id = $2, name = $3, value = $4, unit = $5, source = $6, metadata = $7
         WHERE id = $1 RETURNING *`,
        [metricId, goalId, name, value, unit, source, metadata]
      );
      return result.rows[0];
    },

    createReminder: async (_, { userId, projectId, input }) => {
      const { 
        title, description, type, dueAt, isRecurring, recurrencePattern, 
        recurrenceInterval, recurrenceDays, recurrenceEndDate, taskId, 
        goalId, metricName, notificationAdvanceMinutes, priority, metadata 
      } = input;
      
      const result = await db.query(
        `INSERT INTO reminders (
          project_id, user_id, title, description, type, due_at, is_recurring,
          recurrence_pattern, recurrence_interval, recurrence_days, recurrence_end_date,
          task_id, goal_id, metric_name, notification_advance_minutes, priority, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
         RETURNING *`,
        [
          projectId, userId, title, description, type, dueAt, isRecurring || false,
          recurrencePattern, recurrenceInterval, recurrenceDays, recurrenceEndDate,
          taskId, goalId, metricName, notificationAdvanceMinutes || 0, priority || 2, metadata || {}
        ]
      );
      return result.rows[0];
    },

    updateReminderStatus: async (_, { reminderId, status }) => {
      const completedAt = status === 'completed' ? new Date() : null;
      const result = await db.query(
        `UPDATE reminders SET 
         status = $2, completed_at = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [reminderId, status, completedAt]
      );
      return result.rows[0];
    },

    snoozeReminder: async (_, { reminderId, snoozeUntil }) => {
      const result = await db.query(
        `UPDATE reminders SET 
         status = 'snoozed', snoozed_until = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [reminderId, snoozeUntil]
      );
      return result.rows[0];
    },

    completeReminder: async (_, { reminderId }) => {
      const result = await db.query(
        `UPDATE reminders SET 
         status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [reminderId]
      );
      
      // If this is a recurring reminder, create the next occurrence
      const reminder = result.rows[0];
      if (reminder.is_recurring) {
        const nextDue = await db.query(
          'SELECT generate_next_reminder_occurrence($1, $2) as next_due',
          [reminderId, reminder.due_at]
        );
        
        if (nextDue.rows[0].next_due) {
          await db.query(
            `INSERT INTO reminders (
              project_id, user_id, title, description, type, due_at, is_recurring,
              recurrence_pattern, recurrence_interval, recurrence_days, recurrence_end_date,
              task_id, goal_id, metric_name, notification_advance_minutes, priority, metadata
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
              reminder.project_id, reminder.user_id, reminder.title, reminder.description,
              reminder.type, nextDue.rows[0].next_due, reminder.is_recurring,
              reminder.recurrence_pattern, reminder.recurrence_interval, reminder.recurrence_days,
              reminder.recurrence_end_date, reminder.task_id, reminder.goal_id, reminder.metric_name,
              reminder.notification_advance_minutes, reminder.priority, reminder.metadata
            ]
          );
        }
      }
      
      return result.rows[0];
    },

    executeTask: async (_, { taskId }) => {
      // Get task details
      const taskResult = await db.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      const task = taskResult.rows[0];
      
      if (!task) throw new Error('Task not found');
      
      // Mark task as in progress
      await db.query(
        'UPDATE tasks SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [taskId, 'in_progress']
      );

      // TODO: Implement actual task execution logic based on task.type
      // For now, just simulate completion
      const result = { 
        executed_at: new Date().toISOString(),
        type: task.type,
        success: true 
      };

      // Mark as completed
      const updatedResult = await db.query(
        `UPDATE tasks SET 
         status = $2, result = $3, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [taskId, 'completed', result]
      );

      return updatedResult.rows[0];
    },

    chat: async (_, { userId, projectId, message }) => {
      let projectData = null;
      
      if (projectId) {
        const projectResult = await db.query('SELECT * FROM projects WHERE id = $1', [projectId]);
        projectData = projectResult.rows[0];
      } else {
        // Get the most recent project for backward compatibility
        const projectResult = await db.query(
          'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [userId]
        );
        projectData = projectResult.rows[0];
        projectId = projectData?.id;
      }

      if (!projectData) {
        throw new Error('No project found');
      }

      // Get recent conversation history (last 20 messages)
      const historyResult = await db.query(
        `SELECT role, content, metadata FROM chat_messages 
         WHERE project_id = $1 AND user_id = $2 
         ORDER BY created_at DESC LIMIT 20`,
        [projectId, userId]
      );
      
      const conversationHistory = historyResult.rows.reverse(); // Reverse to get chronological order

      // Store the user's message
      await db.query(
        `INSERT INTO chat_messages (project_id, user_id, role, content, created_at)
         VALUES ($1, $2, 'user', $3, CURRENT_TIMESTAMP)`,
        [projectId, userId, message]
      );

      const llm = new ChatLLM(process.env.OPENAI_API_KEY);
      const aiResponse = await llm.getResponse(projectData, message, conversationHistory);
      
      console.log('AI Response:', JSON.stringify(aiResponse, null, 2));
      
      let suggestedTasks = [];
      let suggestedMetrics = [];
      let suggestedGoals = [];
      
      // Execute suggested actions
      if (aiResponse.suggestedActions) {
        for (const action of aiResponse.suggestedActions) {
          try {
            switch (action.type) {
              case 'create_goal':
                const goalResult = await db.query(
                  `INSERT INTO goals (project_id, title, description, target_value, unit, priority, target_date)
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                  [projectId, action.data.title, action.data.description, action.data.targetValue, 
                   action.data.unit, action.data.priority || 2, action.data.targetDate]
                );
                suggestedGoals.push(goalResult.rows[0]);
                break;
                
              case 'record_metric':
                // Use user-specified timestamp or current time
                const timestamp = action.data.recordedAt || getLocalTimestamp();
                await db.query(
                  `INSERT INTO metrics (project_id, goal_id, name, value, unit, source, recorded_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                  [projectId, action.data.goalId, action.data.name, action.data.value, 
                   action.data.unit, 'ai_chat', timestamp]
                );
                suggestedMetrics.push(action.data);
                break;
                
              case 'get_recent_metrics':
                // Get recent metrics for the AI to reference
                const metricsQuery = action.data.metricName 
                  ? 'SELECT * FROM metrics WHERE project_id = $1 AND name ILIKE $2 ORDER BY recorded_at DESC LIMIT $3'
                  : 'SELECT * FROM metrics WHERE project_id = $1 ORDER BY recorded_at DESC LIMIT $2';
                const metricsParams = action.data.metricName 
                  ? [projectId, `%${action.data.metricName}%`, action.data.limit || 10]
                  : [projectId, action.data.limit || 10];
                
                const metricsResult = await db.query(metricsQuery, metricsParams);
                const metrics = metricsResult.rows.map(m => ({
                  id: m.id,
                  name: m.name,
                  value: m.value,
                  unit: m.unit,
                  recordedAt: m.recorded_at,
                  source: m.source
                }));
                
                // Add to response but don't count as an executed action
                replyText += `\n\n📊 Recent metrics:\n${metrics.map(m => 
                  `• ID ${m.id}: ${m.name} = ${m.value} ${m.unit || ''} (${new Date(m.recordedAt).toLocaleString()})`
                ).join('\n')}`;
                break;
                
              case 'update_metric':
                // Update existing metric with new data
                const updateTimestamp = action.data.recordedAt || getLocalTimestamp();
                await db.query(
                  `UPDATE metrics SET 
                   goal_id = $2, name = $3, value = $4, unit = $5, source = $6, recorded_at = $7
                   WHERE id = $1`,
                  [action.data.metricId, action.data.goalId, action.data.name, action.data.value, 
                   action.data.unit, 'ai_chat', updateTimestamp]
                );
                suggestedMetrics.push({...action.data, updated: true});
                break;
                
              case 'create_task':
                // Block task creation for ALL projects when related to data operations
                if (action.data.title?.toLowerCase().includes('update') ||
                    action.data.title?.toLowerCase().includes('record') ||
                    action.data.title?.toLowerCase().includes('calorie') ||
                    action.data.title?.toLowerCase().includes('metric') ||
                    action.data.title?.toLowerCase().includes('fix') ||
                    action.data.title?.toLowerCase().includes('correct') ||
                    action.data.title?.toLowerCase().includes('change') ||
                    action.data.description?.toLowerCase().includes('update') ||
                    action.data.description?.toLowerCase().includes('record') ||
                    action.data.description?.toLowerCase().includes('metric')) {
                  console.log('Blocked data operation task creation:', action.data.title);
                  break;
                }
                
                const taskResult = await db.query(
                  `INSERT INTO tasks (project_id, goal_id, title, description, type, priority, assigned_to)
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                  [projectId, action.data.goalId, action.data.title, action.data.description,
                   action.data.type, action.data.priority || 2, 'user']
                );
                suggestedTasks.push({
                  title: action.data.title,
                  description: action.data.description,
                  type: action.data.type
                });
                break;
            }
          } catch (error) {
            console.error('Error executing AI action:', error);
          }
        }
      }
      
      let replyText = typeof aiResponse === 'string' ? aiResponse : (aiResponse.reply || 'I had trouble processing that request.');
      
      // Add confirmation messages for executed actions
      if (suggestedGoals.length > 0) {
        replyText += `\n\n✅ Created ${suggestedGoals.length} goal(s): ${suggestedGoals.map(g => g.title).join(', ')}`;
      }
      if (suggestedMetrics.length > 0) {
        replyText += `\n\n📊 Recorded ${suggestedMetrics.length} metric(s): ${suggestedMetrics.map(m => `${m.name} = ${m.value} ${m.unit || ''}`).join(', ')}`;
      }
      if (suggestedTasks.length > 0) {
        replyText += `\n\n📋 Created ${suggestedTasks.length} task(s): ${suggestedTasks.map(t => t.title).join(', ')}`;
      }
      
      // Store the assistant's response with any actions taken
      const responseMetadata = {
        actionsExecuted: {
          goals: suggestedGoals.length,
          metrics: suggestedMetrics.length,
          tasks: suggestedTasks.length
        },
        functionCalls: aiResponse.suggestedActions || []
      };

      await db.query(
        `INSERT INTO chat_messages (project_id, user_id, role, content, metadata, created_at)
         VALUES ($1, $2, 'assistant', $3, $4, CURRENT_TIMESTAMP)`,
        [projectId, userId, replyText, responseMetadata]
      );

      return { 
        reply: replyText,
        suggestedTasks,
        suggestedMetrics: suggestedMetrics.map(m => ({
          name: m.name,
          value: m.value,
          unit: m.unit
        }))
      };
    },

    clearChatHistory: async (_, { userId, projectId }) => {
      await db.query(
        'DELETE FROM chat_messages WHERE user_id = $1 AND project_id = $2',
        [userId, projectId]
      );
      return true;
    },

    // Memory - Episodic & Semantic
    triggerEpisodeSummarization: async (_, { conversationId }) => {
      const MemoryService = (await import('./services/MemoryService.js')).default;
      const episode = await MemoryService.createEpisodeSummary(conversationId);

      if (!episode) {
        throw new Error('No new messages to summarize');
      }

      // Automatically extract facts from episode
      await MemoryService.extractKnowledgeFacts(conversationId, episode.id);

      return episode;
    },

    extractKnowledgeFacts: async (_, { conversationId, episodeId }) => {
      const MemoryService = (await import('./services/MemoryService.js')).default;
      return await MemoryService.extractKnowledgeFacts(conversationId, episodeId);
    }
  }
};