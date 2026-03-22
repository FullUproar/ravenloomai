/**
 * TripleRetrievalService - The Ask pipeline
 *
 * Dual-embedding search, multi-hop traversal, context filtering,
 * and conversation context rewriting.
 */

import db from '../db.js';
import { generateEmbedding, callOpenAI } from './AIService.js';
import * as TripleService from './TripleService.js';

// ============================================================================
// DUAL-EMBEDDING SEARCH
// ============================================================================

/**
 * Search triples using BOTH embedding columns, merge results by max similarity.
 *
 * @param {string} teamId
 * @param {string} question - the user's question
 * @param {Object} options
 * @param {string[]} options.scopeIds - scope pre-filter
 * @param {number} options.topK - max results per embedding column
 * @returns {Array} ranked triples with similarity scores
 */
export async function searchTriples(teamId, question, { scopeIds = [], topK = 15 } = {}) {
  const embedding = await generateEmbedding(question);
  if (!embedding) return [];

  const embeddingStr = `[${embedding.join(',')}]`;
  const scopeFilter = scopeIds.length > 0
    ? `AND t.scope_id = ANY($3)`
    : '';
  const baseParams = scopeIds.length > 0
    ? [embeddingStr, teamId, scopeIds]
    : [embeddingStr, teamId];
  const limitParam = `$${baseParams.length + 1}`;

  // Search with-context embedding
  const withCtxResults = await db.query(`
    SELECT t.*, s.name AS subject_name, s.type AS subject_type,
           o.name AS object_name, o.type AS object_type,
           1 - (t.embedding_with_context <=> $1) AS similarity,
           'with_context' AS match_type
    FROM triples t
    JOIN concepts s ON t.subject_id = s.id
    JOIN concepts o ON t.object_id = o.id
    WHERE t.team_id = $2 AND t.status = 'active'
      AND t.embedding_with_context IS NOT NULL
      ${scopeFilter}
    ORDER BY t.embedding_with_context <=> $1
    LIMIT ${limitParam}
  `, [...baseParams, topK]);

  // Search without-context embedding
  const withoutCtxResults = await db.query(`
    SELECT t.*, s.name AS subject_name, s.type AS subject_type,
           o.name AS object_name, o.type AS object_type,
           1 - (t.embedding_without_context <=> $1) AS similarity,
           'without_context' AS match_type
    FROM triples t
    JOIN concepts s ON t.subject_id = s.id
    JOIN concepts o ON t.object_id = o.id
    WHERE t.team_id = $2 AND t.status = 'active'
      AND t.embedding_without_context IS NOT NULL
      ${scopeFilter}
    ORDER BY t.embedding_without_context <=> $1
    LIMIT ${limitParam}
  `, [...baseParams, topK]);

  // Merge: for each unique triple, take the max similarity across both searches
  return mergeAndRank(withCtxResults.rows, withoutCtxResults.rows);
}

/**
 * Merge results from both embedding searches, keeping max similarity per triple.
 */
function mergeAndRank(withCtxRows, withoutCtxRows) {
  const byId = new Map();

  for (const row of [...withCtxRows, ...withoutCtxRows]) {
    const existing = byId.get(row.id);
    const similarity = parseFloat(row.similarity);

    if (!existing || similarity > existing.similarity) {
      byId.set(row.id, {
        id: row.id,
        teamId: row.team_id,
        scopeId: row.scope_id,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        subjectType: row.subject_type,
        relationship: row.relationship,
        objectId: row.object_id,
        objectName: row.object_name,
        objectType: row.object_type,
        displayText: row.display_text,
        confidence: row.confidence,
        trustTier: row.trust_tier,
        sourceText: row.source_text,
        sourceUrl: row.source_url,
        createdBy: row.created_by,
        createdAt: row.created_at,
        similarity,
        matchType: row.match_type,
      });
    }
  }

  // Sort by similarity descending
  return Array.from(byId.values()).sort((a, b) => b.similarity - a.similarity);
}

// ============================================================================
// MULTI-HOP EXPANSION
// ============================================================================

/**
 * Expand retrieval by walking the graph from initial results.
 * Each hop follows subject_id/object_id connections.
 * Confidence decays by 0.8 per hop.
 *
 * Triggered when initial retrieval is sparse or low confidence.
 */
export async function multiHopExpand(teamId, initialTriples, maxHops = 2) {
  const visitedTripleIds = new Set(initialTriples.map(t => t.id));
  const visitedConceptIds = new Set();

  // Collect concept IDs from initial results
  for (const t of initialTriples) {
    visitedConceptIds.add(t.subjectId);
    visitedConceptIds.add(t.objectId);
  }

  let expanded = [];
  let frontier = Array.from(visitedConceptIds);
  let hopDecay = 1.0;

  for (let hop = 0; hop < maxHops; hop++) {
    if (frontier.length === 0) break;
    hopDecay *= 0.8;

    // Find triples connected to frontier concepts
    const result = await db.query(`
      SELECT t.*, s.name AS subject_name, s.type AS subject_type,
             o.name AS object_name, o.type AS object_type
      FROM triples t
      JOIN concepts s ON t.subject_id = s.id
      JOIN concepts o ON t.object_id = o.id
      WHERE t.team_id = $1 AND t.status = 'active'
        AND (t.subject_id = ANY($2) OR t.object_id = ANY($2))
        AND t.id != ALL($3)
      LIMIT 20
    `, [teamId, frontier, Array.from(visitedTripleIds)]);

    const newFrontier = new Set();

    for (const row of result.rows) {
      visitedTripleIds.add(row.id);
      expanded.push({
        id: row.id,
        teamId: row.team_id,
        scopeId: row.scope_id,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        subjectType: row.subject_type,
        relationship: row.relationship,
        objectId: row.object_id,
        objectName: row.object_name,
        objectType: row.object_type,
        displayText: row.display_text,
        confidence: row.confidence,
        trustTier: row.trust_tier,
        sourceText: row.source_text,
        sourceUrl: row.source_url,
        createdBy: row.created_by,
        createdAt: row.created_at,
        similarity: (row.confidence || 0.5) * hopDecay, // decay similarity by hop distance
        matchType: `hop_${hop + 1}`,
        hopDistance: hop + 1,
      });

      // Add new concept IDs to frontier for next hop
      if (!visitedConceptIds.has(row.subject_id)) {
        newFrontier.add(row.subject_id);
        visitedConceptIds.add(row.subject_id);
      }
      if (!visitedConceptIds.has(row.object_id)) {
        newFrontier.add(row.object_id);
        visitedConceptIds.add(row.object_id);
      }
    }

    frontier = Array.from(newFrontier);
  }

  return expanded;
}

// ============================================================================
// CONTEXT FILTERING
// ============================================================================

/**
 * Filter triples by active contexts.
 *
 * A triple passes the filter if:
 * (a) it has no contexts (universally true), OR
 * (b) ALL of its contexts are satisfied by the active context set
 *     (context hierarchy: active "California" satisfies required "USA")
 */
export async function filterByContexts(triples, activeContextIds) {
  if (!activeContextIds || activeContextIds.length === 0) return triples;

  // Expand active contexts to include all descendants
  // (if "USA" is active, "California" and "Indiana" are also active)
  const expandedActiveIds = new Set(activeContextIds);
  for (const activeId of activeContextIds) {
    const descendants = await TripleService.getContextDescendantIds(activeId);
    descendants.forEach(id => expandedActiveIds.add(id));
  }

  // For each triple, check if its contexts are satisfied
  const filtered = [];
  for (const triple of triples) {
    const contexts = await TripleService.getContextsForTriple(triple.id);

    if (contexts.length === 0) {
      // No contexts = unconditionally true
      filtered.push(triple);
      continue;
    }

    // All contexts must be satisfied
    const allSatisfied = contexts.every(ctx => {
      // Check if this context or any of its ancestors is in the active set
      return expandedActiveIds.has(ctx.id);
    });

    if (allSatisfied) {
      filtered.push(triple);
    }
  }

  return filtered;
}

// ============================================================================
// ANSWER CONTEXT BUILDING
// ============================================================================

/**
 * Render triples as natural language context for the LLM answer prompt.
 */
export async function buildAnswerContext(triples) {
  if (triples.length === 0) return '';

  const lines = [];
  for (const t of triples) {
    const contexts = await TripleService.getContextsForTriple(t.id);
    const ctxStr = contexts.length > 0
      ? ` [context: ${contexts.map(c => c.name).join(', ')}]`
      : '';

    const trustStr = t.trustTier === 'official' ? ' (Official)' : '';
    const confStr = t.similarity ? ` (relevance: ${Math.round(t.similarity * 100)}%)` : '';
    const hopStr = t.hopDistance ? ` (${t.hopDistance}-hop connection)` : '';

    lines.push(`- ${t.displayText}${ctxStr}${trustStr}${confStr}${hopStr}`);

    // Include source text if different from display text
    if (t.sourceText && t.sourceText !== t.displayText) {
      lines.push(`  Source: "${t.sourceText.substring(0, 200)}"`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// CONVERSATION CONTEXT (Follow-up Rewriting)
// ============================================================================

/**
 * Check if a question looks like a follow-up to a previous question.
 */
export function looksLikeFollowUp(question) {
  const q = question.trim().toLowerCase();

  // Short questions that reference prior context
  if (q.length < 30) {
    if (/^(and |what about |how about |also |but |or |the |its |their |that )/.test(q)) return true;
    if (/^(i mean|i meant|sorry|correction|actually)/.test(q)) return true;
  }

  // Pronouns without clear antecedent
  if (/\b(it|they|them|this|that|those|these|he|she)\b/.test(q) && q.length < 50) return true;

  return false;
}

/**
 * Rewrite a follow-up question as a standalone question using conversation history.
 * Uses GPT-4o-mini for speed and cost.
 */
export async function rewriteFollowUp(question, conversationHistory = []) {
  if (!conversationHistory || conversationHistory.length === 0) return question;

  const historyText = conversationHistory
    .slice(-5) // last 5 messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const response = await callOpenAI([
    {
      role: 'system',
      content: `Rewrite the user's latest question as a standalone question that includes all necessary context from the conversation history. Return ONLY the rewritten question, nothing else.`
    },
    {
      role: 'user',
      content: `Conversation history:\n${historyText}\n\nLatest question: ${question}\n\nStandalone version:`
    }
  ], {
    model: 'gpt-4o-mini',
    maxTokens: 200,
    temperature: 0
  });

  return response?.trim() || question;
}

// ============================================================================
// SHOULD EXPAND (Multi-hop trigger heuristic)
// ============================================================================

/**
 * Determine if multi-hop expansion is needed based on initial results.
 */
export function shouldExpand(initialResults) {
  if (initialResults.length < 3) return true;

  const avgSimilarity = initialResults.reduce((sum, t) => sum + (t.similarity || 0), 0) / initialResults.length;
  if (avgSimilarity < 0.5) return true;

  return false;
}

export default {
  searchTriples,
  multiHopExpand,
  filterByContexts,
  buildAnswerContext,
  looksLikeFollowUp,
  rewriteFollowUp,
  shouldExpand,
};
