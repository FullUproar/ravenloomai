/**
 * Sharing and Connections GraphQL Resolvers
 */

import db from '../../db.js';

export default {
  Query: {
    /**
     * Get user's connections
     */
    getConnections: async (_, { userId, status }) => {
      let query = `
        SELECT * FROM user_connections
        WHERE (requester_id = $1 OR recipient_id = $1)
      `;
      const params = [userId];

      if (status) {
        query += ` AND status = $2`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await db.query(query, params);
      return result.rows.map(row => ({
        id: row.id,
        requesterId: row.requester_id,
        recipientId: row.recipient_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },

    /**
     * Get projects shared with user
     */
    getSharedProjects: async (_, { userId }) => {
      const query = `
        SELECT ps.*, p.title, p.description, p.status, p.outcome, p.completion_type
        FROM project_shares ps
        JOIN projects p ON ps.project_id = p.id
        WHERE ps.shared_with_id = $1
        ORDER BY ps.created_at DESC
      `;

      const result = await db.query(query, [userId]);
      return result.rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        ownerId: row.owner_id,
        sharedWithId: row.shared_with_id,
        permissionLevel: row.permission_level,
        project: {
          id: row.project_id,
          title: row.title,
          description: row.description,
          status: row.status,
          outcome: row.outcome,
          completionType: row.completion_type
        },
        createdAt: row.created_at
      }));
    },

    /**
     * Get user messages
     */
    getMessages: async (_, { userId, otherUserId, limit = 50 }) => {
      const query = `
        SELECT * FROM user_messages
        WHERE (sender_id = $1 AND recipient_id = $2)
           OR (sender_id = $2 AND recipient_id = $1)
        ORDER BY created_at DESC
        LIMIT $3
      `;

      const result = await db.query(query, [userId, otherUserId, limit]);
      return result.rows.reverse().map(row => ({
        id: row.id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        content: row.content,
        read: row.read,
        createdAt: row.created_at
      }));
    },

    /**
     * Get message threads for user
     */
    getMessageThreads: async (_, { userId }) => {
      const query = `
        SELECT mt.*,
               um.content as last_message_content,
               um.sender_id as last_message_sender,
               CASE
                 WHEN mt.participant_1_id = $1 THEN mt.participant_2_id
                 ELSE mt.participant_1_id
               END as other_user_id
        FROM message_threads mt
        LEFT JOIN user_messages um ON (
          (um.sender_id = mt.participant_1_id AND um.recipient_id = mt.participant_2_id)
          OR (um.sender_id = mt.participant_2_id AND um.recipient_id = mt.participant_1_id)
        )
        WHERE mt.participant_1_id = $1 OR mt.participant_2_id = $1
        ORDER BY mt.last_message_at DESC
      `;

      const result = await db.query(query, [userId]);
      return result.rows.map(row => ({
        id: row.id,
        otherUserId: row.other_user_id,
        lastMessageContent: row.last_message_content,
        lastMessageSender: row.last_message_sender,
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at
      }));
    }
  },

  Mutation: {
    /**
     * Send connection request
     */
    sendConnectionRequest: async (_, { requesterId, recipientId }) => {
      // Check if connection already exists
      const existing = await db.query(
        `SELECT * FROM user_connections
         WHERE (requester_id = $1 AND recipient_id = $2)
            OR (requester_id = $2 AND recipient_id = $1)`,
        [requesterId, recipientId]
      );

      if (existing.rows.length > 0) {
        throw new Error('Connection request already exists');
      }

      const result = await db.query(
        `INSERT INTO user_connections (requester_id, recipient_id, status)
         VALUES ($1, $2, 'pending')
         RETURNING *`,
        [requesterId, recipientId]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        requesterId: row.requester_id,
        recipientId: row.recipient_id,
        status: row.status,
        createdAt: row.created_at
      };
    },

    /**
     * Respond to connection request
     */
    respondToConnection: async (_, { connectionId, status }) => {
      const result = await db.query(
        `UPDATE user_connections
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, connectionId]
      );

      if (result.rows.length === 0) {
        throw new Error('Connection not found');
      }

      const row = result.rows[0];
      return {
        id: row.id,
        requesterId: row.requester_id,
        recipientId: row.recipient_id,
        status: row.status,
        updatedAt: row.updated_at
      };
    },

    /**
     * Share project with user
     */
    shareProject: async (_, { projectId, ownerId, sharedWithId, permissionLevel = 'view' }) => {
      // Check if already shared
      const existing = await db.query(
        `SELECT * FROM project_shares WHERE project_id = $1 AND shared_with_id = $2`,
        [projectId, sharedWithId]
      );

      if (existing.rows.length > 0) {
        // Update permission level
        const result = await db.query(
          `UPDATE project_shares
           SET permission_level = $1, updated_at = NOW()
           WHERE project_id = $2 AND shared_with_id = $3
           RETURNING *`,
          [permissionLevel, projectId, sharedWithId]
        );

        const row = result.rows[0];
        return {
          id: row.id,
          projectId: row.project_id,
          ownerId: row.owner_id,
          sharedWithId: row.shared_with_id,
          permissionLevel: row.permission_level,
          createdAt: row.created_at
        };
      }

      // Create new share
      const result = await db.query(
        `INSERT INTO project_shares (project_id, owner_id, shared_with_id, permission_level)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [projectId, ownerId, sharedWithId, permissionLevel]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        projectId: row.project_id,
        ownerId: row.owner_id,
        sharedWithId: row.shared_with_id,
        permissionLevel: row.permission_level,
        createdAt: row.created_at
      };
    },

    /**
     * Unshare project
     */
    unshareProject: async (_, { projectId, sharedWithId }) => {
      await db.query(
        `DELETE FROM project_shares WHERE project_id = $1 AND shared_with_id = $2`,
        [projectId, sharedWithId]
      );

      return true;
    },

    /**
     * Send message to user
     */
    sendUserMessage: async (_, { senderId, recipientId, content }) => {
      // Create or update thread
      const [participant1, participant2] = [senderId, recipientId].sort();

      await db.query(
        `INSERT INTO message_threads (participant_1_id, participant_2_id, last_message_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (participant_1_id, participant_2_id)
         DO UPDATE SET last_message_at = NOW()`,
        [participant1, participant2]
      );

      // Insert message
      const result = await db.query(
        `INSERT INTO user_messages (sender_id, recipient_id, content)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [senderId, recipientId, content]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        content: row.content,
        read: row.read,
        createdAt: row.created_at
      };
    },

    /**
     * Mark message as read
     */
    markMessageRead: async (_, { messageId }) => {
      await db.query(
        `UPDATE user_messages SET read = true WHERE id = $1`,
        [messageId]
      );

      return true;
    }
  }
};
