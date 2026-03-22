/**
 * TrustService - Source×Topic trust model using Beta distributions
 *
 * Trust is two-dimensional: trust(source, topic)
 * - A doctor talking about medicine → high trust
 * - Same doctor talking about software → low trust
 *
 * Each (source, topic) pair maintains a Beta(α, β) distribution:
 * - α = confirmed count + prior
 * - β = rejected count + prior
 * - score = α / (α + β)
 *
 * Hierarchical topic resolution: if no trust for exact topic,
 * walks up context tree to find ancestor trust, then global.
 *
 * Cold start: official sources start Beta(3,1) = 0.75 bias toward trust.
 * Tribal sources start Beta(1,1) = 0.5 neutral.
 */

import db from '../db.js';

// ============================================================================
// CORE: Get trust score
// ============================================================================

/**
 * Get trust score for a (source, topic) pair.
 * Resolution order: exact topic → ancestor topics → global → default.
 */
export async function getTrustScore(teamId, sourceId, sourceType = 'user', topicId = null) {
  // 1. Try exact topic match
  if (topicId) {
    const exact = await _queryTrust(teamId, sourceId, sourceType, topicId);
    if (exact) return _formatScore(exact);

    // 2. Walk up context tree looking for ancestor trust
    const ancestors = await _getAncestorTopicIds(topicId);
    for (const ancestorId of ancestors) {
      const ancestor = await _queryTrust(teamId, sourceId, sourceType, ancestorId);
      if (ancestor) return _formatScore(ancestor);
    }
  }

  // 3. Try global trust (topic = NULL)
  const global = await _queryTrustGlobal(teamId, sourceId, sourceType);
  if (global) return _formatScore(global);

  // 4. Default: Beta(1,1) = 0.5 unknown
  return { score: 0.5, alpha: 1, beta: 1, sampleCount: 0, level: 'unknown' };
}

/**
 * Get trust scores for ALL topics for a given source.
 */
export async function getSourceTrustProfile(teamId, sourceId, sourceType = 'user') {
  const result = await db.query(`
    SELECT ts.*, cn.name as topic_name, cn.type as topic_type,
           trust_score(ts.alpha, ts.beta) as score
    FROM trust_scores ts
    LEFT JOIN context_nodes cn ON ts.topic_id = cn.id
    WHERE ts.team_id = $1 AND ts.source_id = $2 AND ts.source_type = $3
    ORDER BY ts.sample_count DESC
  `, [teamId, sourceId, sourceType]);

  return result.rows.map(r => ({
    topicId: r.topic_id,
    topicName: r.topic_name || 'Global',
    topicType: r.topic_type,
    score: parseFloat(r.score),
    alpha: r.alpha,
    beta: r.beta,
    sampleCount: r.sample_count,
    level: getTrustLevel(parseFloat(r.score), r.sample_count),
  }));
}

// ============================================================================
// UPDATE: Record confirmation outcomes
// ============================================================================

/**
 * Update trust score for a (source, topic) pair based on confirmation outcome.
 */
export async function updateTrust(teamId, sourceId, sourceType, topicId, outcome) {
  let alphaInc = 0, betaInc = 0;

  switch (outcome) {
    case 'confirmed':
    case 'auto_confirmed':
      alphaInc = 1;
      break;
    case 'rejected':
      betaInc = 1;
      break;
    case 'edited':
      alphaInc = 0.5;
      betaInc = 0.5;
      break;
    default:
      return;
  }

  // UPSERT: create or update the trust score
  // Use COALESCE for topic_id NULL handling in unique constraint
  const topicValue = topicId || null;
  const uniqueKey = topicId || '00000000-0000-0000-0000-000000000000';

  await db.query(`
    INSERT INTO trust_scores (team_id, source_id, source_type, topic_id, alpha, beta, sample_count, last_updated)
    VALUES ($1, $2, $3, $4, $5 + 1.0, $6 + 1.0, 1, NOW())
    ON CONFLICT (team_id, source_id, source_type, COALESCE(topic_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      alpha = trust_scores.alpha + $5,
      beta = trust_scores.beta + $6,
      sample_count = trust_scores.sample_count + 1,
      last_updated = NOW()
  `, [teamId, sourceId, sourceType, topicValue, alphaInc, betaInc]);
}

/**
 * Update trust for a triple across all its topics + global.
 */
export async function updateTrustForTriple(teamId, sourceId, sourceType, tripleId, outcome) {
  // Update topic-specific trust for each context on this triple
  const contexts = await db.query(
    `SELECT context_node_id FROM triple_contexts WHERE triple_id = $1`,
    [tripleId]
  );

  for (const ctx of contexts.rows) {
    await updateTrust(teamId, sourceId, sourceType, ctx.context_node_id, outcome);
  }

  // Always update global trust
  await updateTrust(teamId, sourceId, sourceType, null, outcome);
}

// ============================================================================
// SEED: Backfill from confirmation history
// ============================================================================

/**
 * Seed trust scores from existing confirmation_events table.
 */
export async function seedTrustFromHistory(teamId) {
  const events = await db.query(`
    SELECT ce.stating_user_id, ce.outcome, t.id as triple_id
    FROM confirmation_events ce
    LEFT JOIN triples t ON ce.triple_id = t.id
    WHERE ce.team_id = $1 AND ce.stating_user_id IS NOT NULL
    ORDER BY ce.created_at ASC
  `, [teamId]);

  let processed = 0;
  for (const event of events.rows) {
    if (!event.stating_user_id) continue;
    await updateTrustForTriple(teamId, event.stating_user_id, 'user', event.triple_id, event.outcome);
    processed++;
  }

  return { processed };
}

/**
 * Seed initial trust based on trust_tier.
 * Official sources: Beta(3,1) = 0.75 bias. Tribal: Beta(1,1) = 0.5 neutral.
 */
export async function seedTrustTier(teamId, sourceId, sourceType, trustTier) {
  if (trustTier === 'official') {
    // Only seed if no existing trust
    const existing = await _queryTrustGlobal(teamId, sourceId, sourceType);
    if (!existing) {
      await db.query(`
        INSERT INTO trust_scores (team_id, source_id, source_type, topic_id, alpha, beta, sample_count, last_updated)
        VALUES ($1, $2, $3, NULL, 3.0, 1.0, 0, NOW())
        ON CONFLICT (team_id, source_id, source_type, COALESCE(topic_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO NOTHING
      `, [teamId, sourceId, sourceType]);
    }
  }
}

// ============================================================================
// TRIAGE: Should auto-confirm?
// ============================================================================

/**
 * Determine if a triple should be auto-confirmed based on trust.
 * Returns true only if trust is HIGH and there are NO challenge flags.
 */
export async function shouldAutoConfirm(teamId, sourceId, sourceType, topicIds = [], challengeFlags = []) {
  // Any challenge flag blocks auto-confirm
  if (challengeFlags.length > 0) return false;

  // Check global trust first
  const globalTrust = await getTrustScore(teamId, sourceId, sourceType, null);
  if (globalTrust.level !== 'high') return false;

  // If topic-specific trust exists and is NOT high, block
  for (const topicId of topicIds) {
    const topicTrust = await getTrustScore(teamId, sourceId, sourceType, topicId);
    if (topicTrust.level === 'low') return false;
  }

  return true;
}

// ============================================================================
// CHALLENGE: Flag potential issues
// ============================================================================

/**
 * Generate challenge flags for extracted triples.
 * Checks: contradictions with existing triples, source trust, plausibility.
 */
export async function challengeTriples(teamId, extractedTriples, sourceId, sourceType = 'user') {
  const { callOpenAI } = await import('./AIService.js');
  const TripleRetrievalService = await import('./TripleRetrievalService.js');

  const flagsByIndex = new Map();

  // 1. Check source trust
  const globalTrust = await getTrustScore(teamId, sourceId, sourceType, null);
  if (globalTrust.level === 'low') {
    for (let i = 0; i < extractedTriples.length; i++) {
      if (!flagsByIndex.has(i)) flagsByIndex.set(i, []);
      flagsByIndex.get(i).push({
        type: 'low_source_trust',
        detail: `Source trust is ${(globalTrust.score * 100).toFixed(0)}% (${globalTrust.sampleCount} observations)`,
        severity: 'soft'
      });
    }
  }

  // 2. Search for contradictions
  const displayTexts = extractedTriples.map(t => t.displayText || `${t.subject} ${t.relationship} ${t.object}`);
  const batchText = displayTexts.join('\n');

  // Find potentially contradicting triples
  let existingTriples = [];
  try {
    existingTriples = await TripleRetrievalService.searchTriples(teamId, batchText, { topK: 10 });
  } catch { /* if search fails, skip contradiction check */ }

  if (existingTriples.length > 0 && extractedTriples.length > 0) {
    // 3. LLM plausibility + contradiction check (single batch call)
    const existingText = existingTriples.slice(0, 8).map(t => `- ${t.displayText}`).join('\n');
    const newText = extractedTriples.map((t, i) => `${i + 1}. ${t.displayText || `${t.subject} ${t.relationship} ${t.object}`}`).join('\n');

    try {
      const response = await callOpenAI([
        {
          role: 'system',
          content: `You are a knowledge quality checker. Compare NEW statements against EXISTING confirmed knowledge.

For each new statement, check:
1. Does it CONTRADICT any existing statement? (different claims about the same entity)
2. Is it FANTASTICAL or implausible? (claims that seem unrealistic for a business context)

Return JSON: { "flags": { "1": [{"type": "contradiction", "detail": "contradicts existing: X", "severity": "hard"}], "3": [{"type": "fantastical", "detail": "reason", "severity": "soft"}] } }
Only include statements that have issues. Empty object if all look fine: { "flags": {} }`
        },
        {
          role: 'user',
          content: `EXISTING CONFIRMED KNOWLEDGE:\n${existingText}\n\nNEW STATEMENTS:\n${newText}`
        }
      ], { model: 'gpt-4o-mini', maxTokens: 300, temperature: 0, teamId, operation: 'challenge' });

      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
      const flags = parsed.flags || {};
      for (const [idx, flagList] of Object.entries(flags)) {
        const i = parseInt(idx) - 1;
        if (i >= 0 && i < extractedTriples.length) {
          if (!flagsByIndex.has(i)) flagsByIndex.set(i, []);
          flagsByIndex.get(i).push(...flagList);
        }
      }
    } catch { /* challenge check is best-effort */ }
  }

  // Build result: attach flags to each triple
  return extractedTriples.map((triple, i) => ({
    ...triple,
    challengeFlags: flagsByIndex.get(i) || [],
  }));
}

/**
 * Compute triage level from challenge flags.
 */
export function computeTriageLevel(challengeFlags, trustLevel) {
  const hasHardFlag = challengeFlags.some(f => f.severity === 'hard');
  const hasSoftFlag = challengeFlags.some(f => f.severity === 'soft');

  if (hasHardFlag) return 'requires_decision';
  if (hasSoftFlag) return 'review';
  if (trustLevel === 'high') return 'auto_confirm';
  return 'review';
}

// ============================================================================
// HELPERS
// ============================================================================

function getTrustLevel(score, sampleCount) {
  if (sampleCount < 3) return 'unknown';
  if (score >= 0.8 && sampleCount >= 5) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function _formatScore(row) {
  const score = row.alpha / (row.alpha + row.beta);
  return {
    score,
    alpha: row.alpha,
    beta: row.beta,
    sampleCount: row.sample_count,
    level: getTrustLevel(score, row.sample_count),
  };
}

async function _queryTrust(teamId, sourceId, sourceType, topicId) {
  const result = await db.query(
    `SELECT alpha, beta, sample_count FROM trust_scores
     WHERE team_id = $1 AND source_id = $2 AND source_type = $3 AND topic_id = $4`,
    [teamId, sourceId, sourceType, topicId]
  );
  return result.rows[0] || null;
}

async function _queryTrustGlobal(teamId, sourceId, sourceType) {
  const result = await db.query(
    `SELECT alpha, beta, sample_count FROM trust_scores
     WHERE team_id = $1 AND source_id = $2 AND source_type = $3 AND topic_id IS NULL`,
    [teamId, sourceId, sourceType]
  );
  return result.rows[0] || null;
}

async function _getAncestorTopicIds(topicId) {
  const ancestors = [];
  let currentId = topicId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const result = await db.query(
      `SELECT parent_id FROM context_nodes WHERE id = $1`,
      [currentId]
    );
    if (result.rows[0]?.parent_id) {
      ancestors.push(result.rows[0].parent_id);
      currentId = result.rows[0].parent_id;
    } else {
      break;
    }
  }

  return ancestors;
}

export default {
  getTrustScore,
  getSourceTrustProfile,
  updateTrust,
  updateTrustForTriple,
  seedTrustFromHistory,
  seedTrustTier,
  shouldAutoConfirm,
  challengeTriples,
  computeTriageLevel,
};
