/**
 * RecallService - Manages knowledge recalls (temporal knowledge)
 *
 * A Recall is knowledge that should be proactively surfaced at a specific time.
 * This is the evolution of AlertService, designed to support:
 * - V1: Time-based triggers ("remind me on Friday")
 * - V2 (future): Event-based triggers ("when X happens, recall Y")
 *
 * Core concept: Knowledge + Trigger + Status = Recall
 */

import db from '../db.js';

/**
 * Create a new recall
 *
 * @param {string} teamId - The team ID
 * @param {object} options - Recall options
 * @param {string} options.factId - The fact/knowledge to recall (optional for backwards compat)
 * @param {string} options.message - The recall message (what to surface)
 * @param {string} options.triggerType - Type of trigger: 'time' (V1), 'event' (V2 future)
 * @param {object} options.triggerCondition - Trigger condition (datetime for V1)
 * @param {string} options.channelId - Channel to surface the recall in (optional)
 * @param {string} options.assignedTo - User to notify (optional)
 * @param {string} options.createdBy - User who created the recall
 */
export async function createRecall(teamId, {
  factId = null,
  message,
  triggerType = 'time',
  triggerCondition = {},
  channelId = null,
  assignedTo = null,
  createdBy = null
}) {
  // For V1, triggerCondition should have { datetime, recurrence }
  const triggerAt = triggerCondition.datetime || null;
  const recurrenceRule = triggerCondition.recurrence || null;

  const result = await db.query(
    `INSERT INTO alerts (
      team_id, channel_id, trigger_type, trigger_at, recurrence_rule,
      message, related_fact_id, assigned_to, created_by, status
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING *`,
    [teamId, channelId, triggerType, triggerAt, recurrenceRule, message, factId, assignedTo, createdBy]
  );
  return mapRecall(result.rows[0]);
}

/**
 * Get recalls for a team
 */
export async function getRecalls(teamId, { status = null, assignedTo = null } = {}) {
  let query = 'SELECT * FROM alerts WHERE team_id = $1';
  const params = [teamId];
  let paramIndex = 2;

  if (status) {
    query += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (assignedTo) {
    query += ` AND assigned_to = $${paramIndex}`;
    params.push(assignedTo);
    paramIndex++;
  }

  query += ' ORDER BY trigger_at ASC NULLS LAST, created_at DESC';

  const result = await db.query(query, params);
  return result.rows.map(mapRecall);
}

/**
 * Get upcoming recalls (pending, not yet due)
 */
export async function getUpcomingRecalls(teamId, { assignedTo = null, limit = 50 } = {}) {
  let query = `
    SELECT * FROM alerts
    WHERE team_id = $1
      AND status = 'pending'
      AND (trigger_at IS NULL OR trigger_at > NOW())
  `;
  const params = [teamId];
  let paramIndex = 2;

  if (assignedTo) {
    query += ` AND assigned_to = $${paramIndex}`;
    params.push(assignedTo);
    paramIndex++;
  }

  query += ` ORDER BY trigger_at ASC NULLS LAST LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await db.query(query, params);
  return result.rows.map(mapRecall);
}

/**
 * Get recalls that are due (ready to be surfaced)
 */
export async function getDueRecalls(teamId = null) {
  let query = `
    SELECT a.*, c.name as channel_name, t.name as team_name, f.content as fact_content
    FROM alerts a
    LEFT JOIN channels c ON a.channel_id = c.id
    LEFT JOIN teams t ON a.team_id = t.id
    LEFT JOIN facts f ON a.related_fact_id = f.id
    WHERE a.status = 'pending'
      AND a.trigger_at <= NOW()
  `;
  const params = [];

  if (teamId) {
    query += ' AND a.team_id = $1';
    params.push(teamId);
  }

  query += ' ORDER BY a.trigger_at ASC LIMIT 100';

  const result = await db.query(query, params);
  return result.rows.map(row => ({
    ...mapRecall(row),
    channelName: row.channel_name,
    teamName: row.team_name,
    factContent: row.fact_content
  }));
}

/**
 * Mark a recall as triggered (surfaced to user)
 */
export async function markRecallTriggered(recallId) {
  const result = await db.query(
    `UPDATE alerts
     SET status = 'triggered', sent_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [recallId]
  );
  return result.rows[0] ? mapRecall(result.rows[0]) : null;
}

/**
 * Complete a recall (user acknowledged/acted on it)
 */
export async function completeRecall(recallId) {
  const result = await db.query(
    `UPDATE alerts
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [recallId]
  );
  return result.rows[0] ? mapRecall(result.rows[0]) : null;
}

/**
 * Snooze a recall to a later time
 */
export async function snoozeRecall(recallId, until) {
  const result = await db.query(
    `UPDATE alerts
     SET status = 'pending',
         snoozed_until = $2,
         trigger_at = $2
     WHERE id = $1
     RETURNING *`,
    [recallId, until]
  );

  if (result.rows.length === 0) {
    throw new Error('Recall not found');
  }

  return mapRecall(result.rows[0]);
}

/**
 * Cancel a recall
 */
export async function cancelRecall(recallId) {
  const result = await db.query(
    `UPDATE alerts
     SET status = 'cancelled'
     WHERE id = $1
     RETURNING *`,
    [recallId]
  );
  return result.rows[0] ? mapRecall(result.rows[0]) : null;
}

/**
 * Get recall by ID
 */
export async function getRecallById(recallId) {
  const result = await db.query(
    `SELECT a.*, f.content as fact_content
     FROM alerts a
     LEFT JOIN facts f ON a.related_fact_id = f.id
     WHERE a.id = $1`,
    [recallId]
  );
  if (!result.rows[0]) return null;
  return {
    ...mapRecall(result.rows[0]),
    factContent: result.rows[0].fact_content
  };
}

/**
 * Update a recall
 */
export async function updateRecall(recallId, updates) {
  const allowedFields = ['message', 'trigger_at', 'assigned_to', 'channel_id'];
  const setClauses = [];
  const params = [recallId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    const dbKey = key === 'triggerAt' ? 'trigger_at'
      : key === 'assignedTo' ? 'assigned_to'
      : key === 'channelId' ? 'channel_id'
      : key;

    if (allowedFields.includes(dbKey) && value !== undefined) {
      setClauses.push(`${dbKey} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return getRecallById(recallId);
  }

  const result = await db.query(
    `UPDATE alerts SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] ? mapRecall(result.rows[0]) : null;
}

// ============================================================================
// Legacy Alert compatibility (for existing code that uses Alert terminology)
// These can be removed once all references are updated
// ============================================================================

export const createAlert = createRecall;
export const getAlerts = getRecalls;
export const getPendingAlerts = (teamId) => getRecalls(teamId, { status: 'pending' });
export const getAllDueAlerts = () => getDueRecalls();
export const markAlertSent = markRecallTriggered;
export const snoozeAlert = snoozeRecall;
export const cancelAlert = cancelRecall;
export const getAlertById = getRecallById;

// ============================================================================
// Helper functions
// ============================================================================

function mapRecall(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    channelId: row.channel_id,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,

    // The knowledge to recall
    factId: row.related_fact_id,
    message: row.message,

    // Trigger configuration (V1: time-based)
    triggerType: row.trigger_type || 'time',
    triggerAt: row.trigger_at,
    recurrenceRule: row.recurrence_rule,

    // Status
    status: row.status,
    triggeredAt: row.sent_at,
    completedAt: row.completed_at,
    snoozedUntil: row.snoozed_until,

    // Metadata
    createdAt: row.created_at
  };
}

export default {
  // New Recall API
  createRecall,
  getRecalls,
  getUpcomingRecalls,
  getDueRecalls,
  markRecallTriggered,
  completeRecall,
  snoozeRecall,
  cancelRecall,
  getRecallById,
  updateRecall,

  // Legacy Alert API (for backwards compatibility)
  createAlert,
  getAlerts,
  getPendingAlerts,
  getAllDueAlerts,
  markAlertSent,
  snoozeAlert,
  cancelAlert,
  getAlertById
};
