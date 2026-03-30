/**
 * Debug endpoint — traces the full Ask pipeline and returns diagnostics.
 * POST /api/debug-ask { question, teamId }
 * Returns: { steps: [...], finalTriples: [...], answerContext: string }
 */

import * as TripleRetrievalService from '../backend/services/TripleRetrievalService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { question, teamId } = req.body || {};
  if (!question || !teamId) return res.status(400).json({ error: 'question and teamId required' });

  const steps = [];
  const start = Date.now();

  try {
    // Step 1: Query classification
    let queryPlan = null;
    try {
      queryPlan = await TripleRetrievalService.planQuery(teamId, question, []);
      steps.push({ step: 'plan', ms: Date.now() - start, queryType: queryPlan?.queryType || 'factual', hasPrecomputed: !!queryPlan?.precomputedData });
    } catch (e) {
      steps.push({ step: 'plan', ms: Date.now() - start, error: e.message });
    }

    const skipEmbedding = queryPlan?.precomputedData && ['exhaustive', 'timeline', 'cross_domain'].includes(queryPlan?.queryType);

    // Step 2: Triple search
    let triples = [];
    if (!skipEmbedding) {
      triples = await TripleRetrievalService.searchTriples(teamId, question, { scopeIds: [], topK: 15 });
      steps.push({
        step: 'search',
        ms: Date.now() - start,
        count: triples.length,
        top5: triples.slice(0, 5).map(t => ({
          sim: parseFloat(t.similarity || 0).toFixed(3),
          match: t.matchType || t.match_type,
          text: (t.displayText || t.display_text || '').substring(0, 80),
        })),
        containsTriples: triples.filter(t => (t.relationship || '').toLowerCase().includes('contains')).map(t => ({
          sim: parseFloat(t.similarity || 0).toFixed(3),
          text: (t.displayText || t.display_text || ''),
          match: t.matchType || t.match_type,
        })),
      });
    } else {
      steps.push({ step: 'search', ms: Date.now() - start, skipped: true, reason: queryPlan?.queryType });
    }

    // Step 3: Multi-hop
    let multiHop = [];
    if (triples.length > 0) {
      const expanded = await TripleRetrievalService.multiHopExpand(teamId, triples, 3);
      const existingIds = new Set(triples.map(t => t.id));
      multiHop = expanded.filter(t => !existingIds.has(t.id));
      triples = [...triples, ...multiHop].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
      steps.push({
        step: 'multihop',
        ms: Date.now() - start,
        newTriples: multiHop.length,
        containsTriples: multiHop.filter(t => (t.relationship || '').toLowerCase().includes('contains')).length,
      });
    }

    // Step 4: Collection expansion
    // Import expandCollectionNodes — it's not exported, so we replicate the logic
    const conceptIds = new Set();
    for (const t of triples) {
      const sid = t.subjectId || t.subject_id;
      const oid = t.objectId || t.object_id;
      if (sid) conceptIds.add(sid);
      if (oid) conceptIds.add(oid);
    }
    steps.push({
      step: 'collection_seeds',
      ms: Date.now() - start,
      conceptCount: conceptIds.size,
      totalTriplesBefore: triples.length,
    });

    // Step 5: Filter + rerank
    const filtered = triples.filter(t => (t.similarity || 0) > 0.3);
    steps.push({
      step: 'filter',
      ms: Date.now() - start,
      before: triples.length,
      after: filtered.length,
      containsSurvived: filtered.filter(t => (t.relationship || '').toLowerCase().includes('contains')).length,
    });

    const reranked = await TripleRetrievalService.rerankTriples(question, filtered);
    const topTriples = reranked.slice(0, 15);
    steps.push({
      step: 'rerank',
      ms: Date.now() - start,
      rerankedCount: reranked.length,
      topCount: topTriples.length,
      top10: topTriples.slice(0, 10).map(t => ({
        sim: parseFloat(t.similarity || 0).toFixed(3),
        match: t.matchType || t.match_type,
        text: (t.displayText || t.display_text || '').substring(0, 80),
      })),
      containsInTop: topTriples.filter(t => (t.relationship || '').toLowerCase().includes('contains')).length,
    });

    // Step 6: Build answer context
    const answerContext = await TripleRetrievalService.buildAnswerContext(topTriples);
    steps.push({
      step: 'context',
      ms: Date.now() - start,
      contextLength: answerContext.length,
      contextPreview: answerContext.substring(0, 500),
    });

    return res.status(200).json({ steps, totalMs: Date.now() - start });
  } catch (e) {
    steps.push({ step: 'error', error: e.message, stack: e.stack?.substring(0, 300) });
    return res.status(500).json({ steps, error: e.message });
  }
}
