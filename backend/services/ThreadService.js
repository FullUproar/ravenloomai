/**
 * ThreadService - Manages conversation threads within channels
 */

import db from '../db.js';

/**
 * Create a new thread in a channel
 */
export async function createThread(channelId, userId, { title = null, initialMessage = null } = {}) {
  // Create the thread
  const threadResult = await db.query(
    `INSERT INTO threads (channel_id, title, started_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [channelId, title, userId]
  );

  const thread = mapThread(threadResult.rows[0]);

  // If there's an initial message, add it
  if (initialMessage) {
    await db.query(
      `INSERT INTO messages (channel_id, thread_id, user_id, content, is_ai, mentions_ai)
       VALUES ($1, $2, $3, $4, false, false)`,
      [channelId, thread.id, userId, initialMessage]
    );

    // Update thread title from first message if not provided
    if (!title) {
      const autoTitle = generateThreadTitle(initialMessage);
      await db.query(
        `UPDATE threads SET title = $1 WHERE id = $2`,
        [autoTitle, thread.id]
      );
      thread.title = autoTitle;
    }
  }

  return thread;
}

/**
 * Get a thread by ID
 */
export async function getThread(threadId) {
  const result = await db.query(
    `SELECT t.*, u.display_name, u.email, u.avatar_url
     FROM threads t
     LEFT JOIN users u ON t.started_by = u.id
     WHERE t.id = $1`,
    [threadId]
  );

  return result.rows[0] ? mapThread(result.rows[0]) : null;
}

/**
 * Get threads for a channel
 */
export async function getThreads(channelId, { limit = 50 } = {}) {
  const result = await db.query(
    `SELECT t.*, u.display_name, u.email, u.avatar_url
     FROM threads t
     LEFT JOIN users u ON t.started_by = u.id
     WHERE t.channel_id = $1
     ORDER BY t.last_activity_at DESC
     LIMIT $2`,
    [channelId, limit]
  );

  return result.rows.map(mapThread);
}

/**
 * Get messages for a thread
 */
export async function getThreadMessages(threadId, { limit = 100 } = {}) {
  const result = await db.query(
    `SELECT m.*, u.display_name, u.email, u.avatar_url
     FROM messages m
     LEFT JOIN users u ON m.user_id = u.id
     WHERE m.thread_id = $1
     ORDER BY m.created_at ASC
     LIMIT $2`,
    [threadId, limit]
  );

  return result.rows.map(mapMessage);
}

/**
 * Mark a thread as resolved
 */
export async function resolveThread(threadId) {
  const result = await db.query(
    `UPDATE threads
     SET is_resolved = true, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [threadId]
  );

  return result.rows[0] ? mapThread(result.rows[0]) : null;
}

/**
 * Add a message to a thread
 */
export async function addThreadMessage(threadId, userId, content, { isAi = false, mentionsAi = false, metadata = {} } = {}) {
  // Get the thread to find the channel
  const threadResult = await db.query(
    `SELECT channel_id FROM threads WHERE id = $1`,
    [threadId]
  );

  if (threadResult.rows.length === 0) {
    throw new Error('Thread not found');
  }

  const channelId = threadResult.rows[0].channel_id;

  // Insert the message
  const messageResult = await db.query(
    `INSERT INTO messages (channel_id, thread_id, user_id, content, is_ai, mentions_ai, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [channelId, threadId, isAi ? null : userId, content, isAi, mentionsAi, JSON.stringify(metadata)]
  );

  return mapMessage(messageResult.rows[0]);
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Generate a thread title from the first message
 */
function generateThreadTitle(message) {
  // Remove @mentions
  let title = message.replace(/@\w+/g, '').trim();

  // Take first sentence or first 60 chars
  const firstSentence = title.split(/[.!?]/)[0];
  if (firstSentence.length <= 60) {
    return firstSentence.trim();
  }

  // Truncate at word boundary
  const truncated = title.substring(0, 57);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 30 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
}

function mapThread(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channel_id,
    title: row.title,
    startedBy: row.started_by,
    startedByUser: row.display_name ? {
      id: row.started_by,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url
    } : null,
    messageCount: row.message_count || 0,
    lastActivityAt: row.last_activity_at,
    isResolved: row.is_resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channel_id,
    threadId: row.thread_id,
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
  createThread,
  getThread,
  getThreads,
  getThreadMessages,
  resolveThread,
  addThreadMessage
};
