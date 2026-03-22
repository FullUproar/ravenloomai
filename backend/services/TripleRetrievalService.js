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
// DUAL-EMBEDDING SEARCH + CONCEPT-ANCHORED RETRIEVAL
// ============================================================================

/**
 * Search triples using four strategies, merged and ranked:
 * 1. Dual-embedding search (with-context and without-context)
 * 2. Concept-anchored search (find mentioned concepts, get ALL their triples)
 * 3. LLM entity extraction (extract entity names from question for exact matching)
 * 4. Results merged by max similarity per triple
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

  // Run embedding searches and entity extraction in parallel
  const [withCtxResults, withoutCtxResults, conceptResults, extractedEntities] = await Promise.all([
    // Strategy 1: Embedding search on with-context column
    db.query(`
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
    `, [...baseParams, topK]),

    // Strategy 2: Embedding search on without-context column
    db.query(`
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
    `, [...baseParams, topK]),

    // Strategy 3a: Concept-anchored search by embedding
    db.query(`
      SELECT id, name, 1 - (embedding <=> $1) AS similarity
      FROM concepts
      WHERE team_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1
      LIMIT 5
    `, [embeddingStr, teamId]),

    // Strategy 3b: LLM entity extraction (lightweight)
    extractEntitiesFromQuestion(question),
  ]);

  // Strategy 3c: Keyword matching on concept names
  const questionWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  let keywordConcepts = [];
  if (questionWords.length > 0) {
    const patterns = questionWords.map(w => `%${w}%`);
    const placeholders = patterns.map((_, i) => `canonical_name ILIKE $${i + 2}`).join(' OR ');
    const keywordResult = await db.query(
      `SELECT id, name, 0.85 AS similarity FROM concepts WHERE team_id = $1 AND (${placeholders}) LIMIT 5`,
      [teamId, ...patterns]
    );
    keywordConcepts = keywordResult.rows;
  }

  // Strategy 3d: Match extracted entities against concept names (fuzzy)
  let entityConcepts = [];
  if (extractedEntities.length > 0) {
    const entityPatterns = extractedEntities.map(e => `%${e}%`);
    const entityPlaceholders = entityPatterns.map((_, i) => `canonical_name ILIKE $${i + 2} OR name ILIKE $${i + 2}`).join(' OR ');
    try {
      const entityResult = await db.query(
        `SELECT id, name, 0.95 AS similarity FROM concepts WHERE team_id = $1 AND (${entityPlaceholders}) LIMIT 8`,
        [teamId, ...entityPatterns]
      );
      entityConcepts = entityResult.rows;
    } catch { /* ignore if query fails */ }
  }

  // Merge concept results (embedding + keyword + entity), dedup by ID
  const conceptMap = new Map();
  for (const c of [...conceptResults.rows, ...keywordConcepts, ...entityConcepts]) {
    const existing = conceptMap.get(c.id);
    if (!existing || parseFloat(c.similarity) > parseFloat(existing.similarity)) {
      conceptMap.set(c.id, c);
    }
  }

  const anchoredTriples = [];
  const topConcepts = Array.from(conceptMap.values()).filter(c => parseFloat(c.similarity) > 0.45);

  for (const concept of topConcepts.slice(0, 5)) {
    const conceptTriples = await db.query(`
      SELECT t.*, s.name AS subject_name, s.type AS subject_type,
             o.name AS object_name, o.type AS object_type,
             'concept_anchor' AS match_type
      FROM triples t
      JOIN concepts s ON t.subject_id = s.id
      JOIN concepts o ON t.object_id = o.id
      WHERE t.team_id = $1 AND t.status = 'active'
        AND (t.subject_id = $2 OR t.object_id = $2)
    `, [teamId, concept.id]);

    for (const row of conceptTriples.rows) {
      // Concept-anchored triples get high similarity based on concept match quality
      row.similarity = parseFloat(concept.similarity) * 0.95;
      anchoredTriples.push(row);
    }
  }

  // Merge all sources
  const merged = mergeAndRank(withCtxResults.rows, withoutCtxResults.rows, anchoredTriples);

  // Apply trust-weighted scoring (best-effort, never blocks)
  try {
    const TrustService = await import('./TrustService.js');
    for (const triple of merged) {
      if (triple.createdBy) {
        const trust = await TrustService.getTrustScore(teamId, triple.createdBy, 'user', null);
        triple.trustScore = trust.score;
        triple.trustLevel = trust.level;
        // Blend: 80% similarity + 20% trust (trust is a tiebreaker, not a dominant signal)
        triple.similarity = (triple.similarity * 0.8) + (trust.score * 0.2);
      }
    }
    // Re-sort by blended score
    merged.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  } catch { /* trust weighting is best-effort */ }

  return merged;
}

/**
 * Extract entity names from a question using lightweight LLM call.
 * "When does our chaos card game ship?" → ["chaos card game", "ship date"]
 * "What's Hack Your Deck's release?" → ["Hack Your Deck", "release"]
 */
async function extractEntitiesFromQuestion(question) {
  try {
    const response = await callOpenAI([
      {
        role: 'system',
        content: `Extract entity names, product names, and key nouns from this question. Return ONLY a JSON array of strings. Include proper nouns, product names, company names, and important concepts. Be generous — include anything that might be a named entity.
Example: "When does our chaos card game ship?" → ["chaos card game"]
Example: "What's the manufacturing lead time for Hack Your Deck?" → ["Hack Your Deck", "manufacturing"]`
      },
      { role: 'user', content: question }
    ], { model: 'gpt-4o-mini', maxTokens: 100, temperature: 0 });

    const parsed = JSON.parse(response.match(/\[[\s\S]*?\]/)?.[0] || '[]');
    return parsed.filter(e => typeof e === 'string' && e.length > 2);
  } catch {
    return [];
  }
}

/**
 * Merge results from multiple search strategies, keeping max similarity per triple.
 */
function mergeAndRank(...rowArrays) {
  const byId = new Map();

  for (const row of rowArrays.flat()) {
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
 * Only expands from the TOP results (highest similarity) to avoid noise.
 */
export async function multiHopExpand(teamId, initialTriples, maxHops = 2) {
  const visitedTripleIds = new Set(initialTriples.map(t => t.id));
  const visitedConceptIds = new Set();

  // Only use top 5 results as seeds for expansion (prevents noise)
  const seeds = initialTriples.slice(0, 5);
  for (const t of seeds) {
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
 * Groups by concept for coherent context.
 */
export async function buildAnswerContext(triples) {
  if (triples.length === 0) return '';

  // Group triples by their primary concept (subject)
  const bySubject = new Map();
  for (const t of triples) {
    const key = t.subjectName || 'General';
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(t);
  }

  const sections = [];
  for (const [subject, subjectTriples] of bySubject) {
    const lines = [];
    for (const t of subjectTriples) {
      const contexts = await TripleService.getContextsForTriple(t.id);
      const ctxStr = contexts.length > 0
        ? ` [context: ${contexts.map(c => c.name).join(', ')}]`
        : '';
      const hopStr = t.hopDistance ? ` (via ${t.hopDistance}-hop connection)` : '';

      lines.push(`  - ${t.displayText}${ctxStr}${hopStr}`);
    }
    sections.push(`${subject}:\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
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
 * More conservative: only expand when the top result isn't strongly relevant,
 * or when we have very few results.
 */
export function shouldExpand(initialResults) {
  if (initialResults.length === 0) return false; // Nothing to expand from
  if (initialResults.length < 2) return true; // Too few, need more

  // Check if top result is strong enough to answer directly
  const topSimilarity = initialResults[0]?.similarity || 0;
  if (topSimilarity >= 0.7) return false; // Strong direct match

  // Check if we have enough concept-anchored results
  const anchoredCount = initialResults.filter(t => t.matchType === 'concept_anchor').length;
  if (anchoredCount >= 3) return false; // Plenty of anchored results

  // Expand when top results are mediocre
  const top3Avg = initialResults.slice(0, 3).reduce((sum, t) => sum + (t.similarity || 0), 0) / Math.min(initialResults.length, 3);
  return top3Avg < 0.55;
}

// ============================================================================
// LLM RE-RANKING
// ============================================================================

/**
 * Re-rank retrieved triples using a lightweight LLM call.
 * Asks the model which triples are most relevant to the question.
 * Only called when we have enough candidates to warrant it.
 */
export async function rerankTriples(question, triples) {
  if (triples.length <= 3) return triples; // Not enough to re-rank

  const candidates = triples.slice(0, 12); // Cap candidates
  const numbered = candidates.map((t, i) => `${i + 1}. ${t.displayText}`).join('\n');

  const response = await callOpenAI([
    {
      role: 'system',
      content: `You are ranking knowledge statements by relevance to a question.
Return ONLY a JSON array of the statement numbers in order of relevance (most relevant first).
Only include statements that are actually relevant. Exclude irrelevant ones.
Example: [3, 1, 7]`
    },
    {
      role: 'user',
      content: `Question: ${question}\n\nStatements:\n${numbered}`
    }
  ], { model: 'gpt-4o-mini', maxTokens: 100, temperature: 0 });

  try {
    const parsed = JSON.parse(response.match(/\[[\d,\s]+\]/)?.[0] || '[]');
    const reranked = [];
    for (const idx of parsed) {
      const i = idx - 1;
      if (i >= 0 && i < candidates.length) {
        const t = candidates[i];
        t.similarity = 1.0 - (reranked.length * 0.05); // Assign descending similarity based on rank
        reranked.push(t);
      }
    }
    // Append any candidates not included by the ranker (with low similarity)
    const rankedIds = new Set(reranked.map(t => t.id));
    for (const t of candidates) {
      if (!rankedIds.has(t.id)) {
        t.similarity = 0.2;
        reranked.push(t);
      }
    }
    return reranked;
  } catch {
    return triples; // Fallback to original ranking
  }
}

export default {
  searchTriples,
  multiHopExpand,
  filterByContexts,
  buildAnswerContext,
  looksLikeFollowUp,
  rewriteFollowUp,
  shouldExpand,
  rerankTriples,
};
