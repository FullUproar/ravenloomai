/**
 * KnowledgeGapService - Analyzes the knowledge graph for missing knowledge
 * and generates natural questions to fill gaps.
 *
 * Gap detection strategies:
 * 1. Missing identity — concepts with attributes but no type/definition
 * 2. Thin knowledge — named concepts with very few triples
 * 3. Missing common relationships — products missing launch date, etc.
 * 4. Referenced but undescribed — heavily referenced but never described
 * 5. Stale concepts — no recent triples
 */

import db from '../db.js';
import { callOpenAI } from './AIService.js';

// ============================================================================
// GAP DETECTION STRATEGIES
// ============================================================================

/**
 * Strategy A: Find concepts with 3+ attribute triples but no identity triple.
 * These are described but never defined.
 */
async function detectMissingIdentity(teamId, focusFilter) {
  const result = await db.query(`
    WITH concept_triple_counts AS (
      -- Count triples where concept appears as EITHER subject or object
      SELECT concept_id, SUM(cnt) AS triple_count FROM (
        SELECT subject_id AS concept_id, COUNT(*) AS cnt
        FROM triples WHERE team_id = $1 AND status = 'active'
        GROUP BY subject_id
        UNION ALL
        SELECT object_id AS concept_id, COUNT(*) AS cnt
        FROM triples WHERE team_id = $1 AND status = 'active'
        GROUP BY object_id
      ) combined
      GROUP BY concept_id
      HAVING SUM(cnt) >= 3
    ),
    identity_concepts AS (
      -- A concept has identity if it's the SUBJECT of an identity-defining triple
      -- OR if it's the OBJECT of a "something is a [this concept]" pattern
      SELECT DISTINCT subject_id AS concept_id
      FROM triples
      WHERE team_id = $1 AND status = 'active'
        AND (
          LOWER(relationship) LIKE '%is a%'
          OR LOWER(relationship) LIKE '%is_a%'
          OR LOWER(relationship) LIKE '%type%'
          OR LOWER(relationship) LIKE '%described as%'
          OR LOWER(relationship) LIKE '%defined as%'
          OR LOWER(relationship) LIKE '%is an%'
          OR LOWER(relationship) = 'is'
          OR LOWER(relationship) LIKE '%serves as%'
          OR LOWER(relationship) LIKE '%functions as%'
          OR LOWER(relationship) LIKE '%operates as%'
          OR LOWER(relationship) LIKE '%platform%'
          OR LOWER(relationship) LIKE '%is a type of%'
        )
      UNION
      -- Also count concepts that appear as objects with many triples (well-described)
      SELECT DISTINCT object_id AS concept_id
      FROM triples
      WHERE team_id = $1 AND status = 'active'
        AND (
          LOWER(relationship) LIKE '%is a%'
          OR LOWER(relationship) LIKE '%is_a%'
          OR LOWER(relationship) LIKE '%is an%'
          OR LOWER(relationship) = 'is'
          OR LOWER(relationship) LIKE '%is a type of%'
        )
    )
    SELECT c.id AS concept_id, c.name AS concept_name, c.type AS concept_type,
           ctc.triple_count
    FROM concept_triple_counts ctc
    JOIN concepts c ON ctc.concept_id = c.id
    LEFT JOIN identity_concepts ic ON ctc.concept_id = ic.concept_id
    WHERE ic.concept_id IS NULL
      AND c.team_id = $1
    ORDER BY ctc.triple_count DESC
    LIMIT 20
  `, [teamId]);

  const gaps = [];
  for (const row of result.rows) {
    if (focusFilter && !matchesFocus(row, focusFilter)) continue;

    // Gather some existing triples for context
    const triplesResult = await db.query(`
      SELECT display_text FROM triples
      WHERE team_id = $1 AND subject_id = $2 AND status = 'active'
      LIMIT 5
    `, [teamId, row.concept_id]);

    const existingFacts = triplesResult.rows.map(r => r.display_text);

    gaps.push({
      conceptId: row.concept_id,
      conceptName: row.concept_name,
      conceptType: row.concept_type,
      gapType: 'missing_identity',
      priority: Math.min(10, 5 + Math.floor(row.triple_count / 3)),
      existingFacts,
      rawContext: `Has ${row.triple_count} triples but no identity/type definition.`
    });
  }

  return gaps;
}

/**
 * Strategy B: Find product/company/person concepts with fewer than 3 triples.
 * Named but barely described.
 */
async function detectThinKnowledge(teamId, focusFilter) {
  const result = await db.query(`
    SELECT c.id AS concept_id, c.name AS concept_name, c.type AS concept_type,
           COUNT(t.id) AS triple_count
    FROM concepts c
    LEFT JOIN triples t ON (t.subject_id = c.id OR t.object_id = c.id)
      AND t.team_id = $1 AND t.status = 'active'
    WHERE c.team_id = $1
      AND LOWER(c.type) IN ('product', 'company', 'person', 'game', 'brand', 'organization', 'service')
    GROUP BY c.id, c.name, c.type
    HAVING COUNT(t.id) < 3
    ORDER BY COUNT(t.id) ASC
    LIMIT 20
  `, [teamId]);

  const gaps = [];
  for (const row of result.rows) {
    if (focusFilter && !matchesFocus(row, focusFilter)) continue;

    const triplesResult = await db.query(`
      SELECT display_text FROM triples
      WHERE team_id = $1 AND (subject_id = $2 OR object_id = $2) AND status = 'active'
      LIMIT 5
    `, [teamId, row.concept_id]);

    const existingFacts = triplesResult.rows.map(r => r.display_text);

    gaps.push({
      conceptId: row.concept_id,
      conceptName: row.concept_name,
      conceptType: row.concept_type,
      gapType: 'thin_knowledge',
      priority: row.triple_count === 0 ? 7 : 5,
      existingFacts,
      rawContext: `A ${row.concept_type} with only ${row.triple_count} triple(s) — barely described.`
    });
  }

  return gaps;
}

/**
 * Strategy C: Find product-type concepts missing common relationships
 * (launch date, description, status) and person-type missing role/responsibilities.
 */
async function detectMissingRelationships(teamId, focusFilter) {
  // Product-type concepts
  const productResult = await db.query(`
    SELECT c.id AS concept_id, c.name AS concept_name, c.type AS concept_type,
           ARRAY_AGG(LOWER(t.relationship)) AS relationships,
           ARRAY_AGG(t.display_text) AS display_texts
    FROM concepts c
    JOIN triples t ON t.subject_id = c.id AND t.team_id = $1 AND t.status = 'active'
    WHERE c.team_id = $1
      AND LOWER(c.type) IN ('product', 'game', 'service', 'app', 'tool')
    GROUP BY c.id, c.name, c.type
    HAVING COUNT(t.id) >= 2
    LIMIT 30
  `, [teamId]);

  const gaps = [];

  for (const row of productResult.rows) {
    if (focusFilter && !matchesFocus(row, focusFilter)) continue;

    const rels = (row.relationships || []).join(' ');
    const missing = [];

    if (!rels.match(/launch|release|ship|available|date/i)) {
      missing.push('launch date');
    }
    if (!rels.match(/is a|is_a|type|described as|defined as|what it is/i)) {
      missing.push('what it is');
    }
    if (!rels.match(/status|phase|stage|state/i)) {
      missing.push('current status');
    }
    if (!rels.match(/price|cost|msrp|retail/i)) {
      missing.push('pricing');
    }

    if (missing.length > 0) {
      gaps.push({
        conceptId: row.concept_id,
        conceptName: row.concept_name,
        conceptType: row.concept_type,
        gapType: 'missing_relationship',
        priority: Math.min(8, 4 + missing.length),
        existingFacts: (row.display_texts || []).slice(0, 5),
        rawContext: `Missing common product info: ${missing.join(', ')}.`
      });
    }
  }

  // Person-type concepts
  const personResult = await db.query(`
    SELECT c.id AS concept_id, c.name AS concept_name, c.type AS concept_type,
           ARRAY_AGG(LOWER(t.relationship)) AS relationships,
           ARRAY_AGG(t.display_text) AS display_texts
    FROM concepts c
    JOIN triples t ON t.subject_id = c.id AND t.team_id = $1 AND t.status = 'active'
    WHERE c.team_id = $1
      AND LOWER(c.type) IN ('person', 'team member', 'employee', 'contact')
    GROUP BY c.id, c.name, c.type
    HAVING COUNT(t.id) >= 2
    LIMIT 30
  `, [teamId]);

  for (const row of personResult.rows) {
    if (focusFilter && !matchesFocus(row, focusFilter)) continue;

    const rels = (row.relationships || []).join(' ');
    const missing = [];

    if (!rels.match(/role|title|position|job/i)) {
      missing.push('role/title');
    }
    if (!rels.match(/responsible|owns|manages|handles|leads/i)) {
      missing.push('responsibilities');
    }

    if (missing.length > 0) {
      gaps.push({
        conceptId: row.concept_id,
        conceptName: row.concept_name,
        conceptType: row.concept_type,
        gapType: 'missing_relationship',
        priority: Math.min(7, 4 + missing.length),
        existingFacts: (row.display_texts || []).slice(0, 5),
        rawContext: `Missing common person info: ${missing.join(', ')}.`
      });
    }
  }

  return gaps;
}

/**
 * Strategy D: Concepts that appear as objects in 5+ triples but subjects in 0-1.
 * Referenced a lot but never described from their own perspective.
 */
async function detectUndescribed(teamId, focusFilter) {
  const result = await db.query(`
    WITH object_counts AS (
      SELECT object_id AS concept_id, COUNT(*) AS ref_count
      FROM triples
      WHERE team_id = $1 AND status = 'active'
      GROUP BY object_id
      HAVING COUNT(*) >= 5
    ),
    subject_counts AS (
      SELECT subject_id AS concept_id, COUNT(*) AS desc_count
      FROM triples
      WHERE team_id = $1 AND status = 'active'
      GROUP BY subject_id
    )
    SELECT c.id AS concept_id, c.name AS concept_name, c.type AS concept_type,
           oc.ref_count,
           COALESCE(sc.desc_count, 0) AS desc_count
    FROM object_counts oc
    JOIN concepts c ON oc.concept_id = c.id
    LEFT JOIN subject_counts sc ON oc.concept_id = sc.concept_id
    WHERE COALESCE(sc.desc_count, 0) <= 1
      AND c.team_id = $1
    ORDER BY oc.ref_count DESC
    LIMIT 20
  `, [teamId]);

  const gaps = [];
  for (const row of result.rows) {
    if (focusFilter && !matchesFocus(row, focusFilter)) continue;

    // Get a sample of how it's referenced
    const refsResult = await db.query(`
      SELECT display_text FROM triples
      WHERE team_id = $1 AND object_id = $2 AND status = 'active'
      LIMIT 5
    `, [teamId, row.concept_id]);

    gaps.push({
      conceptId: row.concept_id,
      conceptName: row.concept_name,
      conceptType: row.concept_type,
      gapType: 'undescribed',
      priority: Math.min(9, 5 + Math.floor(row.ref_count / 5)),
      existingFacts: refsResult.rows.map(r => r.display_text),
      rawContext: `Referenced in ${row.ref_count} triples but only described in ${row.desc_count}. Frequently mentioned but never explained.`
    });
  }

  return gaps;
}

/**
 * Strategy E: Concepts whose most recent triple is older than staleDays.
 */
async function detectStaleConcepts(teamId, focusFilter, staleDays = 30) {
  const result = await db.query(`
    SELECT c.id AS concept_id, c.name AS concept_name, c.type AS concept_type,
           MAX(t.updated_at) AS last_updated,
           COUNT(t.id) AS triple_count
    FROM concepts c
    JOIN triples t ON (t.subject_id = c.id OR t.object_id = c.id)
      AND t.team_id = $1 AND t.status = 'active'
    WHERE c.team_id = $1
    GROUP BY c.id, c.name, c.type
    HAVING MAX(t.updated_at) < NOW() - INTERVAL '1 day' * $2
       AND COUNT(t.id) >= 2
    ORDER BY MAX(t.updated_at) ASC
    LIMIT 20
  `, [teamId, staleDays]);

  const gaps = [];
  for (const row of result.rows) {
    if (focusFilter && !matchesFocus(row, focusFilter)) continue;

    const daysSince = Math.floor((Date.now() - new Date(row.last_updated).getTime()) / (1000 * 60 * 60 * 24));

    gaps.push({
      conceptId: row.concept_id,
      conceptName: row.concept_name,
      conceptType: row.concept_type,
      gapType: 'stale',
      priority: Math.min(6, 3 + Math.floor(daysSince / 30)),
      existingFacts: [],
      rawContext: `Last updated ${daysSince} days ago with ${row.triple_count} triples. May contain outdated information.`
    });
  }

  return gaps;
}

// ============================================================================
// FOCUS MATCHING
// ============================================================================

/**
 * Fuzzy match a concept row against a focus string.
 * "games" matches concepts with "game" in name, type, or connected triples.
 */
function matchesFocus(row, focus) {
  const focusLower = focus.toLowerCase();
  // Create variants: "games" -> also check "game", "gaming"
  const stem = focusLower.replace(/s$/, '').replace(/ing$/, '');
  const variants = [focusLower, stem];

  const name = (row.concept_name || '').toLowerCase();
  const type = (row.concept_type || '').toLowerCase();
  const rels = Array.isArray(row.relationships) ? row.relationships.join(' ').toLowerCase() : '';
  const texts = Array.isArray(row.display_texts) ? row.display_texts.join(' ').toLowerCase() : '';
  const facts = Array.isArray(row.existingFacts) ? row.existingFacts.join(' ').toLowerCase() : '';

  const searchable = `${name} ${type} ${rels} ${texts} ${facts}`;

  return variants.some(v => searchable.includes(v));
}

// ============================================================================
// NATURAL QUESTION GENERATION
// ============================================================================

/**
 * Use LLM to generate natural, conversational questions from raw gap data.
 * Batches gaps in groups of 10.
 */
async function generateNaturalQuestions(gaps) {
  if (gaps.length === 0) return gaps;

  const BATCH_SIZE = 10;
  const results = [];

  for (let i = 0; i < gaps.length; i += BATCH_SIZE) {
    const batch = gaps.slice(i, i + BATCH_SIZE);

    const gapDescriptions = batch.map((g, idx) => {
      const factsStr = g.existingFacts.length > 0
        ? `Known facts: ${g.existingFacts.slice(0, 4).join('; ')}`
        : 'No known facts.';
      return `${idx + 1}. Concept: "${g.conceptName}" (type: ${g.conceptType || 'unknown'})
   Gap: ${g.gapType} — ${g.rawContext}
   ${factsStr}`;
    }).join('\n\n');

    try {
      const response = await callOpenAI([
        {
          role: 'system',
          content: `You generate natural, conversational questions to fill knowledge gaps in a company's knowledge base.

Rules:
- Write questions as if a curious colleague is asking — casual but specific.
- Reference what IS known to show you've been paying attention.
- Don't be robotic ("What is the type of X?"). Instead, be human ("I see X launches in July and costs $20, but what actually IS it? A card game? Board game?").
- For stale concepts, ask if info is still current.
- For undescribed concepts, note how often they're referenced.
- Keep questions to 1-2 sentences max.
- Also generate a brief "context" string (1 sentence) explaining why this gap matters.

Return JSON: { "questions": [ { "index": 1, "question": "...", "context": "..." }, ... ] }
Generate one question per gap. Use the index numbers from the input.`
        },
        {
          role: 'user',
          content: `Generate natural questions for these knowledge gaps:\n\n${gapDescriptions}`
        }
      ], { model: 'gpt-4o-mini', maxTokens: 1000, temperature: 0.7 });

      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
      const questions = parsed.questions || [];

      for (const q of questions) {
        const gap = batch[q.index - 1];
        if (!gap) continue;
        results.push({
          conceptId: gap.conceptId,
          conceptName: gap.conceptName,
          conceptType: gap.conceptType,
          gapType: gap.gapType,
          question: q.question,
          priority: gap.priority,
          context: q.context || gap.rawContext,
        });
      }

      // If LLM missed some, use fallback questions
      for (let j = 0; j < batch.length; j++) {
        const gap = batch[j];
        const alreadyHas = results.some(r => r.conceptId === gap.conceptId && r.gapType === gap.gapType);
        if (!alreadyHas) {
          results.push({
            conceptId: gap.conceptId,
            conceptName: gap.conceptName,
            conceptType: gap.conceptType,
            gapType: gap.gapType,
            question: generateFallbackQuestion(gap),
            priority: gap.priority,
            context: gap.rawContext,
          });
        }
      }
    } catch (err) {
      console.error('[KnowledgeGap] LLM question generation error:', err.message);
      // Fallback: generate basic questions without LLM
      for (const gap of batch) {
        results.push({
          conceptId: gap.conceptId,
          conceptName: gap.conceptName,
          conceptType: gap.conceptType,
          gapType: gap.gapType,
          question: generateFallbackQuestion(gap),
          priority: gap.priority,
          context: gap.rawContext,
        });
      }
    }
  }

  return results;
}

/**
 * Generate a basic question without LLM as a fallback.
 */
function generateFallbackQuestion(gap) {
  switch (gap.gapType) {
    case 'missing_identity':
      return `What exactly is "${gap.conceptName}"? It comes up a lot but I don't have a clear definition for it.`;
    case 'thin_knowledge':
      return `Can you tell me more about "${gap.conceptName}"? I barely know anything about it.`;
    case 'missing_relationship':
      return `I'm missing some key details about "${gap.conceptName}" — ${gap.rawContext.replace(/^Missing common .* info: /, '')}`;
    case 'undescribed':
      return `"${gap.conceptName}" gets mentioned a lot but I don't really know what it is. Can you describe it?`;
    case 'stale':
      return `Is the information about "${gap.conceptName}" still current? It hasn't been updated in a while.`;
    default:
      return `Can you tell me more about "${gap.conceptName}"?`;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Detect knowledge gaps and generate natural questions to fill them.
 *
 * @param {string} teamId
 * @param {object} options
 * @param {string} [options.focus] - Narrow to concepts matching this term (fuzzy)
 * @param {number} [options.maxQuestions=10] - Max questions to return
 * @param {number} [options.staleDays=30] - Days before a concept is considered stale
 * @returns {Promise<Array>} Array of gap objects with natural questions
 */
export async function detectGaps(teamId, options = {}) {
  const { focus, maxQuestions = 10, staleDays = 30 } = options;

  console.log(`[KnowledgeGap] Detecting gaps for team ${teamId}${focus ? ` (focus: ${focus})` : ''}`);

  // Run all detection strategies in parallel
  const [missingIdentity, thinKnowledge, missingRelationships, undescribed, stale] = await Promise.all([
    detectMissingIdentity(teamId, focus),
    detectThinKnowledge(teamId, focus),
    detectMissingRelationships(teamId, focus),
    detectUndescribed(teamId, focus),
    detectStaleConcepts(teamId, focus, staleDays),
  ]);

  // Merge all gaps, deduplicate by conceptId (keep highest priority)
  const gapMap = new Map();

  const allGaps = [
    ...missingIdentity,
    ...thinKnowledge,
    ...missingRelationships,
    ...undescribed,
    ...stale,
  ];

  for (const gap of allGaps) {
    const key = `${gap.conceptId}:${gap.gapType}`;
    const existing = gapMap.get(key);
    if (!existing || gap.priority > existing.priority) {
      gapMap.set(key, gap);
    }
  }

  // Sort by priority descending, take top N
  const sortedGaps = Array.from(gapMap.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxQuestions);

  // Generate natural questions via LLM
  const gapsWithQuestions = await generateNaturalQuestions(sortedGaps);

  // Final sort and limit
  return gapsWithQuestions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxQuestions);
}

/**
 * Get high-level gap statistics for a team's knowledge graph.
 *
 * @param {string} teamId
 * @returns {Promise<object>} Summary stats
 */
export async function getGapSummary(teamId) {
  console.log(`[KnowledgeGap] Generating gap summary for team ${teamId}`);

  // Run all stat queries in parallel
  const [
    totalConceptsResult,
    totalTriplesResult,
    identityResult,
    thinResult,
    undescribedResult,
    staleResult,
    topAreasResult,
  ] = await Promise.all([
    // Total concepts
    db.query(`SELECT COUNT(*) AS count FROM concepts WHERE team_id = $1`, [teamId]),

    // Total active triples
    db.query(`SELECT COUNT(*) AS count FROM triples WHERE team_id = $1 AND status = 'active'`, [teamId]),

    // Concepts with vs without identity
    db.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN has_identity THEN concept_id END) AS with_identity,
        COUNT(DISTINCT CASE WHEN NOT has_identity THEN concept_id END) AS without_identity
      FROM (
        SELECT c.id AS concept_id,
          EXISTS (
            SELECT 1 FROM triples t
            WHERE t.subject_id = c.id AND t.team_id = $1 AND t.status = 'active'
              AND (
                LOWER(t.relationship) LIKE '%is a%'
                OR LOWER(t.relationship) LIKE '%is_a%'
                OR LOWER(t.relationship) LIKE '%type%'
                OR LOWER(t.relationship) LIKE '%described as%'
                OR LOWER(t.relationship) LIKE '%defined as%'
              )
          ) AS has_identity
        FROM concepts c
        WHERE c.team_id = $1
      ) sub
    `, [teamId]),

    // Thin concepts (product/company/person with < 3 triples)
    db.query(`
      SELECT COUNT(*) AS count
      FROM concepts c
      LEFT JOIN triples t ON (t.subject_id = c.id OR t.object_id = c.id)
        AND t.team_id = $1 AND t.status = 'active'
      WHERE c.team_id = $1
        AND LOWER(c.type) IN ('product', 'company', 'person', 'game', 'brand', 'organization', 'service')
      GROUP BY c.id
      HAVING COUNT(t.id) < 3
    `, [teamId]),

    // Undescribed (referenced 5+ as object, 0-1 as subject)
    db.query(`
      WITH object_counts AS (
        SELECT object_id AS concept_id, COUNT(*) AS ref_count
        FROM triples WHERE team_id = $1 AND status = 'active'
        GROUP BY object_id HAVING COUNT(*) >= 5
      ),
      subject_counts AS (
        SELECT subject_id AS concept_id, COUNT(*) AS desc_count
        FROM triples WHERE team_id = $1 AND status = 'active'
        GROUP BY subject_id
      )
      SELECT COUNT(*) AS count
      FROM object_counts oc
      LEFT JOIN subject_counts sc ON oc.concept_id = sc.concept_id
      WHERE COALESCE(sc.desc_count, 0) <= 1
    `, [teamId]),

    // Stale concepts (last triple > 30 days)
    db.query(`
      SELECT COUNT(*) AS count FROM (
        SELECT c.id
        FROM concepts c
        JOIN triples t ON (t.subject_id = c.id OR t.object_id = c.id)
          AND t.team_id = $1 AND t.status = 'active'
        WHERE c.team_id = $1
        GROUP BY c.id
        HAVING MAX(t.updated_at) < NOW() - INTERVAL '30 days'
           AND COUNT(t.id) >= 2
      ) stale
    `, [teamId]),

    // Top gap areas by concept type
    db.query(`
      SELECT COALESCE(NULLIF(c.type, ''), 'untyped') AS area, COUNT(*) AS gap_count
      FROM concepts c
      LEFT JOIN triples t ON t.subject_id = c.id AND t.team_id = $1 AND t.status = 'active'
      WHERE c.team_id = $1
      GROUP BY c.type
      HAVING COUNT(t.id) < 3
      ORDER BY gap_count DESC
      LIMIT 10
    `, [teamId]),
  ]);

  const totalConcepts = parseInt(totalConceptsResult.rows[0]?.count || 0);
  const totalTriples = parseInt(totalTriplesResult.rows[0]?.count || 0);
  const conceptsWithIdentity = parseInt(identityResult.rows[0]?.with_identity || 0);
  const conceptsWithoutIdentity = parseInt(identityResult.rows[0]?.without_identity || 0);
  const thinConcepts = thinResult.rows.length; // Each row is a concept that met the HAVING clause
  const undescribedConcepts = parseInt(undescribedResult.rows[0]?.count || 0);
  const staleConcepts = parseInt(staleResult.rows[0]?.count || 0);

  const topGapAreas = topAreasResult.rows.map(r => ({
    area: r.area,
    gapCount: parseInt(r.gap_count),
  }));

  return {
    totalConcepts,
    totalTriples,
    conceptsWithIdentity,
    conceptsWithoutIdentity,
    thinConcepts,
    undescribedConcepts,
    staleConcepts,
    topGapAreas,
  };
}

export default {
  detectGaps,
  getGapSummary,
};
