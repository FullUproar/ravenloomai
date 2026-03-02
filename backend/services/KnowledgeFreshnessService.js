/**
 * KnowledgeFreshnessService - Track and manage knowledge freshness
 *
 * Features:
 * - Mark stale knowledge needing review
 * - Validate knowledge as still accurate
 * - Expire outdated knowledge
 * - Get freshness statistics
 */

import db from '../db.js';

// ============================================================================
// FRESHNESS DETECTION
// ============================================================================

/**
 * Mark stale knowledge for a team
 * Flags facts and nodes not validated within threshold
 */
export async function markStaleKnowledge(teamId, staleThresholdDays = 90) {
  try {
    const result = await db.query(
      `SELECT * FROM mark_stale_knowledge($1, $2)`,
      [teamId, staleThresholdDays]
    );

    const { facts_marked, nodes_marked } = result.rows[0] || { facts_marked: 0, nodes_marked: 0 };

    console.log(`[FreshnessService] Marked ${facts_marked} facts and ${nodes_marked} nodes as stale for team ${teamId}`);

    return {
      factsMarked: facts_marked,
      nodesMarked: nodes_marked
    };
  } catch (error) {
    console.error('[FreshnessService] markStaleKnowledge error:', error.message);
    throw error;
  }
}

/**
 * Validate facts as still accurate
 */
export async function validateFacts(factIds, userId) {
  if (!factIds || factIds.length === 0) return 0;

  try {
    const result = await db.query(
      `SELECT validate_knowledge($1, $2)`,
      [factIds, userId]
    );

    const count = result.rows[0]?.validate_knowledge || 0;
    console.log(`[FreshnessService] Validated ${count} facts by user ${userId}`);

    return count;
  } catch (error) {
    console.error('[FreshnessService] validateFacts error:', error.message);
    throw error;
  }
}

/**
 * Expire a fact (mark as no longer valid)
 */
export async function expireFact(factId, expiredAt = new Date()) {
  try {
    await db.query(
      `SELECT expire_knowledge($1, $2)`,
      [factId, expiredAt]
    );

    console.log(`[FreshnessService] Expired fact ${factId}`);
    return true;
  } catch (error) {
    console.error('[FreshnessService] expireFact error:', error.message);
    throw error;
  }
}

// ============================================================================
// FRESHNESS QUERIES
// ============================================================================

/**
 * Get facts needing review for a team
 */
export async function getFactsNeedingReview(teamId, options = {}) {
  const { limit = 50, offset = 0, category = null } = options;

  let query = `
    SELECT f.*, kn.name as node_name, kn.type as node_type
    FROM facts f
    LEFT JOIN kg_nodes kn ON f.kg_node_id = kn.id
    WHERE f.team_id = $1
      AND f.is_active = true
      AND (f.freshness_status = 'needs_review' OR f.freshness_status = 'stale')
  `;
  const params = [teamId];
  let paramIndex = 2;

  if (category) {
    query += ` AND f.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  query += ` ORDER BY f.last_validated_at ASC NULLS FIRST LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await db.query(query, params);

  return result.rows.map(row => ({
    id: row.id,
    content: row.content,
    category: row.category,
    freshnessStatus: row.freshness_status,
    lastValidatedAt: row.last_validated_at,
    confidence: row.confidence ? parseFloat(row.confidence) : null,
    daysSinceValidation: row.last_validated_at
      ? Math.floor((Date.now() - new Date(row.last_validated_at).getTime()) / (1000 * 60 * 60 * 24))
      : null,
    nodeName: row.node_name,
    nodeType: row.node_type,
    createdAt: row.created_at
  }));
}

/**
 * Get freshness statistics for a team
 */
export async function getFreshnessStats(teamId) {
  const result = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE freshness_status = 'fresh') as fresh_count,
      COUNT(*) FILTER (WHERE freshness_status = 'stale') as stale_count,
      COUNT(*) FILTER (WHERE freshness_status = 'needs_review') as needs_review_count,
      COUNT(*) FILTER (WHERE freshness_status = 'expired') as expired_count,
      COUNT(*) as total_count,
      AVG(confidence) as avg_confidence,
      MIN(last_validated_at) as oldest_validation,
      COUNT(*) FILTER (WHERE last_validated_at < NOW() - INTERVAL '90 days') as older_than_90_days
    FROM facts
    WHERE team_id = $1 AND is_active = true
  `, [teamId]);

  const stats = result.rows[0];

  return {
    fresh: parseInt(stats.fresh_count) || 0,
    stale: parseInt(stats.stale_count) || 0,
    needsReview: parseInt(stats.needs_review_count) || 0,
    expired: parseInt(stats.expired_count) || 0,
    total: parseInt(stats.total_count) || 0,
    avgConfidence: stats.avg_confidence ? parseFloat(stats.avg_confidence) : null,
    oldestValidation: stats.oldest_validation,
    olderThan90Days: parseInt(stats.older_than_90_days) || 0,
    healthScore: calculateHealthScore(stats)
  };
}

/**
 * Calculate a health score for knowledge freshness (0-100)
 */
function calculateHealthScore(stats) {
  const total = parseInt(stats.total_count) || 0;
  if (total === 0) return 100;

  const fresh = parseInt(stats.fresh_count) || 0;
  const stale = parseInt(stats.stale_count) || 0;
  const needsReview = parseInt(stats.needs_review_count) || 0;

  // Weighted score: fresh = 1.0, needs_review = 0.5, stale = 0.2
  const weightedScore = (fresh * 1.0 + needsReview * 0.5 + stale * 0.2) / total;

  return Math.round(weightedScore * 100);
}

// ============================================================================
// TEMPORAL ANALYSIS
// ============================================================================

/**
 * Find facts with past temporal references
 * These may be outdated and need review
 */
export async function findTemporallyOutdated(teamId, options = {}) {
  const { limit = 50 } = options;
  const currentYear = new Date().getFullYear();

  const result = await db.query(`
    SELECT f.*, kn.name as node_name
    FROM facts f
    LEFT JOIN kg_nodes kn ON f.kg_node_id = kn.id
    WHERE f.team_id = $1
      AND f.is_active = true
      AND (
        -- Check for past year references
        f.content ~ '\\m(20[0-9]{2})\\M'
        OR f.content ~* '\\m(last year|last month|last quarter|yesterday|last week)\\M'
      )
      AND f.freshness_status != 'expired'
    ORDER BY f.created_at DESC
    LIMIT $2
  `, [teamId, limit]);

  // Filter to facts with actual past years
  return result.rows
    .map(row => {
      const yearMatches = row.content.match(/\b(20\d{2})\b/g) || [];
      const pastYears = yearMatches.filter(y => parseInt(y) < currentYear);

      return {
        id: row.id,
        content: row.content,
        category: row.category,
        pastYearsReferenced: pastYears,
        hasPastTenseWords: /\b(last year|last month|last quarter|yesterday|last week)\b/i.test(row.content),
        nodeName: row.node_name,
        freshnessStatus: row.freshness_status,
        createdAt: row.created_at
      };
    })
    .filter(f => f.pastYearsReferenced.length > 0 || f.hasPastTenseWords);
}

/**
 * Set valid time range for a fact
 */
export async function setFactValidRange(factId, validFrom, validUntil) {
  const result = await db.query(`
    UPDATE facts
    SET
      valid_from = COALESCE($2, valid_from),
      valid_until = $3
    WHERE id = $1
    RETURNING id, valid_from, valid_until
  `, [factId, validFrom, validUntil]);

  if (result.rows.length === 0) {
    throw new Error('Fact not found');
  }

  return {
    id: result.rows[0].id,
    validFrom: result.rows[0].valid_from,
    validUntil: result.rows[0].valid_until
  };
}

// ============================================================================
// SCHEDULED MAINTENANCE
// ============================================================================

/**
 * Run freshness maintenance for all teams
 * Call this periodically (e.g., daily cron job)
 */
export async function runFreshnessMaintenance() {
  console.log('[FreshnessService] Starting freshness maintenance...');

  // Get all teams
  const teams = await db.query(`SELECT DISTINCT id FROM teams WHERE is_active = true`);

  let totalFactsMarked = 0;
  let totalNodesMarked = 0;

  for (const team of teams.rows) {
    try {
      const result = await markStaleKnowledge(team.id, 90);
      totalFactsMarked += result.factsMarked;
      totalNodesMarked += result.nodesMarked;
    } catch (err) {
      console.error(`[FreshnessService] Error processing team ${team.id}:`, err.message);
    }
  }

  console.log(`[FreshnessService] Maintenance complete: ${totalFactsMarked} facts, ${totalNodesMarked} nodes marked stale`);

  return {
    teamsProcessed: teams.rows.length,
    totalFactsMarked,
    totalNodesMarked
  };
}

export default {
  markStaleKnowledge,
  validateFacts,
  expireFact,
  getFactsNeedingReview,
  getFreshnessStats,
  findTemporallyOutdated,
  setFactValidRange,
  runFreshnessMaintenance
};
