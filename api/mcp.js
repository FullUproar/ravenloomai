/**
 * Vercel Serverless MCP Endpoint
 *
 * Exposes RavenLoom's MCP tools over HTTP for claude.ai integration.
 * This is a simplified stateless HTTP wrapper — each request is independent.
 *
 * Claude.ai calls POST /api/mcp with MCP protocol JSON-RPC messages.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

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

// ── MCP Server Setup ─────────────────────────────────────────────────────────

function createMcpServer() {
  const server = new McpServer({ name: 'ravenloom', version: '1.0.0' });

  // Tool 1: raven_ask
  server.tool(
    'raven_ask',
    'Ask RavenLoom a question. Returns answer with confidence and source citations.',
    { question: z.string(), teamId: z.string().optional() },
    async ({ question, teamId }) => {
      const tid = teamId || DEFAULT_TEAM_ID;
      if (!tid) return { content: [{ type: 'text', text: 'Error: No teamId provided.' }] };
      try {
        const scopeId = await getTeamScopeId(tid);
        const data = await gql(
          `query AskRaven($scopeId: ID!, $question: String!) {
            askRaven(scopeId: $scopeId, question: $question) {
              answer confidence
              factsUsed { id content sourceQuote createdAt }
              suggestedFollowups
            }
          }`,
          { scopeId, question }
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
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      }
    }
  );

  // Tool 2: raven_remember_preview
  server.tool(
    'raven_remember_preview',
    'Extract facts from text without saving. Returns preview for review.',
    { text: z.string(), teamId: z.string().optional(), scopeId: z.string().optional() },
    async ({ text, teamId, scopeId }) => {
      const tid = teamId || DEFAULT_TEAM_ID;
      if (!tid) return { content: [{ type: 'text', text: 'Error: No teamId provided.' }] };
      try {
        const sid = scopeId || await getTeamScopeId(tid);
        const data = await gql(
          `mutation PreviewRemember($scopeId: ID!, $statement: String!) {
            previewRemember(scopeId: $scopeId, statement: $statement) {
              previewId sourceText
              extractedFacts { content entityType entityName category confidenceScore }
              conflicts { existingFact { id content } conflictType explanation }
              isMismatch mismatchSuggestion
            }
          }`,
          { scopeId: sid, statement: text }
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
        return { content: [{ type: 'text', text: output }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      }
    }
  );

  // Tool 3: raven_remember_confirm
  server.tool(
    'raven_remember_confirm',
    'Confirm and save facts from a preview.',
    { previewId: z.string(), skipConflictIds: z.array(z.string()).optional() },
    async ({ previewId, skipConflictIds }) => {
      try {
        const data = await gql(
          `mutation ConfirmRemember($previewId: ID!, $skipConflictIds: [ID!]) {
            confirmRemember(previewId: $previewId, skipConflictIds: $skipConflictIds) {
              success message
              factsCreated { id content }
              factsUpdated { id content }
              nodeCreated { id name type }
            }
          }`,
          { previewId, skipConflictIds: skipConflictIds || [] }
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
        return { content: [{ type: 'text', text: output }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      }
    }
  );

  // Tool 4: raven_search_facts
  server.tool(
    'raven_search_facts',
    'Search confirmed facts by keyword.',
    { query: z.string(), teamId: z.string().optional(), limit: z.number().optional() },
    async ({ query, teamId, limit }) => {
      const tid = teamId || DEFAULT_TEAM_ID;
      if (!tid) return { content: [{ type: 'text', text: 'Error: No teamId provided.' }] };
      try {
        const data = await gql(
          `query GetFacts($teamId: ID!, $limit: Int) {
            getFacts(teamId: $teamId, limit: $limit) {
              id content category entityName trustTier createdAt
            }
          }`,
          { teamId: tid, limit: limit || 200 }
        );
        const q = query.toLowerCase();
        const filtered = (data.getFacts || [])
          .filter(f => f.content.toLowerCase().includes(q) || (f.entityName || '').toLowerCase().includes(q))
          .slice(0, limit || 20);
        if (!filtered.length) return { content: [{ type: 'text', text: `No facts found matching "${query}".` }] };
        let output = `**Found ${filtered.length} facts:**\n`;
        for (const f of filtered) output += `\n- [${f.category || 'general'}] ${f.content}`;
        return { content: [{ type: 'text', text: output }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      }
    }
  );

  // Tool 5: raven_list_scopes
  server.tool(
    'raven_list_scopes',
    'List available scopes for a team.',
    { teamId: z.string().optional() },
    async ({ teamId }) => {
      const tid = teamId || DEFAULT_TEAM_ID;
      if (!tid) return { content: [{ type: 'text', text: 'Error: No teamId provided.' }] };
      try {
        const data = await gql(
          `query GetScopeTree($teamId: ID!) { getScopeTree(teamId: $teamId) { id name type parentScopeId } }`,
          { teamId: tid }
        );
        const scopes = data.getScopeTree || [];
        if (!scopes.length) return { content: [{ type: 'text', text: 'No scopes found.' }] };
        let output = '**Scopes:**\n';
        for (const s of scopes) output += `\n- **${s.name}** (${s.type}) — ID: \`${s.id}\``;
        return { content: [{ type: 'text', text: output }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      }
    }
  );

  return server;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

const MCP_API_KEY = process.env.MCP_API_KEY || '';

function checkAuth(req) {
  if (!MCP_API_KEY) return true; // No key configured = open (dev mode)
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === MCP_API_KEY;
}

// ── Vercel Handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ status: 'ok', server: 'ravenloom-mcp', version: '1.0.0' });
    return;
  }

  // Auth check for all non-GET requests
  if (!checkAuth(req)) {
    res.status(401).json({ error: 'Unauthorized. Provide Bearer token in Authorization header.' });
    return;
  }

  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error('MCP handler error:', err);
    res.status(500).json({ error: err.message });
  }
}
