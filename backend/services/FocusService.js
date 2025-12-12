/**
 * FocusService - Manages personal focus items, blocked tasks, and team spotlights
 *
 * Focus Items: Personal pins (max 3) that appear at top of user's digest
 * Blocked Tasks: Escalation status for stuck team members
 * Team Spotlights: Manager-broadcast priorities visible to all team members
 */

import db from '../db.js';

// ============================================================================
// PERSONAL FOCUS ITEMS
// ============================================================================

const MAX_FOCUS_ITEMS = 3;

/**
 * Get user's focus items for a team
 */
export async function getUserFocusItems(teamId, userId) {
  const result = await db.query(
    `SELECT ufi.*,
       CASE ufi.item_type
         WHEN 'task' THEN (SELECT title FROM tasks WHERE id = ufi.item_id)
         WHEN 'goal' THEN (SELECT title FROM goals WHERE id = ufi.item_id)
         WHEN 'project' THEN (SELECT name FROM projects WHERE id = ufi.item_id)
       END as item_title,
       CASE ufi.item_type
         WHEN 'task' THEN (SELECT status FROM tasks WHERE id = ufi.item_id)
         WHEN 'goal' THEN (SELECT status FROM goals WHERE id = ufi.item_id)
         WHEN 'project' THEN (SELECT status FROM projects WHERE id = ufi.item_id)
       END as item_status
     FROM user_focus_items ufi
     WHERE ufi.user_id = $1 AND ufi.team_id = $2
     ORDER BY ufi.focus_order ASC`,
    [userId, teamId]
  );

  return result.rows.map(mapFocusItem);
}

/**
 * Add item to user's focus (max 3)
 */
export async function addFocusItem(teamId, userId, itemType, itemId) {
  // Validate item type
  if (!['task', 'goal', 'project'].includes(itemType)) {
    throw new Error('Invalid item type. Must be task, goal, or project.');
  }

  // Check if already focused
  const existing = await db.query(
    `SELECT id FROM user_focus_items
     WHERE user_id = $1 AND team_id = $2 AND item_type = $3 AND item_id = $4`,
    [userId, teamId, itemType, itemId]
  );

  if (existing.rows.length > 0) {
    return { success: true, message: 'Item already focused' };
  }

  // Check current count
  const countResult = await db.query(
    `SELECT COUNT(*) as count FROM user_focus_items
     WHERE user_id = $1 AND team_id = $2`,
    [userId, teamId]
  );

  const currentCount = parseInt(countResult.rows[0].count);

  if (currentCount >= MAX_FOCUS_ITEMS) {
    throw new Error(`Maximum ${MAX_FOCUS_ITEMS} focus items allowed. Remove one first.`);
  }

  // Add focus item
  const nextOrder = currentCount + 1;
  await db.query(
    `INSERT INTO user_focus_items (user_id, team_id, item_type, item_id, focus_order)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, teamId, itemType, itemId, nextOrder]
  );

  return { success: true, message: 'Item added to focus' };
}

/**
 * Remove item from user's focus
 */
export async function removeFocusItem(teamId, userId, itemType, itemId) {
  await db.query(
    `DELETE FROM user_focus_items
     WHERE user_id = $1 AND team_id = $2 AND item_type = $3 AND item_id = $4`,
    [userId, teamId, itemType, itemId]
  );

  // Reorder remaining items
  await reorderFocusItems(teamId, userId);

  return { success: true };
}

/**
 * Check if an item is focused by user
 */
export async function isItemFocused(teamId, userId, itemType, itemId) {
  const result = await db.query(
    `SELECT id FROM user_focus_items
     WHERE user_id = $1 AND team_id = $2 AND item_type = $3 AND item_id = $4`,
    [userId, teamId, itemType, itemId]
  );

  return result.rows.length > 0;
}

/**
 * Reorder focus items to fill gaps
 */
async function reorderFocusItems(teamId, userId) {
  const items = await db.query(
    `SELECT id FROM user_focus_items
     WHERE user_id = $1 AND team_id = $2
     ORDER BY focus_order ASC`,
    [userId, teamId]
  );

  for (let i = 0; i < items.rows.length; i++) {
    await db.query(
      `UPDATE user_focus_items SET focus_order = $1 WHERE id = $2`,
      [i + 1, items.rows[i].id]
    );
  }
}

// ============================================================================
// BLOCKED TASKS
// ============================================================================

/**
 * Mark a task as blocked
 */
export async function markTaskBlocked(taskId, userId, reason = null) {
  const result = await db.query(
    `UPDATE tasks
     SET is_blocked = TRUE,
         blocked_reason = $2,
         blocked_at = NOW(),
         blocked_by = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [taskId, reason, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Task not found');
  }

  return mapTask(result.rows[0]);
}

/**
 * Unblock a task
 */
export async function unblockTask(taskId, userId) {
  const result = await db.query(
    `UPDATE tasks
     SET is_blocked = FALSE,
         blocked_reason = NULL,
         blocked_at = NULL,
         blocked_by = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [taskId]
  );

  if (result.rows.length === 0) {
    throw new Error('Task not found');
  }

  return mapTask(result.rows[0]);
}

/**
 * Get blocked tasks for a team (for owners/admins to see)
 */
export async function getBlockedTasks(teamId) {
  const result = await db.query(
    `SELECT t.*,
       u.display_name as assigned_to_name,
       bu.display_name as blocked_by_name,
       p.name as project_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN users bu ON t.blocked_by = bu.id
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.team_id = $1
       AND t.is_blocked = TRUE
       AND t.status NOT IN ('done', 'cancelled')
     ORDER BY t.blocked_at ASC`,
    [teamId]
  );

  return result.rows.map(mapBlockedTask);
}

/**
 * Get blocked tasks assigned to a specific user
 */
export async function getUserBlockedTasks(teamId, userId) {
  const result = await db.query(
    `SELECT t.*,
       bu.display_name as blocked_by_name,
       p.name as project_name
     FROM tasks t
     LEFT JOIN users bu ON t.blocked_by = bu.id
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.team_id = $1
       AND t.assigned_to = $2
       AND t.is_blocked = TRUE
       AND t.status NOT IN ('done', 'cancelled')
     ORDER BY t.blocked_at ASC`,
    [teamId, userId]
  );

  return result.rows.map(mapBlockedTask);
}

// ============================================================================
// TEAM SPOTLIGHTS
// ============================================================================

/**
 * Get active spotlights for a team
 */
export async function getTeamSpotlights(teamId) {
  const result = await db.query(
    `SELECT ts.*,
       u.display_name as set_by_name,
       CASE ts.item_type
         WHEN 'task' THEN (SELECT title FROM tasks WHERE id = ts.item_id)
         WHEN 'goal' THEN (SELECT title FROM goals WHERE id = ts.item_id)
         WHEN 'project' THEN (SELECT name FROM projects WHERE id = ts.item_id)
         WHEN 'custom' THEN ts.custom_title
       END as item_title,
       CASE ts.item_type
         WHEN 'task' THEN (SELECT status FROM tasks WHERE id = ts.item_id)
         WHEN 'goal' THEN (SELECT status FROM goals WHERE id = ts.item_id)
         WHEN 'project' THEN (SELECT status FROM projects WHERE id = ts.item_id)
         ELSE NULL
       END as item_status
     FROM team_spotlights ts
     LEFT JOIN users u ON ts.set_by = u.id
     WHERE ts.team_id = $1
       AND ts.is_active = TRUE
       AND (ts.expires_at IS NULL OR ts.expires_at > NOW())
     ORDER BY ts.sort_order ASC, ts.created_at ASC
     LIMIT 3`,
    [teamId]
  );

  return result.rows.map(mapSpotlight);
}

/**
 * Add a spotlight (admin only)
 */
export async function addSpotlight(teamId, userId, input) {
  const { itemType, itemId, customTitle, customDescription, expiresAt } = input;

  // Validate
  if (!['task', 'goal', 'project', 'custom'].includes(itemType)) {
    throw new Error('Invalid item type');
  }

  if (itemType === 'custom' && !customTitle) {
    throw new Error('Custom spotlight requires a title');
  }

  if (itemType !== 'custom' && !itemId) {
    throw new Error('Item ID required for non-custom spotlight');
  }

  // Get current max sort order
  const orderResult = await db.query(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order
     FROM team_spotlights
     WHERE team_id = $1 AND is_active = TRUE`,
    [teamId]
  );

  const nextOrder = orderResult.rows[0].next_order;

  const result = await db.query(
    `INSERT INTO team_spotlights
       (team_id, item_type, item_id, custom_title, custom_description, set_by, expires_at, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [teamId, itemType, itemId || null, customTitle || null, customDescription || null, userId, expiresAt || null, nextOrder]
  );

  return mapSpotlight(result.rows[0]);
}

/**
 * Remove a spotlight
 */
export async function removeSpotlight(spotlightId, userId) {
  // Soft delete by setting is_active = false
  await db.query(
    `UPDATE team_spotlights SET is_active = FALSE WHERE id = $1`,
    [spotlightId]
  );

  return { success: true };
}

/**
 * Update spotlight (reorder, etc.)
 */
export async function updateSpotlight(spotlightId, input) {
  const updates = [];
  const values = [spotlightId];
  let paramCount = 1;

  if (input.customTitle !== undefined) {
    paramCount++;
    updates.push(`custom_title = $${paramCount}`);
    values.push(input.customTitle);
  }

  if (input.customDescription !== undefined) {
    paramCount++;
    updates.push(`custom_description = $${paramCount}`);
    values.push(input.customDescription);
  }

  if (input.expiresAt !== undefined) {
    paramCount++;
    updates.push(`expires_at = $${paramCount}`);
    values.push(input.expiresAt);
  }

  if (input.sortOrder !== undefined) {
    paramCount++;
    updates.push(`sort_order = $${paramCount}`);
    values.push(input.sortOrder);
  }

  if (updates.length === 0) {
    throw new Error('No updates provided');
  }

  const result = await db.query(
    `UPDATE team_spotlights SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );

  return mapSpotlight(result.rows[0]);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapFocusItem(row) {
  return {
    id: row.id,
    userId: row.user_id,
    teamId: row.team_id,
    itemType: row.item_type,
    itemId: row.item_id,
    itemTitle: row.item_title,
    itemStatus: row.item_status,
    focusOrder: row.focus_order,
    focusedAt: row.focused_at
  };
}

function mapTask(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    dueAt: row.due_at,
    isBlocked: row.is_blocked,
    blockedReason: row.blocked_reason,
    blockedAt: row.blocked_at,
    blockedBy: row.blocked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapBlockedTask(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    projectName: row.project_name,
    dueAt: row.due_at,
    isBlocked: row.is_blocked,
    blockedReason: row.blocked_reason,
    blockedAt: row.blocked_at,
    blockedBy: row.blocked_by,
    blockedByName: row.blocked_by_name,
    // Calculate how long blocked
    blockedDuration: row.blocked_at ? getBlockedDuration(new Date(row.blocked_at)) : null
  };
}

function getBlockedDuration(blockedAt) {
  const now = new Date();
  const diffMs = now - blockedAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return 'just now';
}

function mapSpotlight(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    itemType: row.item_type,
    itemId: row.item_id,
    itemTitle: row.item_title || row.custom_title,
    itemStatus: row.item_status,
    customTitle: row.custom_title,
    customDescription: row.custom_description,
    setBy: row.set_by,
    setByName: row.set_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    sortOrder: row.sort_order,
    isActive: row.is_active
  };
}

export default {
  // Focus items
  getUserFocusItems,
  addFocusItem,
  removeFocusItem,
  isItemFocused,

  // Blocked tasks
  markTaskBlocked,
  unblockTask,
  getBlockedTasks,
  getUserBlockedTasks,

  // Team spotlights
  getTeamSpotlights,
  addSpotlight,
  removeSpotlight,
  updateSpotlight
};
