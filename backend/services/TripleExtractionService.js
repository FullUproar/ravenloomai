/**
 * TripleExtractionService - AI-powered extraction of triples from text
 *
 * Text → AI → structured triples (subject, relationship, object, contexts)
 * Resolves concepts against existing graph to prevent duplicates.
 * Detects conflicts with existing triples.
 */

import db from '../db.js';
import { generateEmbedding, callOpenAI, callClaude } from './AIService.js';
import * as TripleService from './TripleService.js';

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Extract triples from raw text using GPT-4o.
 *
 * @param {string} text - raw text (Slack thread, meeting notes, etc.)
 * @param {Array} existingConcepts - existing concepts for reference resolution
 * @returns {Array} extracted triples with subject/relationship/object/contexts
 */
export async function extractTriples(text, existingConcepts = []) {
  const conceptList = existingConcepts
    .slice(0, 100) // cap to avoid token overflow
    .map(c => `${c.name} (${c.type})`)
    .join(', ');

  const systemPrompt = `You are a knowledge extraction engine that produces structured triples.

A triple is the atom of knowledge: (Subject --relationship--> Object) with optional Contexts.

RULES:
1. Extract INSTITUTIONAL knowledge only — things specific to this organization.
   DO NOT extract universal knowledge that any AI already knows (e.g., "Blue is a color", "A CEO runs a company").
   When in doubt, include it — it can be pruned later.

2. Each triple must have:
   - subject: { name, type } — the thing being described
   - relationship: a verb phrase (e.g., "launches on", "is manufactured by", "works with", "is a type of")
   - object: { name, type } — what the subject relates to
   - contexts: optional array of { name, type } — conditions under which this triple is true
   - confidence: 0.0-1.0 how certain you are this was stated (not inferred)
   - trustTier: "official" (from canonical docs) or "tribal" (from conversation/flow of work)
   - isCore: boolean — true ONLY for foundational/defining facts (what something IS, key dates, primary relationships). Most triples are NOT core. Core = removing it would fundamentally change understanding of the subject.

3. Concept types: person, product, company, concept, date, event, location
4. Context types: temporal, spatial, organizational, conditional, audience, formality, work_stage

5. CONTEXTS are conditions that make the triple true in a specific situation.
   Most triples have NO contexts (they're unconditionally true within this organization).
   Only add contexts when the statement is explicitly conditional.
   Examples:
   - "Our booth is #1847 at Gen Con 2026" → context: { name: "Gen Con 2026", type: "temporal" }
   - "We use Net 30 for Client X" → context: { name: "Client X", type: "organizational" }

6. Prefer REUSING existing concepts when possible. Here are known concepts:
   ${conceptList || '(none yet)'}
   Match by name (case-insensitive). If an existing concept fits, use its exact name.

7. EXTRACT EVERY FACT, even from dense lists. If input says "Products: A ($10), B ($20), C ($30)"
   you should produce separate triples for EACH product and EACH price:
   - A is a product, A is priced at $10, B is a product, B is priced at $20, etc.
   Don't summarize or skip items in a list. Each item = separate triples.

8. Prefer atomic triples. Split compound statements:
   "A is X and Y" → two triples: "A is X" and "A is Y"

9. Relationships should be natural verb phrases, not uppercase codes.
   Good: "launches on", "is manufactured by", "includes"
   Bad: "LAUNCHES_ON", "IS_A", "HAS"

Return ONLY a raw JSON object (no markdown, no \`\`\`json blocks, no explanation):
{"triples": [{"subject": {"name": "Entity Name", "type": "product"}, "relationship": "launches on", "object": {"name": "May 1, 2026", "type": "date"}, "contexts": [], "confidence": 0.95, "trustTier": "tribal", "isCore": true}]}`;

  // Detect explicit update/correction language and add extraction guidance
  const isExplicitUpdate = /^(update|correction|revised|fyi|heads up)[\s:]/i.test(text.trim())
    || /\b(pushed back to|moved to|changed to|switched to|now using|rescheduled to|revised to)\b/i.test(text);
  const updateGuidance = isExplicitUpdate
    ? `\n\nIMPORTANT: This text describes an UPDATE or CHANGE. Extract the NEW state as the triple.
Example: "Launch pushed back to September 15" → "X launches on September 15" (the new date).
Also extract WHY it changed if stated (e.g., "due to manufacturing delays" → separate triple).`
    : '';

  const messages = [
    { role: 'system', content: systemPrompt + updateGuidance },
    { role: 'user', content: `Extract knowledge triples from this text:\n\n${text}` }
  ];

  try {
    const response = await callClaude(messages, {
      model: 'claude-sonnet-4-6',
      maxTokens: 4000,
      temperature: 0
    });

    let content = (response || '').trim();
    // Strip markdown code blocks if present (handles ```json, ``` json, etc.)
    const codeBlockMatch = content.match(/```\s*(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1].trim();
    }
    // Also try to extract just the JSON object/array if surrounded by other text
    if (!content.startsWith('{') && !content.startsWith('[')) {
      const jsonStart = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonStart) content = jsonStart[1];
    }

    const parsed = JSON.parse(content);
    const triples = parsed.triples || [];

    // Generate display text for each triple
    const extracted = triples.map(t => ({
      ...t,
      displayText: `${t.subject.name} ${t.relationship} ${t.object.name}`,
      isNew: true
    }));

    // Post-extraction: detect fan-out patterns and introduce category nodes
    return detectAndInsertHierarchy(extracted);
  } catch (err) {
    console.error('[TripleExtraction] Extraction failed:', err.message);
    return [];
  }
}

/**
 * Detect fan-out patterns in extracted triples and auto-create intermediate categories.
 *
 * Pattern: 3+ triples from the same subject with semantically similar relationships
 * → introduce a category node to prevent star topology.
 *
 * Example: FUG → uses for payments → Stripe, FUG → uses for hosting → Vercel, FUG → uses for SMS → Twilio
 * Becomes: FUG → has technology stack, Technology Stack → includes → Stripe, etc.
 */
async function detectAndInsertHierarchy(triples) {
  if (triples.length < 4) return triples; // too few to cluster

  // Group triples by subject
  const bySubject = new Map();
  for (const t of triples) {
    const key = t.subject.name.toLowerCase();
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(t);
  }

  const result = [];
  for (const [subjectKey, group] of bySubject) {
    if (group.length < 4) {
      result.push(...group);
      continue;
    }

    // Cluster relationships by semantic similarity (LLM-powered)
    const clusters = await clusterRelationships(group);

    for (const cluster of clusters) {
      if (cluster.triples.length >= 3 && cluster.categoryName) {
        // Fan-out detected — introduce category node
        const subject = cluster.triples[0].subject;

        // Issue 3 fix: Bridge edge inherits average confidence from its children
        // If children are 95-99% confident, the bridge should be too
        const childConfidences = cluster.triples.map(t => t.confidence || 0.8);
        const avgChildConfidence = childConfidences.reduce((a, b) => a + b, 0) / childConfidences.length;
        const bridgeConfidence = Math.max(0.85, avgChildConfidence * 0.98); // Slight discount, floor at 0.85

        // Add: Subject → has → Category
        result.push({
          subject,
          relationship: `has ${cluster.categoryName.toLowerCase()}`,
          object: { name: cluster.categoryName, type: 'concept' },
          contexts: [],
          confidence: bridgeConfidence,
          trustTier: 'tribal',
          isCore: false,
          displayText: `${subject.name} has ${cluster.categoryName.toLowerCase()}`,
          isNew: true,
          _isAutoCategory: true,
        });

        // Add: Category → includes → each Object
        for (const t of cluster.triples) {
          result.push({
            subject: { name: cluster.categoryName, type: 'concept' },
            relationship: t.relationship,
            object: t.object,
            contexts: t.contexts || [],
            confidence: t.confidence,
            trustTier: t.trustTier,
            isCore: t.isCore,
            displayText: `${cluster.categoryName} ${t.relationship} ${t.object.name}`,
            isNew: true,
          });
        }
      } else {
        // Not enough to cluster — keep originals
        result.push(...cluster.triples);
      }
    }
  }

  return result;
}

/**
 * Cluster triples by relationship similarity using LLM.
 * Groups semantically similar relationships and infers category names.
 */
async function clusterRelationships(group) {
  // If small enough, use LLM to cluster properly
  if (group.length >= 4 && group.length <= 30) {
    try {
      const items = group.map((t, i) =>
        `${i + 1}. ${t.subject.name} → ${t.relationship} → ${t.object.name}`
      ).join('\n');

      const response = await callOpenAI([
        {
          role: 'system',
          content: `You are analyzing triples extracted from text. Group them by semantic theme.

Return JSON: {"clusters": [{"name": "Category Name", "indices": [1, 2, 3]}]}

Rules:
- Only create a cluster if 3+ triples share a semantic theme
- The "name" should be a noun phrase that describes the group (e.g., "Technology Stack", "Product Portfolio", "Team Roles")
- Triples that don't fit any cluster should go in a cluster named null
- Be conservative — only cluster things that genuinely belong together`
        },
        { role: 'user', content: `Group these triples:\n${items}` }
      ], { model: 'gpt-4o-mini', maxTokens: 200, temperature: 0 });

      const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
      const clusters = [];
      const used = new Set();

      for (const c of (parsed.clusters || [])) {
        const clusterTriples = (c.indices || [])
          .map(i => group[i - 1])
          .filter(Boolean);
        clusterTriples.forEach((_, i) => used.add(c.indices[i] - 1));
        clusters.push({ triples: clusterTriples, categoryName: c.name || null });
      }

      // Add unclustered triples
      const unclustered = group.filter((_, i) => !used.has(i));
      if (unclustered.length > 0) {
        clusters.push({ triples: unclustered, categoryName: null });
      }

      return clusters;
    } catch {
      // Fallback to simple clustering
    }
  }

  // Fallback: no clustering (treat all as one group)
  return [{ triples: group, categoryName: null }];
}

// ============================================================================
// CONCEPT RESOLUTION
// ============================================================================

/**
 * Resolve extracted triple concepts against existing concepts.
 * Uses canonical name matching first, then embedding similarity fallback.
 *
 * @returns triple with resolved subjectId/objectId (null if new concept)
 */
export async function resolveConceptReferences(teamId, extractedTriple) {
  const resolved = { ...extractedTriple, subjectId: null, objectId: null, newConcepts: [] };

  // Resolve subject
  const existingSubject = await TripleService.findConceptByName(
    teamId, extractedTriple.subject.name, extractedTriple.subject.type
  );
  if (existingSubject) {
    resolved.subjectId = existingSubject.id;
  } else {
    // Try fuzzy match — search by embedding
    const fuzzySubject = await fuzzyConceptMatch(teamId, extractedTriple.subject.name, extractedTriple.subject.type);
    if (fuzzySubject) {
      resolved.subjectId = fuzzySubject.id;
      resolved.subject.name = fuzzySubject.name; // use canonical name
    } else {
      resolved.newConcepts.push(extractedTriple.subject);
    }
  }

  // Resolve object
  const existingObject = await TripleService.findConceptByName(
    teamId, extractedTriple.object.name, extractedTriple.object.type
  );
  if (existingObject) {
    resolved.objectId = existingObject.id;
  } else {
    const fuzzyObject = await fuzzyConceptMatch(teamId, extractedTriple.object.name, extractedTriple.object.type);
    if (fuzzyObject) {
      resolved.objectId = fuzzyObject.id;
      resolved.object.name = fuzzyObject.name;
    } else {
      resolved.newConcepts.push(extractedTriple.object);
    }
  }

  resolved.isNew = !resolved.subjectId || !resolved.objectId;
  return resolved;
}

/**
 * Fuzzy concept match using embedding similarity.
 * Only returns a match if similarity is very high (>0.92).
 */
async function fuzzyConceptMatch(teamId, name, type) {
  const embedding = await generateEmbedding(`${name} (${type})`);
  if (!embedding) return null;

  const result = await db.query(`
    SELECT *, 1 - (embedding <=> $1) AS similarity
    FROM concepts
    WHERE team_id = $2 AND embedding IS NOT NULL AND type = $3
    ORDER BY embedding <=> $1
    LIMIT 1
  `, [`[${embedding.join(',')}]`, teamId, type]);

  const match = result.rows[0];
  if (match && parseFloat(match.similarity) > 0.92) {
    return { id: match.id, name: match.name, similarity: parseFloat(match.similarity) };
  }
  return null;
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Detect conflicts between extracted triples and existing knowledge.
 * Searches for existing triples with similar subject+object but different values.
 */
export async function detectConflicts(teamId, extractedTriples, userId = null) {
  const conflicts = [];

  for (const triple of extractedTriples) {
    // Search for existing triples with similar display text
    const embedding = await generateEmbedding(triple.displayText);
    if (!embedding) continue;

    const result = await db.query(`
      SELECT t.*, s.name AS subject_name, s.type AS subject_type,
             o.name AS object_name, o.type AS object_type,
             1 - (t.embedding_without_context <=> $1) AS similarity
      FROM triples t
      JOIN concepts s ON t.subject_id = s.id
      JOIN concepts o ON t.object_id = o.id
      WHERE t.team_id = $2 AND t.status = 'active'
        AND t.embedding_without_context IS NOT NULL
      ORDER BY t.embedding_without_context <=> $1
      LIMIT 3
    `, [`[${embedding.join(',')}]`, teamId]);

    for (const existing of result.rows) {
      const similarity = parseFloat(existing.similarity);
      if (similarity < 0.7) continue;

      // Tag triple with userId for conflict classification
      triple._userId = userId;
      // Classify the conflict
      const conflictType = classifyConflict(triple, existing, similarity);
      if (conflictType !== 'none') {
        conflicts.push({
          extractedTriple: triple,
          existingTriple: {
            id: existing.id,
            displayText: existing.display_text,
            subjectName: existing.subject_name,
            relationship: existing.relationship,
            objectName: existing.object_name,
            confidence: existing.confidence,
          },
          conflictType,
          similarity,
          explanation: generateConflictExplanation(conflictType, triple, existing)
        });
      }
    }
  }

  return conflicts;
}

/**
 * Classify conflict type: contradiction, update, duplicate, or none.
 */
function classifyConflict(newTriple, existingRow, similarity) {
  // Very high similarity = check if it's a true duplicate or a value-changing update
  if (similarity > 0.95) {
    // If the objects are different, this is an update (same structure, new value)
    const newObj = (typeof newTriple.object === 'object' ? newTriple.object.name : newTriple.object || '').toLowerCase();
    const existObj = (existingRow.object_name || '').toLowerCase();
    if (newObj !== existObj && newObj.length > 0 && existObj.length > 0) {
      return 'update'; // Same structure but different value = supersession
    }
    return 'duplicate';
  }

  const newSubject = (typeof newTriple.subject === 'object' ? newTriple.subject.name : newTriple.subject || '').toLowerCase();
  const existSubject = (existingRow.subject_name || '').toLowerCase();

  // Check subject overlap (fuzzy — one contains the other)
  const sameSubject = newSubject === existSubject
    || newSubject.includes(existSubject) || existSubject.includes(newSubject);

  // Check relationship overlap (fuzzy — similar verb phrases)
  const newRel = (newTriple.relationship || '').toLowerCase();
  const existRel = (existingRow.relationship || '').toLowerCase();
  const sameRelationship = newRel === existRel
    || newRel.includes(existRel) || existRel.includes(newRel)
    || (newRel.includes('launch') && existRel.includes('launch'))
    || (newRel.includes('manufactur') && existRel.includes('manufactur'))
    || (newRel.includes('price') && existRel.includes('price'))
    || (newRel.includes('schedul') && existRel.includes('schedul'));

  // Same subject + similar relationship = update (most common)
  // BUT: if different users stated this, it's a contradiction (not an update)
  const newUserId = newTriple._userId || null;
  const existUserId = existingRow.created_by || null;
  const sameUser = newUserId && existUserId && newUserId === existUserId;
  const differentUser = newUserId && existUserId && newUserId !== existUserId;

  if (sameSubject && sameRelationship && similarity > 0.7) {
    // Different users disagree = contradiction, not update
    if (differentUser) return 'contradiction';
    return 'update';
  }

  // Same subject, different relationship but high similarity = potential update
  if (sameSubject && similarity > 0.8) {
    if (differentUser) return 'contradiction';
    return 'update';
  }

  // Detect temporal supersession patterns in the input text
  const newDisplay = (newTriple.displayText || '').toLowerCase();
  const hasUpdateSignal = /\b(update|pushed back|moved to|changed to|now |switched|new date|rescheduled|revised|corrected)\b/.test(newDisplay)
    || /\b(update|pushed back|moved to|changed to|now |switched|new date|rescheduled|revised|corrected)\b/.test(
      (typeof newTriple.object === 'object' ? newTriple.object.name : newTriple.object || '').toLowerCase()
    );
  if (sameSubject && hasUpdateSignal && similarity > 0.6) {
    return 'update';
  }

  // High similarity but different meaning = contradiction
  if (similarity > 0.85) return 'contradiction';

  // Same subject + similar object type (e.g., both dates) = likely update
  const newObjType = (typeof newTriple.object === 'object' ? newTriple.object.type : '').toLowerCase();
  const existObjType = (existingRow.object_type || '').toLowerCase();
  if (sameSubject && newObjType === existObjType && ['date', 'location', 'company', 'person'].includes(newObjType) && similarity > 0.6) {
    return 'update';
  }

  return 'none';
}

/**
 * Generate human-readable conflict explanation.
 */
function generateConflictExplanation(conflictType, newTriple, existingRow) {
  switch (conflictType) {
    case 'duplicate':
      return `This appears to be the same as: "${existingRow.display_text}"`;
    case 'update':
      return `This may update existing knowledge: "${existingRow.display_text}"`;
    case 'contradiction':
      return `This may contradict: "${existingRow.display_text}"`;
    default:
      return '';
  }
}

// ============================================================================
// MISMATCH DETECTION
// ============================================================================

/**
 * Detect if the input is a question rather than a statement.
 * (Questions should go to Ask, not Remember)
 */
export function detectMismatch(text) {
  const trimmed = text.trim();
  const isQuestion = /^(what|when|where|who|why|how|is|are|do|does|can|will|should|could|would|did)\b/i.test(trimmed)
    || trimmed.endsWith('?');

  return {
    isMismatch: isQuestion,
    suggestion: isQuestion ? 'This looks like a question. Did you mean to use Ask instead?' : null
  };
}

export default {
  extractTriples,
  resolveConceptReferences,
  detectConflicts,
  detectMismatch,
};
