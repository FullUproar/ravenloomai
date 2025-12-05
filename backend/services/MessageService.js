/**
 * MessageService - Handles channel messages and AI interactions
 */

import db from '../db.js';
import AIService from './AIService.js';
import KnowledgeService from './KnowledgeService.js';
import AlertService from './AlertService.js';
import TaskService from './TaskService.js';

/**
 * Send a message to a channel and process any AI commands
 */
export async function sendMessage(channelId, userId, content) {
  // Get channel info for team context
  const channelResult = await db.query(
    'SELECT * FROM channels WHERE id = $1',
    [channelId]
  );

  if (channelResult.rows.length === 0) {
    throw new Error('Channel not found');
  }

  const channel = channelResult.rows[0];
  const teamId = channel.team_id;

  // Check if message mentions @raven
  const mentionsAi = content.toLowerCase().includes('@raven');
  const command = mentionsAi ? AIService.parseRavenCommand(content) : null;

  // Save the user's message
  const messageResult = await db.query(
    `INSERT INTO messages (channel_id, user_id, content, is_ai, mentions_ai, ai_command)
     VALUES ($1, $2, $3, false, $4, $5)
     RETURNING *`,
    [channelId, userId, content, mentionsAi, command?.type || null]
  );

  const userMessage = mapMessage(messageResult.rows[0]);

  // If no AI mention, just return the user message
  if (!mentionsAi) {
    return {
      message: userMessage,
      factsCreated: [],
      alertsCreated: [],
      tasksCreated: []
    };
  }

  // Process the AI command
  const aiResponse = await processAICommand(command, teamId, channelId, userId);

  // Save the AI response message
  const aiMessageResult = await db.query(
    `INSERT INTO messages (channel_id, user_id, content, is_ai, mentions_ai, metadata)
     VALUES ($1, NULL, $2, true, false, $3)
     RETURNING *`,
    [channelId, aiResponse.responseText, JSON.stringify(aiResponse.metadata || {})]
  );

  return {
    message: mapMessage(aiMessageResult.rows[0]),
    factsCreated: aiResponse.factsCreated || [],
    alertsCreated: aiResponse.alertsCreated || [],
    tasksCreated: aiResponse.tasksCreated || []
  };
}

/**
 * Process an AI command and return the response
 */
async function processAICommand(command, teamId, channelId, userId) {
  if (!command) {
    return {
      responseText: "I'm here! You can ask me questions, or use commands like:\n• `@raven remember [fact]` - Save information\n• `@raven remind [when] [what]` - Set a reminder\n• `@raven task [description]` - Create a task"
    };
  }

  switch (command.type) {
    case 'remember':
      return handleRemember(command.content, teamId, channelId, userId);

    case 'remind':
      return handleRemind(command.content, teamId, channelId, userId);

    case 'task':
      return handleTask(command.content, teamId, channelId, userId);

    case 'decision':
      return handleDecision(command.content, teamId, userId);

    case 'query':
    default:
      return handleQuery(command.query, teamId, channelId);
  }
}

/**
 * Handle "remember" command
 */
async function handleRemember(content, teamId, channelId, userId) {
  try {
    // Extract structured fact from content
    const extracted = await AIService.extractFact(content);

    // Save the fact
    const fact = await KnowledgeService.createFact(teamId, {
      content: extracted.content,
      category: extracted.category,
      sourceType: 'conversation',
      createdBy: userId
    });

    return {
      responseText: `Got it. Saved: "${extracted.content}" [${extracted.category}]`,
      factsCreated: [fact],
      metadata: { command: 'remember', factId: fact.id }
    };
  } catch (error) {
    console.error('Remember error:', error);
    return {
      responseText: `I had trouble saving that. Error: ${error.message}`
    };
  }
}

/**
 * Handle "remind" command
 */
async function handleRemind(content, teamId, channelId, userId) {
  try {
    // Extract alert details
    const extracted = await AIService.extractAlert(content);

    // Create the alert
    const alert = await AlertService.createAlert(teamId, {
      channelId,
      triggerType: extracted.triggerType,
      triggerAt: extracted.triggerAt,
      recurrenceRule: extracted.recurrenceRule,
      message: extracted.message,
      createdBy: userId
    });

    const dateStr = extracted.triggerAt
      ? new Date(extracted.triggerAt).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
      : 'as scheduled';

    return {
      responseText: `Reminder set for ${dateStr}: "${extracted.message}"`,
      alertsCreated: [alert],
      metadata: { command: 'remind', alertId: alert.id }
    };
  } catch (error) {
    console.error('Remind error:', error);
    return {
      responseText: `I couldn't set that reminder. Try: "@raven remind [date] about [what]"\nError: ${error.message}`
    };
  }
}

/**
 * Handle "task" command
 */
async function handleTask(content, teamId, channelId, userId) {
  try {
    // Extract task details
    const extracted = await AIService.extractTask(content);

    // Create the task
    const task = await TaskService.createTask(teamId, {
      title: extracted.title,
      description: extracted.description,
      priority: extracted.priority,
      dueAt: extracted.dueAt,
      channelId,
      createdBy: userId
    });

    let responseText = `Task created: "${extracted.title}"`;
    if (extracted.priority === 'high' || extracted.priority === 'urgent') {
      responseText += ` [${extracted.priority.toUpperCase()}]`;
    }
    if (extracted.dueAt) {
      responseText += ` (due ${new Date(extracted.dueAt).toLocaleDateString()})`;
    }

    return {
      responseText,
      tasksCreated: [task],
      metadata: { command: 'task', taskId: task.id }
    };
  } catch (error) {
    console.error('Task error:', error);
    return {
      responseText: `I couldn't create that task. Error: ${error.message}`
    };
  }
}

/**
 * Handle "decision" command
 */
async function handleDecision(content, teamId, userId) {
  try {
    // Extract decision details
    const extracted = await AIService.extractDecision(content);

    // Save the decision
    const decision = await KnowledgeService.createDecision(teamId, {
      what: extracted.what,
      why: extracted.why,
      alternatives: extracted.alternatives,
      madeBy: userId,
      sourceType: 'conversation'
    });

    let responseText = `Decision recorded: "${extracted.what}"`;
    if (extracted.why) {
      responseText += `\nReason: ${extracted.why}`;
    }

    return {
      responseText,
      metadata: { command: 'decision', decisionId: decision.id }
    };
  } catch (error) {
    console.error('Decision error:', error);
    return {
      responseText: `I couldn't record that decision. Error: ${error.message}`
    };
  }
}

/**
 * Handle query (question)
 */
async function handleQuery(query, teamId, channelId) {
  try {
    // Get relevant knowledge
    const knowledge = await KnowledgeService.getKnowledgeContext(teamId, query);

    // Get recent conversation history for context
    const historyResult = await db.query(
      `SELECT * FROM messages
       WHERE channel_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [channelId]
    );
    const history = historyResult.rows.reverse().map(mapMessage);

    // Generate AI response
    const response = await AIService.generateResponse(query, knowledge, history);

    return {
      responseText: response,
      metadata: {
        command: 'query',
        factsUsed: knowledge.facts.length,
        decisionsUsed: knowledge.decisions.length
      }
    };
  } catch (error) {
    console.error('Query error:', error);
    return {
      responseText: `I had trouble answering that. Error: ${error.message}`
    };
  }
}

/**
 * Get messages for a channel
 */
export async function getMessages(channelId, { limit = 50, before = null } = {}) {
  let query = `
    SELECT m.*, u.display_name, u.email, u.avatar_url
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
    WHERE m.channel_id = $1
  `;
  const params = [channelId];
  let paramIndex = 2;

  if (before) {
    query += ` AND m.id < $${paramIndex}`;
    params.push(before);
    paramIndex++;
  }

  query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await db.query(query, params);

  // Return in chronological order
  return result.rows.reverse().map(mapMessage);
}

// ============================================================================
// Helper functions
// ============================================================================

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    user: row.display_name ? {
      id: row.user_id,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url
    } : null,
    content: row.content,
    isAi: row.is_ai,
    mentionsAi: row.mentions_ai,
    aiCommand: row.ai_command,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

export default {
  sendMessage,
  getMessages
};
