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
export async function completeTask(taskId) {
  const result = await db.query(
    `UPDATE tasks
     SET status = 'done', completed_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [taskId]
  );
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
    completedAt: row.completed_at,
    createdBy: row.created_by,
    sourceMessageId: row.source_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default {
  createTask,
  updateTask,
  completeTask,
  deleteTask,
  getTaskById,
  getTasks
};
