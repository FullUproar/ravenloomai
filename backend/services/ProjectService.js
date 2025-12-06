/**
 * ProjectService - Manages projects (time-bound containers for tasks)
 */

import db from '../db.js';
import * as GoalService from './GoalService.js';

/**
 * Create a new project
 */
export async function createProject(teamId, {
  name,
  description = null,
  color = '#5D4B8C',
  dueDate = null,
  ownerId = null,
  goalsInherit = true,
  goalIds = [],
  createdBy = null
}) {
  const result = await db.query(
    `INSERT INTO projects (team_id, name, description, color, due_date, owner_id, goals_inherit, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [teamId, name, description, color, dueDate, ownerId, goalsInherit, createdBy]
  );

  const project = mapProject(result.rows[0]);

  // Link goals if provided
  if (goalIds && goalIds.length > 0) {
    await GoalService.setProjectGoals(project.id, goalIds);
  }

  return project;
}

/**
 * Get project by ID
 */
export async function getProjectById(projectId) {
  const result = await db.query('SELECT * FROM projects WHERE id = $1', [projectId]);
  return result.rows[0] ? mapProject(result.rows[0]) : null;
}

/**
 * Get projects for a team
 */
export async function getProjects(teamId, { goalId, status } = {}) {
  let query = `SELECT DISTINCT p.* FROM projects p`;
  const params = [teamId];
  let paramIndex = 2;

  // Join with goal_projects if filtering by goal
  if (goalId) {
    query += ` INNER JOIN goal_projects gp ON gp.project_id = p.id AND gp.goal_id = $${paramIndex}`;
    params.push(goalId);
    paramIndex++;
  }

  query += ` WHERE p.team_id = $1`;

  if (status) {
    query += ` AND p.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY p.status = 'active' DESC, p.updated_at DESC`;

  const result = await db.query(query, params);
  return result.rows.map(mapProject);
}

/**
 * Update a project
 */
export async function updateProject(projectId, updates) {
  const allowedFields = ['name', 'description', 'status', 'color', 'due_date', 'owner_id', 'goals_inherit'];
  const fieldMapping = {
    name: 'name',
    description: 'description',
    status: 'status',
    color: 'color',
    dueDate: 'due_date',
    ownerId: 'owner_id',
    goalsInherit: 'goals_inherit'
  };

  const setClauses = [];
  const params = [projectId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    const dbField = fieldMapping[key];
    if (dbField && allowedFields.includes(dbField) && value !== undefined) {
      setClauses.push(`${dbField} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0 && !updates.goalIds) {
    return getProjectById(projectId);
  }

  if (setClauses.length > 0) {
    setClauses.push('updated_at = NOW()');

    await db.query(
      `UPDATE projects SET ${setClauses.join(', ')} WHERE id = $1`,
      params
    );
  }

  // Update goal associations if provided
  if (updates.goalIds !== undefined) {
    await GoalService.setProjectGoals(projectId, updates.goalIds);
  }

  return getProjectById(projectId);
}

/**
 * Delete a project
 */
export async function deleteProject(projectId) {
  const result = await db.query('DELETE FROM projects WHERE id = $1 RETURNING id', [projectId]);
  return result.rows.length > 0;
}

/**
 * Get task counts for a project
 */
export async function getTaskCounts(projectId) {
  const result = await db.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'done') as completed
     FROM tasks WHERE project_id = $1`,
    [projectId]
  );
  return {
    taskCount: parseInt(result.rows[0]?.total || 0),
    completedTaskCount: parseInt(result.rows[0]?.completed || 0)
  };
}

// ============================================================================
// Helper functions
// ============================================================================

function mapProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    description: row.description,
    status: row.status,
    color: row.color,
    dueDate: row.due_date,
    ownerId: row.owner_id,
    goalsInherit: row.goals_inherit ?? true,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default {
  createProject,
  getProjectById,
  getProjects,
  updateProject,
  deleteProject,
  getTaskCounts
};
