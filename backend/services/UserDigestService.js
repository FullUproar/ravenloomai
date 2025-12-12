/**
 * UserDigestService - Generates personalized priority-ordered digest for users
 *
 * Priority Order:
 * 1. Unread messages (channels with messages since user last viewed)
 * 2. Events today (or tomorrow if after 4PM)
 * 3. Tasks due today (or tomorrow if after 4PM)
 * 4. Updated items (projects, goals, tasks) - until viewed or 24h timeout
 * 5. Events tomorrow (only before 4PM)
 * 6. Tasks due 1-7 days
 */

import db from '../db.js';

// ============================================================================
// Main Digest Function
// ============================================================================

/**
 * Get prioritized digest queue for a user
 * Returns items sorted by priority tier, then by tie-breaking rules
 */
export async function getUserDigest(teamId, userId) {
  const timeWindow = getTimeWindow();
  const lastDigestView = await getLastDigestView(teamId, userId);

  // Fetch all potential items in parallel
  const [
    unreadChannels,
    eventsToday,
    eventsTomorrow,
    tasksDueToday,
    tasksDueWeek,
    updatedGoals,
    updatedProjects,
    updatedTasks
  ] = await Promise.all([
    getUnreadChannels(teamId, userId),
    getEventsInRange(teamId, userId, timeWindow.todayStart, timeWindow.todayEnd),
    timeWindow.tomorrowStart ? getEventsInRange(teamId, userId, timeWindow.tomorrowStart, timeWindow.tomorrowEnd) : Promise.resolve([]),
    getTasksDueInRange(teamId, userId, timeWindow.todayStart, timeWindow.todayEnd),
    getTasksDueInRange(teamId, userId, timeWindow.tomorrowEnd || timeWindow.todayEnd, timeWindow.weekEnd),
    getUpdatedGoals(teamId, userId, lastDigestView),
    getUpdatedProjects(teamId, userId, lastDigestView),
    getUpdatedTasks(teamId, userId, lastDigestView)
  ]);

  // Build unified queue with priority tiers
  const queue = [
    ...unreadChannels.map(c => ({
      priority: 1,
      type: 'unread_channel',
      sortKey: c.latestMessageAt,
      channel: c.channel,
      unreadCount: c.unreadCount,
      latestMessage: c.latestMessage
    })),
    ...eventsToday.map(e => ({
      priority: 2,
      type: 'event_today',
      sortKey: e.startAt,
      event: e
    })),
    ...tasksDueToday.map(t => ({
      priority: 3,
      type: 'task_today',
      sortKey: t.dueAt,
      task: t
    })),
    ...updatedGoals.map(g => ({
      priority: 4,
      type: 'updated_goal',
      sortKey: g.updatedAt,
      goal: g
    })),
    ...updatedProjects.map(p => ({
      priority: 4,
      type: 'updated_project',
      sortKey: p.updatedAt,
      project: p
    })),
    ...updatedTasks.map(t => ({
      priority: 4,
      type: 'updated_task',
      sortKey: t.updatedAt,
      task: t
    })),
    ...eventsTomorrow.map(e => ({
      priority: 5,
      type: 'event_tomorrow',
      sortKey: e.startAt,
      event: e
    })),
    ...tasksDueWeek.map(t => ({
      priority: 6,
      type: 'task_week',
      sortKey: t.dueAt,
      task: t
    }))
  ];

  // Sort by priority tier, then by sortKey (due/start time), then by title
  queue.sort((a, b) => {
    // Priority tier first
    if (a.priority !== b.priority) return a.priority - b.priority;

    // Then by sortKey (time-based)
    if (a.sortKey && b.sortKey) {
      const timeDiff = new Date(a.sortKey).getTime() - new Date(b.sortKey).getTime();
      if (timeDiff !== 0) return timeDiff;
    }

    // Then alphabetically by title/name
    const aTitle = getItemTitle(a);
    const bTitle = getItemTitle(b);
    return aTitle.localeCompare(bTitle);
  });

  return {
    teamId,  // Include for type resolvers
    items: queue,
    top3: queue.slice(0, 3),
    totalCount: queue.length,
    hasMore: queue.length > 3
  };
}

/**
 * Get title from any digest item for sorting
 */
function getItemTitle(item) {
  if (item.channel) return item.channel.name || '';
  if (item.event) return item.event.title || '';
  if (item.task) return item.task.title || '';
  if (item.goal) return item.goal.title || '';
  if (item.project) return item.project.name || '';
  return '';
}

// ============================================================================
// Time Window Logic
// ============================================================================

/**
 * Calculate time windows based on current time
 * After 4PM, "today" extends to include tomorrow
 */
function getTimeWindow() {
  const now = new Date();
  const hour = now.getHours();

  // Start of today (midnight)
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // End of today (23:59:59)
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  // Tomorrow
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const endOfTomorrow = new Date(tomorrow);
  endOfTomorrow.setHours(23, 59, 59, 999);

  // Week end (7 days from today)
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  // After 4PM, "today" extends to include tomorrow
  if (hour >= 16) {
    return {
      todayStart: now,
      todayEnd: endOfTomorrow,  // Include all of tomorrow
      tomorrowStart: null,      // Tomorrow already included in "today"
      tomorrowEnd: null,
      weekEnd
    };
  } else {
    return {
      todayStart: now,
      todayEnd: endOfToday,
      tomorrowStart: tomorrow,
      tomorrowEnd: endOfTomorrow,
      weekEnd
    };
  }
}

// ============================================================================
// Data Fetching Functions
// ============================================================================

/**
 * Get channels with unread messages for a user
 */
async function getUnreadChannels(teamId, userId) {
  const result = await db.query(
    `SELECT
       c.id, c.name, c.channel_type, c.description,
       COUNT(m.id) as unread_count,
       MAX(m.created_at) as latest_message_at,
       (SELECT content FROM messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as latest_content,
       (SELECT user_id FROM messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as latest_user_id
     FROM channels c
     JOIN messages m ON m.channel_id = c.id
     LEFT JOIN channel_last_seen cls ON cls.channel_id = c.id AND cls.user_id = $2
     WHERE c.team_id = $1
       AND m.created_at > COALESCE(cls.last_seen_at, '1970-01-01'::timestamp)
     GROUP BY c.id, c.name, c.channel_type, c.description
     HAVING COUNT(m.id) > 0
     ORDER BY MAX(m.created_at) DESC`,
    [teamId, userId]
  );

  return result.rows.map(row => ({
    channel: {
      id: row.id,
      name: row.name,
      channelType: row.channel_type,
      description: row.description
    },
    unreadCount: parseInt(row.unread_count),
    latestMessageAt: row.latest_message_at,
    latestMessage: row.latest_content ? {
      content: row.latest_content.substring(0, 100) + (row.latest_content.length > 100 ? '...' : ''),
      userId: row.latest_user_id
    } : null
  }));
}

/**
 * Get events in a time range
 */
async function getEventsInRange(teamId, userId, startDate, endDate) {
  const result = await db.query(
    `SELECT e.*, u.display_name as created_by_name
     FROM events e
     LEFT JOIN users u ON e.created_by = u.id
     WHERE e.team_id = $1
       AND e.start_at >= $2
       AND e.start_at <= $3
     ORDER BY e.start_at ASC
     LIMIT 50`,
    [teamId, startDate, endDate]
  );

  return result.rows.map(mapEvent);
}

/**
 * Get tasks due in a time range (assigned to user or unassigned)
 */
async function getTasksDueInRange(teamId, userId, startDate, endDate) {
  const result = await db.query(
    `SELECT t.*, u.display_name as assigned_to_name, p.name as project_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.team_id = $1
       AND t.status NOT IN ('done', 'cancelled')
       AND t.due_at IS NOT NULL
       AND t.due_at >= $2
       AND t.due_at <= $3
       AND (t.assigned_to = $4 OR t.assigned_to IS NULL)
     ORDER BY t.due_at ASC
     LIMIT 50`,
    [teamId, startDate, endDate, userId]
  );

  return result.rows.map(mapTask);
}

/**
 * Get goals updated since last digest view (that user hasn't individually viewed)
 */
async function getUpdatedGoals(teamId, userId, lastDigestView) {
  // Only show updates from the last 24 hours
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  const result = await db.query(
    `SELECT g.*, u.display_name as owner_name
     FROM goals g
     LEFT JOIN users u ON g.owner_id = u.id
     LEFT JOIN digest_item_views div ON div.user_id = $2
       AND div.item_type = 'goal'
       AND div.item_id = g.id
     WHERE g.team_id = $1
       AND g.updated_at > $3
       AND g.updated_at > g.created_at + INTERVAL '1 minute'  -- Exclude just-created items
       AND div.viewed_at IS NULL  -- User hasn't viewed this item
       ${lastDigestView ? 'AND (g.updated_at > $4 OR $4 IS NULL)' : ''}
     ORDER BY g.updated_at DESC
     LIMIT 20`,
    lastDigestView ? [teamId, userId, cutoff, lastDigestView] : [teamId, userId, cutoff]
  );

  return result.rows.map(mapGoal);
}

/**
 * Get projects updated since last digest view (that user hasn't individually viewed)
 */
async function getUpdatedProjects(teamId, userId, lastDigestView) {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  const result = await db.query(
    `SELECT p.*, u.display_name as owner_name
     FROM projects p
     LEFT JOIN users u ON p.owner_id = u.id
     LEFT JOIN digest_item_views div ON div.user_id = $2
       AND div.item_type = 'project'
       AND div.item_id = p.id
     WHERE p.team_id = $1
       AND p.updated_at > $3
       AND p.updated_at > p.created_at + INTERVAL '1 minute'
       AND div.viewed_at IS NULL
       ${lastDigestView ? 'AND (p.updated_at > $4 OR $4 IS NULL)' : ''}
     ORDER BY p.updated_at DESC
     LIMIT 20`,
    lastDigestView ? [teamId, userId, cutoff, lastDigestView] : [teamId, userId, cutoff]
  );

  return result.rows.map(mapProject);
}

/**
 * Get tasks assigned to user that were updated (or newly assigned)
 */
async function getUpdatedTasks(teamId, userId, lastDigestView) {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  const result = await db.query(
    `SELECT t.*, u.display_name as assigned_to_name, p.name as project_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN projects p ON t.project_id = p.id
     LEFT JOIN digest_item_views div ON div.user_id = $2
       AND div.item_type = 'task'
       AND div.item_id = t.id
     WHERE t.team_id = $1
       AND t.assigned_to = $2
       AND t.status NOT IN ('done', 'cancelled')
       AND (
         t.updated_at > $3  -- Recently updated
         OR t.created_at > $3  -- Or newly created/assigned
       )
       AND div.viewed_at IS NULL
       ${lastDigestView ? 'AND (t.updated_at > $4 OR t.created_at > $4 OR $4 IS NULL)' : ''}
     ORDER BY GREATEST(t.updated_at, t.created_at) DESC
     LIMIT 20`,
    lastDigestView ? [teamId, userId, cutoff, lastDigestView] : [teamId, userId, cutoff]
  );

  return result.rows.map(mapTask);
}

// ============================================================================
// Tracking Functions
// ============================================================================

/**
 * Get user's last digest page view time
 */
async function getLastDigestView(teamId, userId) {
  const result = await db.query(
    `SELECT last_viewed_at FROM user_digest_views
     WHERE user_id = $1 AND team_id = $2`,
    [userId, teamId]
  );

  return result.rows[0]?.last_viewed_at || null;
}

/**
 * Mark the digest page as viewed (updates 24h timeout for update notifications)
 */
export async function markDigestViewed(teamId, userId) {
  await db.query(
    `INSERT INTO user_digest_views (user_id, team_id, last_viewed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, team_id) DO UPDATE SET last_viewed_at = NOW()`,
    [userId, teamId]
  );

  return true;
}

/**
 * Mark a channel as seen (clears unread messages for that channel)
 */
export async function markChannelSeen(channelId, userId) {
  await db.query(
    `INSERT INTO channel_last_seen (user_id, channel_id, last_seen_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, channel_id) DO UPDATE SET last_seen_at = NOW()`,
    [userId, channelId]
  );

  return true;
}

/**
 * Mark a specific item as viewed (clears "updated" notification for that item)
 */
export async function markItemViewed(itemType, itemId, userId) {
  if (!['goal', 'project', 'task'].includes(itemType)) {
    throw new Error('Invalid item type');
  }

  await db.query(
    `INSERT INTO digest_item_views (user_id, item_type, item_id, viewed_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET viewed_at = NOW()`,
    [userId, itemType, itemId]
  );

  return true;
}

// ============================================================================
// Mapping Functions
// ============================================================================

function mapEvent(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: row.start_at,
    endAt: row.end_at,
    isAllDay: row.is_all_day,
    color: row.color,
    taskId: row.task_id,
    projectId: row.project_id,
    createdBy: row.created_by,
    createdByUser: row.created_by_name ? {
      id: row.created_by,
      displayName: row.created_by_name
    } : null,
    createdAt: row.created_at
  };
}

function mapTask(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    assignedToUser: row.assigned_to_name ? {
      id: row.assigned_to,
      displayName: row.assigned_to_name
    } : null,
    project: row.project_name ? {
      id: row.project_id,
      name: row.project_name
    } : null,
    dueAt: row.due_at,
    estimatedHours: row.estimated_hours,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapGoal(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    description: row.description,
    status: row.status,
    progress: row.progress,
    targetDate: row.target_date,
    ownerId: row.owner_id,
    owner: row.owner_name ? {
      id: row.owner_id,
      displayName: row.owner_name
    } : null,
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
    owner: row.owner_name ? {
      id: row.owner_id,
      displayName: row.owner_name
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default {
  getUserDigest,
  markDigestViewed,
  markChannelSeen,
  markItemViewed
};
