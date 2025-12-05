/**
 * ProjectService - Manages projects (lightweight grouping of tasks)
 */

import db from '../db.js';

/**
 * Create a new project
 */
export async function createProject(teamId, { name, description = null, createdBy = null }) {
  const result = await db.query(
    `INSERT INTO projects (team_id, name, description, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [teamId, name, description, createdBy]
  );
  return mapProject(result.rows[0]);
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
export async function getProjects(teamId) {
  const result = await db.query(
    `SELECT * FROM projects
     WHERE team_id = $1
     ORDER BY status = 'active' DESC, updated_at DESC`,
    [teamId]
  );
  return result.rows.map(mapProject);
}

/**
 * Update a project
 */
export async function updateProject(projectId, updates) {
  const allowedFields = ['name', 'description', 'status'];
  const setClauses = [];
  const params = [projectId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      setClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return getProjectById(projectId);
  }

  setClauses.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE projects SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] ? mapProject(result.rows[0]) : null;
}

/**
 * Delete a project
 */
export async function deleteProject(projectId) {
  const result = await db.query('DELETE FROM projects WHERE id = $1 RETURNING id', [projectId]);
  return result.rows.length > 0;
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
  deleteProject
};
