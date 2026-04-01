/**
 * EpisodicMemoryService — Logs interactions as typed events
 *
 * Tracks queries, answers, corrections, confirmations, and rejections.
 * Enables pattern detection: frequent questions, correction clusters,
 * source reliability trends, and knowledge gaps.
 *
 * Based on AriGraph (IJCAI 2025) and MaRS (2025) research.
 */

import db from '../db.js';
import { generateEmbedding } from './AIService.js';

// ============================================================================
// EPISODE LOGGING
// ============================================================================

/**
 * Log a query episode (when someone asks Raven a question).
 */
export async function logQuery(teamId, userId, question, { confidence, triplesUsed, answer, sessionId } = {}) {
  const embedding = await generateEmbedding(question).catch(() => null);
  const tripleIds = (triplesUsed || []).map(t => t.id).filter(Boolean);
  const conceptIds = [...new Set((triplesUsed || []).flatMap(t =>
    [t.subjectId, t.subject_id, t.objectId, t.object_id].filter(Boolean)
  ))];

  return db.query(`
    INSERT INTO episodes (team_id, user_id, episode_type, content, metadata,
      related_triple_ids, related_concept_ids, session_id, query_embedding)
    VALUES ($1, $2, 'query', $3, $4, $5, $6, $7, $8)
    RETURNING id
  `, [
    teamId, userId, question,
    JSON.stringify({ confidence, answer: answer?.substring(0, 500), tripleCount: tripleIds.length }),
    tripleIds, conceptIds, sessionId,
    embedding ? `[${embedding.join(',')}]` : null
  ]);
}

/**
 * Log a confirmation episode (when someone confirms triples).
 */
export async function logConfirmation(teamId, userId, { tripleIds, previewId, tripleCount }) {
  return db.query(`
    INSERT INTO episodes (team_id, user_id, episode_type, content, metadata, related_triple_ids)
    VALUES ($1, $2, 'confirmation', $3, $4, $5)
  `, [
    teamId, userId,
    `Confirmed ${tripleCount || tripleIds?.length || 0} triples`,
    JSON.stringify({ previewId, tripleCount }),
    tripleIds || []
  ]);
}

/**
 * Log a rejection episode.
 */
export async function logRejection(teamId, userId, { tripleId, reason }) {
  return db.query(`
    INSERT INTO episodes (team_id, user_id, episode_type, content, metadata, related_triple_ids)
    VALUES ($1, $2, 'rejection', $3, $4, $5)
  `, [
    teamId, userId,
    `Rejected triple: ${reason || 'no reason given'}`,
    JSON.stringify({ reason }),
    tripleId ? [tripleId] : []
  ]);
}

/**
 * Log a correction episode (when a triple is superseded).
 */
export async function logCorrection(teamId, userId, { oldTripleId, newTripleId, reason }) {
  return db.query(`
    INSERT INTO episodes (team_id, user_id, episode_type, content, metadata, related_triple_ids)
    VALUES ($1, $2, 'correction', $3, $4, $5)
  `, [
    teamId, userId,
    `Corrected triple: ${reason || 'updated information'}`,
    JSON.stringify({ oldTripleId, newTripleId, reason }),
    [oldTripleId, newTripleId].filter(Boolean)
  ]);
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Detect frequently asked questions (knowledge gaps).
 * Groups similar queries by embedding similarity.
 */
export async function detectFrequentQuestions(teamId, { days = 30, minCount = 3 } = {}) {
  // Get recent query episodes with embeddings
  const result = await db.query(`
    SELECT content, query_embedding, metadata, created_at
    FROM episodes
    WHERE team_id = $1 AND episode_type = 'query'
      AND created_at > NOW() - INTERVAL '${days} days'
      AND query_embedding IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 200
  `, [teamId]);

  if (result.rows.length < minCount) return [];

  // Group similar queries by embedding similarity
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < result.rows.length; i++) {
    if (used.has(i)) continue;

    const cluster = [result.rows[i]];
    used.add(i);

    for (let j = i + 1; j < result.rows.length; j++) {
      if (used.has(j)) continue;
      // Use DB for similarity check
      const simResult = await db.query(
        `SELECT 1 - ($1::vector <=> $2::vector) AS similarity`,
        [result.rows[i].query_embedding, result.rows[j].query_embedding]
      );
      if (parseFloat(simResult.rows[0]?.similarity || 0) > 0.85) {
        cluster.push(result.rows[j]);
        used.add(j);
      }
    }

    if (cluster.length >= minCount) {
      const avgConfidence = cluster.reduce((sum, q) => {
        const meta = typeof q.metadata === 'string' ? JSON.parse(q.metadata) : q.metadata;
        return sum + (meta.confidence || 0);
      }, 0) / cluster.length;

      clusters.push({
        question: cluster[0].content,
        count: cluster.length,
        avgConfidence,
        isKnowledgeGap: avgConfidence < 0.5,
        firstAsked: cluster[cluster.length - 1].created_at,
        lastAsked: cluster[0].created_at,
      });
    }
  }

  // Upsert detected patterns
  for (const cluster of clusters) {
    await db.query(`
      INSERT INTO detected_patterns (team_id, pattern_type, description, evidence, frequency, confidence)
      VALUES ($1, 'frequent_question', $2, $3, $4, $5)
      ON CONFLICT (team_id, pattern_type, description) DO UPDATE SET
        frequency = $4, confidence = $5, last_detected_at = NOW()
    `, [
      teamId,
      cluster.question,
      JSON.stringify({ count: cluster.count, avgConfidence: cluster.avgConfidence }),
      cluster.count,
      cluster.isKnowledgeGap ? 0.3 : 0.7
    ]);
  }

  return clusters.sort((a, b) => b.count - a.count);
}

/**
 * Detect correction clusters (triples that keep getting corrected = reliability problem).
 */
export async function detectCorrectionClusters(teamId, { days = 90, minCorrections = 2 } = {}) {
  const result = await db.query(`
    SELECT related_triple_ids, COUNT(*) as correction_count,
           array_agg(content) as corrections
    FROM episodes
    WHERE team_id = $1 AND episode_type = 'correction'
      AND created_at > NOW() - INTERVAL '${days} days'
    GROUP BY related_triple_ids
    HAVING COUNT(*) >= $2
    ORDER BY correction_count DESC
    LIMIT 20
  `, [teamId, minCorrections]);

  return result.rows.map(r => ({
    tripleIds: r.related_triple_ids,
    correctionCount: parseInt(r.correction_count),
    corrections: r.corrections,
  }));
}

/**
 * Get episode stats for a team.
 */
export async function getEpisodeStats(teamId, { days = 30 } = {}) {
  const result = await db.query(`
    SELECT episode_type, COUNT(*) as count
    FROM episodes
    WHERE team_id = $1 AND created_at > NOW() - INTERVAL '${days} days'
    GROUP BY episode_type
    ORDER BY count DESC
  `, [teamId]);

  return result.rows.reduce((acc, r) => {
    acc[r.episode_type] = parseInt(r.count);
    return acc;
  }, {});
}

export default {
  logQuery, logConfirmation, logRejection, logCorrection,
  detectFrequentQuestions, detectCorrectionClusters, getEpisodeStats,
};
