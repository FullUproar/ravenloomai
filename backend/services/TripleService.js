/**
 * TripleService - Core CRUD for the triple-based knowledge system
 *
 * Manages concepts, triples, and context nodes.
 * A triple (Subject --relationship--> Object) [Contexts] is the atom of knowledge.
 * Each triple gets dual embeddings: with-context and without-context.
 */

import db from '../db.js';
import { generateEmbedding } from './AIService.js';

// ============================================================================
// CONCEPTS
// ============================================================================

/**
 * Create or update a concept node.
 * If a concept with the same canonical_name + type exists, increment mention_count.
 */
export async function upsertConcept(teamId, { name, type, description, aliases, scopeId }) {
  const canonicalName = name.trim().toLowerCase();

  // First check: does a concept with this name already exist (ANY type)?
  // This prevents creating "Afterroar" (concept) when "Afterroar" (product) already exists.
  // Prefer existing concept over creating a duplicate with a different type.
  const existing = await db.query(
    `SELECT * FROM concepts WHERE team_id = $1 AND canonical_name = $2 ORDER BY mention_count DESC LIMIT 1`,
    [teamId, canonicalName]
  );

  if (existing.rows[0]) {
    // Found existing concept — increment mention_count and update metadata
    const row = existing.rows[0];
    await db.query(`
      UPDATE concepts SET
        mention_count = mention_count + 1,
        description = COALESCE($1, description),
        aliases = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(aliases, ARRAY[]::text[]) || COALESCE($2, ARRAY[]::text[])))),
        updated_at = NOW()
      WHERE id = $3
    `, [description || null, aliases || [], row.id]);

    const updated = await db.query('SELECT *, false AS is_new FROM concepts WHERE id = $1', [row.id]);
    const concept = updated.rows[0];

    // Generate embedding if missing
    if (!concept.embedding) {
      const embeddingText = concept.description
        ? `${concept.name} (${concept.type}): ${concept.description}`
        : `${concept.name} (${concept.type})`;
      const embedding = await generateEmbedding(embeddingText);
      if (embedding) {
        await db.query('UPDATE concepts SET embedding = $1 WHERE id = $2', [`[${embedding.join(',')}]`, concept.id]);
      }
    }

    return mapConcept(concept);
  }

  // No existing concept — create new
  const result = await db.query(`
    INSERT INTO concepts (team_id, scope_id, name, canonical_name, type, description, aliases)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (team_id, canonical_name, type) DO UPDATE SET
      mention_count = concepts.mention_count + 1,
      description = COALESCE(EXCLUDED.description, concepts.description),
      aliases = (
        SELECT ARRAY(SELECT DISTINCT unnest(concepts.aliases || EXCLUDED.aliases))
      ),
      updated_at = NOW()
    RETURNING *, (xmax = 0) AS is_new
  `, [teamId, scopeId || null, name.trim(), canonicalName, type, description || null, aliases || []]);

  const concept = result.rows[0];

  // Generate embedding if new or missing
  if (concept.is_new || !concept.embedding) {
    const embeddingText = description
      ? `${name} (${type}): ${description}`
      : `${name} (${type})`;
    const embedding = await generateEmbedding(embeddingText);
    if (embedding) {
      await db.query(
        'UPDATE concepts SET embedding = $1 WHERE id = $2',
        [`[${embedding.join(',')}]`, concept.id]
      );
    }
  }

  return mapConcept(concept);
}

/**
 * Find a concept by name (fuzzy match via canonical_name).
 */
export async function findConceptByName(teamId, name, type = null) {
  const canonicalName = name.trim().toLowerCase();
  const query = type
    ? 'SELECT * FROM concepts WHERE team_id = $1 AND canonical_name = $2 AND type = $3'
    : 'SELECT * FROM concepts WHERE team_id = $1 AND canonical_name = $2';
  const params = type ? [teamId, canonicalName, type] : [teamId, canonicalName];

  const result = await db.query(query, params);
  return result.rows[0] ? mapConcept(result.rows[0]) : null;
}

/**
 * Search concepts by embedding similarity.
 */
export async function searchConcepts(teamId, query, limit = 10) {
  const embedding = await generateEmbedding(query);
  if (!embedding) return [];

  const result = await db.query(`
    SELECT *, 1 - (embedding <=> $1) AS similarity
    FROM concepts
    WHERE team_id = $2 AND embedding IS NOT NULL
    ORDER BY embedding <=> $1
    LIMIT $3
  `, [`[${embedding.join(',')}]`, teamId, limit]);

  return result.rows.map(mapConcept);
}

/**
 * Get all concepts for a team, optionally filtered by type.
 */
export async function getConcepts(teamId, { type, limit = 500 } = {}) {
  const query = type
    ? 'SELECT * FROM concepts WHERE team_id = $1 AND type = $2 ORDER BY mention_count DESC LIMIT $3'
    : 'SELECT * FROM concepts WHERE team_id = $1 ORDER BY mention_count DESC LIMIT $2';
  const params = type ? [teamId, type, limit] : [teamId, limit];

  const result = await db.query(query, params);
  return result.rows.map(mapConcept);
}

/**
 * Get a single concept by ID.
 */
export async function getConcept(conceptId) {
  const result = await db.query('SELECT * FROM concepts WHERE id = $1', [conceptId]);
  return result.rows[0] ? mapConcept(result.rows[0]) : null;
}

/**
 * Merge two concepts: move all triples from duplicate to canonical.
 */
export async function mergeConcepts(teamId, canonicalId, duplicateId) {
  // Move triples where duplicate is subject
  await db.query(
    'UPDATE triples SET subject_id = $1, updated_at = NOW() WHERE subject_id = $2',
    [canonicalId, duplicateId]
  );
  // Move triples where duplicate is object
  await db.query(
    'UPDATE triples SET object_id = $1, updated_at = NOW() WHERE object_id = $2',
    [canonicalId, duplicateId]
  );
  // Merge aliases
  await db.query(`
    UPDATE concepts SET
      aliases = (
        SELECT ARRAY(SELECT DISTINCT unnest(c1.aliases || c2.aliases || ARRAY[c2.name]))
        FROM concepts c1, concepts c2
        WHERE c1.id = $1 AND c2.id = $2
      ),
      mention_count = (
        SELECT c1.mention_count + c2.mention_count
        FROM concepts c1, concepts c2
        WHERE c1.id = $1 AND c2.id = $2
      ),
      updated_at = NOW()
    WHERE id = $1
  `, [canonicalId, duplicateId]);

  // Archive self-referential triples that may result from merge
  await db.query(
    "UPDATE triples SET status = 'archived', updated_at = NOW() WHERE subject_id = $1 AND object_id = $1 AND status = 'active'",
    [canonicalId]
  );

  // Archive duplicate concept (don't delete — preserve audit trail)
  await db.query(
    "UPDATE concepts SET type = 'merged_into:' || $1, description = COALESCE(description, '') || ' [MERGED into ' || (SELECT name FROM concepts WHERE id = $1) || ']', updated_at = NOW() WHERE id = $2",
    [canonicalId, duplicateId]
  );

  // Log the merge operation
  console.log(`[TripleService] Merged concept ${duplicateId} into ${canonicalId}`);

  return getConcept(canonicalId);
}

// ============================================================================
// TRIPLES
// ============================================================================

/**
 * Create a triple with dual embeddings.
 */
export async function createTriple(teamId, scopeId, {
  subjectId, relationship, objectId, contexts = [],
  sourceText, sourceUrl, createdBy, confidence = 0.8,
  trustTier = 'tribal', sourceType = 'user_statement',
  isChunky = false, groomedFromId = null,
  isProtected = false, protectionReason = null
}) {
  // Get concept names for display text and embedding generation
  const subjectResult = await db.query('SELECT name FROM concepts WHERE id = $1', [subjectId]);
  const objectResult = await db.query('SELECT name FROM concepts WHERE id = $1', [objectId]);

  if (!subjectResult.rows[0] || !objectResult.rows[0]) {
    throw new Error('Subject or object concept not found');
  }

  const subjectName = subjectResult.rows[0].name;
  const objectName = objectResult.rows[0].name;
  const displayText = `${subjectName} ${relationship} ${objectName}`;

  // Generate dual embeddings
  const { withContext, withoutContext } = await generateDualEmbeddings(
    displayText, subjectName, relationship, objectName, contexts
  );

  const result = await db.query(`
    INSERT INTO triples (
      team_id, scope_id, subject_id, relationship, object_id,
      display_text, embedding_with_context, embedding_without_context,
      confidence, trust_tier, status,
      source_text, source_url, source_type, created_by,
      is_chunky, groomed_from_id,
      is_protected, protection_reason
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, 'active',
      $11, $12, $13, $14,
      $15, $16,
      $17, $18
    ) RETURNING *
  `, [
    teamId, scopeId || null, subjectId, relationship, objectId,
    displayText,
    withContext ? `[${withContext.join(',')}]` : null,
    withoutContext ? `[${withoutContext.join(',')}]` : null,
    confidence, trustTier,
    sourceText || null, sourceUrl || null, sourceType, createdBy || null,
    isChunky, groomedFromId || null,
    isProtected, protectionReason
  ]);

  const triple = result.rows[0];

  // Link contexts
  if (contexts.length > 0) {
    await linkTripleToContexts(triple.id, contexts.map(c => c.id || c), 'extracted');
  }

  return mapTriple(triple);
}

/**
 * Get a single triple by ID with subject, object, and contexts.
 */
export async function getTriple(tripleId) {
  const result = await db.query(`
    SELECT t.*,
      s.name AS subject_name, s.type AS subject_type,
      o.name AS object_name, o.type AS object_type
    FROM triples t
    JOIN concepts s ON t.subject_id = s.id
    JOIN concepts o ON t.object_id = o.id
    WHERE t.id = $1
  `, [tripleId]);

  if (!result.rows[0]) return null;

  const triple = mapTriple(result.rows[0]);
  triple.contexts = await getContextsForTriple(tripleId);
  return triple;
}

/**
 * Get triples connected to a concept (as subject or object).
 */
export async function getTriplesByConcept(conceptId, { direction = 'both', limit = 50 } = {}) {
  let query;
  if (direction === 'outgoing') {
    query = 'SELECT t.*, s.name AS subject_name, s.type AS subject_type, o.name AS object_name, o.type AS object_type FROM triples t JOIN concepts s ON t.subject_id = s.id JOIN concepts o ON t.object_id = o.id WHERE t.subject_id = $1 AND t.status = \'active\' ORDER BY t.created_at DESC LIMIT $2';
  } else if (direction === 'incoming') {
    query = 'SELECT t.*, s.name AS subject_name, s.type AS subject_type, o.name AS object_name, o.type AS object_type FROM triples t JOIN concepts s ON t.subject_id = s.id JOIN concepts o ON t.object_id = o.id WHERE t.object_id = $1 AND t.status = \'active\' ORDER BY t.created_at DESC LIMIT $2';
  } else {
    query = 'SELECT t.*, s.name AS subject_name, s.type AS subject_type, o.name AS object_name, o.type AS object_type FROM triples t JOIN concepts s ON t.subject_id = s.id JOIN concepts o ON t.object_id = o.id WHERE (t.subject_id = $1 OR t.object_id = $1) AND t.status = \'active\' ORDER BY t.created_at DESC LIMIT $2';
  }

  const result = await db.query(query, [conceptId, limit]);
  return result.rows.map(mapTriple);
}

/**
 * Get all active triples for a team, optionally filtered by scope.
 */
export async function getTriples(teamId, { scopeId, limit = 100, offset = 0 } = {}) {
  const query = scopeId
    ? `SELECT t.*, s.name AS subject_name, s.type AS subject_type, o.name AS object_name, o.type AS object_type
       FROM triples t JOIN concepts s ON t.subject_id = s.id JOIN concepts o ON t.object_id = o.id
       WHERE t.team_id = $1 AND t.scope_id = $2 AND t.status = 'active'
       ORDER BY t.created_at DESC LIMIT $3 OFFSET $4`
    : `SELECT t.*, s.name AS subject_name, s.type AS subject_type, o.name AS object_name, o.type AS object_type
       FROM triples t JOIN concepts s ON t.subject_id = s.id JOIN concepts o ON t.object_id = o.id
       WHERE t.team_id = $1 AND t.status = 'active'
       ORDER BY t.created_at DESC LIMIT $2 OFFSET $3`;
  const params = scopeId ? [teamId, scopeId, limit, offset] : [teamId, limit, offset];

  const result = await db.query(query, params);
  return result.rows.map(mapTriple);
}

/**
 * Archive a triple (soft delete).
 */
export async function archiveTriple(tripleId) {
  await db.query(
    "UPDATE triples SET status = 'archived', updated_at = NOW() WHERE id = $1",
    [tripleId]
  );
}

/**
 * Supersede a triple with a new one.
 */
export async function supersedeTriple(oldTripleId, newTripleId) {
  await db.query(
    "UPDATE triples SET status = 'superseded', superseded_by = $2, superseded_at = NOW(), updated_at = NOW() WHERE id = $1",
    [oldTripleId, newTripleId]
  );
}

/**
 * Count active triples for a team.
 */
export async function getTripleCount(teamId, scopeId = null) {
  const query = scopeId
    ? "SELECT COUNT(*) FROM triples WHERE team_id = $1 AND scope_id = $2 AND status = 'active'"
    : "SELECT COUNT(*) FROM triples WHERE team_id = $1 AND status = 'active'";
  const params = scopeId ? [teamId, scopeId] : [teamId];

  const result = await db.query(query, params);
  return parseInt(result.rows[0].count);
}

// ============================================================================
// CONTEXT NODES
// ============================================================================

/**
 * Create or find a context node.
 */
export async function upsertContextNode(teamId, { name, type, parentId, description }) {
  const result = await db.query(`
    INSERT INTO context_nodes (team_id, name, type, parent_id, description)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (team_id, name, type) DO UPDATE SET
      parent_id = COALESCE(EXCLUDED.parent_id, context_nodes.parent_id),
      description = COALESCE(EXCLUDED.description, context_nodes.description)
    RETURNING *
  `, [teamId, name.trim(), type, parentId || null, description || null]);

  return mapContextNode(result.rows[0]);
}

/**
 * Link a triple to context nodes.
 */
export async function linkTripleToContexts(tripleId, contextNodeIds, source = 'extracted') {
  for (const contextNodeId of contextNodeIds) {
    await db.query(`
      INSERT INTO triple_contexts (triple_id, context_node_id, source)
      VALUES ($1, $2, $3)
      ON CONFLICT (triple_id, context_node_id) DO NOTHING
    `, [tripleId, contextNodeId, source]);
  }
}

/**
 * Get all contexts for a triple.
 */
export async function getContextsForTriple(tripleId) {
  const result = await db.query(`
    SELECT cn.*, tc.source, tc.confidence
    FROM context_nodes cn
    JOIN triple_contexts tc ON cn.id = tc.context_node_id
    WHERE tc.triple_id = $1
  `, [tripleId]);

  return result.rows.map(mapContextNode);
}

/**
 * Get context tree (all nodes for a team, optionally filtered).
 */
export async function getContextNodes(teamId, { type, parentId } = {}) {
  let query = 'SELECT * FROM context_nodes WHERE team_id = $1';
  const params = [teamId];

  if (type) {
    query += ` AND type = $${params.length + 1}`;
    params.push(type);
  }
  if (parentId !== undefined) {
    if (parentId === null) {
      query += ' AND parent_id IS NULL';
    } else {
      query += ` AND parent_id = $${params.length + 1}`;
      params.push(parentId);
    }
  }

  query += ' ORDER BY name ASC';
  const result = await db.query(query, params);
  return result.rows.map(mapContextNode);
}

/**
 * Get children of a context node (for hierarchy traversal).
 */
export async function getContextChildren(contextNodeId) {
  const result = await db.query(
    'SELECT * FROM context_nodes WHERE parent_id = $1 ORDER BY name ASC',
    [contextNodeId]
  );
  return result.rows.map(mapContextNode);
}

/**
 * Get all descendant context IDs (inclusive) for context filtering.
 * If user's active context is "USA", this returns IDs for USA + all children.
 */
export async function getContextDescendantIds(contextNodeId) {
  const result = await db.query(`
    WITH RECURSIVE descendants AS (
      SELECT id FROM context_nodes WHERE id = $1
      UNION ALL
      SELECT cn.id FROM context_nodes cn JOIN descendants d ON cn.parent_id = d.id
    )
    SELECT id FROM descendants
  `, [contextNodeId]);

  return result.rows.map(r => r.id);
}

// ============================================================================
// DUAL EMBEDDINGS
// ============================================================================

/**
 * Generate dual embeddings for a triple.
 * - withContext: full statement including context conditions
 * - withoutContext: statement without context (for context-free search)
 */
export async function generateDualEmbeddings(displayText, subjectName, relationship, objectName, contexts = []) {
  const withoutContextText = displayText;

  let withContextText = displayText;
  if (contexts.length > 0) {
    const contextNames = contexts.map(c => c.name || c).filter(Boolean);
    if (contextNames.length > 0) {
      withContextText = `${displayText} [${contextNames.join(', ')}]`;
    }
  }

  const [withContext, withoutContext] = await Promise.all([
    generateEmbedding(withContextText),
    // Only generate separate without-context embedding if contexts exist
    contexts.length > 0 ? generateEmbedding(withoutContextText) : null
  ]);

  return {
    withContext: withContext,
    // If no contexts, both embeddings are the same — use withContext for both
    withoutContext: contexts.length > 0 ? withoutContext : withContext
  };
}

// ============================================================================
// GRAPH STATS
// ============================================================================

/**
 * Get graph statistics for a team.
 */
export async function getGraphStats(teamId) {
  const [concepts, triples, contexts, orphans, chunky, universal] = await Promise.all([
    db.query("SELECT COUNT(*) FROM concepts WHERE team_id = $1", [teamId]),
    db.query("SELECT COUNT(*) FROM triples WHERE team_id = $1 AND status = 'active'", [teamId]),
    db.query("SELECT COUNT(*) FROM context_nodes WHERE team_id = $1", [teamId]),
    db.query(`
      SELECT COUNT(*) FROM concepts c WHERE c.team_id = $1
      AND NOT EXISTS (SELECT 1 FROM triples t WHERE (t.subject_id = c.id OR t.object_id = c.id) AND t.status = 'active')
    `, [teamId]),
    db.query("SELECT COUNT(*) FROM triples WHERE team_id = $1 AND is_chunky = true AND status = 'active'", [teamId]),
    db.query("SELECT COUNT(*) FROM triples WHERE team_id = $1 AND is_universal = true", [teamId]),
  ]);

  const tripleCount = parseInt(triples.rows[0].count);
  const contextCount = parseInt(contexts.rows[0].count);

  // Average contexts per triple
  const avgCtx = tripleCount > 0
    ? await db.query(`
        SELECT COALESCE(AVG(ctx_count), 0) AS avg
        FROM (
          SELECT COUNT(tc.id) AS ctx_count
          FROM triples t
          LEFT JOIN triple_contexts tc ON t.id = tc.triple_id
          WHERE t.team_id = $1 AND t.status = 'active'
          GROUP BY t.id
        ) sub
      `, [teamId])
    : { rows: [{ avg: 0 }] };

  return {
    totalConcepts: parseInt(concepts.rows[0].count),
    totalTriples: tripleCount,
    totalContexts: contextCount,
    avgContextsPerTriple: parseFloat(avgCtx.rows[0].avg) || 0,
    orphanConcepts: parseInt(orphans.rows[0].count),
    chunkyTriples: parseInt(chunky.rows[0].count),
    universalTriples: parseInt(universal.rows[0].count),
  };
}

// ============================================================================
// MAPPERS
// ============================================================================

function mapConcept(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    scopeId: row.scope_id,
    name: row.name,
    canonicalName: row.canonical_name,
    type: row.type,
    description: row.description,
    aliases: row.aliases || [],
    mentionCount: row.mention_count,
    properties: row.properties || {},
    isNew: row.is_new || false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTriple(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    scopeId: row.scope_id,
    subjectId: row.subject_id,
    relationship: row.relationship,
    objectId: row.object_id,
    displayText: row.display_text,
    confidence: row.confidence,
    trustTier: row.trust_tier,
    status: row.status,
    sourceText: row.source_text,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    createdBy: row.created_by,
    isChunky: row.is_chunky,
    isUniversal: row.is_universal,
    groomedAt: row.groomed_at,
    groomedFromId: row.groomed_from_id,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    supersededBy: row.superseded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Joined fields (may be present from joins)
    subjectName: row.subject_name,
    subjectType: row.subject_type,
    objectName: row.object_name,
    objectType: row.object_type,
    // Similarity score (may be present from vector search)
    similarity: row.similarity,
  };
}

function mapContextNode(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    type: row.type,
    parentId: row.parent_id,
    description: row.description,
    isDynamic: row.is_dynamic,
    dynamicResolver: row.dynamic_resolver,
    source: row.source,         // from triple_contexts join
    confidence: row.confidence, // from triple_contexts join
    createdAt: row.created_at,
  };
}

export default {
  // Concepts
  upsertConcept,
  findConceptByName,
  searchConcepts,
  getConcepts,
  getConcept,
  mergeConcepts,
  // Triples
  createTriple,
  getTriple,
  getTriplesByConcept,
  getTriples,
  archiveTriple,
  supersedeTriple,
  getTripleCount,
  // Context nodes
  upsertContextNode,
  linkTripleToContexts,
  getContextsForTriple,
  getContextNodes,
  getContextChildren,
  getContextDescendantIds,
  // Embeddings
  generateDualEmbeddings,
  // Stats
  getGraphStats,
};
