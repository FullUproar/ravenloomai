import pool from '../db.js';

// Create a new goal
export async function createGoal(teamId, input, userId) {
  const { title, description, targetDate, startDate, ownerId, parentGoalId } = input;

  const result = await pool.query(
    `INSERT INTO goals (team_id, title, description, target_date, start_date, owner_id, parent_goal_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [teamId, title, description, targetDate, startDate || new Date(), ownerId || userId, parentGoalId, userId]
  );

  return mapGoal(result.rows[0]);
}

// Get all goals for a team
export async function getGoals(teamId, status = null) {
  let query = 'SELECT * FROM goals WHERE team_id = $1';
  const params = [teamId];

  if (status) {
    query += ' AND status = $2';
    params.push(status);
  }

  query += ' ORDER BY target_date ASC NULLS LAST, created_at DESC';

  const result = await pool.query(query, params);
  return result.rows.map(mapGoal);
}

// Get a single goal by ID
export async function getGoal(goalId) {
  const result = await pool.query('SELECT * FROM goals WHERE id = $1', [goalId]);
  return result.rows[0] ? mapGoal(result.rows[0]) : null;
}

// Get child goals
export async function getChildGoals(parentGoalId) {
  const result = await pool.query(
    'SELECT * FROM goals WHERE parent_goal_id = $1 ORDER BY created_at',
    [parentGoalId]
  );
  return result.rows.map(mapGoal);
}

// Get projects for a goal
export async function getProjectsForGoal(goalId) {
  const result = await pool.query(
    'SELECT * FROM projects WHERE goal_id = $1 ORDER BY created_at',
    [goalId]
  );
  return result.rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    goalId: row.goal_id,
    name: row.name,
    description: row.description,
    status: row.status,
    color: row.color,
    dueDate: row.due_date,
    ownerId: row.owner_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

// Update a goal
export async function updateGoal(goalId, input, userId) {
  const goal = await getGoal(goalId);
  if (!goal) throw new Error('Goal not found');

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (input.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(input.title);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.targetDate !== undefined) {
    updates.push(`target_date = $${paramIndex++}`);
    values.push(input.targetDate);
  }
  if (input.startDate !== undefined) {
    updates.push(`start_date = $${paramIndex++}`);
    values.push(input.startDate);
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(input.status);
  }
  if (input.progress !== undefined) {
    updates.push(`progress = $${paramIndex++}`);
    values.push(Math.min(100, Math.max(0, input.progress)));
  }
  if (input.ownerId !== undefined) {
    updates.push(`owner_id = $${paramIndex++}`);
    values.push(input.ownerId);
  }

  updates.push(`updated_at = NOW()`);
  values.push(goalId);

  const result = await pool.query(
    `UPDATE goals SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return mapGoal(result.rows[0]);
}

// Delete a goal
export async function deleteGoal(goalId) {
  // First, unlink any projects from this goal
  await pool.query('UPDATE projects SET goal_id = NULL WHERE goal_id = $1', [goalId]);

  // Then delete the goal
  const result = await pool.query('DELETE FROM goals WHERE id = $1', [goalId]);
  return result.rowCount > 0;
}

// Calculate goal progress based on linked projects/tasks
export async function calculateGoalProgress(goalId) {
  // Get all projects linked to this goal
  const projectsResult = await pool.query(
    'SELECT id FROM projects WHERE goal_id = $1',
    [goalId]
  );

  if (projectsResult.rows.length === 0) {
    return 0;
  }

  const projectIds = projectsResult.rows.map(r => r.id);

  // Count total and completed tasks across all linked projects
  const tasksResult = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN status = 'done' THEN 1 END) as completed
     FROM tasks
     WHERE project_id = ANY($1)`,
    [projectIds]
  );

  const { total, completed } = tasksResult.rows[0];
  if (parseInt(total) === 0) return 0;

  return Math.round((parseInt(completed) / parseInt(total)) * 100);
}

// Helper to map database row to GraphQL type
function mapGoal(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    description: row.description,
    targetDate: row.target_date,
    startDate: row.start_date,
    status: row.status,
    progress: row.progress,
    ownerId: row.owner_id,
    createdBy: row.created_by,
    parentGoalId: row.parent_goal_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
