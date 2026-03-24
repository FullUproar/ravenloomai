/**
 * SSE Streaming Ask Endpoint
 *
 * Streams traversal events in real-time as the retrieval pipeline runs:
 * - event: status  → { phase, message }
 * - event: phase   → { phase, nodesVisited: [...] }
 * - event: answer  → { answer, confidence, factsUsed, suggestedFollowups }
 * - event: error   → { message }
 *
 * Usage: GET /api/ask-stream?scopeId=...&question=...
 *   or POST with JSON body
 */

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Parse params from GET query string or POST body
  let scopeId, question, conversationHistory;
  if (req.method === 'POST') {
    const body = req.body || {};
    scopeId = body.scopeId;
    question = body.question;
    conversationHistory = body.conversationHistory || [];
  } else {
    scopeId = req.query.scopeId;
    question = req.query.question;
    conversationHistory = [];
  }

  const userId = req.headers['x-user-id'];

  if (!scopeId || !question || !userId) {
    res.status(400).json({ error: 'Missing scopeId, question, or x-user-id header' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders?.();

  // SSE emit helper
  const emit = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Flush if possible (Vercel streaming)
    if (typeof res.flush === 'function') res.flush();
  };

  try {
    // Dynamic import to avoid module-level init issues
    const RavenService = await import('../backend/services/RavenService.js');
    await RavenService.askStreaming(scopeId, userId, question, conversationHistory, emit);
  } catch (err) {
    console.error('[ask-stream] Error:', err.message);
    emit('error', { message: err.message || 'Internal error' });
  }

  // Close the stream
  emit('done', {});
  res.end();
}
