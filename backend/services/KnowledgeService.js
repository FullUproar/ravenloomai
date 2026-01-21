/**
 * KnowledgeService - Manages facts, decisions, and knowledge search
 *
 * Supports:
 * - Atomic fact storage with embeddings for semantic search
 * - Entity extraction and categorization
 * - Provenance tracking (source questions, answers)
 */

import db from '../db.js';
import * as AIService from './AIService.js';

/**
 * Create a new fact with optional embedding
 */
export async function createFact(teamId, { content, category, sourceType = 'conversation', sourceId = null, createdBy = null, metadata = null, embedding = null, entities = null, confidenceScore = null }) {
  // If no embedding provided, generate one
  let factEmbedding = embedding;
  if (!factEmbedding && content) {
    factEmbedding = await AIService.generateEmbedding(content);
  }

  const result = await db.query(
    `INSERT INTO facts (team_id, content, category, source_type, source_id, created_by, metadata, embedding, confidence_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      teamId,
      content,
      category,
      sourceType,
      sourceId,
      createdBy,
      metadata ? JSON.stringify({ ...metadata, entities }) : (entities ? JSON.stringify({ entities }) : null),
      factEmbedding ? `[${factEmbedding.join(',')}]` : null,
      confidenceScore
    ]
  );
  return mapFact(result.rows[0]);
}

/**
 * Create multiple atomic facts from a text (e.g., team answer)
 * Extracts atomic statements, generates embeddings, and stores each
 */
export async function createAtomicFacts(teamId, text, { sourceType = 'team_answer', sourceId = null, createdBy = null, sourceQuestion = null }) {
  // Extract atomic facts using AI
  const atomicFacts = await AIService.extractAtomicFacts(text, { question: sourceQuestion });

  const createdFacts = [];

  for (const fact of atomicFacts) {
    try {
      const created = await createFact(teamId, {
        content: fact.statement,
        category: fact.category,
        sourceType,
        sourceId,
        createdBy,
        entities: fact.entities,
        confidenceScore: fact.confidence,
        metadata: sourceQuestion ? { sourceQuestion } : null
      });
      createdFacts.push(created);
    } catch (error) {
      console.error('Error creating atomic fact:', error);
    }
  }

  return createdFacts;
}

/**
 * Update an existing fact
 */
export async function updateFact(factId, { content, category }) {
  const result = await db.query(
    `UPDATE facts
     SET content = COALESCE($2, content),
         category = COALESCE($3, category),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [factId, content, category]
  );
  return result.rows[0] ? mapFact(result.rows[0]) : null;
}

/**
 * Invalidate a fact (mark as no longer valid)
 */
export async function invalidateFact(factId, supersededById = null) {
  const result = await db.query(
    `UPDATE facts
     SET valid_until = NOW(),
         superseded_by = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [factId, supersededById]
  );
  return result.rows[0] ? mapFact(result.rows[0]) : null;
}

/**
 * Get facts for a team
 */
export async function getFacts(teamId, { category = null, limit = 50, includeInvalid = false } = {}) {
  let query = `
    SELECT f.*, u.display_name as created_by_name, u.email as created_by_email
    FROM facts f
    LEFT JOIN users u ON f.created_by = u.id
    WHERE f.team_id = $1
  `;
  const params = [teamId];
  let paramIndex = 2;

  if (!includeInvalid) {
    query += ` AND f.valid_until IS NULL`;
  }

  if (category) {
    query += ` AND f.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  query += ` ORDER BY f.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await db.query(query, params);
  return result.rows.map(mapFact);
}

/**
 * Search facts by keyword (simple text search) - fallback for when embeddings not available
 */
export async function searchFactsByKeyword(teamId, query, limit = 20) {
  const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  if (searchTerms.length === 0) {
    return getFacts(teamId, { limit });
  }

  // Build a simple text search query
  const result = await db.query(
    `SELECT f.*, u.display_name as created_by_name, u.email as created_by_email
     FROM facts f
     LEFT JOIN users u ON f.created_by = u.id
     WHERE f.team_id = $1
       AND f.valid_until IS NULL
       AND LOWER(f.content) LIKE ANY($2)
     ORDER BY f.created_at DESC
     LIMIT $3`,
    [teamId, searchTerms.map(t => `%${t}%`), limit]
  );

  return result.rows.map(mapFact);
}

/**
 * Semantic search using vector similarity (primary search method)
 * Falls back to keyword search if embeddings not available
 */
export async function searchFacts(teamId, query, limit = 20) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await AIService.generateEmbedding(query);

    if (queryEmbedding) {
      // Use vector similarity search with pgvector
      // cosine distance: 1 - (a <=> b) gives similarity
      const result = await db.query(
        `SELECT f.*, u.display_name as created_by_name, u.email as created_by_email,
                1 - (f.embedding <=> $2::vector) as similarity
         FROM facts f
         LEFT JOIN users u ON f.created_by = u.id
         WHERE f.team_id = $1
           AND f.valid_until IS NULL
           AND f.embedding IS NOT NULL
         ORDER BY f.embedding <=> $2::vector
         LIMIT $3`,
        [teamId, `[${queryEmbedding.join(',')}]`, limit]
      );

      if (result.rows.length > 0) {
        return result.rows.map(row => ({
          ...mapFact(row),
          similarity: parseFloat(row.similarity) || 0
        }));
      }
    }

    // Fallback to keyword search if no embeddings or vector search fails
    return searchFactsByKeyword(teamId, query, limit);
  } catch (error) {
    console.error('Semantic search error, falling back to keyword:', error.message);
    // Fallback to keyword search
    return searchFactsByKeyword(teamId, query, limit);
  }
}

/**
 * Create a new decision
 */
export async function createDecision(teamId, { what, why, alternatives = [], madeBy = null, sourceId = null, relatedFacts = [] }) {
  const result = await db.query(
    `INSERT INTO decisions (team_id, what, why, alternatives, made_by, source_id, related_facts)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [teamId, what, why, JSON.stringify(alternatives), madeBy, sourceId, relatedFacts]
  );
  return mapDecision(result.rows[0]);
}

/**
 * Get decisions for a team
 */
export async function getDecisions(teamId, limit = 50) {
  const result = await db.query(
    `SELECT d.*, u.display_name as made_by_name, u.email as made_by_email
     FROM decisions d
     LEFT JOIN users u ON d.made_by = u.id
     WHERE d.team_id = $1
     ORDER BY d.created_at DESC
     LIMIT $2`,
    [teamId, limit]
  );
  return result.rows.map(mapDecision);
}

/**
 * Search decisions by keyword
 */
export async function searchDecisions(teamId, query, limit = 10) {
  const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  if (searchTerms.length === 0) {
    return getDecisions(teamId, limit);
  }

  const result = await db.query(
    `SELECT d.*, u.display_name as made_by_name, u.email as made_by_email
     FROM decisions d
     LEFT JOIN users u ON d.made_by = u.id
     WHERE d.team_id = $1
       AND (LOWER(d.what) LIKE ANY($2) OR LOWER(d.why) LIKE ANY($2))
     ORDER BY d.created_at DESC
     LIMIT $3`,
    [teamId, searchTerms.map(t => `%${t}%`), limit]
  );

  return result.rows.map(mapDecision);
}

/**
 * Search all knowledge (facts + decisions)
 */
export async function searchKnowledge(teamId, query) {
  const [facts, decisions] = await Promise.all([
    searchFacts(teamId, query, 10),
    searchDecisions(teamId, query, 5)
  ]);

  return {
    facts,
    decisions,
    documents: [] // Phase 2
  };
}

/**
 * Get knowledge context for AI (relevant facts for a query)
 */
export async function getKnowledgeContext(teamId, query) {
  // For now, use simple keyword search
  // Phase 2: Add semantic/vector search
  const knowledge = await searchKnowledge(teamId, query);

  return {
    facts: knowledge.facts,
    decisions: knowledge.decisions
  };
}

// ============================================================================
// Helper functions
// ============================================================================

function mapFact(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    scopeId: row.scope_id,
    content: row.content,
    // Structured entity model
    entityType: row.entity_type,
    entityName: row.entity_name,
    attribute: row.attribute,
    value: row.value,
    category: row.category,
    confidenceScore: row.confidence_score ? parseFloat(row.confidence_score) : null,
    sourceType: row.source_type,
    sourceId: row.source_id,
    // Source attribution for provenance
    sourceQuote: row.source_quote,
    sourceUrl: row.source_url,
    createdBy: row.created_by,
    createdByUser: row.created_by_name ? {
      id: row.created_by,
      displayName: row.created_by_name,
      email: row.created_by_email
    } : null,
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    supersededBy: row.superseded_by,
    contextTags: row.context_tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDecision(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    what: row.what,
    why: row.why,
    alternatives: typeof row.alternatives === 'string' ? JSON.parse(row.alternatives) : row.alternatives,
    madeBy: row.made_by,
    madeByUser: row.made_by_name ? {
      id: row.made_by,
      displayName: row.made_by_name,
      email: row.made_by_email
    } : null,
    sourceId: row.source_id,
    relatedFacts: row.related_facts || [],
    createdAt: row.created_at
  };
}

export default {
  createFact,
  createAtomicFacts,
  updateFact,
  invalidateFact,
  getFacts,
  searchFacts,
  searchFactsByKeyword,
  createDecision,
  getDecisions,
  searchDecisions,
  searchKnowledge,
  getKnowledgeContext
};
