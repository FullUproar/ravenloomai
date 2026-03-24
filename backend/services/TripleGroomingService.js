/**
 * TripleGroomingService - Autonomous graph maintenance
 *
 * All operations are editorial (structural), not factual.
 * They run silently but are auditable via groomed_from_id and logs.
 *
 * Operations:
 * 1. Decompose chunky triples into atomic ones
 * 2. Merge semantically duplicate concepts
 * 3. Prune universal knowledge (things the LLM already knows)
 * 4. Discover missing contexts for context-free triples
 * 5. Propose inferences from 2-hop chains
 * 6. Refine generic relationships into specific types
 */

import db from '../db.js';
import { generateEmbedding, callOpenAI } from './AIService.js';
import * as TripleService from './TripleService.js';

// ============================================================================
// 1. DECOMPOSE CHUNKY TRIPLES
// ============================================================================

/**
 * Find triples flagged as chunky and decompose them into atomic triples.
 */
export async function decomposeChunkyTriples(teamId) {
  const result = await db.query(`
    SELECT t.*, s.name AS subject_name, s.type AS subject_type,
           o.name AS object_name, o.type AS object_type
    FROM triples t
    JOIN concepts s ON t.subject_id = s.id
    JOIN concepts o ON t.object_id = o.id
    WHERE t.team_id = $1 AND t.is_chunky = true AND t.status = 'active'
    LIMIT 20
  `, [teamId]);

  if (result.rows.length === 0) return { decomposed: 0, newTriples: [] };

  const newTriples = [];

  for (const row of result.rows) {
    const displayText = row.display_text;

    const response = await callOpenAI([
      {
        role: 'system',
        content: `You decompose compound knowledge statements into atomic triples.
Each triple must be: { "subject": { "name": "...", "type": "..." }, "relationship": "...", "object": { "name": "...", "type": "..." } }
Return JSON: { "triples": [...] }
Only decompose if the statement contains multiple distinct facts. If it's already atomic, return an empty array.`
      },
      { role: 'user', content: `Decompose: "${displayText}"` }
    ], { model: 'gpt-4o', maxTokens: 500, temperature: 0 });

    try {
      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
      const atomicTriples = parsed.triples || [];

      if (atomicTriples.length > 1) {
        // Create new atomic triples
        for (const atomic of atomicTriples) {
          const subject = await TripleService.upsertConcept(teamId, {
            name: atomic.subject.name, type: atomic.subject.type, scopeId: row.scope_id
          });
          const object = await TripleService.upsertConcept(teamId, {
            name: atomic.object.name, type: atomic.object.type, scopeId: row.scope_id
          });

          const newTriple = await TripleService.createTriple(teamId, row.scope_id, {
            subjectId: subject.id,
            relationship: atomic.relationship,
            objectId: object.id,
            sourceText: row.source_text,
            sourceUrl: row.source_url,
            createdBy: row.created_by,
            confidence: row.confidence,
            trustTier: row.trust_tier,
            sourceType: 'grooming',
            groomedFromId: row.id,
          });
          newTriples.push(newTriple);
        }

        // Archive the original chunky triple
        await TripleService.archiveTriple(row.id);
        await db.query("UPDATE triples SET groomed_at = NOW() WHERE id = $1", [row.id]);
      } else {
        // Not actually chunky — unflag it
        await db.query("UPDATE triples SET is_chunky = false WHERE id = $1", [row.id]);
      }
    } catch (err) {
      console.error(`[Grooming] Decompose error for triple ${row.id}:`, err.message);
    }
  }

  return { decomposed: result.rows.length, newTriples };
}

// ============================================================================
// 2. MERGE DUPLICATE CONCEPTS
// ============================================================================

/**
 * Find semantically duplicate concepts using embedding similarity.
 * Auto-merges >0.97 similarity, proposes 0.90-0.97.
 */
export async function mergeSemanticDuplicates(teamId) {
  // Single SQL query to find all similar concept pairs (much faster than O(n²) loop)
  const pairs = await db.query(`
    SELECT c1.id AS id1, c1.name AS name1, c1.type AS type1, c1.mention_count AS mentions1,
           c2.id AS id2, c2.name AS name2, c2.type AS type2, c2.mention_count AS mentions2,
           1 - (c1.embedding <=> c2.embedding) AS similarity
    FROM concepts c1
    JOIN concepts c2 ON c1.team_id = c2.team_id AND c1.id < c2.id AND c1.type = c2.type
    WHERE c1.team_id = $1
      AND c1.embedding IS NOT NULL AND c2.embedding IS NOT NULL
      AND 1 - (c1.embedding <=> c2.embedding) > 0.90
    ORDER BY similarity DESC
    LIMIT 100
  `, [teamId]);

  const proposals = [];
  const autoMerged = [];
  const processed = new Set();

  for (const row of pairs.rows) {
    if (processed.has(row.id1) || processed.has(row.id2)) continue;
    const similarity = parseFloat(row.similarity);

    if (similarity > 0.97) {
      // Auto-merge (editorial decision — silent)
      const canonicalId = row.mentions1 >= row.mentions2 ? row.id1 : row.id2;
      const duplicateId = canonicalId === row.id1 ? row.id2 : row.id1;
      const canonicalName = canonicalId === row.id1 ? row.name1 : row.name2;
      const duplicateName = canonicalId === row.id1 ? row.name2 : row.name1;

      try {
        await TripleService.mergeConcepts(teamId, canonicalId, duplicateId);
        processed.add(duplicateId);
        autoMerged.push({ canonical: canonicalName, duplicate: duplicateName, similarity });
      } catch (err) {
        console.error(`[Grooming] Merge error: ${err.message}`);
      }
    } else {
      // Propose (needs review)
      proposals.push({
        conceptA: { id: row.id1, name: row.name1, type: row.type1 },
        conceptB: { id: row.id2, name: row.name2, type: row.type2 },
        similarity: similarity.toFixed(3),
        suggestedCanonical: row.mentions1 >= row.mentions2 ? row.name1 : row.name2
      });
    }
  }

  return { autoMerged, proposals };
}

// ============================================================================
// 3. PRUNE UNIVERSAL KNOWLEDGE
// ============================================================================

/**
 * Identify triples that encode universal knowledge the LLM already knows.
 * Mark as is_universal=true, status='pruned'.
 */
export async function pruneUniversalKnowledge(teamId) {
  const result = await db.query(`
    SELECT id, display_text FROM triples
    WHERE team_id = $1 AND status = 'active' AND is_universal IS NOT TRUE
    ORDER BY created_at ASC
    LIMIT 50
  `, [teamId]);

  if (result.rows.length === 0) return { pruned: 0, triples: [] };

  const statements = result.rows.map((r, i) => `${i + 1}. ${r.display_text}`).join('\n');

  const response = await callOpenAI([
    {
      role: 'system',
      content: `You are evaluating knowledge statements for an institutional knowledge base.
Determine which statements are UNIVERSAL knowledge (any LLM would know them without being told)
vs INSTITUTIONAL knowledge (specific to this organization, its people, products, or processes).

BE VERY CONSERVATIVE. Only mark something as universal if it is a TEXTBOOK FACT that adds zero value.
If in doubt, keep it — false negatives (keeping a universal fact) cost nothing, but false positives (pruning an institutional fact) destroy knowledge.

UNIVERSAL (prune these): "Blue is a color", "A CEO runs a company", "JavaScript is a programming language", "Games are played for fun"
INSTITUTIONAL (keep these): anything mentioning specific people, products, companies, dates, targets, processes, or decisions. Even "Our company values creativity" is institutional — it's about a SPECIFIC company.

Return JSON: { "universal": [1, 5, 8] } — list ONLY statements that are pure textbook facts with zero organizational specificity.
If none are universal, return { "universal": [] }. It is BETTER to return an empty list than to prune useful knowledge.`
    },
    { role: 'user', content: `Evaluate these statements:\n${statements}` }
  ], { model: 'gpt-4o-mini', maxTokens: 200, temperature: 0 });

  const pruned = [];
  try {
    const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
    const universalIndices = parsed.universal || [];

    for (const idx of universalIndices) {
      const row = result.rows[idx - 1];
      if (row) {
        await db.query(
          "UPDATE triples SET is_universal = true, status = 'pruned', groomed_at = NOW() WHERE id = $1",
          [row.id]
        );
        pruned.push({ id: row.id, displayText: row.display_text });
      }
    }
  } catch (err) {
    console.error('[Grooming] Prune error:', err.message);
  }

  return { pruned: pruned.length, triples: pruned };
}

// ============================================================================
// 4. DISCOVER MISSING CONTEXTS
// ============================================================================

/**
 * Find triples with no contexts and use AI to infer likely contexts.
 */
export async function discoverMissingContexts(teamId) {
  const result = await db.query(`
    SELECT t.id, t.display_text, t.source_text
    FROM triples t
    LEFT JOIN triple_contexts tc ON t.id = tc.triple_id
    WHERE t.team_id = $1 AND t.status = 'active' AND tc.id IS NULL
    LIMIT 30
  `, [teamId]);

  if (result.rows.length === 0) return { discovered: 0 };

  let discovered = 0;

  // Process in batches of 10
  for (let i = 0; i < result.rows.length; i += 10) {
    const batch = result.rows.slice(i, i + 10);
    const statements = batch.map((r, j) => `${j + 1}. "${r.display_text}"`).join('\n');

    const response = await callOpenAI([
      {
        role: 'system',
        content: `You analyze knowledge statements to identify implicit contexts — conditions under which the statement is true.
Most statements have NO context (they are unconditionally true within the organization). Only add contexts when there's a clear condition.

Context types: temporal (time-related), spatial (location), organizational (team/project), conditional (if/when)

Return JSON: { "contexts": { "1": [{"name": "Gen Con 2026", "type": "temporal"}], "3": [{"name": "manufacturing phase", "type": "work_stage"}] } }
Only include entries for statements that have meaningful contexts. Most should be empty.`
      },
      { role: 'user', content: `Find implicit contexts:\n${statements}` }
    ], { model: 'gpt-4o-mini', maxTokens: 500, temperature: 0 });

    try {
      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
      const contextMap = parsed.contexts || {};

      for (const [idx, ctxList] of Object.entries(contextMap)) {
        const row = batch[parseInt(idx) - 1];
        if (!row || !Array.isArray(ctxList) || ctxList.length === 0) continue;

        for (const ctx of ctxList) {
          const ctxNode = await TripleService.upsertContextNode(teamId, {
            name: ctx.name, type: ctx.type
          });
          await TripleService.linkTripleToContexts(row.id, [ctxNode.id], 'inferred');
          discovered++;
        }
      }
    } catch (err) {
      console.error('[Grooming] Context discovery error:', err.message);
    }
  }

  return { discovered };
}

// ============================================================================
// 5. PROPOSE INFERENCES
// ============================================================================

/**
 * Find 2-hop chains and propose new direct triples.
 * A → r1 → B → r2 → C, propose A → r3 → C
 */
export async function proposeInferences(teamId) {
  const result = await db.query(`
    SELECT t1.subject_id AS a_id, t1.relationship AS r1, t1.object_id AS b_id,
           t2.relationship AS r2, t2.object_id AS c_id,
           s.name AS a_name, s.type AS a_type,
           m.name AS b_name, m.type AS b_type,
           e.name AS c_name, e.type AS c_type
    FROM triples t1
    JOIN triples t2 ON t1.object_id = t2.subject_id
    JOIN concepts s ON t1.subject_id = s.id
    JOIN concepts m ON t1.object_id = m.id
    JOIN concepts e ON t2.object_id = e.id
    WHERE t1.team_id = $1 AND t1.status = 'active' AND t2.status = 'active'
      AND t1.subject_id != t2.object_id
      AND NOT EXISTS (
        SELECT 1 FROM triples t3
        WHERE t3.subject_id = t1.subject_id AND t3.object_id = t2.object_id AND t3.status = 'active'
      )
    LIMIT 50
  `, [teamId]);

  if (result.rows.length === 0) return [];

  const chains = result.rows.map(r =>
    `${r.a_name} (${r.a_type}) --[${r.r1}]--> ${r.b_name} (${r.b_type}) --[${r.r2}]--> ${r.c_name} (${r.c_type})`
  ).join('\n');

  const response = await callOpenAI([
    {
      role: 'system',
      content: `You analyze 2-hop chains in a knowledge graph and propose direct relationships.
For each chain A → B → C, determine if a direct A → C relationship is meaningful and accurate.

Return JSON: { "inferences": [
  { "index": 0, "relationship": "launches at", "statement": "Hack Your Deck launches at Gen Con 2026", "confidence": 0.8 }
] }
Only include inferences with confidence >= 0.6. Be conservative — don't infer what isn't strongly implied.`
    },
    { role: 'user', content: `Evaluate these 2-hop chains:\n${chains}` }
  ], { model: 'gpt-4o', maxTokens: 1000, temperature: 0 });

  try {
    const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return (parsed.inferences || []).map(inf => {
      const chain = result.rows[inf.index];
      return {
        chain: `${chain?.a_name} → ${chain?.b_name} → ${chain?.c_name}`,
        relationship: inf.relationship,
        statement: inf.statement,
        confidence: inf.confidence,
        sourceNodeId: chain?.a_id,
        targetNodeId: chain?.c_id,
      };
    }).filter(inf => inf.confidence >= 0.6);
  } catch (err) {
    console.error('[Grooming] Inference error:', err.message);
    return [];
  }
}

// ============================================================================
// 6. REFINE GENERIC RELATIONSHIPS
// ============================================================================

/**
 * Find triples with generic relationships and classify them specifically.
 */
export async function refineRelationships(teamId) {
  const result = await db.query(`
    SELECT t.id, t.display_text, s.name AS subject_name, s.type AS subject_type,
           o.name AS object_name, o.type AS object_type, t.relationship
    FROM triples t
    JOIN concepts s ON t.subject_id = s.id
    JOIN concepts o ON t.object_id = o.id
    WHERE t.team_id = $1 AND t.status = 'active'
      AND t.relationship IN ('is related to', 'relates to', 'associated with', 'connected to')
    LIMIT 30
  `, [teamId]);

  if (result.rows.length === 0) return { refined: 0 };

  const descriptions = result.rows.map((r, i) =>
    `${i + 1}. ${r.subject_name} (${r.subject_type}) → ${r.object_name} (${r.object_type})`
  ).join('\n');

  const response = await callOpenAI([
    {
      role: 'system',
      content: `You classify generic relationships into specific verb phrases.
Return JSON: { "refined": { "1": "works for", "3": "is manufactured by" } }
Use natural verb phrases, not uppercase codes.`
    },
    { role: 'user', content: `Classify these relationships:\n${descriptions}` }
  ], { model: 'gpt-4o-mini', maxTokens: 300, temperature: 0 });

  let refined = 0;
  try {
    const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
    const refinedMap = parsed.refined || {};

    for (const [idx, newRelationship] of Object.entries(refinedMap)) {
      const row = result.rows[parseInt(idx) - 1];
      if (row && newRelationship) {
        const newDisplayText = `${row.subject_name} ${newRelationship} ${row.object_name}`;
        await db.query(
          'UPDATE triples SET relationship = $1, display_text = $2, groomed_at = NOW() WHERE id = $3',
          [newRelationship, newDisplayText, row.id]
        );

        // Regenerate embeddings with new relationship text
        const embeddings = await TripleService.generateDualEmbeddings(
          newDisplayText, row.subject_name, newRelationship, row.object_name, []
        );
        if (embeddings.withContext) {
          await db.query(
            'UPDATE triples SET embedding_with_context = $1, embedding_without_context = $2 WHERE id = $3',
            [`[${embeddings.withContext.join(',')}]`, `[${embeddings.withoutContext.join(',')}]`, row.id]
          );
        }

        refined++;
      }
    }
  } catch (err) {
    console.error('[Grooming] Refine error:', err.message);
  }

  return { refined };
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * Run all grooming operations and return a combined report.
 */
export async function groomGraph(teamId) {
  console.log(`[Grooming] Starting groom for team ${teamId}`);

  const decomposed = await decomposeChunkyTriples(teamId);
  const duplicates = await mergeSemanticDuplicates(teamId);
  const pruned = await pruneUniversalKnowledge(teamId);
  const contexts = await discoverMissingContexts(teamId);
  const inferences = await proposeInferences(teamId);
  const relationships = await refineRelationships(teamId);
  const stats = await TripleService.getGraphStats(teamId);

  console.log(`[Grooming] Complete: ${decomposed.decomposed} decomposed, ${duplicates.autoMerged.length} auto-merged, ${pruned.pruned} pruned, ${contexts.discovered} contexts, ${inferences.length} inferences, ${relationships.refined} refined`);

  return {
    decomposed: decomposed.decomposed,
    mergeProposals: duplicates.proposals,
    autoMerged: duplicates.autoMerged,
    pruned: pruned.pruned,
    contextsDiscovered: contexts.discovered,
    inferences,
    relationshipsRefined: relationships.refined,
    stats
  };
}

export default {
  decomposeChunkyTriples,
  mergeSemanticDuplicates,
  pruneUniversalKnowledge,
  discoverMissingContexts,
  proposeInferences,
  refineRelationships,
  groomGraph,
};
