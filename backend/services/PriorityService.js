/**
 * PriorityService
 *
 * Handles priority inheritance from goals to tasks.
 * Computes effective priorities based on weighted averages.
 * Detects and reports priority conflicts.
 */

import pool from '../db.js';

// Priority text to score mapping
const PRIORITY_SCORES = {
  critical: 1.00,
  urgent: 1.00,
  high: 0.75,
  medium: 0.50,
  low: 0.25
};

// Score to priority text mapping (for display)
const SCORE_TO_PRIORITY = [
  { min: 0.90, priority: 'critical' },
  { min: 0.65, priority: 'high' },
  { min: 0.40, priority: 'medium' },
  { min: 0.00, priority: 'low' }
];

// ============================================================================
// PRIORITY CONVERSION
// ============================================================================

/**
 * Convert priority text to numeric score
 */
export function priorityToScore(priority) {
  return PRIORITY_SCORES[priority?.toLowerCase()] ?? 0.50;
}

/**
 * Convert numeric score to priority text
 */
export function scoreToPriority(score) {
  for (const { min, priority } of SCORE_TO_PRIORITY) {
    if (score >= min) return priority;
  }
  return 'medium';
}

// ============================================================================
// GOAL PRIORITY
// ============================================================================

/**
 * Set priority for a goal and propagate to linked tasks
 */
export async function setGoalPriority(goalId, priority, userId = null) {
  const score = priorityToScore(priority);

  const result = await pool.query(
    `UPDATE goals
     SET priority = $2, priority_score = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [goalId, priority, score]
  );

  if (result.rows.length === 0) {
    throw new Error('Goal not found');
  }

  // Trigger recalculation of affected tasks
  await propagateGoalPriorityChange(goalId);

  return {
    id: goalId,
    priority,
    priorityScore: score,
    affectedTaskCount: await countAffectedTasks(goalId)
  };
}

/**
 * Get goal priority with context
 */
export async function getGoalPriority(goalId) {
  const result = await pool.query(
    `SELECT id, title, priority, priority_score
     FROM goals WHERE id = $1`,
    [goalId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    goalId: row.id,
    title: row.title,
    priority: row.priority || 'medium',
    priorityScore: parseFloat(row.priority_score) || 0.50
  };
}

// ============================================================================
// TASK EFFECTIVE PRIORITY
// ============================================================================

/**
 * Compute effective priority for a single task
 */
export async function computeTaskPriority(taskId) {
  const result = await pool.query(
    `SELECT * FROM task_effective_priorities WHERE task_id = $1`,
    [taskId]
  );

  if (result.rows.length === 0) {
    // No computed priority yet, compute it now
    const task = await pool.query(
      `SELECT id, priority FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (task.rows.length === 0) return null;

    return {
      taskId,
      taskPriority: task.rows[0].priority,
      taskPriorityScore: priorityToScore(task.rows[0].priority),
      goalPriorityScore: 0.50,
      effectiveScore: priorityToScore(task.rows[0].priority),
      hasPriorityConflict: false,
      source: 'manual'
    };
  }

  const row = result.rows[0];
  return {
    taskId,
    taskPriority: row.task_priority,
    taskPriorityScore: parseFloat(row.task_priority_score) || 0.50,
    goalPriorityScore: parseFloat(row.max_goal_priority_score) || 0.50,
    effectiveScore: parseFloat(row.effective_score) || 0.50,
    hasPriorityConflict: row.has_priority_conflict === true,
    source: row.has_priority_conflict ? 'goal' : 'manual'
  };
}

/**
 * Get effective priorities for all tasks in a team, sorted by score
 */
export async function getTeamPriorities(teamId, options = {}) {
  const { limit = 50, includeCompleted = false } = options;

  const statusFilter = includeCompleted ? '' : "AND t.status != 'done'";

  const result = await pool.query(
    `SELECT
       t.id,
       t.title,
       t.priority as task_priority,
       t.status,
       t.is_blocked,
       t.assigned_to,
       u.display_name as assigned_to_name,
       p.name as project_name,
       tep.effective_score,
       tep.max_goal_priority_score as goal_priority_score,
       tep.has_priority_conflict,
       COALESCE(
         (SELECT string_agg(g.title, ', ')
          FROM goals g
          JOIN goal_tasks gt ON gt.goal_id = g.id
          WHERE gt.task_id = t.id),
         ''
       ) as goal_names
     FROM tasks t
     LEFT JOIN task_effective_priorities tep ON tep.task_id = t.id
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.team_id = $1 ${statusFilter}
     ORDER BY tep.effective_score DESC NULLS LAST, t.created_at ASC
     LIMIT $2`,
    [teamId, limit]
  );

  return result.rows.map(row => ({
    taskId: row.id,
    title: row.title,
    taskPriority: row.task_priority,
    effectiveScore: parseFloat(row.effective_score) || priorityToScore(row.task_priority),
    effectivePriority: scoreToPriority(parseFloat(row.effective_score) || 0.50),
    goalPriorityScore: parseFloat(row.goal_priority_score) || 0.50,
    hasPriorityConflict: row.has_priority_conflict === true,
    status: row.status,
    isBlocked: row.is_blocked,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    projectName: row.project_name,
    goalNames: row.goal_names
  }));
}

/**
 * Update task priority and recompute effective priority
 */
export async function setTaskPriority(taskId, priority, userId = null) {
  const result = await pool.query(
    `UPDATE tasks
     SET priority = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [taskId, priority]
  );

  if (result.rows.length === 0) {
    throw new Error('Task not found');
  }

  // The trigger will update effective_priority_score
  // Return the computed priority
  return await computeTaskPriority(taskId);
}

// ============================================================================
// PRIORITY CONFLICTS
// ============================================================================

/**
 * Detect priority conflicts in a team
 * A conflict occurs when task.priority < max(linked goal priorities)
 */
export async function detectPriorityConflicts(teamId) {
  const result = await pool.query(
    `SELECT
       t.id as task_id,
       t.title as task_title,
       t.priority as task_priority,
       tep.max_goal_priority_score as goal_priority_score,
       g.id as goal_id,
       g.title as goal_title,
       g.priority as goal_priority,
       p.name as project_name
     FROM tasks t
     JOIN task_effective_priorities tep ON tep.task_id = t.id
     LEFT JOIN goal_tasks gt ON gt.task_id = t.id
     LEFT JOIN goals g ON g.id = gt.goal_id AND g.priority_score = tep.max_goal_priority_score
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.team_id = $1
       AND t.status != 'done'
       AND tep.has_priority_conflict = true
     ORDER BY tep.max_goal_priority_score DESC, t.title`,
    [teamId]
  );

  return result.rows.map(row => ({
    taskId: row.task_id,
    taskTitle: row.task_title,
    taskPriority: row.task_priority,
    goalId: row.goal_id,
    goalTitle: row.goal_title,
    goalPriority: row.goal_priority,
    projectName: row.project_name,
    suggestion: `Consider raising task priority to ${row.goal_priority || 'match goal'}`
  }));
}

/**
 * Get summary of priority conflicts for AI context
 */
export async function getPriorityConflictSummary(teamId) {
  const conflicts = await detectPriorityConflicts(teamId);

  if (conflicts.length === 0) {
    return {
      hasConflicts: false,
      summary: 'No priority conflicts detected.',
      conflicts: []
    };
  }

  const criticalConflicts = conflicts.filter(c =>
    c.goalPriority === 'critical' || c.goalPriority === 'urgent'
  );

  return {
    hasConflicts: true,
    conflictCount: conflicts.length,
    criticalConflictCount: criticalConflicts.length,
    summary: `${conflicts.length} task${conflicts.length === 1 ? ' has' : 's have'} priority conflicts. ` +
      (criticalConflicts.length > 0
        ? `${criticalConflicts.length} critical/urgent goal${criticalConflicts.length === 1 ? '' : 's'} affected.`
        : 'No critical goals affected.'),
    conflicts
  };
}

// ============================================================================
// PRIORITY PROPAGATION
// ============================================================================

/**
 * Propagate goal priority change to all linked tasks
 * Called by trigger or manually when goal priority changes
 */
export async function propagateGoalPriorityChange(goalId) {
  // Get all tasks linked to this goal (direct or via project)
  const affectedTasks = await pool.query(
    `SELECT DISTINCT t.id
     FROM tasks t
     LEFT JOIN goal_tasks gt ON gt.task_id = t.id AND gt.goal_id = $1
     LEFT JOIN projects p ON p.id = t.project_id AND p.goals_inherit = true
     LEFT JOIN goal_projects gp ON gp.project_id = p.id AND gp.goal_id = $1
     WHERE (gt.goal_id = $1 OR gp.goal_id = $1)
       AND t.status != 'done'`,
    [goalId]
  );

  // Update effective priority for each affected task
  for (const row of affectedTasks.rows) {
    await pool.query(
      `UPDATE tasks
       SET effective_priority_score = (
         SELECT effective_score FROM task_effective_priorities WHERE task_id = $1
       ),
       priority_source = 'goal'
       WHERE id = $1`,
      [row.id]
    );
  }

  return affectedTasks.rows.length;
}

/**
 * Bulk recompute all priorities in a team
 * Useful for data cleanup or after migrations
 */
export async function recomputeTeamPriorities(teamId) {
  const result = await pool.query(
    `UPDATE tasks t
     SET
       effective_priority_score = tep.effective_score,
       priority_source = CASE
         WHEN EXISTS (SELECT 1 FROM goal_tasks WHERE task_id = t.id) THEN 'goal'
         WHEN t.project_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM goal_projects gp
           JOIN projects p ON p.id = gp.project_id
           WHERE p.id = t.project_id AND p.goals_inherit = true
         ) THEN 'project'
         ELSE 'manual'
       END
     FROM task_effective_priorities tep
     WHERE t.team_id = $1
       AND t.id = tep.task_id
       AND t.status != 'done'
     RETURNING t.id`,
    [teamId]
  );

  return {
    updatedCount: result.rows.length,
    message: `Recomputed priorities for ${result.rows.length} tasks`
  };
}

// ============================================================================
// PRIORITY SUGGESTIONS
// ============================================================================

/**
 * Suggest optimal priorities for tasks based on goals
 */
export async function suggestPriorities(teamId) {
  // Find tasks with priority conflicts
  const conflicts = await detectPriorityConflicts(teamId);

  // Find unlinked high-priority tasks that might need goals
  const orphanHighPriority = await pool.query(
    `SELECT t.id, t.title, t.priority
     FROM tasks t
     LEFT JOIN goal_tasks gt ON gt.task_id = t.id
     WHERE t.team_id = $1
       AND t.status != 'done'
       AND t.priority IN ('high', 'critical', 'urgent')
       AND gt.task_id IS NULL
       AND t.project_id IS NULL`,
    [teamId]
  );

  const suggestions = [];

  // Add conflict resolution suggestions
  for (const conflict of conflicts) {
    suggestions.push({
      type: 'conflict',
      priority: 'high',
      taskId: conflict.taskId,
      taskTitle: conflict.taskTitle,
      action: 'raise_priority',
      currentPriority: conflict.taskPriority,
      suggestedPriority: conflict.goalPriority,
      reason: `Task is linked to ${conflict.goalPriority} priority goal "${conflict.goalTitle}"`
    });
  }

  // Add orphan task suggestions
  for (const row of orphanHighPriority.rows) {
    suggestions.push({
      type: 'orphan',
      priority: 'medium',
      taskId: row.id,
      taskTitle: row.title,
      action: 'link_to_goal',
      currentPriority: row.priority,
      reason: `High priority task not linked to any goal`
    });
  }

  return {
    suggestions,
    summary: suggestions.length > 0
      ? `${suggestions.length} priority suggestion${suggestions.length === 1 ? '' : 's'}`
      : 'No priority suggestions - all looks good!'
  };
}

/**
 * Get priority queue - tasks ordered by effective priority for "what to work on next"
 */
export async function getPriorityQueue(teamId, userId = null, options = {}) {
  const { limit = 10, excludeBlocked = true } = options;

  const userFilter = userId ? 'AND (t.assigned_to = $3 OR t.assigned_to IS NULL)' : '';
  const blockedFilter = excludeBlocked ? 'AND t.is_blocked = false' : '';

  const params = userId
    ? [teamId, limit, userId]
    : [teamId, limit];

  const result = await pool.query(
    `SELECT
       t.id,
       t.title,
       t.priority,
       t.status,
       t.due_at,
       t.assigned_to,
       u.display_name as assigned_to_name,
       p.name as project_name,
       tep.effective_score,
       COALESCE(
         (SELECT string_agg(g.title, ', ')
          FROM goals g
          JOIN goal_tasks gt ON gt.goal_id = g.id
          WHERE gt.task_id = t.id),
         ''
       ) as goal_names
     FROM tasks t
     LEFT JOIN task_effective_priorities tep ON tep.task_id = t.id
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.team_id = $1
       AND t.status NOT IN ('done', 'archived')
       ${userFilter}
       ${blockedFilter}
     ORDER BY
       tep.effective_score DESC NULLS LAST,
       t.due_at ASC NULLS LAST,
       t.created_at ASC
     LIMIT $2`,
    params
  );

  return result.rows.map((row, index) => ({
    rank: index + 1,
    taskId: row.id,
    title: row.title,
    priority: row.priority,
    effectivePriority: scoreToPriority(parseFloat(row.effective_score) || 0.50),
    effectiveScore: parseFloat(row.effective_score) || priorityToScore(row.priority),
    status: row.status,
    dueAt: row.due_at,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    projectName: row.project_name,
    goalNames: row.goal_names
  }));
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Count tasks affected by a goal's priority change
 */
async function countAffectedTasks(goalId) {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT t.id)::int as count
     FROM tasks t
     LEFT JOIN goal_tasks gt ON gt.task_id = t.id AND gt.goal_id = $1
     LEFT JOIN projects p ON p.id = t.project_id AND p.goals_inherit = true
     LEFT JOIN goal_projects gp ON gp.project_id = p.id AND gp.goal_id = $1
     WHERE (gt.goal_id = $1 OR gp.goal_id = $1)
       AND t.status != 'done'`,
    [goalId]
  );
  return result.rows[0]?.count || 0;
}

export default {
  // Conversion
  priorityToScore,
  scoreToPriority,

  // Goal priority
  setGoalPriority,
  getGoalPriority,

  // Task priority
  computeTaskPriority,
  setTaskPriority,
  getTeamPriorities,

  // Conflicts
  detectPriorityConflicts,
  getPriorityConflictSummary,

  // Propagation
  propagateGoalPriorityChange,
  recomputeTeamPriorities,

  // Suggestions
  suggestPriorities,
  getPriorityQueue
};
