/**
 * WorkContextService
 *
 * Builds comprehensive work context for AI operations.
 * Provides Raven with full understanding of goal→project→task hierarchy,
 * priorities, blockers, and knowledge links.
 */

import pool from '../db.js';
import * as GoalService from './GoalService.js';
import * as ProjectService from './ProjectService.js';
import * as TaskService from './TaskService.js';
import * as KnowledgeService from './KnowledgeService.js';
import * as FocusService from './FocusService.js';

// ============================================================================
// CORE CONTEXT BUILDERS
// ============================================================================

/**
 * Build complete work context for AI operations
 * This is the main entry point for AI context gathering
 */
export async function getWorkContext(teamId, userId, options = {}) {
  const {
    includeKnowledge = true,
    includeBlockers = true,
    includeFocus = true,
    maxGoals = 10,
    maxTasksPerGoal = 20
  } = options;

  const [goals, blockers, knowledge, focus, priorities] = await Promise.all([
    getGoalsWithHierarchy(teamId, maxGoals, maxTasksPerGoal),
    includeBlockers ? getBlockedItems(teamId) : [],
    includeKnowledge ? getRelevantKnowledge(teamId) : { facts: [], decisions: [], openQuestions: [] },
    includeFocus && userId ? getUserFocusContext(teamId, userId) : null,
    getEffectivePriorities(teamId)
  ]);

  return {
    goals,
    blockers,
    knowledge,
    focus,
    priorities,
    summary: generateWorkSummary(goals, blockers, priorities)
  };
}

/**
 * Get context for a specific goal including all linked work
 */
export async function getGoalContext(goalId) {
  const goal = await GoalService.getGoal(goalId);
  if (!goal) return null;

  const [projects, directTasks, health, knowledge] = await Promise.all([
    getGoalProjects(goalId),
    getGoalDirectTasks(goalId),
    computeGoalHealth(goalId),
    getGoalKnowledge(goalId)
  ]);

  // Get all tasks (direct + inherited through projects)
  const allTasks = [...directTasks];
  for (const project of projects) {
    const projectTasks = await TaskService.getTasks(goal.teamId, { projectId: project.id });
    for (const task of projectTasks) {
      if (!allTasks.find(t => t.id === task.id)) {
        allTasks.push({ ...task, inheritedFrom: project.id });
      }
    }
  }

  return {
    goal,
    projects,
    tasks: allTasks,
    health,
    knowledge,
    summary: generateGoalSummary(goal, projects, allTasks, health)
  };
}

/**
 * Get context for a specific project
 */
export async function getProjectContext(projectId) {
  const project = await ProjectService.getProjectById(projectId);
  if (!project) return null;

  const [goals, tasks, blockedTasks, knowledge] = await Promise.all([
    GoalService.getGoalsForProject(projectId),
    TaskService.getTasks(project.teamId, { projectId }),
    getProjectBlockedTasks(projectId),
    getProjectKnowledge(projectId)
  ]);

  const health = computeProjectHealth(tasks);

  return {
    project,
    goals,
    tasks,
    blockedTasks,
    health,
    knowledge,
    summary: generateProjectSummary(project, tasks, health)
  };
}

/**
 * Get context for a specific task
 */
export async function getTaskContext(taskId) {
  const task = await TaskService.getTaskById(taskId);
  if (!task) return null;

  const [project, goals, knowledge, dependencies] = await Promise.all([
    task.projectId ? ProjectService.getProjectById(task.projectId) : null,
    GoalService.getEffectiveGoalsForTask(taskId),
    getTaskKnowledge(taskId),
    getTaskDependencies(taskId)
  ]);

  // Get effective priority
  const priority = await getTaskEffectivePriority(taskId);

  return {
    task,
    project,
    goals,
    knowledge,
    dependencies,
    effectivePriority: priority,
    summary: generateTaskSummary(task, project, goals, knowledge)
  };
}

// ============================================================================
// HIERARCHY BUILDERS
// ============================================================================

/**
 * Get all goals with their project and task hierarchy
 */
async function getGoalsWithHierarchy(teamId, maxGoals, maxTasksPerGoal) {
  const goals = await GoalService.getGoals(teamId);

  const goalsWithHierarchy = await Promise.all(
    goals.slice(0, maxGoals).map(async (goal) => {
      const [projects, health] = await Promise.all([
        getGoalProjects(goal.id),
        computeGoalHealth(goal.id)
      ]);

      // Get tasks organized by project
      const projectsWithTasks = await Promise.all(
        projects.map(async (project) => {
          const tasks = await TaskService.getTasks(teamId, { projectId: project.id });
          return {
            ...project,
            tasks: tasks.slice(0, maxTasksPerGoal),
            taskCount: tasks.length,
            completedCount: tasks.filter(t => t.status === 'done').length,
            blockedCount: tasks.filter(t => t.isBlocked).length
          };
        })
      );

      // Get orphan tasks (direct goal tasks not in any project)
      const directTasks = await getGoalDirectTasks(goal.id);
      const orphanTasks = directTasks.filter(t => !t.projectId);

      return {
        ...goal,
        health,
        projects: projectsWithTasks,
        orphanTasks: orphanTasks.slice(0, maxTasksPerGoal)
      };
    })
  );

  return goalsWithHierarchy;
}

/**
 * Get projects for a goal with task counts
 */
async function getGoalProjects(goalId) {
  const result = await pool.query(
    `SELECT p.*,
       COUNT(t.id) as task_count,
       COUNT(t.id) FILTER (WHERE t.status = 'done') as completed_count,
       COUNT(t.id) FILTER (WHERE t.is_blocked = true) as blocked_count
     FROM projects p
     JOIN goal_projects gp ON gp.project_id = p.id
     LEFT JOIN tasks t ON t.project_id = p.id
     WHERE gp.goal_id = $1
     GROUP BY p.id
     ORDER BY p.created_at`,
    [goalId]
  );
  return result.rows.map(mapProjectWithCounts);
}

/**
 * Get direct tasks for a goal (via goal_tasks, not inherited)
 */
async function getGoalDirectTasks(goalId) {
  const result = await pool.query(
    `SELECT t.* FROM tasks t
     JOIN goal_tasks gt ON gt.task_id = t.id
     WHERE gt.goal_id = $1
     ORDER BY t.effective_priority_score DESC NULLS LAST, t.due_at ASC NULLS LAST`,
    [goalId]
  );
  return result.rows.map(TaskService.mapTask);
}

// ============================================================================
// PRIORITY SYSTEM
// ============================================================================

/**
 * Get effective priorities for all tasks in a team
 */
async function getEffectivePriorities(teamId) {
  const result = await pool.query(
    `SELECT
       t.id,
       t.title,
       t.priority as task_priority,
       tep.effective_score,
       tep.max_goal_priority_score,
       tep.has_priority_conflict,
       t.status,
       t.is_blocked
     FROM tasks t
     LEFT JOIN task_effective_priorities tep ON tep.task_id = t.id
     WHERE t.team_id = $1 AND t.status != 'done'
     ORDER BY tep.effective_score DESC NULLS LAST
     LIMIT 50`,
    [teamId]
  );

  return result.rows.map(row => ({
    taskId: row.id,
    title: row.title,
    taskPriority: row.task_priority,
    effectiveScore: parseFloat(row.effective_score) || 0.5,
    goalPriorityScore: parseFloat(row.max_goal_priority_score) || 0.5,
    hasPriorityConflict: row.has_priority_conflict,
    status: row.status,
    isBlocked: row.is_blocked
  }));
}

/**
 * Get effective priority for a single task
 */
async function getTaskEffectivePriority(taskId) {
  const result = await pool.query(
    `SELECT * FROM task_effective_priorities WHERE task_id = $1`,
    [taskId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    taskPriority: row.task_priority,
    effectiveScore: parseFloat(row.effective_score) || 0.5,
    goalPriorityScore: parseFloat(row.max_goal_priority_score) || 0.5,
    hasPriorityConflict: row.has_priority_conflict
  };
}

// ============================================================================
// BLOCKERS
// ============================================================================

/**
 * Get all blocked items in a team
 */
async function getBlockedItems(teamId) {
  const result = await pool.query(
    `SELECT
       t.*,
       p.name as project_name,
       bu.display_name as blocked_by_name,
       bu.email as blocked_by_email
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN users bu ON bu.id = t.blocked_by
     WHERE t.team_id = $1 AND t.is_blocked = true
     ORDER BY t.blocked_at DESC`,
    [teamId]
  );

  return result.rows.map(row => ({
    task: TaskService.mapTask(row),
    projectName: row.project_name,
    blockedByName: row.blocked_by_name || row.blocked_by_email,
    blockedAt: row.blocked_at,
    reason: row.blocked_reason
  }));
}

/**
 * Get blocked tasks for a project
 */
async function getProjectBlockedTasks(projectId) {
  const result = await pool.query(
    `SELECT t.*, u.display_name as blocked_by_name
     FROM tasks t
     LEFT JOIN users u ON u.id = t.blocked_by
     WHERE t.project_id = $1 AND t.is_blocked = true
     ORDER BY t.blocked_at DESC`,
    [projectId]
  );
  return result.rows.map(row => ({
    ...TaskService.mapTask(row),
    blockedByName: row.blocked_by_name
  }));
}

// ============================================================================
// KNOWLEDGE INTEGRATION
// ============================================================================

/**
 * Get relevant knowledge for the team
 */
async function getRelevantKnowledge(teamId) {
  const [facts, decisions, openQuestions] = await Promise.all([
    getRecentFacts(teamId, 10),
    getRecentDecisions(teamId, 5),
    getOpenQuestions(teamId, 10)
  ]);

  return { facts, decisions, openQuestions };
}

/**
 * Get knowledge linked to a task
 */
async function getTaskKnowledge(taskId) {
  const result = await pool.query(
    `SELECT * FROM get_task_knowledge_context($1)`,
    [taskId]
  );

  const required = result.rows.filter(r => r.link_type === 'required');
  const related = result.rows.filter(r => r.link_type === 'related');
  const produced = result.rows.filter(r => r.link_type === 'produced');

  // Check for knowledge gaps (required but not available)
  const gaps = required.filter(r =>
    r.knowledge_type === 'question' && r.status !== 'answered'
  );

  return { required, related, produced, gaps };
}

/**
 * Get knowledge linked to a goal
 */
async function getGoalKnowledge(goalId) {
  const result = await pool.query(
    `SELECT * FROM get_goal_knowledge_context($1)`,
    [goalId]
  );

  return {
    required: result.rows.filter(r => r.link_type === 'required'),
    related: result.rows.filter(r => r.link_type === 'related'),
    supports: result.rows.filter(r => r.link_type === 'supports')
  };
}

/**
 * Get knowledge linked to a project (via its tasks)
 */
async function getProjectKnowledge(projectId) {
  const result = await pool.query(
    `SELECT DISTINCT tk.knowledge_type, tk.knowledge_id, tk.link_type,
       CASE tk.knowledge_type
         WHEN 'fact' THEN (SELECT f.content FROM facts f WHERE f.id = tk.knowledge_id)
         WHEN 'decision' THEN (SELECT d.what FROM decisions d WHERE d.id = tk.knowledge_id)
         WHEN 'question' THEN (SELECT tq.question FROM team_questions tq WHERE tq.id = tk.knowledge_id)
       END as content
     FROM task_knowledge tk
     JOIN tasks t ON t.id = tk.task_id
     WHERE t.project_id = $1`,
    [projectId]
  );
  return result.rows;
}

async function getRecentFacts(teamId, limit) {
  const result = await pool.query(
    `SELECT id, content, category, created_at
     FROM facts
     WHERE team_id = $1 AND superseded_by IS NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [teamId, limit]
  );
  return result.rows;
}

async function getRecentDecisions(teamId, limit) {
  const result = await pool.query(
    `SELECT id, what, why, created_at
     FROM decisions
     WHERE team_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [teamId, limit]
  );
  return result.rows;
}

async function getOpenQuestions(teamId, limit) {
  const result = await pool.query(
    `SELECT id, question, asked_by, created_at
     FROM team_questions
     WHERE team_id = $1 AND status = 'open'
     ORDER BY created_at DESC
     LIMIT $2`,
    [teamId, limit]
  );
  return result.rows;
}

// ============================================================================
// FOCUS CONTEXT
// ============================================================================

/**
 * Get user's focus items with full context
 */
async function getUserFocusContext(teamId, userId) {
  try {
    const focusItems = await FocusService.getUserFocusItems(teamId, userId);

    const itemsWithContext = await Promise.all(
      focusItems.map(async (item) => {
        let context = null;
        switch (item.itemType) {
          case 'task':
            context = await getTaskContext(item.itemId);
            break;
          case 'goal':
            context = await getGoalContext(item.itemId);
            break;
          case 'project':
            context = await getProjectContext(item.itemId);
            break;
        }
        return { ...item, context };
      })
    );

    return itemsWithContext;
  } catch (error) {
    console.error('Error getting focus context:', error);
    return [];
  }
}

// ============================================================================
// TASK DEPENDENCIES
// ============================================================================

async function getTaskDependencies(taskId) {
  // Check if task is blocked by another task
  const result = await pool.query(
    `SELECT t.id, t.title, t.status, t.is_blocked
     FROM tasks t
     WHERE t.id IN (
       SELECT UNNEST(dependencies) FROM tasks WHERE id = $1
     )`,
    [taskId]
  );
  return result.rows.map(TaskService.mapTask);
}

// ============================================================================
// HEALTH CALCULATIONS
// ============================================================================

/**
 * Compute health score for a goal
 */
async function computeGoalHealth(goalId) {
  const result = await pool.query(
    `SELECT
       COUNT(t.id) as total_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'done') as completed_tasks,
       COUNT(t.id) FILTER (WHERE t.is_blocked = true) as blocked_tasks,
       COUNT(t.id) FILTER (WHERE t.due_at < NOW() AND t.status != 'done') as overdue_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'in_progress') as in_progress_tasks,
       AVG(EXTRACT(EPOCH FROM (NOW() - t.updated_at)) / 86400)
         FILTER (WHERE t.status != 'done') as avg_stale_days
     FROM tasks t
     LEFT JOIN goal_tasks gt ON gt.task_id = t.id AND gt.goal_id = $1
     LEFT JOIN projects p ON t.project_id = p.id AND p.goals_inherit = true
     LEFT JOIN goal_projects gp ON gp.project_id = p.id AND gp.goal_id = $1
     WHERE gt.goal_id = $1 OR gp.goal_id = $1`,
    [goalId]
  );

  const row = result.rows[0];
  const total = parseInt(row.total_tasks) || 0;
  const completed = parseInt(row.completed_tasks) || 0;
  const blocked = parseInt(row.blocked_tasks) || 0;
  const overdue = parseInt(row.overdue_tasks) || 0;
  const inProgress = parseInt(row.in_progress_tasks) || 0;
  const staleDays = parseFloat(row.avg_stale_days) || 0;

  // Calculate progress
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Calculate health score (0-100)
  let healthScore = 100;

  // Deduct for blocked tasks (major issue)
  healthScore -= blocked * 15;

  // Deduct for overdue tasks
  healthScore -= overdue * 10;

  // Deduct for stale tasks (not updated in 7+ days)
  if (staleDays > 7) healthScore -= 10;
  if (staleDays > 14) healthScore -= 10;

  // Bonus for having in-progress work
  if (inProgress > 0) healthScore += 5;

  healthScore = Math.max(0, Math.min(100, healthScore));

  // Determine status
  let status = 'on_track';
  if (blocked > 0) status = 'blocked';
  else if (overdue > 0 || healthScore < 50) status = 'behind';
  else if (healthScore < 70) status = 'at_risk';

  // Risk factors
  const riskFactors = [];
  if (blocked > 0) riskFactors.push(`${blocked} task${blocked > 1 ? 's' : ''} blocked`);
  if (overdue > 0) riskFactors.push(`${overdue} task${overdue > 1 ? 's' : ''} overdue`);
  if (staleDays > 7) riskFactors.push(`Tasks stale for ${Math.round(staleDays)} days avg`);
  if (total > 0 && inProgress === 0 && completed < total) riskFactors.push('No tasks in progress');

  return {
    score: healthScore,
    status,
    progress,
    taskCount: total,
    completedCount: completed,
    blockedCount: blocked,
    overdueCount: overdue,
    inProgressCount: inProgress,
    riskFactors
  };
}

/**
 * Compute health for a project based on its tasks
 */
function computeProjectHealth(tasks) {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'done').length;
  const blocked = tasks.filter(t => t.isBlocked).length;
  const overdue = tasks.filter(t => t.dueAt && new Date(t.dueAt) < new Date() && t.status !== 'done').length;

  let healthScore = 100;
  healthScore -= blocked * 15;
  healthScore -= overdue * 10;
  healthScore = Math.max(0, Math.min(100, healthScore));

  let status = 'on_track';
  if (blocked > 0) status = 'blocked';
  else if (overdue > 0 || healthScore < 50) status = 'behind';
  else if (healthScore < 70) status = 'at_risk';

  return {
    score: healthScore,
    status,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    taskCount: total,
    completedCount: completed,
    blockedCount: blocked,
    overdueCount: overdue
  };
}

// ============================================================================
// SUMMARY GENERATORS (for AI context)
// ============================================================================

function generateWorkSummary(goals, blockers, priorities) {
  const activeGoals = goals.filter(g => g.status === 'active');
  const totalTasks = priorities.length;
  const blockedCount = blockers.length;
  const conflictCount = priorities.filter(p => p.hasPriorityConflict).length;

  let summary = `Work Overview: ${activeGoals.length} active goals, ${totalTasks} open tasks`;

  if (blockedCount > 0) {
    summary += `. WARNING: ${blockedCount} task${blockedCount > 1 ? 's' : ''} blocked`;
  }

  if (conflictCount > 0) {
    summary += `. Note: ${conflictCount} task${conflictCount > 1 ? 's have' : ' has'} priority conflicts`;
  }

  return summary;
}

function generateGoalSummary(goal, projects, tasks, health) {
  return `Goal "${goal.title}" (${goal.status}): ${health.progress}% complete, ` +
    `${projects.length} projects, ${tasks.length} tasks. ` +
    `Health: ${health.status} (${health.score}/100). ` +
    (health.riskFactors.length > 0 ? `Risks: ${health.riskFactors.join(', ')}` : 'No risks identified.');
}

function generateProjectSummary(project, tasks, health) {
  return `Project "${project.name}" (${project.status}): ${health.progress}% complete, ` +
    `${tasks.length} tasks. Health: ${health.status} (${health.score}/100).`;
}

function generateTaskSummary(task, project, goals, knowledge) {
  const goalNames = goals.map(g => g.title).join(', ');
  const projectName = project ? project.name : 'No project';
  const knowledgeGaps = knowledge.gaps?.length || 0;

  let summary = `Task "${task.title}" (${task.status}, ${task.priority} priority). `;
  summary += `Project: ${projectName}. Goals: ${goalNames || 'None'}. `;

  if (task.isBlocked) {
    summary += `BLOCKED: ${task.blockedReason}. `;
  }

  if (knowledgeGaps > 0) {
    summary += `Has ${knowledgeGaps} unanswered knowledge requirement${knowledgeGaps > 1 ? 's' : ''}.`;
  }

  return summary;
}

// ============================================================================
// HELPERS
// ============================================================================

function mapProjectWithCounts(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    taskCount: parseInt(row.task_count) || 0,
    completedCount: parseInt(row.completed_count) || 0,
    blockedCount: parseInt(row.blocked_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default {
  getWorkContext,
  getGoalContext,
  getProjectContext,
  getTaskContext,
  getEffectivePriorities,
  getBlockedItems,
  computeGoalHealth
};
