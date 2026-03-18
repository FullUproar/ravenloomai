/**
 * ConfirmationEventService - Tracks every fact confirmation decision
 *
 * This is the primary training data for the adaptive trust model (Phase 2).
 * Every confirm/edit/reject decision is recorded with full context.
 *
 * Phase 1: Collect data
 * Phase 2: Learn from it (compute trust scores)
 * Phase 3: Act on it (auto-confirmation with oversight)
 */

import db from '../db.js';

/**
 * Log a confirmation event
 * @param {Object} event
 * @param {string} event.teamId
 * @param {string} event.previewId
 * @param {string} event.factId - The fact that was created (null if rejected)
 * @param {string} event.confirmingUserId - Who clicked confirm/edit/reject
 * @param {string} event.statingUserId - Who originally stated the information
 * @param {string} event.outcome - 'confirmed' | 'edited' | 'rejected'
 * @param {string} event.originalContent - The AI-extracted fact content
 * @param {string} event.editedContent - Content after user edit (null if not edited)
 * @param {number} event.responseTimeMs - Time from preview to action
 */
export async function logConfirmationEvent(event) {
  const {
    teamId,
    previewId,
    factId,
    confirmingUserId,
    statingUserId,
    outcome,
    originalContent,
    editedContent,
    responseTimeMs
  } = event;

  const result = await db.query(
    `INSERT INTO confirmation_events
       (team_id, preview_id, fact_id, confirming_user_id, stating_user_id,
        outcome, original_content, edited_content, response_time_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [teamId, previewId, factId, confirmingUserId, statingUserId,
     outcome, originalContent, editedContent, responseTimeMs]
  );

  return result.rows[0];
}

/**
 * Log a conflict override decision
 * @param {Object} override
 * @param {string} override.previewId
 * @param {string} override.existingFactId
 * @param {string} override.newFactId - null if user kept existing
 * @param {string} override.conflictType
 * @param {string} override.userDecision - 'override' | 'keep_existing' | 'skip'
 * @param {string} override.userId
 */
export async function logConflictOverride(override) {
  const {
    previewId,
    existingFactId,
    newFactId,
    conflictType,
    userDecision,
    userId
  } = override;

  const result = await db.query(
    `INSERT INTO conflict_overrides
       (preview_id, existing_fact_id, new_fact_id, conflict_type, user_decision, user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [previewId, existingFactId, newFactId, conflictType, userDecision, userId]
  );

  return result.rows[0];
}

/**
 * Get confirmation events for a team (for trust model training)
 */
export async function getConfirmationEvents(teamId, { limit = 100, offset = 0 } = {}) {
  const result = await db.query(
    `SELECT * FROM confirmation_events
     WHERE team_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [teamId, limit, offset]
  );
  return result.rows;
}

/**
 * Get confirmation stats for a user (for trust model)
 */
export async function getUserConfirmationStats(teamId, userId) {
  const result = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE outcome = 'confirmed') as confirmed_count,
       COUNT(*) FILTER (WHERE outcome = 'edited') as edited_count,
       COUNT(*) FILTER (WHERE outcome = 'rejected') as rejected_count,
       COUNT(*) as total_count
     FROM confirmation_events
     WHERE team_id = $1 AND confirming_user_id = $2`,
    [teamId, userId]
  );
  return result.rows[0];
}

export default {
  logConfirmationEvent,
  logConflictOverride,
  getConfirmationEvents,
  getUserConfirmationStats
};
