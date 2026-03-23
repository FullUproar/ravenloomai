/**
 * SSTService — Semantic Scope Tree
 *
 * Internal routing tree for query localization. Users see flat scopes;
 * the SST is the invisible hierarchy that routes queries to the right
 * part of the knowledge graph.
 *
 * Navigation: vector similarity on node embeddings → LLM disambiguation
 * only when candidates are close. 80%+ of queries skip the LLM hop.
 *
 * Growth: automatic. When triples are remembered, the system detects
 * which SST node they belong to (or creates one).
 */

import db from '../db.js';
import * as AIService from './AIService.js';
import * as TokenTrackingService from './TokenTrackingService.js';

// ============================================================================
// NAVIGATION — Route a query to the right SST node
// ============================================================================

/**
 * Route a query to the most relevant SST node.
 * Returns { node, confidence, method } or null if no tree exists.
 *
 * Strategy:
 * 1. Check route cache (instant, free)
 * 2. Vector similarity on node embeddings (fast, cheap)
 * 3. LLM disambiguation only if top candidates are close (rare)
 */
export async function routeQuery(teamId, query) {
  // Step 1: Check route cache
  const cached = await checkRouteCache(teamId, query);
  if (cached) return { node: cached, confidence: 0.95, method: 'cache' };

  // Step 2: Get all SST nodes for this team (should be small — tens, not thousands)
  const nodes = await getTree(teamId);
  if (nodes.length === 0) return null;

  // Step 3: Vector search against node embeddings
  const queryEmbedding = await AIService.generateEmbedding(query);
  if (!queryEmbedding) return null;

  const embStr = '[' + queryEmbedding.join(',') + ']';
  const candidates = await db.query(`
    SELECT id, name, description, depth, parent_id, scope_id, triple_count,
           1 - (embedding <=> $1) as similarity
    FROM sst_nodes
    WHERE team_id = $2 AND embedding IS NOT NULL
    ORDER BY embedding <=> $1
    LIMIT 5
  `, [embStr, teamId]);

  if (candidates.rows.length === 0) return null;

  const top = candidates.rows[0];
  const second = candidates.rows[1];

  // Step 4: If clear winner (gap > 0.08), use directly
  if (!second || (top.similarity - second.similarity) > 0.08) {
    // Cache this route
    cacheRoute(teamId, query, top.id).catch(() => {});
    // Bump query count
    db.query('UPDATE sst_nodes SET query_count = query_count + 1, last_query_at = NOW() WHERE id = $1', [top.id]).catch(() => {});
    return { node: top, confidence: top.similarity, method: 'vector' };
  }

  // Step 5: Ambiguous — LLM decides
  const topCandidates = candidates.rows.slice(0, 4);
  const resolved = await llmDisambiguate(teamId, query, topCandidates);
  if (resolved) {
    cacheRoute(teamId, query, resolved.id).catch(() => {});
    db.query('UPDATE sst_nodes SET query_count = query_count + 1, last_query_at = NOW() WHERE id = $1', [resolved.id]).catch(() => {});
    return { node: resolved, confidence: 0.85, method: 'llm' };
  }

  // Fallback: use top vector result
  return { node: top, confidence: top.similarity, method: 'vector_fallback' };
}

/**
 * LLM disambiguation — only called when vector candidates are close.
 */
async function llmDisambiguate(teamId, query, candidates) {
  const options = candidates.map((c, i) =>
    `${i + 1}. "${c.name}" — ${c.description || 'No description'} (${c.triple_count} facts)`
  ).join('\n');

  try {
    const response = await AIService.callOpenAI([
      {
        role: 'system',
        content: `You are a scope router. Given a user query and candidate scopes, pick the BEST match.
Return ONLY the number (1-${candidates.length}) of the best scope, or 0 if none fit well.`
      },
      {
        role: 'user',
        content: `Query: "${query}"\n\nCandidate scopes:\n${options}`
      }
    ], { model: 'gpt-4o-mini', maxTokens: 5, temperature: 0, teamId, operation: 'sst_route' });

    const num = parseInt(response.trim());
    if (num >= 1 && num <= candidates.length) {
      return candidates[num - 1];
    }
  } catch (err) {
    console.error('[SST] LLM disambiguation error:', err.message);
  }
  return null;
}

// ============================================================================
// TREE GROWTH — Auto-build SST from remembered knowledge
// ============================================================================

/**
 * Place a triple into the SST. If no suitable node exists, create one.
 * Called after confirmRemember. Fire-and-forget.
 *
 * @param {string} teamId
 * @param {object} triple - { subjectName, objectName, relationship, displayText }
 * @param {string} tripleId
 */
export async function placeTriple(teamId, triple, tripleId) {
  const nodes = await getTree(teamId);

  // If no tree at all, bootstrap with a root
  if (nodes.length === 0) {
    const root = await createNode(teamId, {
      name: 'General',
      description: 'General knowledge that doesn\'t fit a specific category',
      isRoot: true,
      parentId: null,
    });
    await tagTriple(tripleId, root.id);
    return root;
  }

  // Try to find the best existing node for this triple
  const tripleText = triple.displayText || `${triple.subjectName} ${triple.relationship} ${triple.objectName}`;
  const embedding = await AIService.generateEmbedding(tripleText);
  if (!embedding) {
    // Fallback: tag to root
    const root = nodes.find(n => n.is_root) || nodes[0];
    await tagTriple(tripleId, root.id);
    return root;
  }

  const embStr = '[' + embedding.join(',') + ']';
  const match = await db.query(`
    SELECT id, name, description, 1 - (embedding <=> $1) as similarity
    FROM sst_nodes
    WHERE team_id = $2 AND embedding IS NOT NULL
    ORDER BY embedding <=> $1
    LIMIT 1
  `, [embStr, teamId]);

  if (match.rows.length > 0 && match.rows[0].similarity > 0.5) {
    // Good match — place here
    await tagTriple(tripleId, match.rows[0].id);
    await db.query('UPDATE sst_nodes SET triple_count = triple_count + 1, updated_at = NOW() WHERE id = $1', [match.rows[0].id]);
    return match.rows[0];
  }

  // No good match — ask LLM where to place it (or create new node)
  const newNode = await suggestPlacement(teamId, tripleText, nodes);
  await tagTriple(tripleId, newNode.id);
  return newNode;
}

/**
 * Ask LLM where a triple belongs in the tree, or suggest a new node.
 */
async function suggestPlacement(teamId, tripleText, existingNodes) {
  const treeDesc = existingNodes.map(n => {
    const indent = '  '.repeat(n.depth || 0);
    return `${indent}[${n.id.substring(0, 8)}] ${n.name} — ${n.description || 'No description'} (${n.triple_count} facts)`;
  }).join('\n');

  try {
    const response = await AIService.callOpenAI([
      {
        role: 'system',
        content: `You are a knowledge organizer. Given a piece of knowledge and an existing category tree, decide where it belongs.

If an existing category fits, return: EXISTING:<id>
If a new category is needed, return: NEW:<parent_id>|<category_name>|<short_description>

The parent_id should be the ID of the most appropriate parent. Use the root if nothing fits.
Keep category names short (1-3 words). Descriptions should be 1 sentence for LLM navigation.
Return ONLY one line in the format above.`
      },
      {
        role: 'user',
        content: `Knowledge: "${tripleText}"\n\nExisting tree:\n${treeDesc}`
      }
    ], { model: 'gpt-4o-mini', maxTokens: 100, temperature: 0, teamId, operation: 'sst_place' });

    const line = response.trim();

    if (line.startsWith('EXISTING:')) {
      const nodeId = line.substring(9).trim();
      // Find the full ID from the prefix
      const node = existingNodes.find(n => n.id.startsWith(nodeId));
      if (node) {
        await db.query('UPDATE sst_nodes SET triple_count = triple_count + 1, updated_at = NOW() WHERE id = $1', [node.id]);
        return node;
      }
    }

    if (line.startsWith('NEW:')) {
      const parts = line.substring(4).split('|');
      if (parts.length >= 2) {
        const parentIdPrefix = parts[0].trim();
        const name = parts[1].trim();
        const desc = parts[2]?.trim() || '';
        const parent = existingNodes.find(n => n.id.startsWith(parentIdPrefix));
        const parentId = parent?.id || existingNodes.find(n => n.is_root)?.id || null;
        const parentDepth = parent?.depth || 0;

        const newNode = await createNode(teamId, {
          name,
          description: desc,
          parentId,
          depth: parentDepth + 1,
        });
        return newNode;
      }
    }
  } catch (err) {
    console.error('[SST] Placement error:', err.message);
  }

  // Fallback: put in root
  const root = existingNodes.find(n => n.is_root) || existingNodes[0];
  await db.query('UPDATE sst_nodes SET triple_count = triple_count + 1, updated_at = NOW() WHERE id = $1', [root.id]);
  return root;
}

// ============================================================================
// TREE MANAGEMENT
// ============================================================================

/**
 * Get the full SST for a team, ordered by depth then name.
 */
export async function getTree(teamId) {
  const result = await db.query(`
    SELECT id, parent_id, name, canonical_name, description, depth,
           scope_id, triple_count, query_count, is_root, auto_generated,
           created_at, updated_at
    FROM sst_nodes
    WHERE team_id = $1
    ORDER BY depth ASC, name ASC
  `, [teamId]);
  return result.rows;
}

/**
 * Create a new SST node with embedding.
 */
async function createNode(teamId, { name, description, parentId = null, depth = 0, isRoot = false, scopeId = null }) {
  const canonical = name.toLowerCase().trim();
  const embText = `${name}: ${description}`;
  const embedding = await AIService.generateEmbedding(embText);
  const embStr = embedding ? '[' + embedding.join(',') + ']' : null;

  const result = await db.query(`
    INSERT INTO sst_nodes (team_id, parent_id, name, canonical_name, description, embedding, depth, is_root, scope_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [teamId, parentId, name, canonical, description, embStr, depth, isRoot, scopeId]);

  console.log(`[SST] Created node: "${name}" (depth ${depth})`);
  return result.rows[0];
}

/**
 * Tag a triple with an SST node.
 */
async function tagTriple(tripleId, sstNodeId) {
  await db.query('UPDATE triples SET sst_node_id = $1 WHERE id = $2', [sstNodeId, tripleId]);
}

/**
 * Bootstrap the SST for a team from existing triples.
 * Clusters triples into categories using LLM, then creates nodes.
 */
export async function bootstrapTree(teamId) {
  // Get all active triples
  const triples = await db.query(`
    SELECT t.id, t.display_text, s.name as subject_name, t.relationship, o.name as object_name
    FROM triples t
    JOIN concepts s ON t.subject_id = s.id
    JOIN concepts o ON t.object_id = o.id
    WHERE t.team_id = $1 AND t.status = 'active'
    ORDER BY t.created_at DESC
    LIMIT 100
  `, [teamId]);

  if (triples.rows.length === 0) return;

  // Ask LLM to cluster into categories
  const tripleDescs = triples.rows.map(t =>
    `- ${t.display_text || `${t.subject_name} ${t.relationship} ${t.object_name}`}`
  ).join('\n');

  try {
    const response = await AIService.callOpenAI([
      {
        role: 'system',
        content: `You are a knowledge organizer. Given a list of knowledge facts, create a hierarchical category tree.

Return a JSON array of categories:
[
  {"name": "Category Name", "description": "1-sentence description for navigation", "parent": null, "facts": [0, 2, 5]},
  {"name": "Sub Category", "description": "...", "parent": "Category Name", "facts": [1, 3]}
]

Rules:
- Max 3 levels deep
- Category names: 1-3 words
- Each fact should appear in exactly one category
- Use "General" for uncategorizable facts
- facts array contains the 0-based indices of facts that belong to this category`
      },
      {
        role: 'user',
        content: `Organize these ${triples.rows.length} facts into categories:\n\n${tripleDescs}`
      }
    ], { model: 'gpt-4o-mini', maxTokens: 1000, temperature: 0.2, teamId, operation: 'sst_bootstrap' });

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const categories = JSON.parse(jsonMatch[0]);

    // Create nodes
    const nodeMap = new Map(); // name → node
    // First pass: create root-level nodes
    for (const cat of categories.filter(c => !c.parent)) {
      const isGeneral = cat.name.toLowerCase() === 'general';
      const node = await createNode(teamId, {
        name: cat.name,
        description: cat.description,
        isRoot: isGeneral,
        depth: 0,
      });
      nodeMap.set(cat.name, node);

      // Tag triples
      for (const idx of (cat.facts || [])) {
        if (triples.rows[idx]) {
          await tagTriple(triples.rows[idx].id, node.id);
        }
      }
      await db.query('UPDATE sst_nodes SET triple_count = $1 WHERE id = $2', [(cat.facts || []).length, node.id]);
    }

    // Second pass: create child nodes
    for (const cat of categories.filter(c => c.parent)) {
      const parent = nodeMap.get(cat.parent);
      if (!parent) continue;
      const node = await createNode(teamId, {
        name: cat.name,
        description: cat.description,
        parentId: parent.id,
        depth: (parent.depth || 0) + 1,
      });
      nodeMap.set(cat.name, node);

      for (const idx of (cat.facts || [])) {
        if (triples.rows[idx]) {
          await tagTriple(triples.rows[idx].id, node.id);
        }
      }
      await db.query('UPDATE sst_nodes SET triple_count = $1 WHERE id = $2', [(cat.facts || []).length, node.id]);
    }

    console.log(`[SST] Bootstrapped ${nodeMap.size} nodes for team ${teamId}`);
  } catch (err) {
    console.error('[SST] Bootstrap error:', err.message);
  }
}

/**
 * Link a user-defined scope to an SST node.
 */
export async function linkScopeToNode(scopeId, sstNodeId) {
  await db.query('UPDATE sst_nodes SET scope_id = $1 WHERE id = $2', [scopeId, sstNodeId]);
}

// ============================================================================
// ROUTE CACHE
// ============================================================================

/**
 * Check if we've seen a similar query pattern before.
 */
async function checkRouteCache(teamId, query) {
  // Canonicalize: lowercase, trim, remove punctuation
  const pattern = query.toLowerCase().trim().replace(/[?!.,;:'"]/g, '').substring(0, 200);

  const result = await db.query(`
    SELECT n.* FROM sst_route_cache c
    JOIN sst_nodes n ON n.id = c.sst_node_id
    WHERE c.team_id = $1 AND c.query_pattern = $2
  `, [teamId, pattern]);

  if (result.rows.length > 0) {
    // Bump hit count
    db.query(`
      UPDATE sst_route_cache SET hit_count = hit_count + 1, last_hit_at = NOW()
      WHERE team_id = $1 AND query_pattern = $2
    `, [teamId, pattern]).catch(() => {});
    return result.rows[0];
  }
  return null;
}

/**
 * Cache a route for future use.
 */
async function cacheRoute(teamId, query, sstNodeId) {
  const pattern = query.toLowerCase().trim().replace(/[?!.,;:'"]/g, '').substring(0, 200);
  await db.query(`
    INSERT INTO sst_route_cache (team_id, query_pattern, sst_node_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (team_id, query_pattern) DO UPDATE SET
      sst_node_id = $3, hit_count = sst_route_cache.hit_count + 1, last_hit_at = NOW()
  `, [teamId, pattern, sstNodeId]);
}

/**
 * Get tree for display (user-facing — hide auto-generated internal details).
 */
export async function getTreeForDisplay(teamId) {
  const nodes = await getTree(teamId);
  return nodes.map(n => ({
    id: n.id,
    name: n.name,
    parentId: n.parent_id,
    depth: n.depth,
    tripleCount: n.triple_count,
    queryCount: n.query_count,
    scopeId: n.scope_id,
  }));
}
