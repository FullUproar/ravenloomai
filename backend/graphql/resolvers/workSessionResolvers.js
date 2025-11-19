/**
 * Work Session GraphQL Resolvers
 */

import db from '../../db.js';

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

      // Create new session
      const result = await db.query(
        `INSERT INTO work_sessions (project_id, user_id, title, focus_area, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING *`,
        [projectId, userId, input.title || null, input.focusArea || null]
      );

      console.log(`🚀 [WorkSession] Started session ${result.rows[0].id} for project ${projectId}`);

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

      // TODO: Generate AI summary in background
      // This would analyze the conversation during the session

      return result.rows[0];
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
