/**
 * KnowledgeGraphService - GraphRAG implementation for RavenLoom
 *
 * Manages the knowledge graph:
 * - Entity and relationship extraction from text
 * - Node, edge, and chunk storage
 * - Vector-based semantic search for graph entry
 * - Graph traversal for context retrieval
 */

import db from '../db.js';
import { generateEmbedding } from './AIService.js';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// ENTITY & RELATIONSHIP EXTRACTION
// ============================================================================

/**
 * Extract entities and relationships from text using GPT-4
 */
export async function extractEntitiesAndRelationships(text, context = {}) {
  const systemPrompt = `You are an entity and relationship extractor for a knowledge graph.
Extract entities (people, products, companies, concepts, dates, events, locations) and their relationships from the text.

Entity Types:
- person: Named individuals (CEO, founder, team members)
- product: Products, games, services
- company: Companies, organizations, vendors
- concept: Abstract concepts, processes, strategies
- date: Dates, deadlines, timeframes
- event: Events, launches, meetings
- location: Places, addresses, regions

Relationship Types:
- IS_A: Type relationship (Fugly IS_A mascot)
- HAS: Possession/attribute (Company HAS product)
- WORKS_FOR: Employment (Person WORKS_FOR company)
- CREATED_BY: Authorship (Product CREATED_BY person)
- RELATED_TO: General association
- PART_OF: Containment (Feature PART_OF product)
- HAPPENS_ON: Temporal (Event HAPPENS_ON date)
- LOCATED_IN: Spatial (Company LOCATED_IN location)

Return JSON:
{
  "entities": [
    {"name": "Entity Name", "type": "person|product|company|concept|date|event|location", "description": "brief description"}
  ],
  "relationships": [
    {"source": "Entity1 Name", "target": "Entity2 Name", "relationship": "RELATIONSHIP_TYPE"}
  ]
}

Be thorough but avoid extracting overly generic entities. Focus on specific, named things.
Return ONLY valid JSON.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 1000,
      temperature: 0
    });

    let content = response.choices[0].message.content;

    // Strip markdown code blocks if present
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1].trim();
    }

    const result = JSON.parse(content);
    console.log(`[KG Extract] Found ${result.entities?.length || 0} entities, ${result.relationships?.length || 0} relationships`);

    return {
      entities: result.entities || [],
      relationships: result.relationships || []
    };
  } catch (error) {
    console.error('[KG Extract] Error:', error.message);
    return { entities: [], relationships: [] };
  }
}

// ============================================================================
// SMART TEXT CHUNKING
// ============================================================================

/**
 * Smart chunking that respects document structure:
 * 1. First splits by sections (headers, double newlines)
 * 2. Then by paragraphs within sections
 * 3. Falls back to sentence boundaries for large paragraphs
 * 4. Adds overlap between chunks for context continuity
 */
export function chunkText(text, options = {}) {
  const {
    targetSize = 500,
    maxSize = 800,
    overlap = 50  // Characters of overlap between chunks
  } = options;

  if (!text || text.length <= targetSize) {
    return text ? [text.trim()] : [];
  }

  // Step 1: Split into sections (by headers or multiple newlines)
  const sections = splitIntoSections(text);

  const chunks = [];
  let previousChunkEnd = ''; // For overlap

  for (const section of sections) {
    // Step 2: Split section into paragraphs
    const paragraphs = splitIntoParagraphs(section);

    let currentChunk = previousChunkEnd;

    for (const paragraph of paragraphs) {
      const trimmedPara = paragraph.trim();
      if (!trimmedPara) continue;

      // If paragraph alone exceeds max, split by sentences
      if (trimmedPara.length > maxSize) {
        // Flush current chunk first
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          previousChunkEnd = getOverlapText(currentChunk, overlap);
          currentChunk = previousChunkEnd;
        }

        // Split large paragraph by sentences
        const sentenceChunks = splitBySentences(trimmedPara, targetSize, maxSize, overlap);
        for (let i = 0; i < sentenceChunks.length; i++) {
          if (i === 0 && currentChunk.trim()) {
            // Prepend overlap to first sentence chunk
            chunks.push((currentChunk + ' ' + sentenceChunks[i]).trim());
          } else {
            chunks.push(sentenceChunks[i].trim());
          }
        }
        previousChunkEnd = getOverlapText(sentenceChunks[sentenceChunks.length - 1], overlap);
        currentChunk = previousChunkEnd;
        continue;
      }

      // Check if adding this paragraph exceeds target
      if (currentChunk.length + trimmedPara.length + 2 > targetSize && currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        previousChunkEnd = getOverlapText(currentChunk, overlap);
        currentChunk = previousChunkEnd + (previousChunkEnd ? '\n\n' : '') + trimmedPara;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
      }
    }

    // Flush remaining content from section
    if (currentChunk.trim() && currentChunk.trim() !== previousChunkEnd.trim()) {
      chunks.push(currentChunk.trim());
      previousChunkEnd = getOverlapText(currentChunk, overlap);
    }
  }

  // Filter out any empty chunks and dedupe near-identical chunks
  return chunks.filter((chunk, index, arr) => {
    if (!chunk.trim()) return false;
    // Remove if this chunk is entirely contained in the previous one
    if (index > 0 && arr[index - 1].includes(chunk)) return false;
    return true;
  });
}

/**
 * Split text into sections based on headers or multiple newlines
 */
function splitIntoSections(text) {
  // Split on markdown headers or 3+ newlines (section breaks)
  const sectionPattern = /\n{3,}|(?=^#{1,3}\s)/gm;
  const sections = text.split(sectionPattern).filter(s => s.trim());

  // If no sections found, return whole text
  return sections.length > 0 ? sections : [text];
}

/**
 * Split section into paragraphs (double newline separated)
 */
function splitIntoParagraphs(text) {
  return text.split(/\n\n+/).filter(p => p.trim());
}

/**
 * Split text by sentences, respecting size limits
 */
function splitBySentences(text, targetSize, maxSize, overlap) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > targetSize && currentChunk) {
      chunks.push(currentChunk.trim());
      // Start new chunk with overlap from end of previous
      const overlapText = getOverlapText(currentChunk, overlap);
      currentChunk = overlapText + (overlapText ? ' ' : '') + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // Handle any remaining chunks that are still too large
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length > maxSize) {
      // Force split at word boundaries
      let remaining = chunk;
      while (remaining.length > 0) {
        let splitPoint = maxSize;
        if (remaining.length > maxSize) {
          // Find last space before maxSize
          const lastSpace = remaining.lastIndexOf(' ', maxSize);
          if (lastSpace > maxSize * 0.5) {
            splitPoint = lastSpace;
          }
        }
        finalChunks.push(remaining.substring(0, splitPoint).trim());
        remaining = remaining.substring(splitPoint).trim();
      }
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

/**
 * Get the last N characters for overlap, breaking at word boundary
 */
function getOverlapText(text, chars) {
  if (!text || chars <= 0) return '';
  if (text.length <= chars) return text;

  // Get last N chars
  let overlap = text.slice(-chars);

  // Try to start at a word boundary
  const firstSpace = overlap.indexOf(' ');
  if (firstSpace > 0 && firstSpace < chars * 0.5) {
    overlap = overlap.slice(firstSpace + 1);
  }

  return overlap.trim();
}

// ============================================================================
// NODE OPERATIONS
// ============================================================================

/**
 * Create or update an entity node in the knowledge graph
 */
export async function upsertNode(teamId, entity, sourceInfo = {}) {
  const { name, type, description } = entity;
  const { sourceType = 'document', sourceId = null } = sourceInfo;

  // Normalize name for consistency
  const normalizedName = name.trim();

  try {
    // Check if node exists
    const existing = await db.query(`
      SELECT id, mention_count FROM kg_nodes
      WHERE team_id = $1 AND lower(name) = lower($2) AND type = $3
    `, [teamId, normalizedName, type]);

    if (existing.rows.length > 0) {
      // Update existing node - increment mention count
      const result = await db.query(`
        UPDATE kg_nodes
        SET mention_count = mention_count + 1,
            description = COALESCE($3, description),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [existing.rows[0].id, teamId, description]);

      return result.rows[0];
    }

    // Create new node with embedding
    const embedding = await generateEmbedding(`${type}: ${normalizedName}. ${description || ''}`);

    const result = await db.query(`
      INSERT INTO kg_nodes (team_id, name, type, description, embedding, source_type, source_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      teamId,
      normalizedName,
      type,
      description || null,
      embedding ? `[${embedding.join(',')}]` : null,
      sourceType,
      sourceId
    ]);

    console.log(`[KG Node] Created: ${type}:${normalizedName}`);
    return result.rows[0];
  } catch (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === '23505') {
      const existing = await db.query(`
        SELECT * FROM kg_nodes
        WHERE team_id = $1 AND lower(name) = lower($2) AND type = $3
      `, [teamId, normalizedName, type]);
      return existing.rows[0];
    }
    console.error('[KG Node] Error:', error.message);
    throw error;
  }
}

/**
 * Find a node by name and type
 */
export async function findNode(teamId, name, type) {
  const result = await db.query(`
    SELECT * FROM kg_nodes
    WHERE team_id = $1 AND lower(name) = lower($2) AND type = $3
  `, [teamId, name, type]);

  return result.rows[0] || null;
}

// ============================================================================
// EDGE OPERATIONS
// ============================================================================

/**
 * Create or strengthen a relationship edge between nodes
 */
export async function createEdge(teamId, relationship, sourceInfo = {}) {
  const { source, target, relationship: relType } = relationship;
  const { sourceType = 'document', sourceId = null } = sourceInfo;

  try {
    // Find source and target nodes
    // We need to find by name since extraction gives us names, not IDs
    const sourceNode = await db.query(`
      SELECT id FROM kg_nodes WHERE team_id = $1 AND lower(name) = lower($2)
      ORDER BY mention_count DESC LIMIT 1
    `, [teamId, source]);

    const targetNode = await db.query(`
      SELECT id FROM kg_nodes WHERE team_id = $1 AND lower(name) = lower($2)
      ORDER BY mention_count DESC LIMIT 1
    `, [teamId, target]);

    if (!sourceNode.rows[0] || !targetNode.rows[0]) {
      console.log(`[KG Edge] Skipping - nodes not found: ${source} -> ${target}`);
      return null;
    }

    const sourceNodeId = sourceNode.rows[0].id;
    const targetNodeId = targetNode.rows[0].id;

    // Check if edge exists
    const existing = await db.query(`
      SELECT id, weight FROM kg_edges
      WHERE source_node_id = $1 AND target_node_id = $2 AND relationship = $3
    `, [sourceNodeId, targetNodeId, relType]);

    if (existing.rows.length > 0) {
      // Strengthen existing edge
      const result = await db.query(`
        UPDATE kg_edges SET weight = weight + 0.1 WHERE id = $1 RETURNING *
      `, [existing.rows[0].id]);
      return result.rows[0];
    }

    // Create new edge
    const result = await db.query(`
      INSERT INTO kg_edges (team_id, source_node_id, target_node_id, relationship, source_type, source_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [teamId, sourceNodeId, targetNodeId, relType, sourceType, sourceId]);

    console.log(`[KG Edge] Created: ${source} -[${relType}]-> ${target}`);
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      // Duplicate - just return
      return null;
    }
    console.error('[KG Edge] Error:', error.message);
    return null;
  }
}

// ============================================================================
// CHUNK OPERATIONS
// ============================================================================

/**
 * Store a text chunk with its embedding and linked nodes
 */
export async function createChunk(teamId, chunkData) {
  const { content, sourceType, sourceId, sourceTitle, linkedNodeIds = [] } = chunkData;

  // Generate embedding for the chunk
  const embedding = await generateEmbedding(content);

  const result = await db.query(`
    INSERT INTO kg_chunks (team_id, content, embedding, source_type, source_id, source_title, linked_node_ids)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [
    teamId,
    content,
    embedding ? `[${embedding.join(',')}]` : null,
    sourceType,
    sourceId || null,
    sourceTitle || null,
    linkedNodeIds
  ]);

  return result.rows[0];
}

// ============================================================================
// DOCUMENT PROCESSING PIPELINE
// ============================================================================

/**
 * Process a document into the knowledge graph
 * Chunks the text, extracts entities/relationships, stores everything
 */
export async function processDocument(teamId, document, sourceInfo = {}) {
  const { content, title, id: docId } = document;
  const { sourceType = 'document' } = sourceInfo;

  if (!content) {
    console.log(`[KG Process] Skipping document with no content: ${title}`);
    return { nodes: 0, edges: 0, chunks: 0 };
  }

  console.log(`[KG Process] Processing "${title}" (${content.length} chars)`);

  // Smart chunk the document
  const chunks = chunkText(content, { targetSize: 500, maxSize: 800, overlap: 50 });
  console.log(`[KG Process] Smart-chunked into ${chunks.length} chunks`);

  let totalNodes = 0;
  let totalEdges = 0;

  // Process each chunk
  for (const chunk of chunks) {
    // Extract entities and relationships
    const extracted = await extractEntitiesAndRelationships(chunk);

    // Create/update nodes
    const nodeIds = [];
    for (const entity of extracted.entities) {
      try {
        const node = await upsertNode(teamId, entity, { sourceType, sourceId: docId });
        if (node) {
          nodeIds.push(node.id);
          totalNodes++;
        }
      } catch (err) {
        console.error(`[KG Process] Node error for ${entity.name}:`, err.message);
      }
    }

    // Create edges
    for (const rel of extracted.relationships) {
      try {
        const edge = await createEdge(teamId, rel, { sourceType, sourceId: docId });
        if (edge) totalEdges++;
      } catch (err) {
        console.error(`[KG Process] Edge error:`, err.message);
      }
    }

    // Store chunk with linked nodes
    await createChunk(teamId, {
      content: chunk,
      sourceType,
      sourceId: docId,
      sourceTitle: title,
      linkedNodeIds: nodeIds
    });
  }

  console.log(`[KG Process] Complete: ${totalNodes} nodes, ${totalEdges} edges, ${chunks.length} chunks`);

  return {
    nodes: totalNodes,
    edges: totalEdges,
    chunks: chunks.length
  };
}

// ============================================================================
// GRAPHRAG RETRIEVAL
// ============================================================================

/**
 * GraphRAG search - the main retrieval function
 * 1. Vector search for entry point nodes
 * 2. Hop to related nodes via edges
 * 3. Collect chunks linked to all relevant nodes
 */
export async function graphRAGSearch(teamId, query, options = {}) {
  const { topK = 5, hopDepth = 1 } = options;

  console.log(`[GraphRAG] Searching for: "${query}"`);

  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) {
    console.log('[GraphRAG] Failed to generate query embedding');
    return { entryNodes: [], relatedNodes: [], chunks: [] };
  }

  // 2. Vector search for entry point nodes
  const entryNodesResult = await db.query(`
    SELECT id, name, type, description, 1 - (embedding <=> $1) as similarity
    FROM kg_nodes
    WHERE team_id = $2 AND embedding IS NOT NULL
    ORDER BY embedding <=> $1
    LIMIT $3
  `, [`[${queryEmbedding.join(',')}]`, teamId, topK]);

  const entryNodes = entryNodesResult.rows;
  console.log(`[GraphRAG] Found ${entryNodes.length} entry nodes`);

  if (entryNodes.length === 0) {
    // Fallback: return most recent chunks
    const fallbackChunks = await db.query(`
      SELECT content, source_title, source_type
      FROM kg_chunks
      WHERE team_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [teamId]);

    return {
      entryNodes: [],
      relatedNodes: [],
      chunks: fallbackChunks.rows
    };
  }

  // 3. Hop to related nodes via edges (1 hop)
  const entryNodeIds = entryNodes.map(n => n.id);

  const relatedNodesResult = await db.query(`
    SELECT DISTINCT n.id, n.name, n.type, n.description, e.relationship
    FROM kg_edges e
    JOIN kg_nodes n ON n.id = CASE
      WHEN e.source_node_id = ANY($1) THEN e.target_node_id
      ELSE e.source_node_id
    END
    WHERE (e.source_node_id = ANY($1) OR e.target_node_id = ANY($1))
      AND n.id != ALL($1)
    ORDER BY e.weight DESC
    LIMIT 10
  `, [entryNodeIds]);

  const relatedNodes = relatedNodesResult.rows;
  console.log(`[GraphRAG] Found ${relatedNodes.length} related nodes via edges`);

  // 4. Collect all relevant node IDs
  const allNodeIds = [
    ...entryNodeIds,
    ...relatedNodes.map(n => n.id)
  ];

  // 5. Get chunks linked to these nodes
  const chunksResult = await db.query(`
    SELECT DISTINCT ON (content) content, source_title, source_type
    FROM kg_chunks
    WHERE team_id = $1
      AND linked_node_ids && $2
    ORDER BY content, created_at DESC
    LIMIT 10
  `, [teamId, allNodeIds]);

  console.log(`[GraphRAG] Retrieved ${chunksResult.rows.length} chunks`);

  return {
    entryNodes,
    relatedNodes,
    chunks: chunksResult.rows
  };
}

/**
 * Get graph statistics for a team
 */
export async function getGraphStats(teamId) {
  const nodes = await db.query('SELECT COUNT(*) FROM kg_nodes WHERE team_id = $1', [teamId]);
  const edges = await db.query('SELECT COUNT(*) FROM kg_edges WHERE team_id = $1', [teamId]);
  const chunks = await db.query('SELECT COUNT(*) FROM kg_chunks WHERE team_id = $1', [teamId]);

  return {
    nodeCount: parseInt(nodes.rows[0].count),
    edgeCount: parseInt(edges.rows[0].count),
    chunkCount: parseInt(chunks.rows[0].count)
  };
}

// ============================================================================
// USER NODE OPERATIONS
// ============================================================================

/**
 * Get or create a user's node in the knowledge graph
 */
export async function getOrCreateUserNode(teamId, userId, userInfo = {}) {
  const { displayName, email } = userInfo;
  const name = displayName || email?.split('@')[0] || `User ${userId.substring(0, 8)}`;

  try {
    // Check if user node already exists
    const existing = await db.query(`
      SELECT * FROM kg_nodes
      WHERE team_id = $1 AND user_id = $2 AND type = 'team_member'
    `, [teamId, userId]);

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Create user node with embedding
    const embedding = await generateEmbedding(`team_member: ${name}. Team member.`);

    const result = await db.query(`
      INSERT INTO kg_nodes (team_id, user_id, name, type, description, embedding, source_type, source_id)
      VALUES ($1, $2, $3, 'team_member', $4, $5, 'user', $2)
      ON CONFLICT (team_id, name, type) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        updated_at = NOW()
      RETURNING *
    `, [
      teamId,
      userId,
      name,
      `Team member: ${name}`,
      embedding ? `[${embedding.join(',')}]` : null
    ]);

    console.log(`[KG UserNode] Created: ${name}`);
    return result.rows[0];
  } catch (error) {
    console.error('[KG UserNode] Error:', error.message);
    throw error;
  }
}

/**
 * Get a user's node by user_id
 */
export async function getUserNode(teamId, userId) {
  const result = await db.query(`
    SELECT * FROM kg_nodes
    WHERE team_id = $1 AND user_id = $2 AND type = 'team_member'
  `, [teamId, userId]);

  return result.rows[0] || null;
}

/**
 * Store a fact about a user (e.g., "call me Shawn", "I'm the marketing lead")
 */
export async function storeUserFact(teamId, userId, factType, key, value, context = null) {
  const result = await db.query(`
    INSERT INTO user_facts (team_id, user_id, fact_type, key, value, context)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (team_id, user_id, fact_type, key) DO UPDATE SET
      value = EXCLUDED.value,
      context = EXCLUDED.context,
      updated_at = NOW()
    RETURNING *
  `, [teamId, userId, factType, key, value, context]);

  console.log(`[UserFact] Stored: ${userId} ${factType}:${key} = ${value}`);
  return result.rows[0];
}

/**
 * Get all facts about a user
 */
export async function getUserFacts(teamId, userId) {
  const result = await db.query(`
    SELECT * FROM user_facts
    WHERE team_id = $1 AND user_id = $2
    ORDER BY fact_type, key
  `, [teamId, userId]);

  return result.rows;
}

/**
 * Get a specific fact about a user
 */
export async function getUserFact(teamId, userId, factType, key) {
  const result = await db.query(`
    SELECT * FROM user_facts
    WHERE team_id = $1 AND user_id = $2 AND fact_type = $3 AND key = $4
  `, [teamId, userId, factType, key]);

  return result.rows[0] || null;
}

/**
 * Get user context for AI - includes user info and all their facts
 */
export async function getUserContext(teamId, userId) {
  // Get user node
  const userNode = await getUserNode(teamId, userId);

  // Get user facts
  const facts = await getUserFacts(teamId, userId);

  // Get user's basic info from users table
  const userResult = await db.query(`
    SELECT id, email, display_name, avatar_url FROM users WHERE id = $1
  `, [userId]);
  const user = userResult.rows[0];

  // Build context object
  const context = {
    userId,
    displayName: user?.display_name || userNode?.name || 'Unknown',
    email: user?.email,
    nodeId: userNode?.id,
    facts: {}
  };

  // Organize facts by type
  for (const fact of facts) {
    if (!context.facts[fact.fact_type]) {
      context.facts[fact.fact_type] = {};
    }
    context.facts[fact.fact_type][fact.key] = fact.value;
  }

  // Check for nickname/preferred name
  if (context.facts.nickname?.preferred_name) {
    context.preferredName = context.facts.nickname.preferred_name;
  }

  return context;
}

/**
 * Find user by name/nickname in the knowledge graph
 */
export async function findUserByName(teamId, name) {
  // First check user_facts for nicknames
  const nicknameResult = await db.query(`
    SELECT uf.user_id, u.display_name, u.email
    FROM user_facts uf
    JOIN users u ON uf.user_id = u.id
    WHERE uf.team_id = $1 AND uf.fact_type = 'nickname'
      AND lower(uf.value) = lower($2)
    LIMIT 1
  `, [teamId, name]);

  if (nicknameResult.rows.length > 0) {
    return nicknameResult.rows[0];
  }

  // Then check kg_nodes for team_member type
  const nodeResult = await db.query(`
    SELECT kn.user_id, u.display_name, u.email
    FROM kg_nodes kn
    JOIN users u ON kn.user_id = u.id
    WHERE kn.team_id = $1 AND kn.type = 'team_member'
      AND (lower(kn.name) = lower($2) OR $2 = ANY(SELECT lower(unnest(kn.aliases))))
    LIMIT 1
  `, [teamId, name]);

  if (nodeResult.rows.length > 0) {
    return nodeResult.rows[0];
  }

  // Finally check users table directly
  const userResult = await db.query(`
    SELECT tm.user_id, u.display_name, u.email
    FROM team_members tm
    JOIN users u ON tm.user_id = u.id
    WHERE tm.team_id = $1
      AND (lower(u.display_name) = lower($2) OR lower(split_part(u.email, '@', 1)) = lower($2))
    LIMIT 1
  `, [teamId, name]);

  return userResult.rows[0] || null;
}

export default {
  extractEntitiesAndRelationships,
  chunkText,
  upsertNode,
  findNode,
  createEdge,
  createChunk,
  processDocument,
  graphRAGSearch,
  getGraphStats,
  // User node operations
  getOrCreateUserNode,
  getUserNode,
  storeUserFact,
  getUserFacts,
  getUserFact,
  getUserContext,
  findUserByName
};
