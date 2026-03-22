/**
 * RavenService - Clean Ask/Remember interface for triple-based knowledge
 *
 * Ask: Instant AI response using dual-embedding search + multi-hop traversal
 * Remember: Preview → Confirm flow producing structured triples
 *
 * This service orchestrates TripleExtractionService, TripleRetrievalService,
 * and TripleService to deliver the two core user-facing flows.
 */

import db from '../db.js';
import * as AIService from './AIService.js';
import * as ScopeService from './ScopeService.js';
import * as TripleService from './TripleService.js';
import * as TripleExtractionService from './TripleExtractionService.js';
import * as TripleRetrievalService from './TripleRetrievalService.js';
import * as ConfirmationEventService from './ConfirmationEventService.js';

// ============================================================================
// ASK (Instant read-only response)
// ============================================================================

/**
 * Ask Raven a question — searches triples via dual embeddings,
 * expands with multi-hop if needed, filters by context, generates answer.
 */
export async function ask(scopeId, userId, question, conversationHistory = []) {
  console.log(`[RavenService.ask] scopeId=${scopeId}, question="${question}"`);

  const scope = await ScopeService.getScopeById(scopeId);
  if (!scope) throw new Error('Scope not found');
  const teamId = scope.teamId;

  // Step 1: Conversation context — rewrite follow-ups as standalone
  let standaloneQuestion = question;
  if (TripleRetrievalService.looksLikeFollowUp(question) && conversationHistory.length > 0) {
    standaloneQuestion = await TripleRetrievalService.rewriteFollowUp(question, conversationHistory);
    console.log(`[RavenService.ask] Rewrote follow-up: "${standaloneQuestion}"`);
  }

  // Step 2: Get scope search IDs (current + ancestors)
  const searchScopeIds = await ScopeService.getSearchScopeIds(scopeId, userId, true);
  console.log(`[RavenService.ask] Searching ${searchScopeIds.length} scopes`);

  // Step 3: Dual-embedding search on triples table
  let triples = await TripleRetrievalService.searchTriples(teamId, standaloneQuestion, {
    scopeIds: searchScopeIds,
    topK: 15
  });
  console.log(`[RavenService.ask] Dual-embedding search found ${triples.length} triples`);

  // Step 3b: Fallback to old facts table if no triples found
  // (transitional — until all knowledge is migrated to triples)
  let legacyFacts = [];
  if (triples.length < 3) {
    try {
      const { default: KnowledgeService } = await import('./KnowledgeService.js');
      const knowledge = await KnowledgeService.getKnowledgeContext(teamId, standaloneQuestion);
      if (knowledge.facts?.length > 0) {
        legacyFacts = knowledge.facts;
        console.log(`[RavenService.ask] Legacy fallback found ${legacyFacts.length} facts`);
      }
    } catch (err) {
      console.error('[RavenService.ask] Legacy fallback error:', err.message);
    }
  }

  // Step 4: Multi-hop expansion if initial results are sparse
  if (triples.length > 0 && TripleRetrievalService.shouldExpand(triples)) {
    console.log(`[RavenService.ask] Expanding with multi-hop...`);
    const expanded = await TripleRetrievalService.multiHopExpand(teamId, triples, 2);
    console.log(`[RavenService.ask] Multi-hop found ${expanded.length} additional triples`);

    const existingIds = new Set(triples.map(t => t.id));
    const newTriples = expanded.filter(t => !existingIds.has(t.id));
    triples = [...triples, ...newTriples].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  }

  // Step 5: Filter low-similarity noise, then re-rank with LLM
  const filteredTriples = triples.filter(t => (t.similarity || 0) > 0.3);

  // Re-rank with lightweight LLM to ensure most relevant triples are first
  const reranked = await TripleRetrievalService.rerankTriples(standaloneQuestion, filteredTriples);
  const topTriples = reranked.slice(0, 8);

  // Step 6: Build answer context (combining triples + legacy facts)
  let answerContext = await TripleRetrievalService.buildAnswerContext(topTriples);

  // Append legacy facts if we have them
  if (legacyFacts.length > 0) {
    const legacyLines = legacyFacts.slice(0, 10).map(f =>
      `- ${f.content}${f.sourceQuote ? ` (Source: "${f.sourceQuote.substring(0, 100)}")` : ''}`
    );
    answerContext = answerContext
      ? `${answerContext}\n\nAdditional confirmed facts:\n${legacyLines.join('\n')}`
      : legacyLines.join('\n');
  }

  // Step 7: Generate answer
  const answer = await generateTripleBasedAnswer(standaloneQuestion, answerContext, topTriples);

  return {
    answer: answer.text,
    confidence: answer.confidence,
    triplesUsed: topTriples.map(t => ({
      id: t.id,
      displayText: t.displayText,
      subjectName: t.subjectName,
      relationship: t.relationship,
      objectName: t.objectName,
      sourceText: t.sourceText,
      sourceUrl: t.sourceUrl,
      createdAt: t.createdAt,
    })),
    // Backward compat: render triples as "facts" for existing consumers
    // If no triples, use legacy facts
    factsUsed: topTriples.length > 0
      ? topTriples.slice(0, 5).map(t => ({
          id: t.id,
          content: t.displayText,
          sourceQuote: t.sourceText,
          sourceUrl: t.sourceUrl,
          createdAt: t.createdAt,
        }))
      : legacyFacts.slice(0, 5).map(f => ({
          id: f.id,
          content: f.content,
          sourceQuote: f.sourceQuote || f.source_quote,
          sourceUrl: f.sourceUrl || f.source_url,
          createdAt: f.createdAt || f.created_at,
        })),
    suggestedFollowups: answer.followups || []
  };
}

/**
 * Generate answer from triple-based context.
 */
async function generateTripleBasedAnswer(question, answerContext, triples) {
  if (!answerContext && triples.length === 0) {
    return {
      text: "I don't have any confirmed knowledge about that yet.",
      confidence: 0,
      followups: []
    };
  }

  // If we have triples but no rendered context, build it now
  if (!answerContext && triples.length > 0) {
    answerContext = triples.map(t => `- ${t.displayText}`).join('\n');
  }

  const systemPrompt = `You are Raven, the institutional knowledge assistant.

STRICT RULES — FOLLOW EXACTLY:
1. Answer using ONLY the knowledge statements listed below. Do NOT add information from your training data.
2. If NONE of the knowledge below is relevant to the question, say "I don't have confirmed knowledge about that." But if ANY statements are relevant, use them to answer — even partial answers are better than "I don't know".
3. Every claim in your answer must be traceable to a specific knowledge statement below. If you can't point to it, don't say it.
4. CRITICAL: Do NOT merge or connect statements about different entities. "Company A has target X" and "Company B makes product Y" does NOT mean Company B has target X. Each statement is about the specific entities it names.
5. When connecting multiple facts (multi-hop), the connection must share a COMMON entity: "X is Y" + "Y is Z" → "X is Z" is valid. "X is Y" + "A is B" → nothing, different entities.
6. If contexts are listed, mention them: "as of [date]..." or "in the context of [context]..."
7. Be concise. No filler. No hedging beyond what's warranted by the data.

KNOWLEDGE STATEMENTS:
${answerContext}

After your answer, on a new line, return a JSON object:
{"confidence": 0.0-1.0, "followups": ["question 1", "question 2"]}

confidence = 0.0 if none of the knowledge is relevant, 1.0 if the knowledge fully answers the question.
If you said "I don't have confirmed knowledge", confidence should be 0.0-0.1.`;

  const response = await AIService.callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ], { model: 'gpt-4o', maxTokens: 800, temperature: 0.3 });

  return parseAnswerResponse(response);
}

/**
 * Parse LLM response into answer + confidence + followups.
 */
function parseAnswerResponse(response) {
  if (!response) return { text: "I wasn't able to generate an answer.", confidence: 0, followups: [] };

  // Try to find JSON at the end
  const jsonMatch = response.match(/\{[^{}]*"confidence"[^{}]*\}\s*$/);
  let confidence = 0.5;
  let followups = [];
  let text = response;

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      confidence = parsed.confidence || 0.5;
      followups = parsed.followups || [];
      text = response.substring(0, jsonMatch.index).trim();
    } catch {
      // Keep full response as text
    }
  }

  return { text, confidence, followups };
}

// ============================================================================
// REMEMBER: Preview (extract triples from text)
// ============================================================================

/**
 * Preview: extract triples from text for human review.
 */
export async function previewRemember(scopeId, userId, statement, sourceUrl = null) {
  console.log(`[RavenService.previewRemember] statement="${statement.substring(0, 100)}..."`);

  const scope = await ScopeService.getScopeById(scopeId);
  if (!scope) throw new Error('Scope not found');
  const teamId = scope.teamId;

  // Step 1: Mismatch detection
  const mismatch = TripleExtractionService.detectMismatch(statement);

  // Step 2: Load existing concepts for reference resolution
  const existingConcepts = await TripleService.getConcepts(teamId, { limit: 200 });

  // Step 3: AI extraction — text to triples
  const extractedTriples = await TripleExtractionService.extractTriples(statement, existingConcepts);
  console.log(`[RavenService.previewRemember] Extracted ${extractedTriples.length} triples`);

  // Step 4: Resolve concept references
  for (let i = 0; i < extractedTriples.length; i++) {
    extractedTriples[i] = await TripleExtractionService.resolveConceptReferences(teamId, extractedTriples[i]);
  }

  // Step 5: Detect conflicts
  const conflicts = await TripleExtractionService.detectConflicts(teamId, extractedTriples);
  console.log(`[RavenService.previewRemember] Found ${conflicts.length} conflicts`);

  // Step 6: Persist preview
  const result = await db.query(
    `INSERT INTO remember_previews
       (scope_id, team_id, user_id, source_text, source_url,
        extracted_triples, conflicts, is_mismatch, mismatch_suggestion, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING id`,
    [
      scopeId, teamId, userId, statement, sourceUrl,
      JSON.stringify(extractedTriples), JSON.stringify(conflicts),
      mismatch.isMismatch, mismatch.suggestion
    ]
  );

  return {
    previewId: result.rows[0].id,
    sourceText: statement,
    extractedTriples,
    // Backward compat: render triples as extractedFacts for old consumers
    extractedFacts: extractedTriples.map(t => ({
      content: t.displayText,
      entityType: typeof t.subject === 'object' ? t.subject.type : t.subjectType,
      entityName: typeof t.subject === 'object' ? t.subject.name : t.subject,
      category: null,
      confidenceScore: t.confidence,
      contextTags: (t.contexts || []).map(c => typeof c === 'object' ? c.name : c),
    })),
    conflicts: conflicts.map(c => ({
      ...c,
      // Backward compat: map existingTriple to existingFact
      existingFact: c.existingTriple ? {
        id: c.existingTriple.id,
        content: c.existingTriple.displayText,
        createdAt: c.existingTriple.createdAt,
      } : null,
    })),
    isMismatch: mismatch.isMismatch,
    mismatchSuggestion: mismatch.suggestion
  };
}

// ============================================================================
// REMEMBER: Confirm (save triples to graph)
// ============================================================================

/**
 * Confirm: create concepts and triples from a preview.
 */
export async function confirmRemember(previewId, skipConflictIds = [], confirmingUserId = null) {
  console.log(`[RavenService.confirmRemember] previewId=${previewId}`);

  const previewResult = await db.query(
    `SELECT * FROM remember_previews WHERE id = $1 AND status = 'pending'`,
    [previewId]
  );
  if (previewResult.rows.length === 0) throw new Error('Preview not found or expired');

  const row = previewResult.rows[0];
  const teamId = row.team_id;
  const scopeId = row.scope_id;
  const userId = row.user_id;
  const sourceText = row.source_text;
  const sourceUrl = row.source_url;
  const extractedTriples = row.extracted_triples || [];
  const conflicts = row.conflicts || [];
  const confirmer = confirmingUserId || userId;

  const triplesCreated = [];
  const triplesUpdated = [];
  const conceptsCreated = [];
  const skipIds = new Set(skipConflictIds || []);

  for (const extracted of extractedTriples) {
    // Check for conflicts
    const conflict = conflicts.find(c =>
      c.extractedTriple?.displayText === extracted.displayText &&
      !skipIds.has(c.existingTriple?.id)
    );

    // Skip duplicates
    if (conflict && conflict.conflictType === 'duplicate') {
      await ConfirmationEventService.logConflictOverride({
        previewId, existingFactId: conflict.existingTriple.id,
        newFactId: null, conflictType: 'duplicate',
        userDecision: 'skip', userId: confirmer
      }).catch(() => {});
      continue;
    }

    // Handle updates: supersede existing triple
    if (conflict && conflict.conflictType === 'update' && conflict.existingTriple?.id) {
      await TripleService.archiveTriple(conflict.existingTriple.id);
    }

    // Step 1: Upsert subject concept
    const subjectConcept = await TripleService.upsertConcept(teamId, {
      name: extracted.subject.name,
      type: extracted.subject.type,
      scopeId
    });
    if (subjectConcept.isNew) conceptsCreated.push(subjectConcept);

    // Step 2: Upsert object concept
    const objectConcept = await TripleService.upsertConcept(teamId, {
      name: extracted.object.name,
      type: extracted.object.type,
      scopeId
    });
    if (objectConcept.isNew) conceptsCreated.push(objectConcept);

    // Step 3: Upsert context nodes
    const contextNodeIds = [];
    for (const ctx of (extracted.contexts || [])) {
      const ctxNode = await TripleService.upsertContextNode(teamId, {
        name: ctx.name,
        type: ctx.type
      });
      contextNodeIds.push(ctxNode);
    }

    // Step 4: Create triple with dual embeddings
    const triple = await TripleService.createTriple(teamId, scopeId, {
      subjectId: subjectConcept.id,
      relationship: extracted.relationship,
      objectId: objectConcept.id,
      contexts: contextNodeIds,
      sourceText,
      sourceUrl,
      createdBy: userId,
      confidence: extracted.confidence || 0.8,
      trustTier: extracted.trustTier || 'tribal',
    });

    if (conflict && conflict.conflictType === 'update') {
      triplesUpdated.push(triple);
    } else {
      triplesCreated.push(triple);
    }

    // Step 5: Log confirmation event
    await ConfirmationEventService.logConfirmationEvent({
      teamId, previewId, tripleId: triple.id,
      confirmingUserId: confirmer, statingUserId: userId,
      outcome: 'confirmed', originalContent: extracted.displayText,
      responseTimeMs: Date.now() - new Date(row.created_at).getTime()
    }).catch(err => console.error('[confirmRemember] Event logging error:', err.message));
  }

  // Log skipped conflicts
  for (const skipId of skipIds) {
    const skippedConflict = conflicts.find(c => c.existingTriple?.id === skipId);
    if (skippedConflict) {
      await ConfirmationEventService.logConflictOverride({
        previewId, existingFactId: skipId,
        newFactId: null, conflictType: skippedConflict.conflictType,
        userDecision: 'keep_existing', userId: confirmer
      }).catch(() => {});
    }
  }

  // Mark preview as confirmed
  await db.query(
    `UPDATE remember_previews SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`,
    [previewId]
  );

  return {
    success: true,
    triplesCreated,
    triplesUpdated,
    conceptsCreated,
    // Backward compat
    factsCreated: triplesCreated.map(t => ({ id: t.id, content: t.displayText })),
    factsUpdated: triplesUpdated.map(t => ({ id: t.id, content: t.displayText })),
    nodeCreated: conceptsCreated[0] ? { id: conceptsCreated[0].id, name: conceptsCreated[0].name, type: conceptsCreated[0].type } : null,
    message: `Created ${triplesCreated.length} triple(s), updated ${triplesUpdated.length} triple(s), ${conceptsCreated.length} new concept(s)`
  };
}

// ============================================================================
// CANCEL
// ============================================================================

export async function cancelRemember(previewId) {
  const result = await db.query(
    `UPDATE remember_previews SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
    [previewId]
  );
  return result.rowCount > 0;
}

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

/**
 * Get fact count — returns triple count for backward compat.
 */
export async function getFactCount(teamId) {
  return TripleService.getTripleCount(teamId);
}

/**
 * Get facts — returns triples rendered as flat facts for backward compat.
 */
export async function getFacts(teamId, { category, limit = 100 } = {}) {
  const triples = await TripleService.getTriples(teamId, { limit });
  return triples.map(t => ({
    id: t.id,
    content: t.displayText,
    category: null,
    entityType: t.subjectType,
    entityName: t.subjectName,
    sourceQuote: t.sourceText,
    sourceUrl: t.sourceUrl,
    trustTier: t.trustTier,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
  }));
}

export default {
  ask,
  previewRemember,
  confirmRemember,
  cancelRemember,
  getFactCount,
  getFacts,
};
