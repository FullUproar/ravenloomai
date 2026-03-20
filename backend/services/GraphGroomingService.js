/**
 * GraphGroomingService - On-demand knowledge graph maintenance and inference
 *
 * Techniques:
 * 1. Relationship extraction — replace RELATED_TO with actual relationship types via AI
 * 2. Semantic node dedup — merge nodes that refer to the same entity (embedding similarity)
 * 3. Orphan cleanup — flag nodes with no edges and no linked facts
 * 4. Edge weight recalculation — based on fact count, recency, trust
 * 5. Inference proposals — detect when facts imply new knowledge
 *
 * All operations are on-demand (triggered by user), not background jobs.
 */

import db from '../db.js';
import { generateEmbedding, callOpenAI } from './AIService.js';

// ============================================================================
// 1. RELATIONSHIP EXTRACTION — Replace generic RELATED_TO edges
// ============================================================================

/**
 * Find all RELATED_TO edges and use AI to classify the actual relationship.
 * Returns a report of what was changed.
 */
export async function refineRelationships(teamId) {
  const result = await db.query(`
    SELECT e.id, e.source_node_id, e.target_node_id, e.relationship, e.source_fact_ids,
           s.name as source_name, s.type as source_type,
           t.name as target_name, t.type as target_type
    FROM kg_edges e
    JOIN kg_nodes s ON s.id = e.source_node_id
    JOIN kg_nodes t ON t.id = e.target_node_id
    WHERE e.team_id = $1 AND e.relationship = 'RELATED_TO'
    LIMIT 50
  `, [teamId]);

  if (result.rows.length === 0) return { refined: 0, message: 'No generic relationships to refine.' };

  // Batch edges into groups for AI classification
  const edges = result.rows;
  const edgeDescriptions = edges.map(e =>
    `${e.source_name} (${e.source_type}) → ${e.target_name} (${e.target_type})`
  ).join('\n');

  // Get fact context for each edge
  const factContexts = [];
  for (const edge of edges.slice(0, 20)) {
    if (edge.source_fact_ids?.length > 0) {
      const facts = await db.query(
        `SELECT content FROM facts WHERE id = ANY($1) LIMIT 3`,
        [edge.source_fact_ids]
      );
      if (facts.rows.length > 0) {
        factContexts.push(`${edge.source_name} → ${edge.target_name}: ${facts.rows.map(f => f.content).join('; ')}`);
      }
    }
  }

  const prompt = `You are a knowledge graph relationship classifier. Given entity pairs and their source facts, determine the most accurate relationship type.

Available relationship types:
- FOUNDED_BY: Person founded/created an organization
- WORKS_FOR: Person works at/for organization
- MANUFACTURES: Company manufactures a product
- PART_OF: Entity is part of another entity
- IS_A: Type/category relationship
- HAS: Ownership or possession
- CREATED_BY: Product/work created by person/company
- LAUNCHES_ON: Product launches on a date
- LOCATED_IN: Entity is in a location
- DEPENDS_ON: Entity depends on another
- SUPERSEDES: New entity replaces old one
- MANAGES: Person manages project/team/product
- USES: Entity uses another entity
- COSTS: Financial relationship
- PARTNERS_WITH: Business partnership
- RELATED_TO: Only if no better type fits

Entity pairs to classify:
${edgeDescriptions}

${factContexts.length > 0 ? `\nSource facts for context:\n${factContexts.join('\n')}` : ''}

Return JSON array: [{"source": "Name", "target": "Name", "relationship": "TYPE"}]
Return ONLY valid JSON.`;

  try {
    const response = await callOpenAI([
      { role: 'system', content: prompt }
    ], { maxTokens: 1000, temperature: 0 });

    let content = response;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) content = codeBlockMatch[1].trim();

    const classifications = JSON.parse(content);
    let refined = 0;

    for (const cls of classifications) {
      if (cls.relationship && cls.relationship !== 'RELATED_TO') {
        const edge = edges.find(e =>
          e.source_name.toLowerCase() === cls.source.toLowerCase() &&
          e.target_name.toLowerCase() === cls.target.toLowerCase()
        );
        if (edge) {
          await db.query(
            `UPDATE kg_edges SET relationship = $1 WHERE id = $2`,
            [cls.relationship, edge.id]
          );
          refined++;
        }
      }
    }

    return { refined, total: edges.length, message: `Refined ${refined} of ${edges.length} generic relationships.` };
  } catch (error) {
    console.error('[GraphGroom] Relationship refinement error:', error.message);
    return { refined: 0, error: error.message };
  }
}

// ============================================================================
// 2. SEMANTIC NODE DEDUP — Merge nodes referring to the same entity
// ============================================================================

/**
 * Find semantically similar nodes and propose merges.
 * Uses pgvector cosine similarity on node embeddings.
 * Returns proposals — does not auto-merge (human confirms via separate mutation).
 */
export async function findDuplicateNodes(teamId) {
  // Find pairs of nodes with high embedding similarity but different names
  const result = await db.query(`
    SELECT
      a.id as node_a_id, a.name as node_a_name, a.type as node_a_type, a.mention_count as node_a_mentions,
      b.id as node_b_id, b.name as node_b_name, b.type as node_b_type, b.mention_count as node_b_mentions,
      1 - (a.embedding <=> b.embedding) as similarity
    FROM kg_nodes a
    JOIN kg_nodes b ON a.team_id = b.team_id AND a.id < b.id
    WHERE a.team_id = $1
      AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
      AND a.type = b.type
      AND lower(a.name) != lower(b.name)
      AND 1 - (a.embedding <=> b.embedding) > 0.85
    ORDER BY similarity DESC
    LIMIT 20
  `, [teamId]);

  return result.rows.map(row => ({
    nodeA: { id: row.node_a_id, name: row.node_a_name, type: row.node_a_type, mentions: row.node_a_mentions },
    nodeB: { id: row.node_b_id, name: row.node_b_name, type: row.node_b_type, mentions: row.node_b_mentions },
    similarity: parseFloat(row.similarity).toFixed(3),
    suggestedCanonical: row.node_a_mentions >= row.node_b_mentions ? row.node_a_name : row.node_b_name
  }));
}

/**
 * Merge two nodes — keep the canonical, absorb the duplicate.
 * Moves all edges, facts, and chunks from duplicate → canonical.
 */
export async function mergeNodes(teamId, canonicalNodeId, duplicateNodeId) {
  try {
    // 1. Move all edges pointing TO duplicate → point to canonical
    await db.query(`
      UPDATE kg_edges SET target_node_id = $1
      WHERE target_node_id = $2 AND source_node_id != $1
    `, [canonicalNodeId, duplicateNodeId]);

    // 2. Move all edges pointing FROM duplicate → point from canonical
    await db.query(`
      UPDATE kg_edges SET source_node_id = $1
      WHERE source_node_id = $2 AND target_node_id != $1
    `, [canonicalNodeId, duplicateNodeId]);

    // 3. Delete self-referential edges that may have been created
    await db.query(`
      DELETE FROM kg_edges WHERE source_node_id = $1 AND target_node_id = $1
    `, [canonicalNodeId]);

    // 4. Move fact associations
    await db.query(`
      UPDATE facts SET kg_node_id = $1 WHERE kg_node_id = $2
    `, [canonicalNodeId, duplicateNodeId]);

    // 5. Update mention count on canonical
    const dupNode = await db.query(`SELECT mention_count, aliases FROM kg_nodes WHERE id = $1`, [duplicateNodeId]);
    const canNode = await db.query(`SELECT name, mention_count, aliases FROM kg_nodes WHERE id = $1`, [canonicalNodeId]);

    if (dupNode.rows[0] && canNode.rows[0]) {
      const dupName = (await db.query(`SELECT name FROM kg_nodes WHERE id = $1`, [duplicateNodeId])).rows[0]?.name;
      const existingAliases = canNode.rows[0].aliases || [];
      const newAliases = [...new Set([...existingAliases, dupName].filter(Boolean))];

      await db.query(`
        UPDATE kg_nodes
        SET mention_count = mention_count + $2,
            aliases = $3
        WHERE id = $1
      `, [canonicalNodeId, dupNode.rows[0].mention_count || 0, JSON.stringify(newAliases)]);
    }

    // 6. Move children
    await db.query(`
      UPDATE kg_nodes SET parent_node_id = $1 WHERE parent_node_id = $2
    `, [canonicalNodeId, duplicateNodeId]);

    // 7. Delete duplicate edges that are now redundant (same source, target, relationship)
    await db.query(`
      DELETE FROM kg_edges a USING kg_edges b
      WHERE a.id > b.id
        AND a.source_node_id = b.source_node_id
        AND a.target_node_id = b.target_node_id
        AND a.relationship = b.relationship
    `);

    // 8. Delete the duplicate node
    await db.query(`DELETE FROM kg_nodes WHERE id = $1`, [duplicateNodeId]);

    return { success: true, message: `Merged into "${canNode.rows[0]?.name}". Duplicate removed.` };
  } catch (error) {
    console.error('[GraphGroom] Merge error:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// 3. ORPHAN CLEANUP — Find disconnected nodes
// ============================================================================

/**
 * Find nodes with no edges and no linked facts.
 * Returns orphans for review (not auto-deleted).
 */
export async function findOrphanNodes(teamId) {
  const result = await db.query(`
    SELECT n.id, n.name, n.type, n.mention_count, n.created_at
    FROM kg_nodes n
    WHERE n.team_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM kg_edges e
        WHERE e.source_node_id = n.id OR e.target_node_id = n.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM facts f WHERE f.kg_node_id = n.id AND (f.status IS NULL OR f.status = 'active')
      )
    ORDER BY n.created_at ASC
    LIMIT 50
  `, [teamId]);

  return result.rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    mentions: r.mention_count,
    createdAt: r.created_at
  }));
}

/**
 * Delete orphan nodes by IDs (after user confirms).
 */
export async function deleteOrphanNodes(teamId, nodeIds) {
  if (!nodeIds?.length) return { deleted: 0 };

  const result = await db.query(`
    DELETE FROM kg_nodes
    WHERE team_id = $1 AND id = ANY($2)
      AND NOT EXISTS (
        SELECT 1 FROM kg_edges e
        WHERE e.source_node_id = kg_nodes.id OR e.target_node_id = kg_nodes.id
      )
    RETURNING id
  `, [teamId, nodeIds]);

  return { deleted: result.rowCount };
}

// ============================================================================
// 4. EDGE WEIGHT RECALCULATION
// ============================================================================

/**
 * Recalculate edge weights based on:
 * - Number of supporting facts (source_fact_ids array length)
 * - Recency of latest supporting fact
 * - Trust score of the confirming users
 */
export async function recalculateEdgeWeights(teamId) {
  const result = await db.query(`
    UPDATE kg_edges e
    SET weight = (
      -- Base weight from fact count (log scale, max contribution 0.6)
      LEAST(0.6, 0.2 * LN(1 + COALESCE(array_length(source_fact_ids, 1), 0)))
      +
      -- Recency bonus (max 0.3, decays over 90 days)
      0.3 * GREATEST(0, 1 - EXTRACT(EPOCH FROM NOW() - COALESCE(e.last_confirmed_at, e.created_at)) / (90 * 86400))
      +
      -- Trust bonus (max 0.1)
      0.1 * COALESCE(e.trust_score, 0.5)
    ),
    trust_score = COALESCE(e.trust_score, 0.5)
    WHERE e.team_id = $1
    RETURNING id
  `, [teamId]);

  return { updated: result.rowCount, message: `Recalculated weights for ${result.rowCount} edges.` };
}

// ============================================================================
// 5. INFERENCE PROPOSALS — Detect implied knowledge
// ============================================================================

/**
 * Detect potential inferences from the knowledge graph.
 * Looks for patterns like:
 * - A FOUNDED_BY B, B WORKS_FOR C → A may be related to C
 * - A IS_A X, B IS_A X → A and B are in the same category
 * - A → B → C (transitive chains) with no direct A → C edge
 *
 * Returns proposals for human review — never auto-asserts.
 */
export async function proposeInferences(teamId) {
  // Find 2-hop paths that don't have a direct edge
  const result = await db.query(`
    SELECT DISTINCT
      a.name as source_name, a.type as source_type, a.id as source_id,
      c.name as target_name, c.type as target_type, c.id as target_id,
      b.name as via_name,
      e1.relationship as rel1,
      e2.relationship as rel2
    FROM kg_edges e1
    JOIN kg_edges e2 ON e1.target_node_id = e2.source_node_id
    JOIN kg_nodes a ON a.id = e1.source_node_id
    JOIN kg_nodes b ON b.id = e1.target_node_id
    JOIN kg_nodes c ON c.id = e2.target_node_id
    WHERE e1.team_id = $1
      AND a.id != c.id
      AND NOT EXISTS (
        SELECT 1 FROM kg_edges direct
        WHERE direct.source_node_id = a.id AND direct.target_node_id = c.id
      )
      AND e1.relationship != 'RELATED_TO'
      AND e2.relationship != 'RELATED_TO'
    LIMIT 20
  `, [teamId]);

  if (result.rows.length === 0) return [];

  // Use AI to evaluate which inferences are meaningful
  const chains = result.rows.map(r =>
    `${r.source_name} -[${r.rel1}]-> ${r.via_name} -[${r.rel2}]-> ${r.target_name}`
  ).join('\n');

  try {
    const response = await callOpenAI([{
      role: 'system',
      content: `You are evaluating potential knowledge graph inferences. Given 2-hop relationship chains, determine if they imply a meaningful direct relationship.

For each chain, respond with:
- "infer": true/false (is this a real inference worth proposing?)
- "relationship": the inferred relationship type
- "statement": the inferred fact as a natural language statement
- "confidence": 0.0-1.0

Chains:
${chains}

Return JSON array. Only include inferences with confidence >= 0.7.
Return ONLY valid JSON.`
    }], { maxTokens: 1500, temperature: 0 });

    let content = response;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) content = codeBlockMatch[1].trim();

    const proposals = JSON.parse(content);

    return proposals
      .filter(p => p.infer && p.confidence >= 0.7)
      .map((p, i) => ({
        chain: result.rows[i] ? `${result.rows[i].source_name} → ${result.rows[i].via_name} → ${result.rows[i].target_name}` : 'unknown',
        relationship: p.relationship,
        statement: p.statement,
        confidence: p.confidence,
        sourceNodeId: result.rows[i]?.source_id,
        targetNodeId: result.rows[i]?.target_id
      }));
  } catch (error) {
    console.error('[GraphGroom] Inference error:', error.message);
    return [];
  }
}

// ============================================================================
// 6. FULL GROOM — Run all operations and return a report
// ============================================================================

/**
 * Run all grooming operations and return a comprehensive report.
 * This is the main entry point — called from the UI "Groom Knowledge" button.
 */
export async function groomGraph(teamId) {
  console.log(`[GraphGroom] Starting full groom for team ${teamId}`);
  const report = {};

  // 1. Refine generic relationships
  report.relationships = await refineRelationships(teamId);

  // 2. Find duplicate nodes (propose, don't auto-merge)
  report.duplicates = await findDuplicateNodes(teamId);

  // 3. Find orphan nodes (propose, don't auto-delete)
  report.orphans = await findOrphanNodes(teamId);

  // 4. Recalculate edge weights
  report.weights = await recalculateEdgeWeights(teamId);

  // 5. Propose inferences
  report.inferences = await proposeInferences(teamId);

  // 6. Graph stats
  const nodes = await db.query('SELECT COUNT(*) FROM kg_nodes WHERE team_id = $1', [teamId]);
  const edges = await db.query('SELECT COUNT(*) FROM kg_edges WHERE team_id = $1', [teamId]);
  const facts = await db.query("SELECT COUNT(*) FROM facts WHERE team_id = $1 AND (status IS NULL OR status = 'active')", [teamId]);

  report.stats = {
    totalNodes: parseInt(nodes.rows[0].count),
    totalEdges: parseInt(edges.rows[0].count),
    totalFacts: parseInt(facts.rows[0].count)
  };

  console.log(`[GraphGroom] Complete. ${report.relationships.refined} relationships refined, ${report.duplicates.length} duplicates found, ${report.orphans.length} orphans found, ${report.inferences.length} inferences proposed.`);

  return report;
}

export default {
  groomGraph,
  refineRelationships,
  findDuplicateNodes,
  mergeNodes,
  findOrphanNodes,
  deleteOrphanNodes,
  recalculateEdgeWeights,
  proposeInferences
};
