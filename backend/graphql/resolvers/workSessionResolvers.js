/**
 * Work Session GraphQL Resolvers
 */

import db from '../../db.js';
import { generateSimpleResponse } from '../../utils/llm.js';
import ActivityTrackingService from '../../services/ActivityTrackingService.js';

/**
 * Generate AI summary for a completed work session
 *
 * Analyzes messages from the session period and creates a concise summary
 */
async function generateSessionSummary(session) {
  try {
    // Get messages from the session's conversation during the session time period
    if (!session.conversation_id) {
      console.log(`⚠️  [WorkSession] No conversation linked to session ${session.id}`);
      return;
    }

    const messagesResult = await db.query(
      `SELECT content, sender_type, created_at
       FROM messages
       WHERE conversation_id = $1
         AND created_at >= $2
         AND created_at <= $3
       ORDER BY created_at ASC`,
      [session.conversation_id, session.started_at, session.ended_at || new Date()]
    );

    const messages = messagesResult.rows;

    if (messages.length === 0) {
      console.log(`⚠️  [WorkSession] No messages found for session ${session.id}`);
      return;
    }

    // Format messages for context
    const conversationText = messages
      .map(msg => `${msg.sender_type === 'user' ? 'User' : 'AI'}: ${msg.content}`)
      .join('\n\n');

    // Generate summary using AI
    const systemPrompt = `You are summarizing a work session. Create a brief, actionable summary (2-3 sentences) of what was accomplished, discussed, or decided. Focus on outcomes and key points.`;

    const userPrompt = `Summarize this work session:\n\n${conversationText}\n\nProvide a concise summary of the session's key accomplishments and outcomes.`;

    const summary = await generateSimpleResponse(userPrompt, systemPrompt, {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 200
    });

    // Update session with generated summary
    await db.query(
      'UPDATE work_sessions SET summary = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [summary.trim(), session.id]
    );

    console.log(`📝 [WorkSession] Generated summary for session ${session.id}`);
  } catch (error) {
    console.error(`❌ [WorkSession] Error generating summary for session ${session.id}:`, error);
    throw error;
  }
}

export default {
  Query: {
    /**
     * Get work sessions for a project
     */
    getWorkSessions: async (_, { projectId, userId, limit = 20 }) => {
      const result = await db.query(
        `SELECT * FROM work_sessions
         WHERE project_id = $1 AND user_id = $2
         ORDER BY started_at DESC
         LIMIT $3`,
        [projectId, userId, limit]
      );
      return result.rows;
    },

    /**
     * Get active work session (if any)
     */
    getActiveWorkSession: async (_, { projectId, userId }) => {
      const result = await db.query(
        `SELECT * FROM work_sessions
         WHERE project_id = $1 AND user_id = $2 AND status = 'active'
         ORDER BY started_at DESC
         LIMIT 1`,
        [projectId, userId]
      );
      return result.rows[0] || null;
    },

    /**
     * Get specific work session
     */
    getWorkSession: async (_, { sessionId }) => {
      const result = await db.query(
        'SELECT * FROM work_sessions WHERE id = $1',
        [sessionId]
      );
      return result.rows[0];
    }
  },

  Mutation: {
    /**
     * Start a new work session
     */
    startWorkSession: async (_, { projectId, userId, input = {} }) => {
      // Check if there's already an active session
      const activeCheck = await db.query(
        `SELECT id FROM work_sessions
         WHERE project_id = $1 AND user_id = $2 AND status = 'active'`,
        [projectId, userId]
      );

      if (activeCheck.rows.length > 0) {
        throw new Error('You already have an active work session. Please end it before starting a new one.');
      }

      // Get or create conversation for this project
      const conversationResult = await db.query(
        `SELECT id FROM conversations
         WHERE project_id = $1 AND user_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [projectId, userId]
      );

      let conversationId = null;
      if (conversationResult.rows.length > 0) {
        conversationId = conversationResult.rows[0].id;
      }

      // Create new session with conversation link
      const result = await db.query(
        `INSERT INTO work_sessions (project_id, user_id, conversation_id, title, focus_area, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING *`,
        [projectId, userId, conversationId, input.title || null, input.focusArea || null]
      );

      console.log(`🚀 [WorkSession] Started session ${result.rows[0].id} for project ${projectId}`);

      // Record activity and detect patterns
      await ActivityTrackingService.recordActivity(projectId, userId);

      // Analyze best work times (async, don't block response)
      ActivityTrackingService.detectBestWorkTimes(userId, projectId).catch(err => {
        console.error('[WorkSession] Error detecting work time patterns:', err);
      });

      return result.rows[0];
    },

    /**
     * End a work session and generate summary
     */
    endWorkSession: async (_, { sessionId, input = {} }) => {
      // Get the session
      const sessionResult = await db.query(
        'SELECT * FROM work_sessions WHERE id = $1',
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Work session not found');
      }

      const session = sessionResult.rows[0];

      if (session.status !== 'active') {
        throw new Error('This work session is not active');
      }

      // Calculate duration
      const startedAt = new Date(session.started_at);
      const endedAt = new Date();
      const durationMinutes = Math.round((endedAt - startedAt) / (1000 * 60));

      // Update session
      const result = await db.query(
        `UPDATE work_sessions
         SET status = 'completed',
             ended_at = CURRENT_TIMESTAMP,
             duration_minutes = $1,
             notes = $2,
             mood = $3,
             interruptions = $4,
             breaks_taken = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [
          durationMinutes,
          input.notes || null,
          input.mood || null,
          input.interruptions || 0,
          input.breaksTaken || 0,
          sessionId
        ]
      );

      console.log(`✅ [WorkSession] Ended session ${sessionId}, duration: ${durationMinutes} minutes`);

      // Generate AI summary in background
      const completedSession = result.rows[0];
      generateSessionSummary(completedSession).catch(err => {
        console.error(`Failed to generate summary for session ${sessionId}:`, err);
      });

      return completedSession;
    },

    /**
     * Abandon a work session without completing
     */
    abandonWorkSession: async (_, { sessionId }) => {
      await db.query(
        `UPDATE work_sessions
         SET status = 'abandoned',
             ended_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [sessionId]
      );

      console.log(`⏹️  [WorkSession] Abandoned session ${sessionId}`);

      return true;
    }
  },

  WorkSession: {
    projectId: (parent) => parent.project_id,
    userId: (parent) => parent.user_id,
    conversationId: (parent) => parent.conversation_id,
    focusArea: (parent) => parent.focus_area,
    startedAt: (parent) => parent.started_at,
    endedAt: (parent) => parent.ended_at,
    durationMinutes: (parent) => parent.duration_minutes,
    tasksCompleted: (parent) => parent.tasks_completed || [],
    tasksCreated: (parent) => parent.tasks_created || [],
    breaksTaken: (parent) => parent.breaks_taken || 0,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at
  }
};
