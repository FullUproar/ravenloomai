/**
 * Vercel Serverless MCP Endpoint
 *
 * Handles MCP JSON-RPC protocol directly (no streaming transport).
 * Vercel serverless functions can't hold SSE connections, so we handle
 * initialize, tools/list, and tools/call as stateless request/response.
 */

// ── Config ───────────────────────────────────────────────────────────────────

const GRAPHQL_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/graphql`
  : (process.env.RAVENLOOM_URL || 'http://localhost:4000/graphql');

const DEFAULT_TEAM_ID = process.env.RAVENLOOM_TEAM_ID || '';
const DEFAULT_USER_ID = process.env.RAVENLOOM_USER_ID || '';

// ── GraphQL Client ───────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (DEFAULT_USER_ID) headers['x-user-id'] = DEFAULT_USER_ID;

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`GraphQL HTTP error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(', '));
  return json.data;
}

async function getTeamScopeId(teamId) {
  const data = await gql(
    `query GetTeamScope($teamId: ID!) { getTeamScope(teamId: $teamId) { id } }`,
    { teamId }
  );
  return data.getTeamScope.id;
}

// ── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'raven_ask',
    description: 'Ask RavenLoom a question. Returns answer with confidence and source citations.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask' },
        teamId: { type: 'string', description: 'Team UUID (optional, uses default)' },
      },
      required: ['question'],
    },
  },
  {
    name: 'raven_remember_preview',
    description: 'Extract facts from text without saving. Returns preview for human review.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to extract facts from' },
        teamId: { type: 'string', description: 'Team UUID (optional)' },
        scopeId: { type: 'string', description: 'Scope UUID (optional)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'raven_remember_confirm',
    description: 'Confirm and save facts from a preview.',
    inputSchema: {
      type: 'object',
      properties: {
        previewId: { type: 'string', description: 'Preview ID from raven_remember_preview' },
        skipConflictIds: { type: 'array', items: { type: 'string' }, description: 'Fact IDs to skip (keep existing)' },
      },
      required: ['previewId'],
    },
  },
  {
    name: 'raven_search_facts',
    description: 'Search confirmed facts by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms' },
        teamId: { type: 'string', description: 'Team UUID (optional)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'raven_list_scopes',
    description: 'List available scopes for a team.',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team UUID (optional)' },
      },
    },
  },
];

// ── Tool Handlers ────────────────────────────────────────────────────────────

async function handleTool(name, args) {
  switch (name) {
    case 'raven_ask': {
      const tid = args.teamId || DEFAULT_TEAM_ID;
      if (!tid) return [{ type: 'text', text: 'Error: No teamId provided.' }];
      const scopeId = await getTeamScopeId(tid);
      const data = await gql(
        `query AskRaven($scopeId: ID!, $question: String!) {
          askRaven(scopeId: $scopeId, question: $question) {
            answer confidence
            factsUsed { id content sourceQuote createdAt }
            suggestedFollowups
          }
        }`,
        { scopeId, question: args.question }
      );
      const r = data.askRaven;
      let text = `**Answer:** ${r.answer}\n**Confidence:** ${r.confidence != null ? Math.round(r.confidence * 100) + '%' : 'unknown'}`;
      if (r.factsUsed?.length) {
        text += `\n\n**Sources:**`;
        for (const f of r.factsUsed) text += `\n- "${f.content}"`;
      }
      if (r.suggestedFollowups?.length) {
        text += `\n\n**Follow-ups:**`;
        for (const q of r.suggestedFollowups) text += `\n- ${q}`;
      }
      return [{ type: 'text', text }];
    }

    case 'raven_remember_preview': {
      const tid = args.teamId || DEFAULT_TEAM_ID;
      if (!tid) return [{ type: 'text', text: 'Error: No teamId provided.' }];
      const sid = args.scopeId || await getTeamScopeId(tid);
      const data = await gql(
        `mutation PreviewRemember($scopeId: ID!, $statement: String!) {
          previewRemember(scopeId: $scopeId, statement: $statement) {
            previewId sourceText
            extractedFacts { content entityType entityName category confidenceScore }
            conflicts { existingFact { id content } conflictType explanation }
            isMismatch mismatchSuggestion
          }
        }`,
        { scopeId: sid, statement: args.text }
      );
      const r = data.previewRemember;
      let output = `**Preview ID:** \`${r.previewId}\`\n**Extracted ${r.extractedFacts.length} facts:**\n`;
      r.extractedFacts.forEach((f, i) => {
        output += `\n${i + 1}. [${(f.category || 'general').toUpperCase()}] "${f.content}"`;
      });
      if (r.conflicts?.length) {
        output += `\n\n**Conflicts:**`;
        for (const c of r.conflicts) output += `\n⚠ ${c.explanation}`;
      }
      output += `\n\nCall \`raven_remember_confirm\` with preview ID \`${r.previewId}\` to save.`;
      return [{ type: 'text', text: output }];
    }

    case 'raven_remember_confirm': {
      const data = await gql(
        `mutation ConfirmRemember($previewId: ID!, $skipConflictIds: [ID!]) {
          confirmRemember(previewId: $previewId, skipConflictIds: $skipConflictIds) {
            success message
            factsCreated { id content }
            factsUpdated { id content }
            nodeCreated { id name type }
          }
        }`,
        { previewId: args.previewId, skipConflictIds: args.skipConflictIds || [] }
      );
      const r = data.confirmRemember;
      let output = r.success ? '**Confirmed!**\n' : '**Failed.**\n';
      if (r.message) output += `${r.message}\n`;
      if (r.factsCreated?.length) {
        output += `\n**New facts (${r.factsCreated.length}):**`;
        for (const f of r.factsCreated) output += `\n- ${f.content}`;
      }
      if (r.factsUpdated?.length) {
        output += `\n**Updated (${r.factsUpdated.length}):**`;
        for (const f of r.factsUpdated) output += `\n- ${f.content}`;
      }
      return [{ type: 'text', text: output }];
    }

    case 'raven_search_facts': {
      const tid = args.teamId || DEFAULT_TEAM_ID;
      if (!tid) return [{ type: 'text', text: 'Error: No teamId provided.' }];
      const data = await gql(
        `query GetFacts($teamId: ID!, $limit: Int) {
          getFacts(teamId: $teamId, limit: $limit) {
            id content category entityName trustTier createdAt
          }
        }`,
        { teamId: tid, limit: args.limit || 200 }
      );
      const q = args.query.toLowerCase();
      const filtered = (data.getFacts || [])
        .filter(f => f.content.toLowerCase().includes(q) || (f.entityName || '').toLowerCase().includes(q))
        .slice(0, args.limit || 20);
      if (!filtered.length) return [{ type: 'text', text: `No facts found matching "${args.query}".` }];
      let output = `**Found ${filtered.length} facts:**\n`;
      for (const f of filtered) output += `\n- [${f.category || 'general'}] ${f.content}`;
      return [{ type: 'text', text: output }];
    }

    case 'raven_list_scopes': {
      const tid = args.teamId || DEFAULT_TEAM_ID;
      if (!tid) return [{ type: 'text', text: 'Error: No teamId provided.' }];
      const data = await gql(
        `query GetScopeTree($teamId: ID!) { getScopeTree(teamId: $teamId) { id name type parentScopeId } }`,
        { teamId: tid }
      );
      const scopes = data.getScopeTree || [];
      if (!scopes.length) return [{ type: 'text', text: 'No scopes found.' }];
      let output = '**Scopes:**\n';
      for (const s of scopes) output += `\n- **${s.name}** (${s.type}) — ID: \`${s.id}\``;
      return [{ type: 'text', text: output }];
    }

    default:
      return [{ type: 'text', text: `Unknown tool: ${name}` }];
  }
}

// ── JSON-RPC Handler ─────────────────────────────────────────────────────────

function jsonrpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonrpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return jsonrpc(id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'ravenloom', version: '1.0.0' },
      });

    case 'notifications/initialized':
      // Client acknowledgment — no response needed
      return null;

    case 'tools/list':
      return jsonrpc(id, { tools: TOOLS });

    case 'tools/call': {
      const { name, arguments: args } = params;
      try {
        const content = await handleTool(name, args || {});
        return jsonrpc(id, { content });
      } catch (err) {
        return jsonrpc(id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
      }
    }

    case 'ping':
      return jsonrpc(id, {});

    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ── Vercel Handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', server: 'ravenloom-mcp', version: '1.0.0' });
  }

  if (req.method === 'DELETE') {
    // Session termination — just acknowledge
    return res.status(200).json({ jsonrpc: '2.0', result: {} });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // Handle batch requests
    if (Array.isArray(body)) {
      const results = [];
      for (const msg of body) {
        const result = await handleMessage(msg);
        if (result) results.push(result);
      }
      return res.status(200).json(results.length === 1 ? results[0] : results);
    }

    // Single request
    const result = await handleMessage(body);
    if (!result) return res.status(204).end(); // Notification — no response
    return res.status(200).json(result);
  } catch (err) {
    console.error('MCP handler error:', err);
    return res.status(500).json(jsonrpcError(null, -32603, err.message));
  }
}
