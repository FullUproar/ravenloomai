/**
 * TaskService - Manages tasks
 */

import db from '../db.js';

/**
 * Create a new task
 */
export async function createTask(teamId, {
  projectId = null,
  channelId = null,
  title,
  description = null,
  priority = 'medium',
  assignedTo = null,
  dueAt = null,
  createdBy = null,
  sourceMessageId = null
}) {
  const result = await db.query(
    `INSERT INTO tasks (team_id, project_id, channel_id, title, description, status, priority, assigned_to, due_at, created_by, source_message_id)
     VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7, $8, $9, $10)
     RETURNING *`,
    [teamId, projectId, channelId, title, description, priority, assignedTo, dueAt, createdBy, sourceMessageId]
  );
  return mapTask(result.rows[0]);
}

/**
 * Update a task
 */
export async function updateTask(taskId, updates) {
  const allowedFields = ['title', 'description', 'status', 'priority', 'assigned_to', 'due_at', 'project_id'];
  const setClauses = [];
  const params = [taskId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    const dbKey = key === 'assignedTo' ? 'assigned_to'
      : key === 'dueAt' ? 'due_at'
      : key === 'projectId' ? 'project_id'
      : key;

    if (allowedFields.includes(dbKey) && value !== undefined) {
      setClauses.push(`${dbKey} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    // No valid updates, just return existing task
    return getTaskById(taskId);
  }

  setClauses.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] ? mapTask(result.rows[0]) : null;
}

/**
 * Complete a task
 */
export async function completeTask(taskId, userId = null) {
  const task = await getTaskById(taskId);
  const result = await db.query(
    `UPDATE tasks
     SET status = 'done', completed_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [taskId]
  );

  if (result.rows[0] && userId) {
    await logTaskActivity(taskId, userId, 'status_changed', task?.status, 'done');
  }

  return result.rows[0] ? mapTask(result.rows[0]) : null;
}

/**
 * Reopen a completed task
 */
export async function reopenTask(taskId, userId = null) {
  const result = await db.query(
    `UPDATE tasks
     SET status = 'todo', completed_at = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [taskId]
  );

  if (result.rows[0] && userId) {
    await logTaskActivity(taskId, userId, 'status_changed', 'done', 'todo');
  }

  return result.rows[0] ? mapTask(result.rows[0]) : null;
}

/**
 * Delete a task
 */
export async function deleteTask(taskId) {
  const result = await db.query(
    'DELETE FROM tasks WHERE id = $1 RETURNING id',
    [taskId]
  );
  return result.rows.length > 0;
}

/**
 * Get a task by ID
 */
export async function getTaskById(taskId) {
  const result = await db.query(
    `SELECT t.*, u.display_name as assigned_to_name, u.email as assigned_to_email
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.id = $1`,
    [taskId]
  );
  return result.rows[0] ? mapTask(result.rows[0]) : null;
}

/**
 * Get tasks for a team
 */
export async function getTasks(teamId, { projectId = null, status = null, assignedTo = null, limit = 100 } = {}) {
  let query = `
    SELECT t.*, u.display_name as assigned_to_name, u.email as assigned_to_email
    FROM tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.team_id = $1
  `;
  const params = [teamId];
  let paramIndex = 2;

  if (projectId) {
    query += ` AND t.project_id = $${paramIndex}`;
    params.push(projectId);
    paramIndex++;
  }

  if (status) {
    query += ` AND t.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (assignedTo) {
    query += ` AND t.assigned_to = $${paramIndex}`;
    params.push(assignedTo);
    paramIndex++;
  }

  query += ` ORDER BY
    CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
    CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    t.due_at ASC NULLS LAST,
    t.created_at DESC
    LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await db.query(query, params);
  return result.rows.map(mapTask);
}

// ============================================================================
// Task Comments
// ============================================================================

/**
 * Add a comment to a task
 */
export async function addTaskComment(taskId, userId, content, parentCommentId = null) {
  const result = await db.query(
    `INSERT INTO task_comments (task_id, user_id, content, parent_comment_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [taskId, userId, content, parentCommentId]
  );

  // Log activity
  await logTaskActivity(taskId, userId, 'commented', null, content.substring(0, 100));

  return mapComment(result.rows[0]);
}

/**
 * Update a comment
 */
export async function updateTaskComment(commentId, content) {
  const result = await db.query(
    `UPDATE task_comments SET content = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [commentId, content]
  );
  return result.rows[0] ? mapComment(result.rows[0]) : null;
}

/**
 * Delete a comment
 */
export async function deleteTaskComment(commentId) {
  const result = await db.query('DELETE FROM task_comments WHERE id = $1', [commentId]);
  return result.rowCount > 0;
}

/**
 * Get comments for a task
 */
export async function getTaskComments(taskId) {
  const result = await db.query(
    `SELECT c.*, u.display_name, u.email, u.avatar_url
     FROM task_comments c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.task_id = $1
     ORDER BY c.created_at ASC`,
    [taskId]
  );
  return result.rows.map(mapComment);
}

/**
 * Get comment count for a task
 */
export async function getTaskCommentCount(taskId) {
  const result = await db.query(
    'SELECT COUNT(*) as count FROM task_comments WHERE task_id = $1',
    [taskId]
  );
  return parseInt(result.rows[0].count);
}

// ============================================================================
// Task Activity Log
// ============================================================================

/**
 * Log task activity
 */
export async function logTaskActivity(taskId, userId, action, oldValue = null, newValue = null) {
  try {
    await db.query(
      `INSERT INTO task_activity (task_id, user_id, action, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5)`,
      [taskId, userId, action, oldValue, newValue]
    );
  } catch (err) {
    // Don't fail if activity logging fails (table might not exist yet)
    console.warn('Failed to log task activity:', err.message);
  }
}

/**
 * Get activity for a task
 */
export async function getTaskActivity(taskId) {
  try {
    const result = await db.query(
      `SELECT a.*, u.display_name, u.email
       FROM task_activity a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.task_id = $1
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [taskId]
    );
    return result.rows.map(mapActivity);
  } catch (err) {
    // Return empty if table doesn't exist yet
    return [];
  }
}

/**
 * Reorder tasks within a project
 */
export async function reorderTasks(projectId, taskIds) {
  const tasks = [];
  for (let i = 0; i < taskIds.length; i++) {
    const result = await db.query(
      `UPDATE tasks SET sort_order = $1, updated_at = NOW()
       WHERE id = $2 AND project_id = $3
       RETURNING *`,
      [i, taskIds[i], projectId]
    );
    if (result.rows[0]) {
      tasks.push(mapTask(result.rows[0]));
    }
  }
  return tasks;
}

// ============================================================================
// Helper functions
// ============================================================================

function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    channelId: row.channel_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    assignedToUser: row.assigned_to_name ? {
      id: row.assigned_to,
      displayName: row.assigned_to_name,
      email: row.assigned_to_email
    } : null,
    dueAt: row.due_at,
    startDate: row.start_date,
    completedAt: row.completed_at,
    estimatedHours: row.estimated_hours ? parseFloat(row.estimated_hours) : null,
    actualHours: row.actual_hours ? parseFloat(row.actual_hours) : null,
    tags: row.tags || [],
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    sourceMessageId: row.source_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    user: row.display_name ? {
      id: row.user_id,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url
    } : null,
    content: row.content,
    parentCommentId: row.parent_comment_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    user: row.display_name ? {
      id: row.user_id,
      displayName: row.display_name,
      email: row.email
    } : null,
    action: row.action,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at
  };
}

export default {
  createTask,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
  getTaskById,
  getTasks,
  addTaskComment,
  updateTaskComment,
  deleteTaskComment,
  getTaskComments,
  getTaskCommentCount,
  getTaskActivity,
  logTaskActivity,
  reorderTasks
};
