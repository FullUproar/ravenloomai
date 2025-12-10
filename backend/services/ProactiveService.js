/**
 * ProactiveService - AI-Powered Proactive Intelligence
 *
 * Inspired by Motion, Reclaim AI, and Clockwise.
 * This service provides:
 * - Task health monitoring and risk prediction
 * - Smart nudges based on user patterns
 * - Workload analysis and recommendations
 * - Stale task detection
 */

import db from '../db.js';
import OpenAI from 'openai';
import * as TaskService from './TaskService.js';
import * as CalendarService from './CalendarService.js';
import * as KnowledgeService from './KnowledgeService.js';
import * as TeamService from './TeamService.js';
import * as RateLimiterService from './RateLimiterService.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// TASK HEALTH MONITORING
// ============================================================================

/**
 * Calculate task health score and risk level
 * Returns 0.0 (critical) to 1.0 (healthy)
 */
export async function calculateTaskHealth(taskId) {
  const task = await TaskService.getTaskById(taskId);
  if (!task || task.status === 'done') return null;

  const now = new Date();
  let healthScore = 1.0;
  let riskFactors = [];
  let riskLevel = 'low';

  // Factor 1: Days until due
  if (task.dueAt) {
    const dueDate = new Date(task.dueAt);
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
      // Overdue
      healthScore -= 0.5;
      riskFactors.push(`Overdue by ${Math.abs(daysUntilDue)} days`);
    } else if (daysUntilDue === 0) {
      healthScore -= 0.3;
      riskFactors.push('Due today');
    } else if (daysUntilDue <= 2) {
      healthScore -= 0.2;
      riskFactors.push(`Due in ${daysUntilDue} days`);
    }
  }

  // Factor 2: Task age (stale tasks)
  const createdAt = new Date(task.createdAt);
  const taskAgeDays = Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24));

  if (task.status === 'todo' && taskAgeDays > 14) {
    healthScore -= 0.2;
    riskFactors.push(`No progress in ${taskAgeDays} days`);
  } else if (task.status === 'in_progress') {
    // Get last activity
    const activity = await db.query(
      `SELECT created_at FROM task_activity WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [taskId]
    );
    if (activity.rows.length > 0) {
      const lastActivityDays = Math.ceil((now - new Date(activity.rows[0].created_at)) / (1000 * 60 * 60 * 24));
      if (lastActivityDays > 7) {
        healthScore -= 0.15;
        riskFactors.push(`No activity for ${lastActivityDays} days`);
      }
    }
  }

  // Factor 3: Priority vs age
  if (task.priority === 'urgent' && taskAgeDays > 3) {
    healthScore -= 0.2;
    riskFactors.push('Urgent task aging');
  } else if (task.priority === 'high' && taskAgeDays > 7) {
    healthScore -= 0.1;
    riskFactors.push('High priority task delayed');
  }

  // Factor 4: Estimate vs actual (if applicable)
  if (task.estimatedHours && task.actualHours) {
    if (task.actualHours > task.estimatedHours * 1.5) {
      healthScore -= 0.1;
      riskFactors.push('Exceeding time estimate');
    }
  }

  // Determine risk level
  if (healthScore <= 0.3) riskLevel = 'critical';
  else if (healthScore <= 0.5) riskLevel = 'high';
  else if (healthScore <= 0.7) riskLevel = 'medium';
  else riskLevel = 'low';

  // Clamp score
  healthScore = Math.max(0, Math.min(1, healthScore));

  // Generate suggested interventions
  const interventions = [];
  if (riskFactors.includes('Overdue')) {
    interventions.push({ intervention: 'Extend deadline', impact: 'high' });
    interventions.push({ intervention: 'Break into smaller tasks', impact: 'medium' });
  }
  if (riskFactors.some(f => f.includes('No progress') || f.includes('No activity'))) {
    interventions.push({ intervention: 'Check for blockers', impact: 'high' });
    interventions.push({ intervention: 'Reassign task', impact: 'medium' });
  }
  if (task.priority === 'urgent') {
    interventions.push({ intervention: 'Add to focus time', impact: 'high' });
  }

  // Store health metrics
  await db.query(`
    INSERT INTO task_health_metrics (task_id, health_score, risk_level, days_until_due, suggested_interventions)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (task_id) DO UPDATE SET
      health_score = EXCLUDED.health_score,
      risk_level = EXCLUDED.risk_level,
      days_until_due = EXCLUDED.days_until_due,
      suggested_interventions = EXCLUDED.suggested_interventions,
      computed_at = NOW()
  `, [
    taskId,
    healthScore,
    riskLevel,
    task.dueAt ? Math.ceil((new Date(task.dueAt) - now) / (1000 * 60 * 60 * 24)) : null,
    JSON.stringify(interventions)
  ]);

  return {
    taskId,
    taskTitle: task.title,
    healthScore,
    riskLevel,
    riskFactors,
    interventions
  };
}

/**
 * Calculate health for all active tasks in a team
 */
export async function calculateTeamTaskHealth(teamId) {
  const tasks = await TaskService.getTasks(teamId, { status: ['todo', 'in_progress'] });
  const healthReports = [];

  for (const task of tasks) {
    const health = await calculateTaskHealth(task.id);
    if (health) healthReports.push(health);
  }

  return healthReports.sort((a, b) => a.healthScore - b.healthScore);
}

/**
 * Get tasks at risk (health score below threshold)
 */
export async function getAtRiskTasks(teamId, threshold = 0.6) {
  const result = await db.query(`
    SELECT thm.*, t.title, t.status, t.priority, t.due_at, t.assigned_to
    FROM task_health_metrics thm
    JOIN tasks t ON t.id = thm.task_id
    WHERE t.team_id = $1 AND t.status != 'done' AND thm.health_score <= $2
    ORDER BY thm.health_score ASC
  `, [teamId, threshold]);

  return result.rows.map(row => ({
    taskId: row.task_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    assignedTo: row.assigned_to,
    healthScore: row.health_score,
    riskLevel: row.risk_level,
    interventions: row.suggested_interventions
  }));
}

// ============================================================================
// SMART NUDGES
// ============================================================================

/**
 * Generate proactive nudges for a user
 */
export async function generateNudgesForUser(teamId, userId) {
  // Check if smart nudges are enabled for this team
  const nudgesEnabled = await TeamService.getProactiveFeatureStatus(teamId, 'smartNudges');
  if (!nudgesEnabled) {
    return []; // Return empty if disabled
  }

  const nudges = [];
  const now = new Date();

  // Get user's preferences
  const prefsResult = await db.query(
    `SELECT * FROM focus_time_preferences WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );
  const prefs = prefsResult.rows[0] || {
    nudge_overdue_tasks: true,
    nudge_stale_tasks: true,
    nudge_upcoming_deadlines: true
  };

  // 1. Overdue tasks
  if (prefs.nudge_overdue_tasks) {
    const overdueTasks = await db.query(`
      SELECT * FROM tasks
      WHERE team_id = $1 AND assigned_to = $2 AND status != 'done'
        AND due_at < NOW()
      ORDER BY due_at ASC
      LIMIT 5
    `, [teamId, userId]);

    for (const task of overdueTasks.rows) {
      const daysOverdue = Math.ceil((now - new Date(task.due_at)) / (1000 * 60 * 60 * 24));
      nudges.push({
        nudgeType: 'overdue_task',
        title: 'Overdue Task',
        message: `"${task.title}" is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`,
        priority: daysOverdue > 7 ? 'urgent' : daysOverdue > 3 ? 'high' : 'medium',
        relatedTaskId: task.id,
        suggestedActions: [
          { action: 'complete', label: 'Mark Complete' },
          { action: 'extend', label: 'Extend Deadline' },
          { action: 'reassign', label: 'Reassign' }
        ],
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours
      });
    }
  }

  // 2. Upcoming deadlines (next 48 hours)
  if (prefs.nudge_upcoming_deadlines) {
    const upcomingTasks = await db.query(`
      SELECT * FROM tasks
      WHERE team_id = $1 AND assigned_to = $2 AND status != 'done'
        AND due_at BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
      ORDER BY due_at ASC
      LIMIT 5
    `, [teamId, userId]);

    for (const task of upcomingTasks.rows) {
      const hoursUntil = Math.ceil((new Date(task.due_at) - now) / (1000 * 60 * 60));
      nudges.push({
        nudgeType: 'upcoming_deadline',
        title: 'Deadline Approaching',
        message: `"${task.title}" is due in ${hoursUntil < 24 ? hoursUntil + ' hours' : Math.ceil(hoursUntil / 24) + ' days'}`,
        priority: hoursUntil < 12 ? 'high' : 'medium',
        relatedTaskId: task.id,
        suggestedActions: [
          { action: 'focus', label: 'Add to Focus Time' },
          { action: 'complete', label: 'Mark Complete' }
        ],
        expiresAt: new Date(task.due_at)
      });
    }
  }

  // 3. Stale tasks (no activity in 7+ days)
  if (prefs.nudge_stale_tasks) {
    const staleTasks = await db.query(`
      SELECT t.*,
        COALESCE(
          (SELECT MAX(created_at) FROM task_activity WHERE task_id = t.id),
          t.created_at
        ) as last_activity
      FROM tasks t
      WHERE t.team_id = $1 AND t.assigned_to = $2 AND t.status = 'in_progress'
        AND (
          (SELECT MAX(created_at) FROM task_activity WHERE task_id = t.id) < NOW() - INTERVAL '7 days'
          OR (NOT EXISTS (SELECT 1 FROM task_activity WHERE task_id = t.id) AND t.created_at < NOW() - INTERVAL '7 days')
        )
      ORDER BY last_activity ASC
      LIMIT 5
    `, [teamId, userId]);

    for (const task of staleTasks.rows) {
      const daysSinceActivity = Math.ceil((now - new Date(task.last_activity)) / (1000 * 60 * 60 * 24));
      nudges.push({
        nudgeType: 'stale_task',
        title: 'Stale Task',
        message: `"${task.title}" hasn't had activity in ${daysSinceActivity} days`,
        priority: daysSinceActivity > 14 ? 'high' : 'medium',
        relatedTaskId: task.id,
        suggestedActions: [
          { action: 'update_status', label: 'Update Status' },
          { action: 'add_blocker', label: 'Mark Blocked' },
          { action: 'complete', label: 'Mark Complete' }
        ],
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });
    }
  }

  // 4. Meeting prep nudges (events in next 30 minutes without prep)
  const upcomingMeetings = await db.query(`
    SELECT e.* FROM events e
    LEFT JOIN meeting_prep mp ON mp.event_id = e.id AND mp.user_id = $2
    WHERE e.team_id = $1 AND e.start_at BETWEEN NOW() AND NOW() + INTERVAL '30 minutes'
      AND mp.id IS NULL
    ORDER BY e.start_at ASC
    LIMIT 3
  `, [teamId, userId]);

  for (const event of upcomingMeetings.rows) {
    nudges.push({
      nudgeType: 'meeting_prep',
      title: 'Meeting Starting Soon',
      message: `"${event.title}" starts in ${Math.ceil((new Date(event.start_at) - now) / (1000 * 60))} minutes. Want me to prepare context?`,
      priority: 'high',
      relatedEventId: event.id,
      suggestedActions: [
        { action: 'prepare', label: 'Prepare Context' },
        { action: 'dismiss', label: 'Skip' }
      ],
      expiresAt: new Date(event.start_at)
    });
  }

  // Store nudges in database
  for (const nudge of nudges) {
    // Check if similar nudge already exists and is pending
    const existing = await db.query(`
      SELECT id FROM proactive_nudges
      WHERE team_id = $1 AND user_id = $2 AND nudge_type = $3 AND status = 'pending'
        AND (related_task_id = $4 OR related_event_id = $5)
    `, [teamId, userId, nudge.nudgeType, nudge.relatedTaskId || null, nudge.relatedEventId || null]);

    if (existing.rows.length === 0) {
      await db.query(`
        INSERT INTO proactive_nudges
        (team_id, user_id, nudge_type, title, message, priority, related_task_id, related_event_id, suggested_actions, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        teamId, userId, nudge.nudgeType, nudge.title, nudge.message, nudge.priority,
        nudge.relatedTaskId || null, nudge.relatedEventId || null,
        JSON.stringify(nudge.suggestedActions), nudge.expiresAt
      ]);
    }
  }

  return nudges;
}

/**
 * Get pending nudges for a user
 */
export async function getPendingNudges(teamId, userId) {
  const result = await db.query(`
    SELECT * FROM proactive_nudges
    WHERE team_id = $1 AND user_id = $2 AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY
      CASE priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      created_at DESC
    LIMIT 10
  `, [teamId, userId]);

  return result.rows.map(row => ({
    id: row.id,
    nudgeType: row.nudge_type,
    title: row.title,
    message: row.message,
    priority: row.priority,
    relatedTaskId: row.related_task_id,
    relatedEventId: row.related_event_id,
    suggestedActions: row.suggested_actions,
    createdAt: row.created_at
  }));
}

/**
 * Mark nudge as acted upon or dismissed
 */
export async function updateNudgeStatus(nudgeId, status, userId) {
  const validStatuses = ['shown', 'acted', 'dismissed'];
  if (!validStatuses.includes(status)) throw new Error('Invalid status');

  const updateField = status === 'acted' ? 'acted_at' : status === 'dismissed' ? 'dismissed_at' : 'shown_at';

  await db.query(`
    UPDATE proactive_nudges
    SET status = $1, ${updateField} = NOW()
    WHERE id = $2 AND user_id = $3
  `, [status, nudgeId, userId]);

  return { success: true };
}

/**
 * Dismiss a nudge
 */
export async function dismissNudge(nudgeId, userId) {
  return updateNudgeStatus(nudgeId, 'dismissed', userId);
}

/**
 * Act on a nudge
 */
export async function actOnNudge(nudgeId, action, userId) {
  // Mark the nudge as acted upon
  await updateNudgeStatus(nudgeId, 'acted', userId);

  // Get the nudge to see what action was taken
  const result = await db.query(
    `SELECT * FROM proactive_nudges WHERE id = $1`,
    [nudgeId]
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Nudge not found' };
  }

  // Return success with action details
  return {
    success: true,
    action,
    nudgeType: result.rows[0].nudge_type,
    relatedTaskId: result.rows[0].related_task_id,
    relatedEventId: result.rows[0].related_event_id
  };
}

/**
 * Refresh task health for all tasks in a team
 */
export async function refreshTeamTaskHealth(teamId) {
  return calculateTeamTaskHealth(teamId);
}

// ============================================================================
// WORKLOAD ANALYSIS
// ============================================================================

/**
 * Analyze user workload and capacity
 */
export async function analyzeWorkload(teamId, userId) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Get tasks due this week
  const tasksDueThisWeek = await db.query(`
    SELECT * FROM tasks
    WHERE team_id = $1 AND assigned_to = $2 AND status != 'done'
      AND due_at BETWEEN $3 AND $4
    ORDER BY due_at ASC
  `, [teamId, userId, weekStart, weekEnd]);

  // Get events this week
  const eventsThisWeek = await db.query(`
    SELECT * FROM events
    WHERE team_id = $1 AND start_at BETWEEN $2 AND $3
    ORDER BY start_at ASC
  `, [teamId, weekStart, weekEnd]);

  // Calculate meeting hours
  let meetingHours = 0;
  for (const event of eventsThisWeek.rows) {
    if (!event.is_all_day) {
      const duration = (new Date(event.end_at) - new Date(event.start_at)) / (1000 * 60 * 60);
      meetingHours += duration;
    }
  }

  // Calculate task hours (estimated)
  let taskHours = 0;
  for (const task of tasksDueThisWeek.rows) {
    taskHours += task.estimated_hours || 2; // Default 2 hours if no estimate
  }

  // Assume 40 hour work week, minus meetings
  const availableHours = 40 - meetingHours;
  const workloadRatio = taskHours / availableHours;

  let workloadLevel = 'balanced';
  let recommendation = '';

  if (workloadRatio > 1.5) {
    workloadLevel = 'overloaded';
    recommendation = 'Consider delegating or extending deadlines. You have more work than available time.';
  } else if (workloadRatio > 1.2) {
    workloadLevel = 'heavy';
    recommendation = 'Your week is packed. Protect your focus time and avoid taking on more work.';
  } else if (workloadRatio < 0.5) {
    workloadLevel = 'light';
    recommendation = 'You have capacity for more work this week.';
  } else {
    recommendation = 'Your workload looks balanced for the week.';
  }

  return {
    weekStart,
    weekEnd,
    tasksDue: tasksDueThisWeek.rows.length,
    estimatedTaskHours: taskHours,
    meetingHours,
    availableHours,
    workloadRatio: Math.round(workloadRatio * 100) / 100,
    workloadLevel,
    recommendation,
    tasks: tasksDueThisWeek.rows.map(t => ({
      id: t.id,
      title: t.title,
      dueAt: t.due_at,
      estimatedHours: t.estimated_hours
    })),
    events: eventsThisWeek.rows.length
  };
}

// ============================================================================
// AI INSIGHTS GENERATION
// ============================================================================

/**
 * Generate AI insights for a team
 */
export async function generateTeamInsights(teamId) {
  // Check if insights are enabled for this team
  const insightsEnabled = await TeamService.getProactiveFeatureStatus(teamId, 'insights');
  if (!insightsEnabled) {
    return {
      insights: [],
      recommendations: [],
      summary: 'AI insights are disabled for this team.',
      metrics: {},
      disabled: true
    };
  }

  // Check rate limits before making AI call
  try {
    await RateLimiterService.enforceRateLimit(teamId);
  } catch (error) {
    console.warn('Rate limit hit for team insights:', teamId, error.message);
    return {
      insights: [],
      recommendations: [],
      summary: 'Rate limit reached. Please try again later.',
      metrics: {},
      rateLimited: true
    };
  }

  const startTime = Date.now();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Gather data
  const tasks = await TaskService.getTasks(teamId, {});
  const completedRecently = tasks.filter(t =>
    t.status === 'done' && t.completedAt && new Date(t.completedAt) > weekAgo
  );
  const overdue = tasks.filter(t =>
    t.status !== 'done' && t.dueAt && new Date(t.dueAt) < now
  );
  const atRisk = await getAtRiskTasks(teamId, 0.6);

  // Get team activity
  const messageCount = await db.query(`
    SELECT COUNT(*) as count FROM messages m
    JOIN channels c ON c.id = m.channel_id
    WHERE c.team_id = $1 AND m.created_at > $2
  `, [teamId, weekAgo]);

  // Get recent decisions
  const decisions = await KnowledgeService.getDecisions(teamId, { limit: 10 });
  const recentDecisions = decisions.filter(d => new Date(d.createdAt) > weekAgo);

  // Generate AI summary
  const prompt = `Analyze this team productivity data and provide 3-5 key insights and 2-3 actionable recommendations:

Data:
- Tasks completed this week: ${completedRecently.length}
- Overdue tasks: ${overdue.length}
- At-risk tasks: ${atRisk.length}
- Messages this week: ${messageCount.rows[0]?.count || 0}
- Decisions made: ${recentDecisions.length}

Provide JSON response:
{
  "insights": [{"title": "...", "description": "...", "sentiment": "positive|neutral|warning"}],
  "recommendations": [{"title": "...", "action": "..."}],
  "summary": "One sentence summary of team health"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a productivity analyst. Be concise and actionable.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    // Track API usage
    const durationMs = Date.now() - startTime;
    const usage = response.usage || {};
    await RateLimiterService.incrementRateLimit(teamId, usage.total_tokens || 0);
    await RateLimiterService.logApiCall({
      teamId,
      service: 'proactive',
      operation: 'generate_insights',
      model: 'gpt-4o',
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      durationMs,
      success: true
    });

    let content = response.choices[0].message.content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) content = codeBlockMatch[1].trim();

    const aiInsights = JSON.parse(content);

    // Store in cache
    await db.query(`
      INSERT INTO insights_cache (team_id, insight_type, scope, insights, summary, metrics, valid_until)
      VALUES ($1, 'daily', 'team', $2, $3, $4, NOW() + INTERVAL '6 hours')
    `, [
      teamId,
      JSON.stringify(aiInsights.insights),
      aiInsights.summary,
      JSON.stringify({
        tasksCompleted: completedRecently.length,
        overdueTasks: overdue.length,
        atRiskTasks: atRisk.length,
        messagesThisWeek: parseInt(messageCount.rows[0]?.count || 0),
        decisionsThisWeek: recentDecisions.length
      })
    ]);

    return {
      insights: aiInsights.insights,
      recommendations: aiInsights.recommendations,
      summary: aiInsights.summary,
      metrics: {
        tasksCompleted: completedRecently.length,
        overdueTasks: overdue.length,
        atRiskTasks: atRisk.length,
        messagesThisWeek: parseInt(messageCount.rows[0]?.count || 0)
      }
    };
  } catch (error) {
    console.error('Error generating insights:', error);
    // Log failed API call
    await RateLimiterService.logApiCall({
      teamId,
      service: 'proactive',
      operation: 'generate_insights',
      model: 'gpt-4o',
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error.message
    });
    return {
      insights: [],
      recommendations: [],
      summary: 'Unable to generate insights at this time.',
      metrics: {
        tasksCompleted: completedRecently.length,
        overdueTasks: overdue.length,
        atRiskTasks: atRisk.length
      }
    };
  }
}

/**
 * Get cached insights or generate new ones
 */
export async function getTeamInsights(teamId) {
  // Check cache first
  const cached = await db.query(`
    SELECT * FROM insights_cache
    WHERE team_id = $1 AND insight_type = 'daily' AND valid_until > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `, [teamId]);

  if (cached.rows.length > 0) {
    return {
      insights: cached.rows[0].insights,
      summary: cached.rows[0].summary,
      metrics: cached.rows[0].metrics,
      cached: true,
      generatedAt: cached.rows[0].created_at
    };
  }

  // Generate fresh insights
  return generateTeamInsights(teamId);
}

export default {
  calculateTaskHealth,
  calculateTeamTaskHealth,
  refreshTeamTaskHealth,
  getAtRiskTasks,
  generateNudgesForUser,
  getPendingNudges,
  updateNudgeStatus,
  dismissNudge,
  actOnNudge,
  analyzeWorkload,
  generateTeamInsights,
  getTeamInsights
};
