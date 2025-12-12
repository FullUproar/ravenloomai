/**
 * DigestBriefingService - AI-powered daily briefings for the digest page
 *
 * Generates personalized, conversational briefings that help users understand
 * what matters most RIGHT NOW. Caches briefings until the digest state changes.
 */

import crypto from 'crypto';
import OpenAI from 'openai';
import db from '../db.js';
import * as UserDigestService from './UserDigestService.js';
import * as RateLimiterService from './RateLimiterService.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// System Prompt for Raven
// ============================================================================

const BRIEFING_SYSTEM_PROMPT = `You are Raven, a world-class executive assistant for a team collaboration platform.
Your job is to help the user understand what matters most RIGHT NOW.

Guidelines:
- Be conversational and warm, like a trusted advisor
- Start with a greeting based on time of day (Good morning/afternoon/evening)
- Prioritize: urgent first, then important
- Be specific: mention names, channel names, task titles
- Suggest actions when appropriate (e.g., "Perhaps you'd like to..." or "I'd suggest...")
- Keep it concise: 3-5 sentences for the main briefing
- Don't just list items - synthesize and prioritize
- If there's nothing urgent, say so clearly and suggest what to focus on
- Use a professional but friendly tone

Example tone:
"Good morning. You have a few messages from Sarah in #design that look time-sensitive - she's asking about the logo revisions. I'd tackle that first. After that, your 2pm client call prep is the main event today. The rest can wait."

Another example:
"Good afternoon. Looks like you have some unread messages from Ethan in #manufacturing. He's looking to understand the quote more deeply. Perhaps you'd like to kick off a Research project for this. Looking at the upcoming tasks, I'd suggest focusing today on getting the designs ready for submission."`;

// ============================================================================
// Main Briefing Functions
// ============================================================================

/**
 * Get or generate AI briefing for user's digest
 */
export async function getDigestBriefing(teamId, userId) {
  try {
    // 1. Get current digest
    const digest = await UserDigestService.getUserDigest(teamId, userId);

    // 2. Compute hash of current state
    const currentHash = computeDigestHash(digest);

    // 3. Check cache
    const cached = await getCachedBriefing(teamId, userId);
    if (cached && cached.digest_hash === currentHash) {
      return {
        briefing: cached.briefing,
        cached: true,
        generatedAt: cached.generated_at
      };
    }

    // 4. Check rate limit before generating
    try {
      await RateLimiterService.enforceRateLimit(teamId);
    } catch (error) {
      // Rate limited - return cached if available, otherwise null
      if (cached) {
        return {
          briefing: cached.briefing,
          cached: true,
          generatedAt: cached.generated_at,
          rateLimited: true
        };
      }
      return {
        briefing: null,
        error: 'Rate limited. Please try again later.'
      };
    }

    // 5. Gather comprehensive context
    const context = await gatherBriefingContext(teamId, userId, digest);

    // 6. Generate with LLM
    const briefing = await generateBriefing(context, teamId);

    // 7. Cache result
    await cacheBriefing(teamId, userId, currentHash, briefing);

    return {
      briefing,
      cached: false,
      generatedAt: new Date()
    };
  } catch (error) {
    console.error('Error generating digest briefing:', error);
    return {
      briefing: null,
      error: error.message
    };
  }
}

/**
 * Force regenerate briefing (for manual refresh)
 */
export async function regenerateBriefing(teamId, userId) {
  try {
    // Check rate limit
    await RateLimiterService.enforceRateLimit(teamId);

    // Get digest and context
    const digest = await UserDigestService.getUserDigest(teamId, userId);
    const context = await gatherBriefingContext(teamId, userId, digest);

    // Generate fresh briefing
    const briefing = await generateBriefing(context, teamId);

    // Cache it
    const hash = computeDigestHash(digest);
    await cacheBriefing(teamId, userId, hash, briefing);

    return {
      briefing,
      cached: false,
      generatedAt: new Date()
    };
  } catch (error) {
    console.error('Error regenerating briefing:', error);
    throw error;
  }
}

// ============================================================================
// Hash Computation
// ============================================================================

/**
 * Compute a hash of the digest state to detect meaningful changes
 */
function computeDigestHash(digest) {
  // Build a string representation of the digest state
  const items = digest.items.map(item => {
    // Include type and relevant ID
    const id = item.channel?.id || item.task?.id || item.event?.id ||
               item.goal?.id || item.project?.id || 'unknown';
    // Include unread count for channels
    const extra = item.unreadCount ? `:${item.unreadCount}` : '';
    return `${item.type}:${id}${extra}`;
  });

  // Add total count to detect additions/removals
  const hashInput = `${digest.totalCount}|${items.join('|')}`;

  return crypto.createHash('md5').update(hashInput).digest('hex');
}

// ============================================================================
// Context Gathering
// ============================================================================

/**
 * Gather comprehensive context for LLM briefing generation
 */
async function gatherBriefingContext(teamId, userId, digest) {
  const [
    unreadMessages,
    activeProjects,
    activeGoals,
    upcomingTasks,
    todayEvents,
    recentFacts,
    userInfo
  ] = await Promise.all([
    getUnreadMessageContent(teamId, userId),
    getActiveProjects(teamId),
    getActiveGoals(teamId),
    getUpcomingTasks(teamId, userId),
    getTodayEvents(teamId),
    getRecentFacts(teamId, 10),
    getUserContext(userId)
  ]);

  return {
    digest,
    unreadMessages,
    activeProjects,
    activeGoals,
    upcomingTasks,
    todayEvents,
    recentFacts,
    userInfo,
    currentTime: new Date()
  };
}

/**
 * Get actual message content from unread channels
 */
async function getUnreadMessageContent(teamId, userId) {
  const result = await db.query(
    `SELECT
       c.id as channel_id,
       c.name as channel_name,
       m.content,
       m.created_at,
       u.display_name as sender_name
     FROM channels c
     JOIN messages m ON m.channel_id = c.id
     LEFT JOIN users u ON m.user_id = u.id
     LEFT JOIN channel_last_seen cls ON cls.channel_id = c.id AND cls.user_id = $2
     WHERE c.team_id = $1
       AND m.created_at > COALESCE(cls.last_seen_at, '1970-01-01'::timestamp)
       AND m.is_ai = false
     ORDER BY m.created_at DESC
     LIMIT 15`,
    [teamId, userId]
  );

  // Group by channel
  const byChannel = {};
  for (const row of result.rows) {
    if (!byChannel[row.channel_name]) {
      byChannel[row.channel_name] = [];
    }
    if (byChannel[row.channel_name].length < 3) {
      byChannel[row.channel_name].push({
        sender: row.sender_name || 'Unknown',
        content: truncate(row.content, 100),
        time: row.created_at
      });
    }
  }

  return byChannel;
}

/**
 * Get active projects with descriptions
 */
async function getActiveProjects(teamId) {
  const result = await db.query(
    `SELECT id, name, description, status, due_date
     FROM projects
     WHERE team_id = $1 AND status NOT IN ('completed', 'cancelled', 'archived')
     ORDER BY due_date ASC NULLS LAST
     LIMIT 10`,
    [teamId]
  );

  return result.rows.map(row => ({
    name: row.name,
    description: truncate(row.description, 80),
    status: row.status,
    dueDate: row.due_date
  }));
}

/**
 * Get active goals with progress
 */
async function getActiveGoals(teamId) {
  const result = await db.query(
    `SELECT id, title, description, status, progress, target_date
     FROM goals
     WHERE team_id = $1 AND status NOT IN ('completed', 'cancelled')
     ORDER BY target_date ASC NULLS LAST
     LIMIT 10`,
    [teamId]
  );

  return result.rows.map(row => ({
    title: row.title,
    description: truncate(row.description, 80),
    status: row.status,
    progress: row.progress || 0,
    targetDate: row.target_date
  }));
}

/**
 * Get upcoming tasks for the user
 */
async function getUpcomingTasks(teamId, userId) {
  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const result = await db.query(
    `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_at,
            p.name as project_name
     FROM tasks t
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.team_id = $1
       AND t.status NOT IN ('done', 'cancelled')
       AND (t.assigned_to = $2 OR t.assigned_to IS NULL)
       AND (t.due_at IS NULL OR t.due_at <= $3)
     ORDER BY
       CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
       t.due_at ASC,
       t.priority DESC
     LIMIT 10`,
    [teamId, userId, weekFromNow]
  );

  return result.rows.map(row => ({
    title: row.title,
    description: truncate(row.description, 60),
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    projectName: row.project_name
  }));
}

/**
 * Get today's events
 */
async function getTodayEvents(teamId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const result = await db.query(
    `SELECT id, title, description, location, start_at, end_at, is_all_day
     FROM events
     WHERE team_id = $1
       AND start_at >= $2 AND start_at < $3
     ORDER BY start_at ASC
     LIMIT 10`,
    [teamId, today, tomorrow]
  );

  return result.rows.map(row => ({
    title: row.title,
    description: truncate(row.description, 60),
    location: row.location,
    startAt: row.start_at,
    endAt: row.end_at,
    isAllDay: row.is_all_day
  }));
}

/**
 * Get recent knowledge base facts
 */
async function getRecentFacts(teamId, limit) {
  const result = await db.query(
    `SELECT content, category, created_at
     FROM facts
     WHERE team_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [teamId, limit]
  );

  return result.rows.map(row => ({
    content: truncate(row.content, 100),
    category: row.category
  }));
}

/**
 * Get user context
 */
async function getUserContext(userId) {
  const result = await db.query(
    `SELECT id, email, display_name
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return { displayName: 'User' };
  }

  const user = result.rows[0];
  return {
    displayName: user.display_name || user.email?.split('@')[0] || 'User'
  };
}

// ============================================================================
// LLM Generation
// ============================================================================

/**
 * Generate briefing with LLM
 */
async function generateBriefing(context, teamId) {
  const prompt = buildBriefingPrompt(context);

  const startTime = Date.now();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 400,
      temperature: 0.7
    });

    const briefing = response.choices[0].message.content;

    // Log the API call
    const duration = Date.now() - startTime;
    const tokens = response.usage?.total_tokens || 0;

    await RateLimiterService.incrementRateLimit(teamId, tokens);
    await RateLimiterService.logApiCall({
      teamId,
      serviceName: 'DigestBriefingService',
      operationType: 'generateBriefing',
      model: 'gpt-4o',
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: tokens,
      durationMs: duration,
      success: true
    });

    return briefing;
  } catch (error) {
    const duration = Date.now() - startTime;

    await RateLimiterService.logApiCall({
      teamId,
      serviceName: 'DigestBriefingService',
      operationType: 'generateBriefing',
      model: 'gpt-4o',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs: duration,
      success: false,
      errorMessage: error.message
    });

    throw error;
  }
}

/**
 * Build the user prompt with context
 */
function buildBriefingPrompt(context) {
  const timeOfDay = getTimeOfDay(context.currentTime);
  const userName = context.userInfo?.displayName || 'User';

  let prompt = `Current time: ${formatDateTime(context.currentTime)}
Time of day: ${timeOfDay}
User: ${userName}

`;

  // Unread messages
  prompt += `UNREAD MESSAGES:\n`;
  const channels = Object.entries(context.unreadMessages);
  if (channels.length === 0) {
    prompt += `No unread messages.\n`;
  } else {
    for (const [channelName, messages] of channels) {
      prompt += `#${channelName}:\n`;
      for (const msg of messages) {
        prompt += `  - ${msg.sender}: "${msg.content}"\n`;
      }
    }
  }
  prompt += `\n`;

  // Today's events
  prompt += `TODAY'S EVENTS:\n`;
  if (context.todayEvents.length === 0) {
    prompt += `No events scheduled for today.\n`;
  } else {
    for (const event of context.todayEvents) {
      const time = event.isAllDay ? 'All day' : formatTime(event.startAt);
      const location = event.location ? ` at ${event.location}` : '';
      prompt += `- ${time}: ${event.title}${location}\n`;
    }
  }
  prompt += `\n`;

  // Upcoming tasks
  prompt += `TASKS DUE SOON:\n`;
  if (context.upcomingTasks.length === 0) {
    prompt += `No tasks due in the next week.\n`;
  } else {
    for (const task of context.upcomingTasks) {
      const due = task.dueAt ? `Due ${formatRelativeDate(task.dueAt)}` : 'No due date';
      const project = task.projectName ? ` (${task.projectName})` : '';
      prompt += `- ${task.title}${project} - ${due} [${task.priority || 'normal'} priority]\n`;
    }
  }
  prompt += `\n`;

  // Active goals
  if (context.activeGoals.length > 0) {
    prompt += `ACTIVE GOALS (${context.activeGoals.length}):\n`;
    for (const goal of context.activeGoals.slice(0, 5)) {
      prompt += `- ${goal.title} (${goal.progress}% complete)\n`;
    }
    prompt += `\n`;
  }

  // Active projects
  if (context.activeProjects.length > 0) {
    prompt += `ACTIVE PROJECTS (${context.activeProjects.length}):\n`;
    for (const project of context.activeProjects.slice(0, 5)) {
      const due = project.dueDate ? ` - Due ${formatRelativeDate(project.dueDate)}` : '';
      prompt += `- ${project.name}${due}\n`;
    }
    prompt += `\n`;
  }

  // Recent team knowledge (if relevant)
  if (context.recentFacts.length > 0) {
    prompt += `RECENT TEAM KNOWLEDGE:\n`;
    for (const fact of context.recentFacts.slice(0, 5)) {
      prompt += `- [${fact.category}] ${fact.content}\n`;
    }
    prompt += `\n`;
  }

  prompt += `Based on this context, provide a personalized daily briefing for ${userName}. What should they focus on? What's urgent vs can wait? Any suggestions for how to approach the day?`;

  return prompt;
}

// ============================================================================
// Caching
// ============================================================================

/**
 * Get cached briefing
 */
async function getCachedBriefing(teamId, userId) {
  const result = await db.query(
    `SELECT briefing, digest_hash, generated_at
     FROM user_digest_briefings
     WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  return result.rows[0] || null;
}

/**
 * Cache a briefing
 */
async function cacheBriefing(teamId, userId, hash, briefing) {
  await db.query(
    `INSERT INTO user_digest_briefings (user_id, team_id, digest_hash, briefing, generated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, team_id)
     DO UPDATE SET digest_hash = $3, briefing = $4, generated_at = NOW()`,
    [userId, teamId, hash, briefing]
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

function getTimeOfDay(date) {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function formatDateTime(date) {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatRelativeDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays < 7) return `in ${diffDays} days`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default {
  getDigestBriefing,
  regenerateBriefing
};
