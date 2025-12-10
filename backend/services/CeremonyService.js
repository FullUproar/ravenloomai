/**
 * CeremonyService - Productivity Rituals & Ceremonies
 *
 * Inspired by DailyBot, Geekbot, and Friday.
 * Handles:
 * - Morning Focus (AI-generated daily plan)
 * - Daily Standup (async check-in)
 * - Weekly Review (AI-summarized week)
 * - End of Day reflection
 */

import db from '../db.js';
import OpenAI from 'openai';
import * as TaskService from './TaskService.js';
import * as CalendarService from './CalendarService.js';
import * as ProactiveService from './ProactiveService.js';
import * as KnowledgeService from './KnowledgeService.js';
import * as TeamService from './TeamService.js';
import * as RateLimiterService from './RateLimiterService.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// MORNING FOCUS (AI-Generated Daily Plan)
// ============================================================================

/**
 * Generate Morning Focus plan for a user
 * This is the "Motion/Reclaim-style" AI daily planning
 */
export async function generateMorningFocus(teamId, userId) {
  // Check if Morning Focus is enabled for this team
  const morningFocusEnabled = await TeamService.getProactiveFeatureStatus(teamId, 'morningFocus');
  if (!morningFocusEnabled) {
    return {
      status: 'disabled',
      message: 'Morning Focus is disabled for this team.'
    };
  }

  // Check rate limits before making AI call
  try {
    await RateLimiterService.enforceRateLimit(teamId);
  } catch (error) {
    console.warn('Rate limit hit for morning focus:', teamId, error.message);
    return {
      status: 'rate_limited',
      message: 'Rate limit reached. Please try again later.'
    };
  }

  const startTime = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if already generated today
  const existing = await db.query(`
    SELECT * FROM ceremonies
    WHERE team_id = $1 AND user_id = $2 AND ceremony_type = 'morning_focus'
      AND scheduled_for = $3
  `, [teamId, userId, today]);

  if (existing.rows.length > 0 && existing.rows[0].status === 'completed') {
    return {
      id: existing.rows[0].id,
      status: 'already_completed',
      aiPlan: existing.rows[0].ai_plan,
      aiSummary: existing.rows[0].ai_summary
    };
  }

  // Gather context for AI planning
  const now = new Date();
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Get today's tasks (assigned to user, due today or overdue)
  const tasks = await db.query(`
    SELECT * FROM tasks
    WHERE team_id = $1 AND assigned_to = $2 AND status != 'done'
      AND (due_at IS NULL OR due_at <= $3)
    ORDER BY
      CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      due_at ASC NULLS LAST
    LIMIT 15
  `, [teamId, userId, endOfDay]);

  // 2. Get today's calendar events
  const events = await CalendarService.getEvents(teamId, {
    startDate: today.toISOString(),
    endDate: endOfDay.toISOString()
  });

  // 3. Get workload analysis
  const workload = await ProactiveService.analyzeWorkload(teamId, userId);

  // 4. Get pending nudges/alerts
  const nudges = await ProactiveService.getPendingNudges(teamId, userId);

  // Build AI prompt
  const prompt = `You are an AI productivity assistant helping plan someone's day. Create a focused, actionable daily plan.

TODAY'S DATE: ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}

TASKS TO CONSIDER (${tasks.rows.length} total):
${tasks.rows.map(t => `- [${t.priority}] ${t.title}${t.due_at ? ` (due: ${new Date(t.due_at).toLocaleDateString()})` : ''}`).join('\n') || 'No tasks'}

TODAY'S CALENDAR (${events.length} events):
${events.map(e => {
  const start = new Date(e.startAt);
  return `- ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}: ${e.title}${e.isAllDay ? ' (all day)' : ''}`;
}).join('\n') || 'No events'}

WORKLOAD STATUS: ${workload.workloadLevel}
- ${workload.tasksDue} tasks due this week
- ${workload.meetingHours} hours of meetings
- ${workload.recommendation}

${nudges.length > 0 ? `ATTENTION NEEDED:\n${nudges.map(n => `- ${n.title}: ${n.message}`).join('\n')}` : ''}

Generate a daily plan in JSON format:
{
  "greeting": "Personalized good morning message (1 sentence)",
  "topPriority": "The ONE thing to focus on today",
  "scheduledBlocks": [
    {"time": "9:00 AM", "activity": "...", "duration": "1h", "type": "focus|meeting|break"},
    ...
  ],
  "tasksToComplete": ["task title 1", "task title 2"],
  "warnings": ["Any concerns or conflicts"],
  "tip": "One productivity tip for the day"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a supportive, efficient productivity coach. Keep responses concise and actionable. Focus on what matters most.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.4
    });

    // Track API usage
    const durationMs = Date.now() - startTime;
    const usage = response.usage || {};
    await RateLimiterService.incrementRateLimit(teamId, usage.total_tokens || 0);
    await RateLimiterService.logApiCall({
      teamId,
      userId,
      service: 'ceremony',
      operation: 'morning_focus',
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

    const aiPlan = JSON.parse(content);

    // Store or update ceremony
    let ceremonyId;
    if (existing.rows.length > 0) {
      await db.query(`
        UPDATE ceremonies
        SET ai_plan = $1, ai_summary = $2, status = 'completed', completed_at = NOW()
        WHERE id = $3
      `, [JSON.stringify(aiPlan), aiPlan.greeting, existing.rows[0].id]);
      ceremonyId = existing.rows[0].id;
    } else {
      const result = await db.query(`
        INSERT INTO ceremonies (team_id, user_id, ceremony_type, scheduled_for, ai_plan, ai_summary, status, completed_at)
        VALUES ($1, $2, 'morning_focus', $3, $4, $5, 'completed', NOW())
        RETURNING id
      `, [teamId, userId, today, JSON.stringify(aiPlan), aiPlan.greeting]);
      ceremonyId = result.rows[0].id;
    }

    return {
      id: ceremonyId,
      status: 'generated',
      aiPlan,
      tasks: tasks.rows.map(t => ({ id: t.id, title: t.title, priority: t.priority, dueAt: t.due_at })),
      events,
      workload
    };
  } catch (error) {
    console.error('Error generating morning focus:', error);
    // Log failed API call
    await RateLimiterService.logApiCall({
      teamId,
      userId,
      service: 'ceremony',
      operation: 'morning_focus',
      model: 'gpt-4o',
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: error.message
    });
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Get existing Morning Focus for a date (doesn't generate new)
 */
export async function getMorningFocus(teamId, userId, date) {
  const targetDate = date ? new Date(date) : new Date();
  targetDate.setHours(0, 0, 0, 0);

  const result = await db.query(`
    SELECT * FROM ceremonies
    WHERE team_id = $1 AND user_id = $2 AND ceremony_type = 'morning_focus'
      AND scheduled_for = $3
  `, [teamId, userId, targetDate]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    status: row.status,
    aiPlan: row.ai_plan,
    aiSummary: row.ai_summary,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

// ============================================================================
// DAILY STANDUP (Async Check-in)
// ============================================================================

/**
 * Get standup questions for today
 */
export function getStandupQuestions() {
  return [
    { id: 'yesterday', question: 'What did you accomplish yesterday?', placeholder: 'I finished the design review and...' },
    { id: 'today', question: 'What will you work on today?', placeholder: 'Today I plan to...' },
    { id: 'blockers', question: 'Any blockers or concerns?', placeholder: 'Nothing blocking me / I need help with...' }
  ];
}

/**
 * Start or get today's standup for a user
 */
export async function getOrCreateStandup(teamId, userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check for existing
  const existing = await db.query(`
    SELECT * FROM ceremonies
    WHERE team_id = $1 AND user_id = $2 AND ceremony_type = 'daily_standup'
      AND scheduled_for = $3
  `, [teamId, userId, today]);

  if (existing.rows.length > 0) {
    return {
      id: existing.rows[0].id,
      responses: existing.rows[0].responses,
      status: existing.rows[0].status,
      questions: getStandupQuestions()
    };
  }

  // Create new standup
  const result = await db.query(`
    INSERT INTO ceremonies (team_id, user_id, ceremony_type, scheduled_for, status)
    VALUES ($1, $2, 'daily_standup', $3, 'pending')
    RETURNING *
  `, [teamId, userId, today]);

  return {
    id: result.rows[0].id,
    responses: {},
    status: 'pending',
    questions: getStandupQuestions()
  };
}

/**
 * Submit standup responses
 */
export async function submitStandup(ceremonyId, userId, responses) {
  // Verify ownership
  const ceremony = await db.query(
    `SELECT * FROM ceremonies WHERE id = $1 AND user_id = $2`,
    [ceremonyId, userId]
  );

  if (ceremony.rows.length === 0) {
    throw new Error('Ceremony not found');
  }

  // Generate AI summary of standup
  let aiSummary = '';
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Summarize this standup in 1-2 sentences. Be concise.' },
        { role: 'user', content: `Yesterday: ${responses.yesterday}\nToday: ${responses.today}\nBlockers: ${responses.blockers || 'None'}` }
      ],
      max_tokens: 100,
      temperature: 0
    });
    aiSummary = response.choices[0].message.content;
  } catch (e) {
    aiSummary = `Working on: ${responses.today?.substring(0, 100) || 'Not specified'}`;
  }

  await db.query(`
    UPDATE ceremonies
    SET responses = $1, ai_summary = $2, status = 'completed', completed_at = NOW()
    WHERE id = $3
  `, [JSON.stringify(responses), aiSummary, ceremonyId]);

  return {
    id: ceremonyId,
    responses,
    aiSummary,
    status: 'completed'
  };
}

/**
 * Get team standups for today
 */
export async function getTeamStandups(teamId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db.query(`
    SELECT c.*, u.display_name, u.avatar_url
    FROM ceremonies c
    JOIN users u ON u.id = c.user_id
    WHERE c.team_id = $1 AND c.ceremony_type = 'daily_standup'
      AND c.scheduled_for = $2 AND c.status = 'completed'
    ORDER BY c.completed_at DESC
  `, [teamId, today]);

  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    userName: row.display_name,
    avatarUrl: row.avatar_url,
    responses: row.responses,
    aiSummary: row.ai_summary,
    completedAt: row.completed_at
  }));
}

// ============================================================================
// WEEKLY REVIEW (AI-Summarized Week)
// ============================================================================

/**
 * Generate weekly review for a user
 */
export async function generateWeeklyReview(teamId, userId) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Check if already exists
  const existing = await db.query(`
    SELECT * FROM ceremonies
    WHERE team_id = $1 AND user_id = $2 AND ceremony_type = 'weekly_review'
      AND scheduled_for >= $3 AND scheduled_for <= $4
  `, [teamId, userId, weekStart, weekEnd]);

  if (existing.rows.length > 0 && existing.rows[0].status === 'completed') {
    return {
      id: existing.rows[0].id,
      status: 'already_completed',
      aiSummary: existing.rows[0].ai_summary,
      responses: existing.rows[0].responses
    };
  }

  // Gather week's data
  // 1. Tasks completed this week
  const completedTasks = await db.query(`
    SELECT * FROM tasks
    WHERE team_id = $1 AND assigned_to = $2 AND status = 'done'
      AND completed_at BETWEEN $3 AND $4
    ORDER BY completed_at DESC
  `, [teamId, userId, weekStart, weekEnd]);

  // 2. Tasks created this week
  const createdTasks = await db.query(`
    SELECT * FROM tasks
    WHERE team_id = $1 AND created_by = $2
      AND created_at BETWEEN $3 AND $4
  `, [teamId, userId, weekStart, weekEnd]);

  // 3. Standups completed
  const standups = await db.query(`
    SELECT * FROM ceremonies
    WHERE team_id = $1 AND user_id = $2 AND ceremony_type = 'daily_standup'
      AND scheduled_for BETWEEN $3 AND $4 AND status = 'completed'
  `, [teamId, userId, weekStart, weekEnd]);

  // 4. Messages sent
  const messages = await db.query(`
    SELECT COUNT(*) as count FROM messages m
    JOIN channels c ON c.id = m.channel_id
    WHERE c.team_id = $1 AND m.user_id = $2
      AND m.created_at BETWEEN $3 AND $4
  `, [teamId, userId, weekStart, weekEnd]);

  // 5. Events attended
  const events = await CalendarService.getEvents(teamId, {
    startDate: weekStart.toISOString(),
    endDate: weekEnd.toISOString()
  });

  // Build AI prompt
  const prompt = `Generate a weekly review summary for this team member.

WEEK: ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}

ACCOMPLISHMENTS:
- Tasks completed: ${completedTasks.rows.length}
${completedTasks.rows.slice(0, 10).map(t => `  • ${t.title}`).join('\n')}

ACTIVITY:
- Tasks created: ${createdTasks.rows.length}
- Standups completed: ${standups.rows.length}/5
- Messages sent: ${messages.rows[0]?.count || 0}
- Meetings: ${events.length}

${standups.rows.length > 0 ? `STANDUP HIGHLIGHTS:\n${standups.rows.map(s => s.ai_summary).join('\n')}` : ''}

Generate JSON:
{
  "headline": "One sentence summary of the week (celebratory tone)",
  "highlights": ["Key accomplishment 1", "Key accomplishment 2"],
  "metrics": {
    "productivity": "high|medium|low",
    "collaboration": "high|medium|low"
  },
  "areasOfFocus": ["What to focus on next week"],
  "celebration": "Something to celebrate or be proud of"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an encouraging productivity coach. Celebrate wins and provide constructive suggestions. Keep it positive and actionable.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.4
    });

    let content = response.choices[0].message.content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) content = codeBlockMatch[1].trim();

    const aiReview = JSON.parse(content);

    // Store
    let ceremonyId;
    if (existing.rows.length > 0) {
      await db.query(`
        UPDATE ceremonies
        SET ai_plan = $1, ai_summary = $2, status = 'completed', completed_at = NOW()
        WHERE id = $3
      `, [JSON.stringify(aiReview), aiReview.headline, existing.rows[0].id]);
      ceremonyId = existing.rows[0].id;
    } else {
      const result = await db.query(`
        INSERT INTO ceremonies (team_id, user_id, ceremony_type, scheduled_for, ai_plan, ai_summary, status, completed_at)
        VALUES ($1, $2, 'weekly_review', $3, $4, $5, 'completed', NOW())
        RETURNING id
      `, [teamId, userId, weekEnd, JSON.stringify(aiReview), aiReview.headline]);
      ceremonyId = result.rows[0].id;
    }

    return {
      id: ceremonyId,
      status: 'generated',
      weekStart,
      weekEnd,
      review: aiReview,
      stats: {
        tasksCompleted: completedTasks.rows.length,
        tasksCreated: createdTasks.rows.length,
        standupsCompleted: standups.rows.length,
        messagesSent: parseInt(messages.rows[0]?.count || 0),
        meetings: events.length
      }
    };
  } catch (error) {
    console.error('Error generating weekly review:', error);
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Get existing Weekly Review (doesn't generate new)
 */
export async function getWeeklyReview(teamId, userId, weekStart) {
  let startDate;
  if (weekStart) {
    startDate = new Date(weekStart);
  } else {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - startDate.getDay() + 1); // Monday
  }
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  const result = await db.query(`
    SELECT * FROM ceremonies
    WHERE team_id = $1 AND user_id = $2 AND ceremony_type = 'weekly_review'
      AND scheduled_for >= $3 AND scheduled_for <= $4
  `, [teamId, userId, startDate, endDate]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    status: row.status,
    weekStart: startDate,
    weekEnd: endDate,
    review: row.ai_plan,
    aiSummary: row.ai_summary,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

// ============================================================================
// FOCUS TIME PREFERENCES
// ============================================================================

/**
 * Get or create focus time preferences for user
 */
export async function getFocusPreferences(teamId, userId) {
  const result = await db.query(`
    SELECT * FROM focus_time_preferences
    WHERE team_id = $1 AND user_id = $2
  `, [teamId, userId]);

  if (result.rows.length > 0) {
    return mapFocusPrefs(result.rows[0]);
  }

  // Create defaults
  const insert = await db.query(`
    INSERT INTO focus_time_preferences (team_id, user_id)
    VALUES ($1, $2)
    RETURNING *
  `, [teamId, userId]);

  return mapFocusPrefs(insert.rows[0]);
}

/**
 * Update focus time preferences
 */
export async function updateFocusPreferences(teamId, userId, prefs) {
  const fields = [];
  const values = [teamId, userId];
  let idx = 3;

  const allowedFields = [
    'preferred_focus_hours', 'min_focus_block_minutes', 'max_meetings_per_day',
    'work_start_hour', 'work_end_hour', 'work_days',
    'morning_focus_enabled', 'morning_focus_time',
    'daily_standup_enabled', 'daily_standup_time',
    'weekly_review_enabled', 'weekly_review_day', 'weekly_review_time',
    'end_of_day_enabled', 'end_of_day_time',
    'nudge_overdue_tasks', 'nudge_stale_tasks', 'nudge_upcoming_deadlines'
  ];

  for (const [key, value] of Object.entries(prefs)) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey)) {
      fields.push(`${snakeKey} = $${idx}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      idx++;
    }
  }

  if (fields.length === 0) return getFocusPreferences(teamId, userId);

  await db.query(`
    INSERT INTO focus_time_preferences (team_id, user_id, ${fields.map(f => f.split(' = ')[0]).join(', ')})
    VALUES ($1, $2, ${values.slice(2).map((_, i) => `$${i + 3}`).join(', ')})
    ON CONFLICT (team_id, user_id) DO UPDATE SET ${fields.join(', ')}
  `, values);

  return getFocusPreferences(teamId, userId);
}

function mapFocusPrefs(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    preferredFocusHours: row.preferred_focus_hours,
    minFocusBlockMinutes: row.min_focus_block_minutes,
    maxMeetingsPerDay: row.max_meetings_per_day,
    workStartHour: row.work_start_hour,
    workEndHour: row.work_end_hour,
    workDays: row.work_days,
    morningFocusEnabled: row.morning_focus_enabled,
    morningFocusTime: row.morning_focus_time,
    dailyStandupEnabled: row.daily_standup_enabled,
    dailyStandupTime: row.daily_standup_time,
    weeklyReviewEnabled: row.weekly_review_enabled,
    weeklyReviewDay: row.weekly_review_day,
    weeklyReviewTime: row.weekly_review_time,
    endOfDayEnabled: row.end_of_day_enabled,
    endOfDayTime: row.end_of_day_time,
    nudgeOverdueTasks: row.nudge_overdue_tasks,
    nudgeStaleTasks: row.nudge_stale_tasks,
    nudgeUpcomingDeadlines: row.nudge_upcoming_deadlines
  };
}

export default {
  generateMorningFocus,
  getMorningFocus,
  getOrCreateStandup,
  submitStandup,
  getStandupQuestions,
  getTeamStandups,
  generateWeeklyReview,
  getWeeklyReview,
  getFocusPreferences,
  updateFocusPreferences
};
