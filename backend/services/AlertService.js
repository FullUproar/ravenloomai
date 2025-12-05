/**
 * AlertService - Manages alerts and reminders
 */

import db from '../db.js';

/**
 * Create a new alert
 */
export async function createAlert(teamId, {
  channelId = null,
  triggerType,
  triggerAt = null,
  recurrenceRule = null,
  message,
  relatedFactId = null,
  createdBy = null
}) {
  const result = await db.query(
    `INSERT INTO alerts (team_id, channel_id, trigger_type, trigger_at, recurrence_rule, message, related_fact_id, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     RETURNING *`,
    [teamId, channelId, triggerType, triggerAt, recurrenceRule, message, relatedFactId, createdBy]
  );
  return mapAlert(result.rows[0]);
}

/**
 * Get alerts for a team
 */
export async function getAlerts(teamId, { status = null } = {}) {
  let query = 'SELECT * FROM alerts WHERE team_id = $1';
  const params = [teamId];

  if (status) {
    query += ' AND status = $2';
    params.push(status);
  }

  query += ' ORDER BY trigger_at ASC NULLS LAST, created_at DESC';

  const result = await db.query(query, params);
  return result.rows.map(mapAlert);
}

/**
 * Get pending alerts that are due
 */
export async function getPendingAlerts(teamId) {
  const result = await db.query(
    `SELECT * FROM alerts
     WHERE team_id = $1
       AND status = 'pending'
       AND trigger_at <= NOW()
     ORDER BY trigger_at ASC`,
    [teamId]
  );
  return result.rows.map(mapAlert);
}

/**
 * Get all pending alerts for the alert scheduler
 */
export async function getAllDueAlerts() {
  const result = await db.query(
    `SELECT a.*, c.name as channel_name, t.name as team_name
     FROM alerts a
     LEFT JOIN channels c ON a.channel_id = c.id
     LEFT JOIN teams t ON a.team_id = t.id
     WHERE a.status = 'pending'
       AND a.trigger_at <= NOW()
     ORDER BY a.trigger_at ASC
     LIMIT 100`
  );
  return result.rows.map(row => ({
    ...mapAlert(row),
    channelName: row.channel_name,
    teamName: row.team_name
  }));
}

/**
 * Mark an alert as sent
 */
export async function markAlertSent(alertId) {
  const result = await db.query(
    `UPDATE alerts
     SET status = 'sent', sent_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [alertId]
  );
  return result.rows[0] ? mapAlert(result.rows[0]) : null;
}

/**
 * Snooze an alert
 */
export async function snoozeAlert(alertId, until) {
  const result = await db.query(
    `UPDATE alerts
     SET status = 'snoozed',
         snoozed_until = $2,
         trigger_at = $2
     WHERE id = $1
     RETURNING *`,
    [alertId, until]
  );

  if (result.rows.length === 0) {
    throw new Error('Alert not found');
  }

  // Reset status to pending so it triggers again
  await db.query(
    `UPDATE alerts SET status = 'pending' WHERE id = $1`,
    [alertId]
  );

  return mapAlert(result.rows[0]);
}

/**
 * Cancel an alert
 */
export async function cancelAlert(alertId) {
  const result = await db.query(
    `UPDATE alerts
     SET status = 'cancelled'
     WHERE id = $1
     RETURNING *`,
    [alertId]
  );
  return result.rows[0] ? mapAlert(result.rows[0]) : null;
}

/**
 * Get alert by ID
 */
export async function getAlertById(alertId) {
  const result = await db.query(
    'SELECT * FROM alerts WHERE id = $1',
    [alertId]
  );
  return result.rows[0] ? mapAlert(result.rows[0]) : null;
}

// ============================================================================
// Helper functions
// ============================================================================

function mapAlert(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    channelId: row.channel_id,
    createdBy: row.created_by,
    triggerType: row.trigger_type,
    triggerAt: row.trigger_at,
    recurrenceRule: row.recurrence_rule,
    message: row.message,
    relatedFactId: row.related_fact_id,
    status: row.status,
    sentAt: row.sent_at,
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at
  };
}

export default {
  createAlert,
  getAlerts,
  getPendingAlerts,
  getAllDueAlerts,
  markAlertSent,
  snoozeAlert,
  cancelAlert,
  getAlertById
};
