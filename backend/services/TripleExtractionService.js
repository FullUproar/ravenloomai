/**
 * TripleExtractionService - AI-powered extraction of triples from text
 *
 * Text → AI → structured triples (subject, relationship, object, contexts)
 * Resolves concepts against existing graph to prevent duplicates.
 * Detects conflicts with existing triples.
 */

import db from '../db.js';
import { generateEmbedding, callOpenAI } from './AIService.js';
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

Return ONLY a JSON object:
{
  "triples": [
    {
      "subject": { "name": "Entity Name", "type": "product" },
      "relationship": "launches on",
      "object": { "name": "May 1, 2026", "type": "date" },
      "contexts": [],
      "confidence": 0.95,
      "trustTier": "tribal"
    }
  ]
}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Extract knowledge triples from this text:\n\n${text}` }
  ];

  try {
    const response = await callOpenAI(messages, {
      model: 'gpt-4o',
      maxTokens: 2000,
      temperature: 0
    });

    let content = response;
    // Strip markdown code blocks if present
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(content);
    const triples = parsed.triples || [];

    // Generate display text for each triple
    return triples.map(t => ({
      ...t,
      displayText: `${t.subject.name} ${t.relationship} ${t.object.name}`,
      isNew: true // will be updated during concept resolution
    }));
  } catch (err) {
    console.error('[TripleExtraction] Extraction failed:', err.message);
    return [];
  }
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
export async function detectConflicts(teamId, extractedTriples) {
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
  // Very high similarity = likely duplicate
  if (similarity > 0.95) return 'duplicate';

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
  if (sameSubject && sameRelationship && similarity > 0.7) {
    return 'update';
  }

  // Same subject, different relationship but high similarity = potential update
  if (sameSubject && similarity > 0.8) {
    return 'update';
  }

  // High similarity but different meaning = contradiction
  if (similarity > 0.85) return 'contradiction';

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
