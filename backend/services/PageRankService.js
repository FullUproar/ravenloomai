/**
 * PageRankService — Graph centrality scoring for entity resolution
 *
 * Replaces the heuristic hub penalty with a principled authority score.
 * Company entities naturally rank higher than their sub-nodes because
 * they receive more inbound links from high-authority nodes.
 *
 * Based on FastGraphRAG and RAGRank research (2024-2025).
 */

import db from '../db.js';

const DAMPING_FACTOR = 0.85;
const MAX_ITERATIONS = 20;
const CONVERGENCE_THRESHOLD = 0.0001;

/**
 * Compute PageRank for all concepts in a team.
 * Run on-demand (via groom button or scheduled).
 *
 * Returns: { iterations, converged, topNodes: [...] }
 */
export async function computePageRank(teamId) {
  // 1. Load all concepts and edges
  const conceptsResult = await db.query(
    `SELECT id FROM concepts WHERE team_id = $1`,
    [teamId]
  );
  const concepts = conceptsResult.rows;
  const N = concepts.length;
  if (N === 0) return { iterations: 0, converged: true, topNodes: [] };

  // Build adjacency: for each concept, who links TO it?
  const conceptIds = concepts.map(c => c.id);
  const idToIndex = new Map();
  conceptIds.forEach((id, i) => idToIndex.set(id, i));

  // Get all active edges (triples connect subject → object)
  const edgesResult = await db.query(`
    SELECT DISTINCT subject_id, object_id
    FROM triples
    WHERE team_id = $1 AND status = 'active'
      AND subject_id IS NOT NULL AND object_id IS NOT NULL
  `, [teamId]);

  // Build outlink count and inlink list
  const outlinks = new Array(N).fill(0);
  const inlinks = Array.from({ length: N }, () => []);

  for (const edge of edgesResult.rows) {
    const srcIdx = idToIndex.get(edge.subject_id);
    const tgtIdx = idToIndex.get(edge.object_id);
    if (srcIdx !== undefined && tgtIdx !== undefined && srcIdx !== tgtIdx) {
      outlinks[srcIdx]++;
      inlinks[tgtIdx].push(srcIdx);
    }
    // Bidirectional: object also links back to subject (knowledge graph edges are bidirectional for authority)
    if (srcIdx !== undefined && tgtIdx !== undefined && srcIdx !== tgtIdx) {
      outlinks[tgtIdx]++;
      inlinks[srcIdx].push(tgtIdx);
    }
  }

  // 2. Iterative PageRank computation
  let ranks = new Array(N).fill(1.0 / N);
  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    iterations++;
    const newRanks = new Array(N).fill((1 - DAMPING_FACTOR) / N);

    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (const srcIdx of inlinks[i]) {
        if (outlinks[srcIdx] > 0) {
          sum += ranks[srcIdx] / outlinks[srcIdx];
        }
      }
      newRanks[i] += DAMPING_FACTOR * sum;
    }

    // Check convergence
    let maxDiff = 0;
    for (let i = 0; i < N; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(newRanks[i] - ranks[i]));
    }

    ranks = newRanks;

    if (maxDiff < CONVERGENCE_THRESHOLD) {
      converged = true;
      break;
    }
  }

  // 3. Normalize to 0-1 range
  const maxRank = Math.max(...ranks);
  const minRank = Math.min(...ranks);
  const range = maxRank - minRank || 1;
  const normalizedRanks = ranks.map(r => (r - minRank) / range);

  // 4. Write back to database
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < N; i++) {
      await client.query(
        `UPDATE concepts SET pagerank = $1, authority_score = $2, last_pagerank_at = NOW()
         WHERE id = $3`,
        [ranks[i], normalizedRanks[i], conceptIds[i]]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 5. Return top nodes for verification
  const topNodes = [];
  const sortedIndices = normalizedRanks.map((r, i) => ({ rank: r, idx: i }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 15);

  for (const { rank, idx } of sortedIndices) {
    const concept = await db.query('SELECT name, type FROM concepts WHERE id = $1', [conceptIds[idx]]);
    if (concept.rows[0]) {
      topNodes.push({ name: concept.rows[0].name, type: concept.rows[0].type, rank: rank.toFixed(4) });
    }
  }

  return { iterations, converged, totalConcepts: N, topNodes };
}

/**
 * Get PageRank-boosted similarity for a concept.
 * Used in entity resolution to prefer high-authority nodes.
 *
 * authority_boost = 0.05 * authority_score (0-1 range)
 * This means company entities (authority ~1.0) get +0.05 boost
 * while leaf nodes (authority ~0.1) get +0.005 boost
 */
export function getAuthorityBoost(authorityScore) {
  return 0.05 * (authorityScore || 0);
}

export default { computePageRank, getAuthorityBoost };
