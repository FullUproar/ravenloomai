import pool from '../db.js';

// Create a new goal
export async function createGoal(teamId, input, userId) {
  const { title, description, targetDate, startDate, ownerId, parentGoalId, priority } = input;

  // Priority with score (from migration 134)
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const goalPriority = validPriorities.includes(priority) ? priority : 'medium';
  const priorityScore = { critical: 1.0, high: 0.75, medium: 0.5, low: 0.25 }[goalPriority];

  const result = await pool.query(
    `INSERT INTO goals (team_id, title, description, target_date, start_date, owner_id, parent_goal_id, created_by, priority, priority_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [teamId, title, description, targetDate, startDate || new Date(), ownerId || userId, parentGoalId, userId, goalPriority, priorityScore]
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

// Get projects for a goal (via junction table)
export async function getProjectsForGoal(goalId) {
  const result = await pool.query(
    `SELECT p.* FROM projects p
     JOIN goal_projects gp ON gp.project_id = p.id
     WHERE gp.goal_id = $1
     ORDER BY p.created_at`,
    [goalId]
  );
  return result.rows.map(mapProject);
}

// Get goals for a project
export async function getGoalsForProject(projectId) {
  const result = await pool.query(
    `SELECT g.* FROM goals g
     JOIN goal_projects gp ON gp.goal_id = g.id
     WHERE gp.project_id = $1
     ORDER BY g.title`,
    [projectId]
  );
  return result.rows.map(mapGoal);
}

// Get direct goals for a task (not inherited)
export async function getDirectGoalsForTask(taskId) {
  const result = await pool.query(
    `SELECT g.* FROM goals g
     JOIN goal_tasks gt ON gt.goal_id = g.id
     WHERE gt.task_id = $1
     ORDER BY g.title`,
    [taskId]
  );
  return result.rows.map(mapGoal);
}

// Get effective goals for a task (direct + inherited)
export async function getEffectiveGoalsForTask(taskId) {
  const result = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (g.id) g.*,
         CASE WHEN gt.id IS NOT NULL THEN 'direct' ELSE 'inherited' END as link_type
       FROM goals g
       LEFT JOIN goal_tasks gt ON gt.goal_id = g.id AND gt.task_id = $1
       LEFT JOIN tasks t ON t.id = $1
       LEFT JOIN projects p ON t.project_id = p.id AND p.goals_inherit = true
       LEFT JOIN goal_projects gp ON gp.project_id = p.id AND gp.goal_id = g.id
       WHERE gt.task_id = $1 OR (gp.project_id IS NOT NULL AND p.goals_inherit = true)
       ORDER BY g.id
     ) sub ORDER BY title`,
    [taskId]
  );
  return result.rows.map(row => ({
    ...mapGoal(row),
    linkType: row.link_type
  }));
}

// Get all tasks linked to a goal (direct + inherited)
export async function getTasksForGoal(goalId, teamId) {
  const result = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (t.id) t.*,
         CASE WHEN gt.id IS NOT NULL THEN 'direct' ELSE 'inherited' END as link_type
       FROM tasks t
       LEFT JOIN goal_tasks gt ON gt.task_id = t.id AND gt.goal_id = $1
       LEFT JOIN projects p ON t.project_id = p.id AND p.goals_inherit = true
       LEFT JOIN goal_projects gp ON gp.project_id = p.id AND gp.goal_id = $1
       WHERE t.team_id = $2
         AND (gt.goal_id = $1 OR gp.goal_id = $1)
       ORDER BY t.id
     ) sub ORDER BY created_at DESC`,
    [goalId, teamId]
  );
  return result.rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    linkType: row.link_type,
    createdAt: row.created_at
  }));
}

// ============================================================================
// Goal Association Management
// ============================================================================

// Link goal to project
export async function linkGoalToProject(goalId, projectId) {
  const result = await pool.query(
    `INSERT INTO goal_projects (goal_id, project_id)
     VALUES ($1, $2)
     ON CONFLICT (goal_id, project_id) DO NOTHING
     RETURNING *`,
    [goalId, projectId]
  );
  return result.rowCount > 0;
}

// Unlink goal from project
export async function unlinkGoalFromProject(goalId, projectId) {
  const result = await pool.query(
    `DELETE FROM goal_projects WHERE goal_id = $1 AND project_id = $2`,
    [goalId, projectId]
  );
  return result.rowCount > 0;
}

// Link goal to task (direct link)
export async function linkGoalToTask(goalId, taskId) {
  const result = await pool.query(
    `INSERT INTO goal_tasks (goal_id, task_id)
     VALUES ($1, $2)
     ON CONFLICT (goal_id, task_id) DO NOTHING
     RETURNING *`,
    [goalId, taskId]
  );
  return result.rowCount > 0;
}

// Unlink goal from task
export async function unlinkGoalFromTask(goalId, taskId) {
  const result = await pool.query(
    `DELETE FROM goal_tasks WHERE goal_id = $1 AND task_id = $2`,
    [goalId, taskId]
  );
  return result.rowCount > 0;
}

// Set all goals for a project (replaces existing)
export async function setProjectGoals(projectId, goalIds) {
  // Remove existing links
  await pool.query('DELETE FROM goal_projects WHERE project_id = $1', [projectId]);

  // Add new links
  if (goalIds && goalIds.length > 0) {
    const values = goalIds.map((gId, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
    const params = goalIds.flatMap(gId => [gId, projectId]);
    await pool.query(
      `INSERT INTO goal_projects (goal_id, project_id) VALUES ${values}`,
      params
    );
  }

  return getGoalsForProject(projectId);
}

// Set direct goals for a task (replaces existing direct links)
export async function setTaskGoals(taskId, goalIds) {
  // Remove existing direct links
  await pool.query('DELETE FROM goal_tasks WHERE task_id = $1', [taskId]);

  // Add new links
  if (goalIds && goalIds.length > 0) {
    const values = goalIds.map((gId, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
    const params = goalIds.flatMap(gId => [gId, taskId]);
    await pool.query(
      `INSERT INTO goal_tasks (goal_id, task_id) VALUES ${values}`,
      params
    );
  }

  return getDirectGoalsForTask(taskId);
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
  // Priority field (from migration 134)
  if (input.priority !== undefined) {
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    const priority = validPriorities.includes(input.priority) ? input.priority : 'medium';
    const priorityScore = { critical: 1.0, high: 0.75, medium: 0.5, low: 0.25 }[priority];
    updates.push(`priority = $${paramIndex++}`);
    values.push(priority);
    updates.push(`priority_score = $${paramIndex++}`);
    values.push(priorityScore);
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
  // Junction table entries are deleted via CASCADE
  const result = await pool.query('DELETE FROM goals WHERE id = $1', [goalId]);
  return result.rowCount > 0;
}

// Calculate goal progress based on all linked tasks (direct + inherited)
export async function calculateGoalProgress(goalId, teamId) {
  // Use the effective goals view/query to count all tasks for this goal
  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT t.id) as total,
       COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed
     FROM tasks t
     LEFT JOIN goal_tasks gt ON gt.task_id = t.id AND gt.goal_id = $1
     LEFT JOIN projects p ON t.project_id = p.id AND p.goals_inherit = true
     LEFT JOIN goal_projects gp ON gp.project_id = p.id AND gp.goal_id = $1
     WHERE (gt.goal_id = $1 OR gp.goal_id = $1)
       AND ($2::uuid IS NULL OR t.team_id = $2)`,
    [goalId, teamId || null]
  );

  const { total, completed } = result.rows[0];
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
    // Priority fields (from migration 134)
    priority: row.priority || 'medium',
    priorityScore: parseFloat(row.priority_score) || 0.5,
    ownerId: row.owner_id,
    createdBy: row.created_by,
    parentGoalId: row.parent_goal_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProject(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    description: row.description,
    status: row.status,
    color: row.color,
    dueDate: row.due_date,
    ownerId: row.owner_id,
    goalsInherit: row.goals_inherit,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
