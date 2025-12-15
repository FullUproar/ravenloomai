/**
 * ChannelService - Manages channels within teams
 */

import db from '../db.js';

/**
 * Create a new channel
 */
export async function createChannel(teamId, { name, description = null, aiMode = 'mentions_only', createdBy = null }) {
  // Normalize channel name
  const normalizedName = name.toLowerCase()
    .replace(/^#/, '')  // Remove leading #
    .replace(/[^a-z0-9-_]/g, '-')  // Replace invalid chars
    .replace(/-+/g, '-')  // Collapse multiple dashes
    .replace(/^-|-$/g, '');  // Remove leading/trailing dashes

  const result = await db.query(
    `INSERT INTO channels (team_id, name, description, ai_mode, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [teamId, normalizedName, description, aiMode, createdBy]
  );

  return mapChannel(result.rows[0]);
}

/**
 * Get channel by ID
 */
export async function getChannelById(channelId) {
  const result = await db.query('SELECT * FROM channels WHERE id = $1', [channelId]);
  return result.rows[0] ? mapChannel(result.rows[0]) : null;
}

/**
 * Get channels for a team (excludes private Raven DMs and Calendar Chats)
 */
export async function getChannels(teamId) {
  const result = await db.query(
    `SELECT * FROM channels
     WHERE team_id = $1 AND (channel_type IS NULL OR channel_type NOT IN ('raven_dm', 'calendar_chat'))
     ORDER BY is_default DESC, name ASC`,
    [teamId]
  );
  return result.rows.map(mapChannel);
}

/**
 * Get default channel for a team
 */
export async function getDefaultChannel(teamId) {
  const result = await db.query(
    `SELECT * FROM channels
     WHERE team_id = $1 AND is_default = true
     LIMIT 1`,
    [teamId]
  );
  return result.rows[0] ? mapChannel(result.rows[0]) : null;
}

/**
 * Update a channel
 */
export async function updateChannel(channelId, { name, description, aiMode }) {
  const updates = [];
  const params = [channelId];
  let paramIndex = 2;

  if (name !== undefined) {
    const normalizedName = name.toLowerCase()
      .replace(/^#/, '')
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    updates.push(`name = $${paramIndex}`);
    params.push(normalizedName);
    paramIndex++;
  }

  if (description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    params.push(description);
    paramIndex++;
  }

  if (aiMode !== undefined) {
    updates.push(`ai_mode = $${paramIndex}`);
    params.push(aiMode);
    paramIndex++;
  }

  if (updates.length === 0) {
    return getChannelById(channelId);
  }

  updates.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE channels SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] ? mapChannel(result.rows[0]) : null;
}

/**
 * Delete a channel
 */
export async function deleteChannel(channelId) {
  // Don't allow deleting the default channel
  const channel = await getChannelById(channelId);
  if (channel?.isDefault) {
    throw new Error('Cannot delete the default channel');
  }

  const result = await db.query('DELETE FROM channels WHERE id = $1 RETURNING id', [channelId]);
  return result.rows.length > 0;
}

/**
 * Get or create the user's private Raven DM channel
 * This is a private channel between the user and Raven only
 */
export async function getOrCreateRavenDM(teamId, userId) {
  // First, try to find existing Raven DM for this user
  const existing = await db.query(
    `SELECT * FROM channels
     WHERE team_id = $1 AND channel_type = 'raven_dm' AND owner_id = $2`,
    [teamId, userId]
  );

  if (existing.rows.length > 0) {
    return mapChannel(existing.rows[0]);
  }

  // Create new Raven DM channel
  const result = await db.query(
    `INSERT INTO channels (team_id, name, description, ai_mode, channel_type, owner_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      teamId,
      'Raven',  // Friendly name for private chat with AI
      'Private chat with Raven',
      'active',  // Always active in Raven DMs
      'raven_dm',
      userId,
      userId
    ]
  );

  return mapChannel(result.rows[0]);
}

/**
 * Get or create the user's private Calendar Chat channel
 * This is a private channel between the user and Raven for calendar assistance
 */
export async function getOrCreateCalendarChat(teamId, userId) {
  // First, try to find existing Calendar Chat for this user
  const existing = await db.query(
    `SELECT * FROM channels
     WHERE team_id = $1 AND channel_type = 'calendar_chat' AND owner_id = $2`,
    [teamId, userId]
  );

  if (existing.rows.length > 0) {
    return mapChannel(existing.rows[0]);
  }

  // Create new Calendar Chat channel
  const result = await db.query(
    `INSERT INTO channels (team_id, name, description, ai_mode, channel_type, owner_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      teamId,
      `calendar-chat-${userId.substring(0, 8)}`,  // Unique name per user
      'Private calendar assistant',
      'active',  // Always active in Calendar Chat
      'calendar_chat',
      userId,
      userId
    ]
  );

  return mapChannel(result.rows[0]);
}

/**
 * Get public channels for a team (excludes private DMs and system channels)
 */
export async function getPublicChannels(teamId) {
  const result = await db.query(
    `SELECT * FROM channels
     WHERE team_id = $1 AND (channel_type = 'public' OR channel_type IS NULL)
     ORDER BY is_default DESC, name ASC`,
    [teamId]
  );
  return result.rows.map(mapChannel);
}

// ============================================================================
// Helper functions
// ============================================================================

function mapChannel(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    description: row.description,
    aiMode: row.ai_mode,
    channelType: row.channel_type || 'public',
    ownerId: row.owner_id,
    isDefault: row.is_default,
    createdBy: row.created_by,
    // AI Focus fields
    focusGoalId: row.focus_goal_id,
    focusProjectId: row.focus_project_id,
    focusTaskId: row.focus_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Set AI Focus for a channel
 * Allows setting goal, project, and/or task as context for AI
 */
export async function setChannelAIFocus(channelId, { goalId, projectId, taskId }) {
  const result = await db.query(
    `UPDATE channels SET
      focus_goal_id = $2,
      focus_project_id = $3,
      focus_task_id = $4,
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [channelId, goalId || null, projectId || null, taskId || null]
  );

  return result.rows[0] ? mapChannel(result.rows[0]) : null;
}

/**
 * Clear all AI Focus from a channel
 */
export async function clearChannelAIFocus(channelId) {
  const result = await db.query(
    `UPDATE channels SET
      focus_goal_id = NULL,
      focus_project_id = NULL,
      focus_task_id = NULL,
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [channelId]
  );

  return result.rows[0] ? mapChannel(result.rows[0]) : null;
}

/**
 * Get AI Focus context for a channel
 * Returns the focused goal, project, and task details
 */
export async function getChannelAIFocusContext(channelId) {
  const result = await db.query(
    `SELECT
      c.id,
      g.id as goal_id, g.title as goal_title, g.description as goal_description,
      p.id as project_id, p.name as project_name, p.description as project_description,
      t.id as task_id, t.title as task_title, t.description as task_description, t.status as task_status
     FROM channels c
     LEFT JOIN goals g ON c.focus_goal_id = g.id
     LEFT JOIN projects p ON c.focus_project_id = p.id
     LEFT JOIN tasks t ON c.focus_task_id = t.id
     WHERE c.id = $1`,
    [channelId]
  );

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  return {
    goal: row.goal_id ? {
      id: row.goal_id,
      title: row.goal_title,
      description: row.goal_description
    } : null,
    project: row.project_id ? {
      id: row.project_id,
      name: row.project_name,
      description: row.project_description
    } : null,
    task: row.task_id ? {
      id: row.task_id,
      title: row.task_title,
      description: row.task_description,
      status: row.task_status
    } : null
  };
}

export default {
  createChannel,
  getChannelById,
  getChannels,
  getPublicChannels,
  getDefaultChannel,
  getOrCreateRavenDM,
  getOrCreateCalendarChat,
  updateChannel,
  deleteChannel,
  setChannelAIFocus,
  clearChannelAIFocus,
  getChannelAIFocusContext
};
