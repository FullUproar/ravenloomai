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
import * as TrustService from './TrustService.js';
import * as UserModelService from './UserModelService.js';
import * as SSTService from './SSTService.js';

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

  // Step 2a: SST routing — narrow search to the most relevant part of the graph
  let sstNode = null;
  try {
    const route = await SSTService.routeQuery(teamId, standaloneQuestion);
    if (route && route.confidence > 0.45) {
      sstNode = route.node;
      console.log(`[RavenService.ask] SST routed to "${sstNode.name}" (${route.method}, confidence ${route.confidence.toFixed(2)})`);
    }
  } catch (err) {
    console.error('[RavenService.ask] SST routing error:', err.message);
  }

  // Step 2b: Query execution planning — decides retrieval strategy
  // Triggers for anything beyond simple factual lookups
  let queryPlan = null;
  // Always classify — the LLM planner is fast (~200ms) and returns null for simple factual queries
  const needsPlanning = true;
  if (needsPlanning) {
    try {
      queryPlan = await TripleRetrievalService.planQuery(teamId, standaloneQuestion, searchScopeIds);
      if (queryPlan) {
        console.log(`[RavenService.ask] Query plan: ${queryPlan.queryType}${queryPlan.precomputedData ? ` (precomputed)` : ''}`);
        if (queryPlan.warnSlowQuery) {
          console.log(`[RavenService.ask] Slow query warning — deep/broad search`);
        }
      }
    } catch (err) {
      console.error('[RavenService.ask] Query planning error:', err.message);
    }
  }

  // ── Traversal tracking ──────────────────────────────────────────────
  const traversalSteps = [];
  const traversalStart = Date.now();

  // For exhaustive/timeline plans, skip normal embedding search — the scan has the data
  // NOTE: Never skip for 'listing' — listing queries need collection expansion to traverse hierarchies
  const skipEmbeddingSearch = queryPlan?.precomputedData && ['exhaustive', 'timeline', 'cross_domain'].includes(queryPlan.queryType);

  // Step 3: Dual-embedding search on triples table (skip if plan already scanned)
  let triples = skipEmbeddingSearch ? [] : await TripleRetrievalService.searchTriples(teamId, standaloneQuestion, {
    scopeIds: searchScopeIds,
    sstNodeId: sstNode?.id || null,
    topK: 15
  });
  console.log(`[RavenService.ask] Dual-embedding search found ${triples.length} triples`);

  // Track: initial embedding search results
  traversalSteps.push({
    phase: 'embedding_search',
    timestamp: Date.now() - traversalStart,
    nodesVisited: triples.map(t => ({
      id: t.id, subjectId: t.subjectId || t.subject_id,
      objectId: t.objectId || t.object_id,
      subjectName: t.subjectName || t.subject_name,
      objectName: t.objectName || t.object_name,
      relationship: t.relationship,
      similarity: t.similarity,
      displayText: t.displayText || t.display_text,
    })),
  });

  // Step 3b: Fallback to old facts table if no triples found
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

  // Step 4: Multi-hop expansion — ALWAYS expand when we have seed results
  // The expansion function has its own controls (maxHops, limits, hub handling)
  let multiHopTriples = [];
  if (triples.length > 0) {
    console.log(`[RavenService.ask] Expanding with multi-hop (${triples.length} seeds)...`);
    const expanded = await TripleRetrievalService.multiHopExpand(teamId, triples, 3);
    console.log(`[RavenService.ask] Multi-hop found ${expanded.length} additional triples`);

    const existingIds = new Set(triples.map(t => t.id));
    multiHopTriples = expanded.filter(t => !existingIds.has(t.id));
    triples = [...triples, ...multiHopTriples].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    if (multiHopTriples.length > 0) {
      traversalSteps.push({
        phase: 'multi_hop',
        timestamp: Date.now() - traversalStart,
        nodesVisited: multiHopTriples.map(t => ({
          id: t.id, subjectId: t.subjectId || t.subject_id,
          objectId: t.objectId || t.object_id,
          subjectName: t.subjectName || t.subject_name,
          objectName: t.objectName || t.object_name,
          relationship: t.relationship,
          similarity: t.similarity,
          displayText: t.displayText || t.display_text,
        })),
      });
    }
  }

  // Step 4b: MANDATORY collection expansion — follow category/collection edges explicitly
  // This is the "mandatory second hop" for hierarchical structures.
  // When we find nodes connected by containment relationships, fetch their children AND grandchildren.
  const collectionExpanded = await expandCollectionNodes(teamId, triples);
  if (collectionExpanded.length > 0) {
    const existingIds = new Set(triples.map(t => t.id));
    const newFromCollection = collectionExpanded.filter(t => !existingIds.has(t.id));
    console.log(`[RavenService.ask] Collection expansion found ${newFromCollection.length} additional triples`);
    triples = [...triples, ...newFromCollection].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    if (newFromCollection.length > 0) {
      traversalSteps.push({
        phase: 'collection_expand',
        timestamp: Date.now() - traversalStart,
        nodesVisited: newFromCollection.map(t => ({
          id: t.id, subjectId: t.subjectId || t.subject_id,
          objectId: t.objectId || t.object_id,
          subjectName: t.subjectName || t.subject_name,
          objectName: t.objectName || t.object_name,
          relationship: t.relationship,
          similarity: t.similarity,
          displayText: t.displayText || t.display_text,
        })),
      });
    }
  }

  // Step 5: Filter low-similarity noise, then re-rank with LLM
  const filteredTriples = triples.filter(t => (t.similarity || 0) > 0.3);
  const reranked = await TripleRetrievalService.rerankTriples(standaloneQuestion, filteredTriples);
  const topTriples = reranked.slice(0, 15);

  // Track: final selected triples
  traversalSteps.push({
    phase: 'selected',
    timestamp: Date.now() - traversalStart,
    nodesVisited: topTriples.map(t => ({
      id: t.id, subjectId: t.subjectId || t.subject_id,
      objectId: t.objectId || t.object_id,
      subjectName: t.subjectName || t.subject_name,
      objectName: t.objectName || t.object_name,
      relationship: t.relationship,
      similarity: t.similarity,
      displayText: t.displayText || t.display_text,
    })),
  });

  // Step 6: Build answer context (combining triples + legacy facts + precomputed data)
  let answerContext = await TripleRetrievalService.buildAnswerContext(topTriples);

  // Inject precomputed data from query plan — but ONLY when triple search didn't find enough
  // For listing queries, the triple search + collection expansion is more accurate than the
  // graph scan (which searches by concept type and often finds wrong entities)
  const tripleSearchSufficient = topTriples.length >= 5;
  if (queryPlan?.precomputedData && !(tripleSearchSufficient && queryPlan.queryType === 'listing')) {
    const pd = queryPlan.precomputedData;
    let planContext = '';
    if (pd.type === 'count') {
      planContext = `\n\nGRAPH SCAN RESULT: There are exactly ${pd.count} items matching the query: ${pd.names.join(', ')}`;
    } else if (pd.type === 'list') {
      planContext = `\n\nADDITIONAL CONTEXT from graph scan (${pd.items.length} items found). Use these ONLY if they are relevant to the question — prioritize the knowledge statements above:\n${pd.items.map(i => {
        const details = i.triples?.length > 0 ? `\n    ${i.triples.join('\n    ')}` : '';
        return `- ${i.name} (${i.type}, ${i.triple_count} connections)${details}`;
      }).join('\n')}`;
    } else if (pd.type === 'comparison') {
      planContext = `\n\nCOMPARISON DATA:\n${pd.comparisons.map(c =>
        `${c.concept}:\n${c.triples.map(t => `  - ${t}`).join('\n')}`
      ).join('\n\n')}`;
    } else if (pd.type === 'exhaustive') {
      planContext = `\n\nCOMPREHENSIVE SCAN (${pd.count} facts found):\n${pd.triples.map(t => `- ${t}`).join('\n')}`;
    } else if (pd.type === 'timeline') {
      planContext = `\n\nTIMELINE SCAN (${pd.count} dated events):\n${pd.events.map(e => `- ${e.event} ${e.relationship} ${e.date}`).join('\n')}`;
    } else if (pd.type === 'cross_domain') {
      planContext = `\n\nCROSS-DOMAIN ANALYSIS:\n${pd.domains.map(d =>
        `${d.domain.toUpperCase()} (${d.triples.length} facts):\n${d.triples.map(t => `  - ${t}`).join('\n')}`
      ).join('\n\n')}`;
    }
    answerContext = (answerContext || '') + planContext;
  }

  // Append legacy facts if we have them
  if (legacyFacts.length > 0) {
    const legacyLines = legacyFacts.slice(0, 10).map(f =>
      `- ${f.content}${f.sourceQuote ? ` (Source: "${f.sourceQuote.substring(0, 100)}")` : ''}`
    );
    answerContext = answerContext
      ? `${answerContext}\n\nAdditional confirmed facts:\n${legacyLines.join('\n')}`
      : legacyLines.join('\n');
  }

  // Step 7: Apply user model to answer generation
  let userModelPrompt = '';
  try {
    const userModel = await UserModelService.getUserModel(teamId, userId);
    userModelPrompt = UserModelService.applyUserModel(userModel);
  } catch { /* user model is best-effort */ }

  // Step 8: Generate answer
  const answer = await generateTripleBasedAnswer(standaloneQuestion, answerContext, topTriples, userModelPrompt);

  // Step 9: Extract user model traits from this interaction (fire-and-forget)
  // User model trait extraction disabled — creates noise triples about 'this_user'
  // TODO: re-enable when extraction quality is improved
  // UserModelService.extractUserTraits(teamId, userId, {
  //   type: 'ask', content: question,
  //   topics: topTriples.slice(0, 3).map(t => t.subjectName).filter(Boolean),
  // }).catch(() => {});

  // Step 10: Learn aliases from the query (fire-and-forget)
  learnAliasesFromQuery(teamId, standaloneQuestion, topTriples).catch(() => {});

  // Step 11: Recall reinforcement — increment recall_count, auto-protect at 3+
  if (topTriples.length > 0) {
    const tripleIds = topTriples.map(t => t.id).filter(Boolean);
    if (tripleIds.length > 0) {
      db.query(
        `UPDATE triples SET recall_count = COALESCE(recall_count, 0) + 1 WHERE id = ANY($1)`,
        [tripleIds]
      ).catch(() => {});
      db.query(
        `UPDATE triples SET is_protected = true, protection_reason = 'recall_reinforced'
         WHERE id = ANY($1) AND COALESCE(recall_count, 0) >= 3 AND is_protected IS NOT TRUE`,
        [tripleIds]
      ).catch(() => {});
    }
  }

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
    // Issue 5 fix: Prefer concept-anchored and multi-hop triples for citations
    // (these came from graph traversal, not just semantic similarity)
    // This prevents citing unrelated high-similarity results
    factsUsed: topTriples.length > 0
      ? topTriples
          .filter(t => t.displayText) // must have display text
          .sort((a, b) => {
            // Prioritize: concept_anchor > hop_N > semantic matches
            const aScore = a.matchType === 'concept_anchor' ? 3 :
              (a.matchType || '').startsWith('hop_') ? 2 : 1;
            const bScore = b.matchType === 'concept_anchor' ? 3 :
              (b.matchType || '').startsWith('hop_') ? 2 : 1;
            if (aScore !== bScore) return bScore - aScore;
            return (b.similarity || 0) - (a.similarity || 0);
          })
          .slice(0, 5).map(t => ({
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
    suggestedFollowups: answer.followups || [],
    traversalPath: {
      steps: traversalSteps,
      totalDurationMs: Date.now() - traversalStart,
      sstScope: sstNode ? { id: sstNode.id, name: sstNode.name } : null,
    },
  };
}

/**
 * Streaming version of ask() — emits SSE events as each retrieval phase completes.
 * @param {function} emit - (event, data) => void, writes SSE events to the response
 */
export async function askStreaming(scopeId, userId, question, conversationHistory = [], emit) {
  const scope = await ScopeService.getScopeById(scopeId);
  if (!scope) throw new Error('Scope not found');
  const teamId = scope.teamId;

  emit('status', { phase: 'starting', message: 'Preparing query...' });

  // Step 1: Rewrite follow-ups
  let standaloneQuestion = question;
  if (TripleRetrievalService.looksLikeFollowUp(question) && conversationHistory.length > 0) {
    standaloneQuestion = await TripleRetrievalService.rewriteFollowUp(question, conversationHistory);
  }

  // Step 2: Get scopes + SST routing
  const searchScopeIds = await ScopeService.getSearchScopeIds(scopeId, userId, true);
  let sstNode = null;
  try {
    const route = await SSTService.routeQuery(teamId, standaloneQuestion);
    if (route && route.confidence > 0.45) sstNode = route.node;
  } catch {}

  if (sstNode) {
    emit('status', { phase: 'routed', message: `Scoped to: ${sstNode.name}`, scope: { id: sstNode.id, name: sstNode.name } });
  }

  // Step 2b: Query planning
  let queryPlan = null;
  // Always classify — the LLM planner is fast (~200ms) and returns null for simple factual queries
  const needsPlanning = true;
  if (needsPlanning) {
    emit('status', { phase: 'planning', message: 'Planning retrieval strategy...' });
    try {
      queryPlan = await TripleRetrievalService.planQuery(teamId, standaloneQuestion, searchScopeIds);
      if (queryPlan) {
        const planMessages = {
          exhaustive: 'Doing a deep scan — gathering everything I know...',
          timeline: 'Scanning all dates and deadlines...',
          cross_domain: 'Searching across multiple topics...',
          counting: 'Counting items in the knowledge base...',
          comparison: 'Comparing the items you asked about...',
          listing: 'Building a list from the knowledge base...',
        };
        emit('status', {
          phase: 'planned',
          message: planMessages[queryPlan.queryType] || `Running a ${queryPlan.queryType} query...`,
          queryType: queryPlan.queryType,
          warnSlowQuery: queryPlan.warnSlowQuery,
        });
      }
    } catch {}
  }

  // For exhaustive/timeline plans, skip embedding search — the scan has the data
  const skipEmbeddingSearch = queryPlan?.precomputedData && ['exhaustive', 'timeline', 'cross_domain'].includes(queryPlan?.queryType);

  // Step 3: Embedding search (skip if plan already scanned)
  if (!skipEmbeddingSearch) {
    emit('status', { phase: 'searching', message: 'Searching knowledge base...' });
  }

  let triples = skipEmbeddingSearch ? [] : await TripleRetrievalService.searchTriples(teamId, standaloneQuestion, {
    scopeIds: searchScopeIds, sstNodeId: sstNode?.id || null, topK: 15
  });

  // Emit embedding search results
  const mapTriple = t => ({
    id: t.id, subjectId: t.subjectId || t.subject_id, objectId: t.objectId || t.object_id,
    subjectName: t.subjectName || t.subject_name, objectName: t.objectName || t.object_name,
    relationship: t.relationship, similarity: t.similarity, displayText: t.displayText || t.display_text,
  });

  emit('phase', {
    phase: 'embedding_search',
    nodesVisited: triples.map(mapTriple),
  });

  // Step 4: Multi-hop — ALWAYS expand
  let multiHopTriples = [];
  if (triples.length > 0) {
    emit('status', { phase: 'expanding', message: 'Following connections...' });

    const expanded = await TripleRetrievalService.multiHopExpand(teamId, triples, 3);
    const existingIds = new Set(triples.map(t => t.id));
    multiHopTriples = expanded.filter(t => !existingIds.has(t.id));
    triples = [...triples, ...multiHopTriples].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    if (multiHopTriples.length > 0) {
      emit('phase', {
        phase: 'multi_hop',
        nodesVisited: multiHopTriples.map(mapTriple),
      });
    }
  }

  // Step 4b: Mandatory collection expansion (streaming path)
  const collectionExpanded = await expandCollectionNodes(teamId, triples);
  if (collectionExpanded.length > 0) {
    const existingIds = new Set(triples.map(t => t.id));
    const newFromCollection = collectionExpanded.filter(t => !existingIds.has(t.id));
    triples = [...triples, ...newFromCollection].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    if (newFromCollection.length > 0) {
      emit('phase', { phase: 'collection_expand', nodesVisited: newFromCollection.map(mapTriple) });
    }
  }

  // Step 5: Re-rank + select
  emit('status', { phase: 'ranking', message: 'Evaluating relevance...' });

  const filteredTriples = triples.filter(t => (t.similarity || 0) > 0.3);
  const reranked = await TripleRetrievalService.rerankTriples(standaloneQuestion, filteredTriples);
  const topTriples = reranked.slice(0, 15);

  emit('phase', {
    phase: 'selected',
    nodesVisited: topTriples.map(mapTriple),
  });

  // Step 6-7: Build context + user model
  let answerContext = await TripleRetrievalService.buildAnswerContext(topTriples);

  // Legacy fallback
  let legacyFacts = [];
  if (topTriples.length < 3) {
    try {
      const { default: KnowledgeService } = await import('./KnowledgeService.js');
      const knowledge = await KnowledgeService.getKnowledgeContext(teamId, standaloneQuestion);
      if (knowledge.facts?.length > 0) {
        legacyFacts = knowledge.facts;
        const legacyLines = legacyFacts.slice(0, 10).map(f =>
          `- ${f.content}${f.sourceQuote ? ` (Source: "${f.sourceQuote.substring(0, 100)}")` : ''}`
        );
        answerContext = answerContext
          ? `${answerContext}\n\nAdditional confirmed facts:\n${legacyLines.join('\n')}`
          : legacyLines.join('\n');
      }
    } catch {}
  }

  // Inject precomputed data — skip for listing queries when triple search found enough
  const streamTriplesSufficient = topTriples.length >= 5;
  if (queryPlan?.precomputedData && !(streamTriplesSufficient && queryPlan.queryType === 'listing')) {
    const pd = queryPlan.precomputedData;
    let planContext = '';
    if (pd.type === 'count') planContext = `\n\nGRAPH SCAN: ${pd.count} items found: ${pd.names.join(', ')}`;
    else if (pd.type === 'list') planContext = `\n\nADDITIONAL CONTEXT:\n${pd.items.map(i => {
      const details = i.triples?.length > 0 ? `: ${i.triples.join('; ')}` : '';
      return `- ${i.name} (${i.type})${details}`;
    }).join('\n')}`;
    else if (pd.type === 'comparison') planContext = `\n\nCOMPARISON:\n${pd.comparisons.map(c => `${c.concept}:\n${c.triples.map(t => `  - ${t}`).join('\n')}`).join('\n\n')}`;
    else if (pd.type === 'exhaustive') planContext = `\n\nDEEP SCAN (${pd.count} facts):\n${pd.triples.map(t => `- ${t}`).join('\n')}`;
    else if (pd.type === 'timeline') planContext = `\n\nTIMELINE (${pd.count} events):\n${pd.events.map(e => `- ${e.event} ${e.relationship} ${e.date}`).join('\n')}`;
    else if (pd.type === 'cross_domain') planContext = `\n\nCROSS-DOMAIN:\n${pd.domains.map(d => `${d.domain} (${d.triples.length} facts):\n${d.triples.map(t => `  - ${t}`).join('\n')}`).join('\n\n')}`;
    answerContext = (answerContext || '') + planContext;
  }

  let userModelPrompt = '';
  try {
    const userModel = await UserModelService.getUserModel(teamId, userId);
    userModelPrompt = UserModelService.applyUserModel(userModel);
  } catch {}

  // Step 8: Generate answer
  emit('status', { phase: 'answering', message: 'Composing answer...' });

  const answer = await generateTripleBasedAnswer(standaloneQuestion, answerContext, topTriples, userModelPrompt);

  // Fire-and-forget side effects
  // User model trait extraction disabled — creates noise triples about 'this_user'
  // TODO: re-enable when extraction quality is improved
  // UserModelService.extractUserTraits(teamId, userId, {
  //   type: 'ask', content: question,
  //   topics: topTriples.slice(0, 3).map(t => t.subjectName).filter(Boolean),
  // }).catch(() => {});
  learnAliasesFromQuery(teamId, standaloneQuestion, topTriples).catch(() => {});

  // Final answer event
  emit('answer', {
    answer: answer.text,
    confidence: answer.confidence,
    factsUsed: topTriples.slice(0, 5).map(t => ({
      id: t.id, content: t.displayText, sourceQuote: t.sourceText,
      sourceUrl: t.sourceUrl, createdAt: t.createdAt,
    })),
    suggestedFollowups: answer.followups || [],
  });
}

/**
 * Learn concept aliases from how users phrase questions.
 * If "chaos card game" matches concept "Fugly's Mayhem Machine",
 * store "chaos card game" as an alias with lower trust.
 */
async function learnAliasesFromQuery(teamId, question, matchedTriples) {
  if (!matchedTriples || matchedTriples.length === 0) return;

  const questionLower = question.toLowerCase();
  const seenConcepts = new Set();

  for (const triple of matchedTriples.slice(0, 5)) {
    for (const conceptName of [triple.subjectName, triple.objectName]) {
      if (!conceptName || seenConcepts.has(conceptName)) continue;
      seenConcepts.add(conceptName);

      const nameLower = conceptName.toLowerCase();
      // If the question doesn't contain the concept name, the system found it
      // through embedding/entity extraction — the question phrasing is an alias
      if (!questionLower.includes(nameLower) && nameLower.length > 3) {
        // Extract what the user called this concept
        try {
          const response = await AIService.callOpenAI([
            {
              role: 'system',
              content: `The user asked a question and the system matched it to a concept called "${conceptName}".
Extract the SHORT PHRASE from the question that the user used to refer to "${conceptName}".
Return ONLY the phrase (2-5 words) or "NONE" if the question doesn't clearly refer to this concept.`
            },
            { role: 'user', content: question }
          ], { model: 'gpt-4o-mini', maxTokens: 30, temperature: 0, teamId, operation: 'alias_learn' });

          const alias = response?.trim();
          if (alias && alias !== 'NONE' && alias.length > 2 && alias.length < 60) {
            // Store as alias on the concept (low confidence — implied, not stated)
            await db.query(
              `UPDATE concepts SET aliases = array_append(
                 CASE WHEN $2 = ANY(aliases) THEN aliases ELSE aliases END, $2
               ), updated_at = NOW()
               WHERE team_id = $1 AND canonical_name = $3 AND NOT ($2 = ANY(COALESCE(aliases, '{}')))`,
              [teamId, alias.toLowerCase(), nameLower]
            );
            console.log(`[AliasLearn] Learned: "${alias}" → "${conceptName}"`);
          }
        } catch { /* alias learning is best-effort */ }
      }
    }
  }
}

/**
 * Generate answer from triple-based context.
 */
async function generateTripleBasedAnswer(question, answerContext, triples, userModelPrompt = '') {
  if ((!answerContext || answerContext.trim().length === 0) && triples.length === 0) {
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

  // Detect conflicts in retrieved triples (same subject, different objects)
  const conflictWarning = detectRetrievedConflicts(triples);

  const systemPrompt = `You are Raven, the institutional knowledge assistant. You are conversational and helpful, but NEVER guess.

STRICT RULES — FOLLOW EXACTLY:
1. Answer using ONLY the knowledge statements listed below. Do NOT add information from your training data.
2. RELEVANCE CHECK: Before answering, ask yourself: "Do these knowledge statements DIRECTLY address what was asked?"
   - If YES → answer using only those statements.
   - If PARTIALLY → say what you DO know, then clearly state what you don't: "I don't have specific info about [X], but here's what I know about [related topic]..."
   - If NO (statements are only tangentially related) → say "I don't have confirmed knowledge about that." You may briefly mention what related info you DO have and offer to explore it: "I do have some info about [related topic] if that would help."
3. Every claim must trace to a specific knowledge statement below. If you can't point to it, don't say it.
4. CRITICAL: Do NOT merge statements about different entities. Each statement is about the specific entities it names.
5. Multi-hop connections must share a COMMON entity: "X is Y" + "Y is Z" → "X is Z" is valid. Different entities → no connection.
6. NEVER invent relationships, dependencies, or connections that are not EXPLICITLY stated in the knowledge below. If a dependency or relationship is not listed, it does not exist. Do not infer "X depends on Y" unless a statement says so.
7. If contexts are listed, mention them naturally.
8. Be concise and conversational. No filler.
9. If a statement is marked [SUPERSEDED], use the newer version instead.
${conflictWarning ? `9. CONFLICTING INFORMATION DETECTED: ${conflictWarning}
   Present ALL perspectives and clearly note the discrepancy.` : ''}

KNOWLEDGE STATEMENTS:
${answerContext}

After your answer, on a new line, return a JSON object:
{"confidence": 0.0-1.0, "followups": ["question 1", "question 2"]}

Confidence guide:
- 1.0 = knowledge fully and directly answers the question
- 0.6-0.9 = partial answer, some aspects not covered
- 0.1-0.5 = only tangentially related info available
- 0.0 = no relevant knowledge at all
If you said "I don't have confirmed knowledge", confidence MUST be 0.0-0.2.
Followups should be natural conversational next steps, not generic.${userModelPrompt}`;

  const response = await AIService.callClaude([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ], { model: 'claude-sonnet-4-6', maxTokens: 800, temperature: 0.3 });

  return parseAnswerResponse(response);
}

/**
 * Detect conflicts in retrieved triples — same subject + same relationship type but different objects.
 * Returns a warning string for the LLM prompt, or null if no conflicts.
 */
function detectRetrievedConflicts(triples) {
  if (!triples || triples.length < 2) return null;

  const conflicts = [];
  const seen = new Map(); // key: "subject|rel_category" → triple

  for (const t of triples) {
    const subject = (t.subjectName || '').toLowerCase();
    const rel = (t.relationship || '').toLowerCase();

    // Normalize relationship to category
    let relCat = rel;
    if (/launch|release|ship|come out|debut/.test(rel)) relCat = 'release_date';
    else if (/manufactur|produce|make|built by/.test(rel)) relCat = 'manufacturer';
    else if (/price|cost|retail/.test(rel)) relCat = 'price';
    else if (/pay|term|net \d+/.test(rel)) relCat = 'payment_terms';
    else if (/schedul|date|when|held on/.test(rel)) relCat = 'date';
    else if (/locat|based in|held at|venue/.test(rel)) relCat = 'location';

    const key = `${subject}|${relCat}`;
    const existing = seen.get(key);

    if (existing) {
      const existObj = (existing.objectName || '').toLowerCase();
      const newObj = (t.objectName || '').toLowerCase();
      if (existObj !== newObj) {
        conflicts.push(`"${existing.displayText}" vs "${t.displayText}"`);
      }
    } else {
      seen.set(key, t);
    }
  }

  if (conflicts.length === 0) return null;
  return `The following statements appear to conflict — present BOTH and note the discrepancy:\n${conflicts.join('\n')}`;
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

  // Step 5: Challenge pipeline — check for contradictions, plausibility, source trust
  let challengedTriples = extractedTriples;
  let triageLevel = 'review'; // default
  try {
    challengedTriples = await TrustService.challengeTriples(teamId, extractedTriples, userId, 'user');
    const globalTrust = await TrustService.getTrustScore(teamId, userId, 'user', null);
    const allFlags = challengedTriples.flatMap(t => t.challengeFlags || []);
    triageLevel = TrustService.computeTriageLevel(allFlags, globalTrust.level);
    console.log(`[RavenService.previewRemember] Challenge: ${allFlags.length} flags, triage=${triageLevel}`);
  } catch (err) {
    console.error('[RavenService.previewRemember] Challenge error:', err.message);
  }

  // Step 6: Detect conflicts
  const conflicts = await TripleExtractionService.detectConflicts(teamId, challengedTriples, userId);
  console.log(`[RavenService.previewRemember] Found ${conflicts.length} conflicts`);

  // Step 7: Seed trust tier for official sources
  const trustTier = challengedTriples[0]?.trustTier || 'tribal';
  if (trustTier === 'official') {
    TrustService.seedTrustTier(teamId, userId, 'user', 'official').catch(() => {});
  }

  // Step 8: Persist preview
  const result = await db.query(
    `INSERT INTO remember_previews
       (scope_id, team_id, user_id, source_text, source_url,
        extracted_triples, conflicts, is_mismatch, mismatch_suggestion, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING id`,
    [
      scopeId, teamId, userId, statement, sourceUrl,
      JSON.stringify(challengedTriples), JSON.stringify(conflicts),
      mismatch.isMismatch, mismatch.suggestion
    ]
  );

  return {
    previewId: result.rows[0].id,
    sourceText: statement,
    extractedTriples: challengedTriples,
    triageLevel,
    // Backward compat: render triples as extractedFacts for old consumers
    extractedFacts: challengedTriples.map(t => ({
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

    // Handle updates: mark as pending supersession (finalized after new triple created)
    const pendingSupersession = (conflict && conflict.conflictType === 'update' && conflict.existingTriple?.id)
      ? conflict.existingTriple.id : null;

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
      isProtected: extracted.isCore || false,
      protectionReason: extracted.isCore ? 'llm_core_fact' : null,
    });

    // Complete supersession: link old triple to new one
    if (pendingSupersession) {
      await TripleService.supersedeTriple(pendingSupersession, triple.id);
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

    // Step 6: Update trust scores for source×topic
    TrustService.updateTrustForTriple(teamId, userId, 'user', triple.id, 'confirmed')
      .catch(err => console.error('[confirmRemember] Trust update error:', err.message));

    // Step 7: Auto-protect — human-confirmed triples are prune-proof
    db.query(
      "UPDATE triples SET is_protected = true, protection_reason = 'human_confirmed' WHERE id = $1 AND is_protected IS NOT TRUE",
      [triple.id]
    ).catch(() => {});
  }

  // Extract user model traits passively (fire-and-forget)
  UserModelService.extractUserTraits(teamId, confirmer, {
    type: 'confirm',
    content: triplesCreated.map(t => t.displayText || t.display_text).join('; '),
    responseTimeMs: Date.now() - new Date(row.created_at).getTime(),
    topics: triplesCreated.flatMap(t => (t.contexts || []).map(c => c.name)).filter(Boolean),
  }).catch(() => {});

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

  // Place confirmed triples in the SST (fire-and-forget)
  for (const triple of [...triplesCreated, ...triplesUpdated]) {
    SSTService.placeTriple(teamId, {
      subjectName: triple.subjectName || triple.subject_name,
      objectName: triple.objectName || triple.object_name,
      relationship: triple.relationship,
      displayText: triple.displayText || triple.display_text,
    }, triple.id).catch(err => console.error('[confirmRemember] SST placement error:', err.message));
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

// ============================================================================
// CORRECTION LEARNING
// ============================================================================

/**
 * Log a correction signal when a user indicates an answer was wrong.
 * Stores the correction for future learning during grooming.
 *
 * correction = { question, wrongAnswer, correctInfo, triplesUsedIds }
 */
export async function logCorrection(teamId, userId, correction) {
  try {
    await db.query(`
      INSERT INTO correction_signals (team_id, user_id, question, wrong_answer, correct_info, triple_ids, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      teamId, userId,
      correction.question,
      correction.wrongAnswer,
      correction.correctInfo,
      correction.triplesUsedIds || [],
    ]);

    // If user provided correct info, treat it as a new remember statement
    if (correction.correctInfo) {
      console.log(`[RavenService.logCorrection] User provided correction, treating as remember`);
      // The correction itself becomes new knowledge
      // This will naturally trigger conflict detection + supersession
    }

    // Update trust: penalize the source of the wrong triples
    if (correction.triplesUsedIds?.length > 0) {
      for (const tripleId of correction.triplesUsedIds) {
        await TrustService.updateTrustForTriple(teamId, userId, 'user', tripleId, 'corrected')
          .catch(() => {});
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[RavenService.logCorrection] Error:', err.message);
    // Best effort — create the table if it doesn't exist
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS correction_signals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          team_id UUID NOT NULL,
          user_id VARCHAR(255),
          question TEXT,
          wrong_answer TEXT,
          correct_info TEXT,
          triple_ids UUID[],
          resolved BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      // Retry
      return logCorrection(teamId, userId, correction);
    } catch { return { success: false }; }
  }
}

// ============================================================================
// COLLECTION EXPANSION — Mandatory traversal of hierarchical structures
// ============================================================================

/**
 * Explicit collection/category expansion.
 *
 * For every concept found in the current results, check if it has collection-style
 * outbound edges (contains, includes, is responsible for, asks, solves, etc.).
 * If yes, fetch those children AND their immediate triples.
 *
 * This guarantees 2-hop traversal through hierarchies:
 *   Parent → has category → Category → contains → Item
 *   9 High Rules ← is a rule within ← Return Rule → asks → "come back?"
 */
async function expandCollectionNodes(teamId, triples) {
  if (!triples || triples.length === 0) return [];

  // Collect ALL unique concept IDs from current results
  const conceptIds = new Set();
  for (const t of triples) {
    const sid = t.subjectId || t.subject_id;
    const oid = t.objectId || t.object_id;
    if (sid) conceptIds.add(sid);
    if (oid) conceptIds.add(oid);
  }

  if (conceptIds.size === 0) return [];

  const existingTripleIds = new Set(triples.map(t => t.id));

  // Step 1: For ALL concepts in results, fetch their OUTBOUND triples
  // (these are the children we're missing)
  const childrenResult = await db.query(`
    SELECT t.*, s.name AS subject_name, s.type AS subject_type,
           o.name AS object_name, o.type AS object_type,
           'collection_child' AS match_type
    FROM triples t
    JOIN concepts s ON t.subject_id = s.id
    JOIN concepts o ON t.object_id = o.id
    WHERE t.team_id = $1 AND t.status = 'active'
      AND (t.subject_id = ANY($2) OR t.object_id = ANY($2))
      AND t.id != ALL($3)
    ORDER BY t.confidence DESC NULLS LAST
    LIMIT 60
  `, [teamId, Array.from(conceptIds), Array.from(existingTripleIds)]);

  const childTriples = childrenResult.rows.map(row => ({
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
    similarity: Math.min((row.confidence || 0.5) * 0.9, 0.65), // Cap below embedding results
    matchType: 'collection_child',
    hopDistance: 1,
  }));

  // Step 2: Collect NEW concept IDs from children (the grandchildren level)
  const grandchildConceptIds = new Set();
  for (const t of childTriples) {
    if (!conceptIds.has(t.subjectId)) grandchildConceptIds.add(t.subjectId);
    if (!conceptIds.has(t.objectId)) grandchildConceptIds.add(t.objectId);
  }

  // Step 3: For grandchild concepts, fetch THEIR triples (2nd hop)
  let grandchildTriples = [];
  if (grandchildConceptIds.size > 0) {
    const allExisting = new Set([...existingTripleIds, ...childTriples.map(t => t.id)]);
    const gcResult = await db.query(`
      SELECT t.*, s.name AS subject_name, s.type AS subject_type,
             o.name AS object_name, o.type AS object_type,
             'collection_grandchild' AS match_type
      FROM triples t
      JOIN concepts s ON t.subject_id = s.id
      JOIN concepts o ON t.object_id = o.id
      WHERE t.team_id = $1 AND t.status = 'active'
        AND (t.subject_id = ANY($2) OR t.object_id = ANY($2))
        AND t.id != ALL($3)
      ORDER BY t.confidence DESC NULLS LAST
      LIMIT 40
    `, [teamId, Array.from(grandchildConceptIds), Array.from(allExisting)]);

    grandchildTriples = gcResult.rows.map(row => ({
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
      similarity: Math.min((row.confidence || 0.5) * 0.8, 0.55), // 2 hops, capped below embedding results
      matchType: 'collection_grandchild',
      hopDistance: 2,
    }));
  }

  console.log(`[expandCollectionNodes] ${conceptIds.size} seed concepts → ${childTriples.length} children → ${grandchildConceptIds.size} grandchild concepts → ${grandchildTriples.length} grandchild triples`);

  return [...childTriples, ...grandchildTriples];
}

export default {
  ask,
  previewRemember,
  confirmRemember,
  cancelRemember,
  getFactCount,
  getFacts,
  logCorrection,
};
