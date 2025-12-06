/**
 * DigestService - Generates daily digests for team members
 */

import db from '../db.js';
import AIService from './AIService.js';

/**
 * Generate a daily digest for a user in a team
 */
export async function generateDigest(teamId, userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get overdue tasks
  const overdueResult = await db.query(
    `SELECT t.*, u.display_name as assigned_to_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.team_id = $1
       AND t.status != 'done'
       AND t.due_at < $2
     ORDER BY t.due_at ASC
     LIMIT 20`,
    [teamId, today]
  );

  // Get tasks due today
  const dueTodayResult = await db.query(
    `SELECT t.*, u.display_name as assigned_to_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.team_id = $1
       AND t.status != 'done'
       AND t.due_at >= $2
       AND t.due_at < $3
     ORDER BY t.due_at ASC
     LIMIT 20`,
    [teamId, today, tomorrow]
  );

  // Get upcoming alerts (next 24 hours)
  const alertsResult = await db.query(
    `SELECT *
     FROM alerts
     WHERE team_id = $1
       AND status = 'pending'
       AND trigger_at >= $2
       AND trigger_at < $3
     ORDER BY trigger_at ASC
     LIMIT 10`,
    [teamId, today, tomorrow]
  );

  // Get recent decisions (last 24 hours)
  const decisionsResult = await db.query(
    `SELECT d.*, u.display_name as made_by_name
     FROM decisions d
     LEFT JOIN users u ON d.made_by = u.id
     WHERE d.team_id = $1
       AND d.created_at >= $2 - INTERVAL '24 hours'
     ORDER BY d.created_at DESC
     LIMIT 10`,
    [teamId, today]
  );

  // Get new facts (last 24 hours)
  const factsResult = await db.query(
    `SELECT f.*, u.display_name as created_by_name
     FROM facts f
     LEFT JOIN users u ON f.created_by = u.id
     WHERE f.team_id = $1
       AND f.created_at >= $2 - INTERVAL '24 hours'
       AND f.valid_until IS NULL
     ORDER BY f.created_at DESC
     LIMIT 10`,
    [teamId, today]
  );

  // Generate activity summary using AI if there's significant activity
  let activitySummary = null;
  const hasActivity = overdueResult.rows.length > 0 ||
                      dueTodayResult.rows.length > 0 ||
                      decisionsResult.rows.length > 0 ||
                      factsResult.rows.length > 0;

  if (hasActivity) {
    try {
      activitySummary = await generateActivitySummary({
        overdueTasks: overdueResult.rows,
        dueTodayTasks: dueTodayResult.rows,
        decisions: decisionsResult.rows,
        facts: factsResult.rows
      });
    } catch (error) {
      console.error('Error generating activity summary:', error);
    }
  }

  return {
    teamId,
    date: today.toISOString().split('T')[0],
    overdueTasks: overdueResult.rows.map(mapTask),
    dueTodayTasks: dueTodayResult.rows.map(mapTask),
    upcomingAlerts: alertsResult.rows.map(mapAlert),
    recentDecisions: decisionsResult.rows.map(mapDecision),
    newFacts: factsResult.rows.map(mapFact),
    activitySummary
  };
}

/**
 * Get users who should receive digest at a given time
 */
export async function getUsersForDigest(digestTime = '09:00') {
  const result = await db.query(
    `SELECT DISTINCT u.*, tm.team_id
     FROM users u
     JOIN team_members tm ON u.id = tm.user_id
     WHERE u.digest_enabled = true
       AND u.digest_time = $1
       AND (u.last_digest_at IS NULL OR u.last_digest_at < CURRENT_DATE)`,
    [digestTime]
  );

  return result.rows;
}

/**
 * Mark digest as sent for a user
 */
export async function markDigestSent(userId, teamId) {
  // Update user's last digest time
  await db.query(
    `UPDATE users SET last_digest_at = NOW() WHERE id = $1`,
    [userId]
  );

  // Log the digest
  await db.query(
    `INSERT INTO digest_log (user_id, team_id, digest_date)
     VALUES ($1, $2, CURRENT_DATE)
     ON CONFLICT (user_id, team_id, digest_date) DO UPDATE SET sent_at = NOW()`,
    [userId, teamId]
  );
}

/**
 * Generate AI summary of activity
 */
async function generateActivitySummary({ overdueTasks, dueTodayTasks, decisions, facts }) {
  const prompt = `Generate a brief, friendly daily digest summary (2-3 sentences max) based on this team activity:

${overdueTasks.length > 0 ? `- ${overdueTasks.length} overdue tasks need attention` : ''}
${dueTodayTasks.length > 0 ? `- ${dueTodayTasks.length} tasks due today` : ''}
${decisions.length > 0 ? `- ${decisions.length} new decisions made: ${decisions.slice(0, 3).map(d => d.what).join(', ')}` : ''}
${facts.length > 0 ? `- ${facts.length} new facts learned` : ''}

Be concise and action-oriented. Don't use any special formatting.`;

  try {
    const response = await AIService.callOpenAI([
      { role: 'system', content: 'You are a helpful assistant generating brief daily digest summaries.' },
      { role: 'user', content: prompt }
    ], { maxTokens: 150 });

    return response;
  } catch (error) {
    console.error('Error generating summary:', error);
    return null;
  }
}

// ============================================================================
// Helper functions
// ============================================================================

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
    dueAt: row.due_at,
    createdAt: row.created_at
  };
}

function mapAlert(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    channelId: row.channel_id,
    triggerType: row.trigger_type,
    triggerAt: row.trigger_at,
    message: row.message,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapDecision(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    what: row.what,
    why: row.why,
    madeBy: row.made_by,
    madeByUser: row.made_by_name ? {
      id: row.made_by,
      displayName: row.made_by_name
    } : null,
    createdAt: row.created_at
  };
}

function mapFact(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    content: row.content,
    entityType: row.entity_type,
    entityName: row.entity_name,
    attribute: row.attribute,
    value: row.value,
    category: row.category,
    confidenceScore: row.confidence_score,
    sourceType: row.source_type,
    createdBy: row.created_by,
    createdByUser: row.created_by_name ? {
      id: row.created_by,
      displayName: row.created_by_name
    } : null,
    createdAt: row.created_at
  };
}

export default {
  generateDigest,
  getUsersForDigest,
  markDigestSent
};
