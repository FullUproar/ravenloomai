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
// QUERY EXECUTION PLANNER
// ============================================================================

/**
 * Analyze a question and create an execution plan.
 * Gives the LLM a birds-eye view of the graph and lets it decide
 * the best retrieval strategy.
 *
 * Returns: { queryType, strategy, precomputedData, augmentedQuestion }
 */
export async function planQuery(teamId, question, scopeIds = []) {
  // ── Lightweight LLM classification (~200ms with gpt-4o-mini) ────────
  let plan = null;
  try {
    const classification = await callOpenAI([
      {
        role: 'system',
        content: `Classify this question into ONE type. Return ONLY a JSON object, no markdown.

Types:
- factual: simple fact lookup ("When does X launch?")
- exhaustive: wants ALL info about a topic ("Tell me everything about X", "What do we know about X?")
- timeline: wants dates/deadlines aggregated ("All deadlines", "What's our schedule?", "Upcoming milestones")
- listing: wants a list of items ("What games do we make?", "Which products are in development?", "What are our projects?")
- counting: wants a count ("How many products?")
- comparison: comparing items ("Compare X and Y")
- cross_domain: combines multiple distinct topics ("X and Y?", "Who does A and what about B?")

{"type":"factual","topics":[],"scanQuery":null}`
      },
      { role: 'user', content: question }
    ], { model: 'gpt-4o-mini', maxTokens: 80, temperature: 0, teamId, operation: 'classify_query' });

    const parsed = JSON.parse(classification.match(/\{[\s\S]*\}/)?.[0] || '{}');
    const qt = parsed.type || 'factual';
    const topics = parsed.topics || [];

    if (qt === 'factual') return null; // Normal retrieval

    plan = {
      queryType: qt,
      targetConcepts: topics,
      needsGraphScan: true,
      scanQuery: parsed.scanQuery || question,
      warnSlowQuery: ['timeline', 'cross_domain', 'exhaustive'].includes(qt),
    };
  } catch {
    return null; // Classification failed — fall back to normal retrieval
  }

  // Execute graph scan based on plan
  let precomputedData = null;
  if (plan.needsGraphScan && plan.scanQuery) {
    precomputedData = await executeGraphScan(teamId, plan, scopeIds);
  }

  return { ...plan, precomputedData };
}

/**
 * Execute a targeted graph scan based on the query plan.
 * Handles counting, listing, and aggregation queries.
 */
async function executeGraphScan(teamId, plan, scopeIds) {
  const qt = (plan.queryType || '').toLowerCase();
  const scan = (plan.scanQuery || '').toLowerCase();

  try {
    if (qt === 'counting') {
      // Strategy 1: Count by type (try multiple synonyms)
      const typeMatch = scan.match(/count\s+(?:concepts?\s+of\s+type\s+)?(\w+)/i);
      if (typeMatch) {
        const type = typeMatch[1].toLowerCase();
        // Expand type to include synonyms
        const typeVariants = expandTypeVariants(type);

        const result = await db.query(
          `SELECT COUNT(*) as count, array_agg(name ORDER BY name) as names
           FROM concepts WHERE team_id = $1 AND LOWER(type) = ANY($2)`,
          [teamId, typeVariants]
        );
        let row = result.rows[0];

        // Strategy 2: If type match fails, find concepts connected via "is a" or "includes" relationships
        if (parseInt(row.count) === 0) {
          const relResult = await db.query(`
            SELECT DISTINCT s.name
            FROM triples t
            JOIN concepts s ON t.subject_id = s.id
            JOIN concepts o ON t.object_id = o.id
            WHERE t.team_id = $1 AND t.status = 'active'
              AND (LOWER(t.relationship) LIKE '%include%' OR LOWER(t.relationship) LIKE '%is a%'
                OR LOWER(t.relationship) LIKE '%product%' OR LOWER(o.name) LIKE $2)
            ORDER BY s.name
          `, [teamId, `%${type}%`]);

          if (relResult.rows.length > 0) {
            const names = relResult.rows.map(r => r.name);
            return { type: 'count', count: names.length, names, description: `Found ${names.length} items via relationship search: ${names.join(', ')}` };
          }
        }

        // Strategy 3: Count subjects that appear in triples where the object matches the query type
        if (parseInt(row.count) === 0) {
          const subjectResult = await db.query(`
            SELECT DISTINCT s.name
            FROM triples t
            JOIN concepts s ON t.subject_id = s.id
            WHERE t.team_id = $1 AND t.status = 'active'
              AND s.type != 'concept'
              AND (LOWER(s.type) = ANY($2)
                OR LOWER(t.display_text) LIKE '%product line%'
                OR LOWER(t.display_text) LIKE '%product%includes%')
            ORDER BY s.name
          `, [teamId, typeVariants]);

          if (subjectResult.rows.length > 0) {
            const names = subjectResult.rows.map(r => r.name);
            return { type: 'count', count: names.length, names, description: `Found ${names.length} items: ${names.join(', ')}` };
          }
        }

        return {
          type: 'count',
          count: parseInt(row.count),
          names: row.names || [],
          description: `Found ${row.count} ${type} concepts: ${(row.names || []).join(', ')}`,
        };
      }

      // Generic count — count all concepts mentioned in targetConcepts
      if (plan.targetConcepts?.length > 0) {
        return {
          type: 'count',
          count: plan.targetConcepts.length,
          names: plan.targetConcepts,
          description: `Identified ${plan.targetConcepts.length} matching concepts`,
        };
      }
    }

    if (qt === 'listing') {
      // Use LLM to extract what we're listing — more robust than regex
      let listTarget = '';
      try {
        const extraction = await callOpenAI([
          { role: 'system', content: 'Extract the TYPE of thing being listed from this question. Return ONLY the singular noun (e.g., "game", "product", "person", "deadline", "target"). If unclear, return "item".' },
          { role: 'user', content: plan.scanQuery || scan }
        ], { model: 'gpt-4o-mini', maxTokens: 10, temperature: 0 });
        listTarget = extraction.trim().toLowerCase().replace(/[^a-z]/g, '');
      } catch {
        // Fallback to simple keyword extraction
        const q = plan.scanQuery || scan;
        listTarget = q.match(/\b(games?|products?|projects?|people|team|members?|targets?|goals?|deadlines?)\b/i)?.[1] || 'item';
      }
      const typeVariants = expandTypeVariants(listTarget);

      // Strategy 1: Find concepts by type
      let result = await db.query(`
        SELECT c.name, c.type, COUNT(t.id) as triple_count
        FROM concepts c
        LEFT JOIN triples t ON (t.subject_id = c.id OR t.object_id = c.id) AND t.status = 'active'
        WHERE c.team_id = $1 AND LOWER(c.type) = ANY($2)
        GROUP BY c.id, c.name, c.type
        HAVING COUNT(t.id) > 0
        ORDER BY triple_count DESC
        LIMIT 20
      `, [teamId, typeVariants]);

      // Strategy 2: If no type match, search display_text for the category
      if (result.rows.length < 3 && listTarget) {
        const textResult = await db.query(`
          SELECT DISTINCT s.name, s.type, COUNT(t.id) as triple_count
          FROM triples t
          JOIN concepts s ON t.subject_id = s.id
          WHERE t.team_id = $1 AND t.status = 'active'
            AND (t.display_text ~* $2 OR s.type ~* $2 OR t.relationship ~* $2)
          GROUP BY s.id, s.name, s.type
          HAVING COUNT(t.id) >= 2
          ORDER BY triple_count DESC
          LIMIT 20
        `, [teamId, listTarget]);
        if (textResult.rows.length > result.rows.length) result = textResult;
      }

      // Strategy 3: Broadest fallback — get top concepts by connectivity
      if (result.rows.length < 3) {
        result = await db.query(`
          SELECT c.name, c.type, COUNT(t.id) as triple_count
          FROM concepts c
          JOIN triples t ON (t.subject_id = c.id OR t.object_id = c.id) AND t.status = 'active'
          WHERE c.team_id = $1
          GROUP BY c.id, c.name, c.type
          HAVING COUNT(t.id) >= 3
          ORDER BY triple_count DESC
          LIMIT 20
        `, [teamId]);
      }

      // Fetch a representative triple for each listed concept so the LLM knows WHAT each item is
      const enrichedItems = [];
      for (const item of result.rows.slice(0, 15)) {
        const rep = await db.query(`
          SELECT t.display_text FROM triples t
          WHERE t.team_id = $1 AND t.status = 'active'
            AND (t.subject_id IN (SELECT id FROM concepts WHERE canonical_name = $2 AND team_id = $1))
          ORDER BY t.confidence DESC NULLS LAST
          LIMIT 3
        `, [teamId, item.name.toLowerCase()]);
        enrichedItems.push({
          ...item,
          triples: rep.rows.map(r => r.display_text),
        });
      }

      return {
        type: 'list',
        items: enrichedItems,
        description: `Found ${enrichedItems.length} ${listTarget || 'items'}:\n${enrichedItems.map(i => `- ${i.name} (${i.type}): ${i.triples[0] || 'no details'}`).join('\n')}`,
      };
    }

    if (qt === 'comparison' && plan.targetConcepts?.length >= 2) {
      const results = [];
      for (const name of plan.targetConcepts.slice(0, 2)) {
        const conceptResult = await db.query(
          `SELECT id FROM concepts WHERE team_id = $1 AND LOWER(canonical_name) = $2`,
          [teamId, name.toLowerCase()]
        );
        if (conceptResult.rows[0]) {
          const triples = await db.query(`
            SELECT display_text FROM triples
            WHERE team_id = $1 AND status = 'active'
              AND (subject_id = $2 OR object_id = $2)
          `, [teamId, conceptResult.rows[0].id]);
          results.push({ concept: name, triples: triples.rows.map(r => r.display_text) });
        }
      }
      return { type: 'comparison', comparisons: results };
    }

    // ── EXHAUSTIVE: get ALL triples for target concepts ──────────────
    if (qt === 'exhaustive' && plan.targetConcepts?.length > 0) {
      const allTriples = [];
      for (const name of plan.targetConcepts.slice(0, 3)) {
        // Fuzzy match concept name
        const conceptResult = await db.query(`
          SELECT id, name FROM concepts
          WHERE team_id = $1 AND (LOWER(canonical_name) LIKE $2 OR LOWER(name) LIKE $2
            OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE LOWER(a) LIKE $2))
          LIMIT 3
        `, [teamId, `%${name.toLowerCase()}%`]);

        for (const concept of conceptResult.rows) {
          const triples = await db.query(`
            SELECT t.display_text, t.relationship, s.name AS sn, o.name AS on2
            FROM triples t
            JOIN concepts s ON t.subject_id = s.id
            JOIN concepts o ON t.object_id = o.id
            WHERE t.team_id = $1 AND t.status = 'active'
              AND (t.subject_id = $2 OR t.object_id = $2)
            ORDER BY t.confidence DESC
            LIMIT 30
          `, [teamId, concept.id]);
          allTriples.push(...triples.rows.map(r => r.display_text));
        }
      }
      const unique = [...new Set(allTriples)];
      return {
        type: 'exhaustive',
        triples: unique,
        count: unique.length,
        description: `Found ${unique.length} facts about ${plan.targetConcepts.join(', ')}`,
      };
    }

    // ── TIMELINE: aggregate all date-containing triples ──────────────
    if (qt === 'timeline') {
      // Search BOTH concept names AND display_text for date patterns
      const dateTriples = await db.query(`
        SELECT DISTINCT t.id, t.display_text, t.relationship,
               s.name AS subject, o.name AS object, o.type AS object_type, s.type AS subject_type
        FROM triples t
        JOIN concepts s ON t.subject_id = s.id
        JOIN concepts o ON t.object_id = o.id
        WHERE t.team_id = $1 AND t.status = 'active'
          AND (
            -- Object is a date-like concept
            o.type IN ('date', 'deadline', 'milestone', 'event', 'time_period', 'quarter')
            -- Relationship involves timing
            OR t.relationship ~* '(launch|release|due|deadline|target|schedule|start|open|ship|complete|deliver|goes live|doors open)'
            -- Object name contains a date
            OR o.name ~* '(january|february|march|april|may|june|july|august|september|october|november|december|20[0-9]{2}|Q[1-4]|spring|summer|fall|winter)'
            -- Subject name contains a date
            OR s.name ~* '(january|february|march|april|may|june|july|august|september|october|november|december|20[0-9]{2}|Q[1-4])'
            -- Display text mentions dates
            OR t.display_text ~* '(january|february|march|april|may|june|july|august|september|october|november|december|20[0-9]{2}|Q[1-4]|deadline|milestone|launch|target date)'
          )
        ORDER BY t.display_text ASC
        LIMIT 60
      `, [teamId]);

      const timeline = dateTriples.rows.map(r => ({
        event: r.subject,
        relationship: r.relationship,
        date: r.object,
        displayText: r.display_text,
      }));

      return {
        type: 'timeline',
        events: timeline,
        count: timeline.length,
        description: `Found ${timeline.length} dated events/deadlines:\n${timeline.map(t => `- ${t.displayText}`).join('\n')}`,
      };
    }

    // ── CROSS_DOMAIN: search multiple concepts and merge ─────────────
    if (qt === 'cross_domain' && plan.targetConcepts?.length >= 2) {
      const domainResults = [];
      for (const name of plan.targetConcepts.slice(0, 4)) {
        const triples = new Set();

        // Strategy 1: Match concept names
        const conceptResult = await db.query(`
          SELECT id, name FROM concepts
          WHERE team_id = $1 AND (LOWER(canonical_name) LIKE $2 OR LOWER(name) LIKE $2
            OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE LOWER(a) LIKE $2))
          LIMIT 5
        `, [teamId, `%${name.toLowerCase()}%`]);

        for (const concept of conceptResult.rows) {
          const tripleResult = await db.query(`
            SELECT t.display_text FROM triples t
            WHERE t.team_id = $1 AND t.status = 'active'
              AND (t.subject_id = $2 OR t.object_id = $2)
            ORDER BY t.confidence DESC LIMIT 15
          `, [teamId, concept.id]);
          tripleResult.rows.forEach(r => triples.add(r.display_text));
        }

        // Strategy 2: Search display_text directly for the topic
        if (triples.size < 5) {
          const textResult = await db.query(`
            SELECT t.display_text FROM triples t
            WHERE t.team_id = $1 AND t.status = 'active'
              AND t.display_text ~* $2
            ORDER BY t.confidence DESC LIMIT 10
          `, [teamId, name.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3).join('|')]);
          textResult.rows.forEach(r => triples.add(r.display_text));
        }

        domainResults.push({ domain: name, triples: [...triples] });
      }

      return {
        type: 'cross_domain',
        domains: domainResults,
        description: domainResults.map(d =>
          `${d.domain} (${d.triples.length} facts):\n${d.triples.slice(0, 5).map(t => `  - ${t}`).join('\n')}`
        ).join('\n\n'),
      };
    }
  } catch (err) {
    console.error('[QueryPlan] Graph scan error:', err.message);
  }

  return null;
}

/**
 * Expand a concept type into synonyms/variants for broader matching.
 */
function expandTypeVariants(type) {
  // Normalize: strip plural, lowercase
  const normalized = type.toLowerCase().replace(/s$/, '');
  const synonyms = {
    product: ['product', 'game', 'item', 'offering', 'app', 'platform', 'service'],
    game: ['game', 'product', 'card game', 'board game', 'app'],
    project: ['product', 'project', 'game', 'app', 'platform'],
    person: ['person', 'employee', 'team member', 'contact', 'user'],
    member: ['person', 'employee', 'team member', 'contact'],
    company: ['company', 'organization', 'partner', 'manufacturer'],
    location: ['location', 'place', 'city', 'venue'],
    date: ['date', 'deadline', 'milestone', 'event'],
    event: ['event', 'milestone', 'date', 'launch'],
    target: ['target', 'goal', 'milestone', 'revenue'],
    feature: ['feature', 'capability', 'mechanic'],
    service: ['service', 'platform', 'product', 'app'],
    tool: ['tool', 'product', 'platform', 'app'],
    app: ['app', 'product', 'platform', 'service'],
    platform: ['platform', 'product', 'service', 'app'],
    deadline: ['date', 'deadline', 'milestone', 'event', 'launch'],
  };
  return synonyms[normalized] || [type, normalized];
}

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
export async function searchTriples(teamId, question, { scopeIds = [], sstNodeId = null, topK = 15 } = {}) {
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

  // Strategy 3c: Keyword matching on concept names (include short words for abbreviations)
  const questionWords = question.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  let keywordConcepts = [];
  if (questionWords.length > 0) {
    // For short words (2-3 chars), do exact alias match. For longer, do ILIKE.
    const shortWords = questionWords.filter(w => w.length <= 3);
    const longWords = questionWords.filter(w => w.length > 3);

    // Exact alias match for short words (catches "HYD", "ISS", etc.)
    if (shortWords.length > 0) {
      for (const sw of shortWords) {
        try {
          const aliasResult = await db.query(
            `SELECT id, name, 0.95 AS similarity FROM concepts WHERE team_id = $1
              AND (UPPER(canonical_name) = UPPER($2) OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE UPPER(a) = UPPER($2)))
             LIMIT 3`,
            [teamId, sw]
          );
          keywordConcepts.push(...aliasResult.rows);
        } catch {}
      }
    }

    const patterns = longWords.map(w => `%${w}%`);
    if (patterns.length === 0 && keywordConcepts.length > 0) {
      // Short-word-only query — skip ILIKE, we have alias matches
    } else if (patterns.length > 0) {
      const placeholders = patterns.map((_, i) => `canonical_name ILIKE $${i + 2}`).join(' OR ');
      const keywordResult = await db.query(
        `SELECT id, name, 0.85 AS similarity FROM concepts WHERE team_id = $1 AND (${placeholders}) LIMIT 5`,
        [teamId, ...patterns]
      );
      keywordConcepts.push(...keywordResult.rows);
    }
  }

  // Strategy 3d: Match extracted entities against concept names AND aliases (fuzzy)
  let entityConcepts = [];
  if (extractedEntities.length > 0) {
    const entityPatterns = extractedEntities.map(e => `%${e}%`);
    const entityPlaceholders = entityPatterns.map((_, i) =>
      `canonical_name ILIKE $${i + 2} OR name ILIKE $${i + 2} OR EXISTS (SELECT 1 FROM unnest(aliases) alias WHERE alias ILIKE $${i + 2})`
    ).join(' OR ');
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

  // SST scope boost: triples tagged with the routed SST node get a similarity bump
  if (sstNodeId) {
    for (const triple of merged) {
      if (triple.sst_node_id === sstNodeId) {
        triple.similarity = Math.min((triple.similarity || 0) + 0.1, 1.0);
        triple.sstMatch = true;
      }
    }
    merged.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  }

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
        content: `Extract entity names, product names, and key nouns from this question. Return ONLY a JSON array of strings.

Include:
- Proper nouns, product names, company names
- Key action nouns and their SYNONYMS (e.g., "shipped" → include "shipped", "sold", "delivered", "distributed")
- Paraphrased concepts (e.g., "boxes" → include "boxes", "packaging")
- Be generous — include anything that might match a stored concept

Examples:
"When does our chaos card game ship?" → ["chaos card game", "ship", "launch", "release"]
"How many games have we shipped total?" → ["games", "shipped", "sold", "units", "total"]
"Are our boxes environmentally friendly?" → ["boxes", "packaging", "environmentally friendly", "eco-friendly"]
"What's the manufacturing lead time for Hack Your Deck?" → ["Hack Your Deck", "manufacturing", "production", "lead time"]`
      },
      { role: 'user', content: question }
    ], { model: 'gpt-4o-mini', maxTokens: 150, temperature: 0 });

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

    // Adaptive hub handling: check if any frontier concept is a high-degree hub
    // If so, only traverse edges whose relationship type is semantically relevant
    const hubCheck = await db.query(`
      SELECT c.id, c.name,
        (SELECT COUNT(*) FROM triples WHERE (subject_id = c.id OR object_id = c.id) AND status = 'active') as degree
      FROM concepts c WHERE c.id = ANY($1)
    `, [frontier]);

    const hubIds = hubCheck.rows.filter(r => parseInt(r.degree) > 30).map(r => r.id);
    const nonHubFrontier = frontier.filter(id => !hubIds.includes(id));

    // For hub nodes, get edges but limit to avoid explosion
    // For non-hub nodes, get all edges normally
    const result = await db.query(`
      SELECT t.*, s.name AS subject_name, s.type AS subject_type,
             o.name AS object_name, o.type AS object_type
      FROM triples t
      JOIN concepts s ON t.subject_id = s.id
      JOIN concepts o ON t.object_id = o.id
      WHERE t.team_id = $1 AND t.status = 'active'
        AND (t.subject_id = ANY($2) OR t.object_id = ANY($2))
        AND t.id != ALL($3)
      ORDER BY t.confidence DESC NULLS LAST
      LIMIT ${hubIds.length > 0 ? 10 : 20}
    `, [teamId, nonHubFrontier.length > 0 ? nonHubFrontier : frontier, Array.from(visitedTripleIds)]);

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

      const supersededStr = t.status === 'superseded' ? ' [SUPERSEDED]' : '';
      lines.push(`  - ${t.displayText}${ctxStr}${hopStr}${supersededStr}`);
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
