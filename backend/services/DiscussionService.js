/**
 * DiscussionService - Manages Raven-led facilitated discussions
 */

import pool from '../db.js';

class DiscussionService {
  /**
   * Start a new discussion in a channel
   */
  static async startDiscussion(channelId, topic, userId) {
    // End any existing active discussion first
    await this.endActiveDiscussion(channelId);

    const result = await pool.query(`
      INSERT INTO active_discussions (channel_id, topic, started_by)
      VALUES ($1, $2, $3)
      RETURNING id, channel_id, topic, started_by, started_at, is_active
    `, [channelId, topic, userId]);

    return result.rows[0];
  }

  /**
   * Get the active discussion for a channel
   */
  static async getActiveDiscussion(channelId) {
    const result = await pool.query(`
      SELECT id, channel_id, topic, started_by, started_at
      FROM active_discussions
      WHERE channel_id = $1 AND is_active = TRUE
    `, [channelId]);

    return result.rows[0] || null;
  }

  /**
   * End the active discussion in a channel
   */
  static async endActiveDiscussion(channelId) {
    const result = await pool.query(`
      UPDATE active_discussions
      SET is_active = FALSE, ended_at = NOW()
      WHERE channel_id = $1 AND is_active = TRUE
      RETURNING id, topic
    `, [channelId]);

    return result.rows[0] || null;
  }

  /**
   * Get recent messages from a channel for discussion context
   */
  static async getDiscussionMessages(channelId, discussionStartedAt, limit = 20) {
    const result = await pool.query(`
      SELECT m.id, m.content, m.is_ai, m.created_at,
             u.id as user_id, u.email, u.display_name
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = $1
        AND m.created_at >= $2
      ORDER BY m.created_at ASC
      LIMIT $3
    `, [channelId, discussionStartedAt, limit]);

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      isAi: row.is_ai,
      createdAt: row.created_at,
      user: row.user_id ? {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name
      } : null
    }));
  }
}

export default DiscussionService;
