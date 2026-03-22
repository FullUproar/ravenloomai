/**
 * TokenTrackingService - Per-tenant AI usage tracking
 *
 * Logs every AI call with token counts and estimated cost.
 * Fire-and-forget writes — never blocks the main flow.
 */

import db from '../db.js';

// Pricing per 1M tokens (as of March 2026)
const PRICING = {
  'gpt-4o':                  { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':             { input: 0.15,  output: 0.60 },
  'text-embedding-3-small':  { input: 0.02,  output: 0 },
  'text-embedding-3-large':  { input: 0.13,  output: 0 },
};

function estimateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING['gpt-4o'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/**
 * Log a single token usage event. Fire-and-forget — never throws.
 */
export async function logTokenUsage({ teamId, userId, operation, model, inputTokens, outputTokens, metadata = {} }) {
  if (!teamId) return;
  try {
    const cost = estimateCost(model, inputTokens, outputTokens);
    await db.query(
      `INSERT INTO token_usage (team_id, user_id, operation, model, input_tokens, output_tokens, estimated_cost_usd, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [teamId, userId, operation, model, inputTokens, outputTokens, cost, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('[TokenTracking] Log error:', err.message);
  }
}

/**
 * Get aggregated token usage for a team.
 */
export async function getTokenUsage(teamId, { startDate, endDate, groupBy = 'operation' } = {}) {
  const dateFilter = startDate
    ? `AND created_at >= $2 AND created_at <= $3`
    : '';
  const params = startDate ? [teamId, startDate, endDate || new Date()] : [teamId];

  if (groupBy === 'model') {
    const result = await db.query(`
      SELECT model,
             SUM(input_tokens) as input_tokens,
             SUM(output_tokens) as output_tokens,
             SUM(estimated_cost_usd) as estimated_cost_usd,
             COUNT(*) as call_count
      FROM token_usage
      WHERE team_id = $1 ${dateFilter}
      GROUP BY model
      ORDER BY estimated_cost_usd DESC
    `, params);
    return result.rows;
  }

  if (groupBy === 'user') {
    const result = await db.query(`
      SELECT user_id,
             SUM(input_tokens) as input_tokens,
             SUM(output_tokens) as output_tokens,
             SUM(estimated_cost_usd) as estimated_cost_usd,
             COUNT(*) as call_count
      FROM token_usage
      WHERE team_id = $1 ${dateFilter}
      GROUP BY user_id
      ORDER BY estimated_cost_usd DESC
    `, params);
    return result.rows;
  }

  // Default: group by operation
  const result = await db.query(`
    SELECT operation,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens,
           SUM(estimated_cost_usd) as estimated_cost_usd,
           COUNT(*) as call_count
    FROM token_usage
    WHERE team_id = $1 ${dateFilter}
    GROUP BY operation
    ORDER BY estimated_cost_usd DESC
  `, params);
  return result.rows;
}

/**
 * Get total usage summary for a team.
 */
export async function getUsageSummary(teamId, { startDate, endDate } = {}) {
  const dateFilter = startDate
    ? `AND created_at >= $2 AND created_at <= $3`
    : '';
  const params = startDate ? [teamId, startDate, endDate || new Date()] : [teamId];

  const result = await db.query(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(estimated_cost_usd), 0) as total_estimated_cost_usd,
      COUNT(*) as total_calls
    FROM token_usage
    WHERE team_id = $1 ${dateFilter}
  `, params);

  return result.rows[0];
}

export default {
  logTokenUsage,
  getTokenUsage,
  getUsageSummary,
};
