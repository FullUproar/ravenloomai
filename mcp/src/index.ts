/**
 * RavenLoom MCP Server
 *
 * Thin wrapper around RavenLoom's GraphQL API.
 * Lets Claude interact with the knowledge base: ask questions,
 * extract facts, confirm them, search, and list scopes.
 *
 * STDIO transport — works with Claude Desktop and Claude Code.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createServer } from "http";

// ── Config ───────────────────────────────────────────────────────────────────

const RAVENLOOM_URL = process.env.RAVENLOOM_URL || "http://localhost:4000/graphql";
const DEFAULT_TEAM_ID = process.env.RAVENLOOM_TEAM_ID || "";
const RAVENLOOM_USER_ID = process.env.RAVENLOOM_USER_ID || "";

// ── GraphQL Client ───────────────────────────────────────────────────────────

async function gql(query: string, variables: Record<string, any> = {}): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Pass user ID for auth context
  if (RAVENLOOM_USER_ID) {
    headers["x-user-id"] = RAVENLOOM_USER_ID;
  }

  const res = await fetch(RAVENLOOM_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL HTTP error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e: any) => e.message).join(", "));
  }
  return json.data;
}

// Helper: resolve teamId → scopeId (team scope)
async function getTeamScopeId(teamId: string): Promise<string> {
  const data = await gql(
    `query GetTeamScope($teamId: ID!) { getTeamScope(teamId: $teamId) { id } }`,
    { teamId }
  );
  return data.getTeamScope.id;
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "ravenloom",
  version: "1.0.0",
});

// ── Tool 1: raven_ask ────────────────────────────────────────────────────────

// @ts-ignore — TS 5.9 deep instantiation issue with Zod + MCP SDK optional params
server.tool(
  "raven_ask",
  "Ask RavenLoom a question. Returns an answer based on confirmed facts with source citations and confidence score. Raven never guesses — if it doesn't have confirmed information, it says so.",
  {
    question: z.string().describe("The natural language question to ask"),
    teamId: z.string().optional().describe("Team UUID (uses default if not provided)"),
  },
  async ({ question, teamId }) => {
    const tid = teamId || DEFAULT_TEAM_ID;
    if (!tid) {
      return { content: [{ type: "text", text: "Error: No teamId provided and RAVENLOOM_TEAM_ID not set." }] };
    }

    try {
      const scopeId = await getTeamScopeId(tid);
      const data = await gql(
        `query AskRaven($scopeId: ID!, $question: String!) {
          askRaven(scopeId: $scopeId, question: $question) {
            answer
            confidence
            factsUsed { id content sourceQuote sourceUrl createdAt }
            suggestedFollowups
          }
        }`,
        { scopeId, question }
      );

      const r = data.askRaven;
      const conf = r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "unknown";

      let text = `**Answer:** ${r.answer}\n\n**Confidence:** ${conf}`;

      if (r.factsUsed?.length > 0) {
        text += `\n\n**Sources (${r.factsUsed.length}):**`;
        for (const fact of r.factsUsed) {
          const date = fact.createdAt ? new Date(fact.createdAt).toLocaleDateString() : "";
          text += `\n- "${fact.content}"${date ? ` (${date})` : ""}`;
          if (fact.sourceUrl) text += ` [source](${fact.sourceUrl})`;
        }
      }

      if (r.suggestedFollowups?.length > 0) {
        text += `\n\n**Follow-up questions:**`;
        for (const q of r.suggestedFollowups) {
          text += `\n- ${q}`;
        }
      }

      return { content: [{ type: "text", text }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 2: raven_remember_preview ───────────────────────────────────────────

server.tool(
  "raven_remember_preview",
  "Extract facts from text without saving them. Returns a preview with extracted facts, categories, and any detected conflicts. The user should review before confirming. Use raven_remember_confirm to save.",
  {
    text: z.string().describe("The raw text to extract facts from (paste Slack threads, meeting notes, etc.)"),
    teamId: z.string().optional().describe("Team UUID (uses default if not provided)"),
    scopeId: z.string().optional().describe("Specific scope ID (defaults to team scope)"),
  },
  async ({ text, teamId, scopeId }) => {
    const tid = teamId || DEFAULT_TEAM_ID;
    if (!tid) {
      return { content: [{ type: "text", text: "Error: No teamId provided and RAVENLOOM_TEAM_ID not set." }] };
    }

    try {
      const sid = scopeId || await getTeamScopeId(tid);
      const data = await gql(
        `mutation PreviewRemember($scopeId: ID!, $statement: String!) {
          previewRemember(scopeId: $scopeId, statement: $statement) {
            previewId
            sourceText
            extractedTriples {
              subject
              subjectType
              relationship
              object
              objectType
              contexts { name type }
              confidence
              trustTier
              displayText
              isNew
            }
            conflicts {
              existingDisplayText
              conflictType
              explanation
              similarity
            }
            isMismatch
            mismatchSuggestion
          }
        }`,
        { scopeId: sid, statement: text }
      );

      const r = data.previewRemember;
      const triples = r.extractedTriples || [];
      let output = `**Preview ID:** \`${r.previewId}\`\n`;
      output += `**Extracted ${triples.length} knowledge triples:**\n`;

      triples.forEach((t: any, i: number) => {
        const ctxStr = t.contexts?.length > 0
          ? ` [${t.contexts.map((c: any) => c.name).join(', ')}]`
          : '';
        const conf = t.confidence != null ? ` (confidence: ${Math.round(t.confidence * 100)}%)` : '';
        const newStr = t.isNew ? ' 🆕' : '';
        output += `\n${i + 1}. **${t.subject}** → _${t.relationship}_ → **${t.object}**${ctxStr}${conf}${newStr}`;
      });

      if (r.conflicts?.length > 0) {
        output += `\n\n**Conflicts detected:**`;
        for (const c of r.conflicts) {
          output += `\n⚠ ${c.conflictType}: ${c.explanation}`;
          if (c.existingDisplayText) output += `\n  Existing: "${c.existingDisplayText}"`;
        }
      }

      if (r.isMismatch) {
        output += `\n\n⚠ ${r.mismatchSuggestion || "This looks like a question — did you mean to use raven_ask instead?"}`;
      }

      output += `\n\n**To save these triples**, call \`raven_remember_confirm\` with preview ID \`${r.previewId}\`.`;

      return { content: [{ type: "text", text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 3: raven_remember_confirm ───────────────────────────────────────────

server.tool(
  "raven_remember_confirm",
  "Confirm and save knowledge triples from a remember preview. Pass the preview ID from raven_remember_preview. Optionally skip specific conflict IDs to keep existing knowledge instead of overwriting.",
  {
    previewId: z.string().describe("The preview ID from raven_remember_preview"),
    skipConflictIds: z.array(z.string()).optional().describe("IDs of existing triples to keep (don't overwrite)"),
  },
  async ({ previewId, skipConflictIds }) => {
    try {
      const data = await gql(
        `mutation ConfirmRemember($previewId: ID!, $skipConflictIds: [ID!]) {
          confirmRemember(previewId: $previewId, skipConflictIds: $skipConflictIds) {
            success
            factsCreated { id content }
            factsUpdated { id content }
            message
          }
        }`,
        { previewId, skipConflictIds: skipConflictIds || [] }
      );

      const r = data.confirmRemember;
      let output = r.success ? "**Confirmed!**\n" : "**Failed to confirm.**\n";
      if (r.message) output += `${r.message}\n`;

      if (r.factsCreated?.length > 0) {
        output += `\n**New triples saved (${r.factsCreated.length}):**`;
        for (const f of r.factsCreated) {
          output += `\n- ${f.content}`;
        }
      }

      if (r.factsUpdated?.length > 0) {
        output += `\n\n**Updated triples (${r.factsUpdated.length}):**`;
        for (const f of r.factsUpdated) {
          output += `\n- ${f.content}`;
        }
      }

      return { content: [{ type: "text", text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 4: raven_search_facts ───────────────────────────────────────────────

// @ts-ignore — TS 5.9 deep instantiation issue with Zod + MCP SDK optional params
server.tool(
  "raven_search_facts",
  "Search ALL knowledge (both legacy facts and graph triples) by keyword. Returns matching content from the entire knowledge base.",
  {
    query: z.string().describe("Search terms or keywords"),
    teamId: z.string().optional().describe("Team UUID (uses default if not provided)"),
    limit: z.number().optional().describe("Max results to return (default: 20)"),
  },
  async ({ query, teamId, limit }) => {
    const tid = teamId || DEFAULT_TEAM_ID;
    if (!tid) {
      return { content: [{ type: "text", text: "Error: No teamId provided and RAVENLOOM_TEAM_ID not set." }] };
    }

    try {
      const data = await gql(
        `query SearchKnowledge($teamId: ID!, $query: String!, $limit: Int) {
          searchKnowledge(teamId: $teamId, query: $query, limit: $limit) {
            id content source conceptName relationship category trustTier confidence createdAt
          }
        }`,
        { teamId: tid, query, limit: limit || 20 }
      );

      const results = data.searchKnowledge || [];

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No knowledge found matching "${query}".` }] };
      }

      let output = `**Found ${results.length} results for "${query}":**\n`;

      for (const r of results) {
        const icon = r.source === "triple" ? "🔗" : "📄";
        const concept = r.conceptName ? ` (${r.conceptName})` : "";
        output += `\n${icon} ${r.content}${concept}`;
      }

      return { content: [{ type: "text", text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 5: raven_list_scopes ────────────────────────────────────────────────

server.tool(
  "raven_list_scopes",
  "List available scopes (teams, projects, sub-scopes) for a team. Useful for understanding how knowledge is organized and targeting specific scopes.",
  {
    teamId: z.string().optional().describe("Team UUID (uses default if not provided)"),
  },
  async ({ teamId }) => {
    const tid = teamId || DEFAULT_TEAM_ID;
    if (!tid) {
      return { content: [{ type: "text", text: "Error: No teamId provided and RAVENLOOM_TEAM_ID not set." }] };
    }

    try {
      const data = await gql(
        `query GetScopeTree($teamId: ID!) {
          getScopeTree(teamId: $teamId) {
            id
            name
            type
            parentScopeId
          }
        }`,
        { teamId: tid }
      );

      const scopes = data.getScopeTree || [];

      if (scopes.length === 0) {
        return { content: [{ type: "text", text: "No scopes found for this team." }] };
      }

      // Build a simple tree display
      const roots = scopes.filter((s: any) => !s.parentScopeId);
      const children = (parentId: string) => scopes.filter((s: any) => s.parentScopeId === parentId);

      let output = `**Scopes for team:**\n`;

      const renderScope = (scope: any, indent: number) => {
        const prefix = "  ".repeat(indent) + (indent > 0 ? "└─ " : "");
        output += `\n${prefix}**${scope.name}** (${scope.type}) — ID: \`${scope.id}\``;
        for (const child of children(scope.id)) {
          renderScope(child, indent + 1);
        }
      };

      for (const root of roots) {
        renderScope(root, 0);
      }

      return { content: [{ type: "text", text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 6: raven_get_usage_stats ────────────────────────────────────────────

server.tool(
  "raven_get_usage_stats",
  "Get AI token usage and estimated cost for the team. Shows usage breakdown by operation (ask, extract, embed, groom, etc.) and total estimated cost in USD.",
  {
    teamId: z.string().optional().describe("Team UUID (uses default if not provided)"),
  },
  async ({ teamId }) => {
    const tid = teamId || DEFAULT_TEAM_ID;
    if (!tid) {
      return { content: [{ type: "text", text: "Error: No teamId provided and RAVENLOOM_TEAM_ID not set." }] };
    }

    try {
      const data = await gql(
        `query GetTokenUsage($teamId: ID!) {
          getTokenUsage(teamId: $teamId) {
            totalInputTokens
            totalOutputTokens
            totalEstimatedCostUsd
            totalCalls
            byOperation {
              operation
              inputTokens
              outputTokens
              estimatedCostUsd
              callCount
            }
          }
        }`,
        { teamId: tid }
      );

      const r = data.getTokenUsage;
      let output = `**Token Usage Summary**\n`;
      output += `Total calls: ${r.totalCalls}\n`;
      output += `Total tokens: ${(r.totalInputTokens + r.totalOutputTokens).toLocaleString()} (${r.totalInputTokens.toLocaleString()} in, ${r.totalOutputTokens.toLocaleString()} out)\n`;
      output += `Estimated cost: $${r.totalEstimatedCostUsd.toFixed(4)}\n`;

      if (r.byOperation?.length > 0) {
        output += `\n**By Operation:**`;
        for (const op of r.byOperation) {
          output += `\n- ${op.operation}: ${op.callCount} calls, ${(op.inputTokens + op.outputTokens).toLocaleString()} tokens, $${op.estimatedCostUsd.toFixed(4)}`;
        }
      }

      return { content: [{ type: "text", text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 7: raven_detect_gaps ─────────────────────────────────────────────────

// @ts-ignore
server.tool(
  "raven_detect_gaps",
  "Detect knowledge gaps in the knowledge base. Raven analyzes its own graph to find concepts with missing identity, thin knowledge, or missing relationships, and generates natural questions to fill the gaps. Use 'focus' to narrow to a specific domain (e.g., 'games', 'accounting', 'products').",
  {
    focus: z.string().optional().describe("Optional focus area — e.g., 'games', 'accounting', 'manufacturing'. Narrows gap detection to related concepts."),
    maxQuestions: z.number().optional().describe("Max number of gap questions to return (default: 10)"),
    teamId: z.string().optional().describe("Team UUID (uses default if not provided)"),
  },
  async ({ focus, maxQuestions, teamId }) => {
    const tid = teamId || DEFAULT_TEAM_ID;
    if (!tid) {
      return { content: [{ type: "text", text: "Error: No teamId provided and RAVENLOOM_TEAM_ID not set." }] };
    }

    try {
      const data = await gql(
        `query GetKnowledgeGaps($teamId: ID!, $focus: String, $maxQuestions: Int) {
          getKnowledgeGaps(teamId: $teamId, focus: $focus, maxQuestions: $maxQuestions) {
            conceptName
            conceptType
            gapType
            question
            priority
            context
          }
        }`,
        { teamId: tid, focus: focus || null, maxQuestions: maxQuestions || 10 }
      );

      const gaps = data.getKnowledgeGaps || [];
      if (gaps.length === 0) {
        return { content: [{ type: "text", text: focus ? `No knowledge gaps found for "${focus}". The knowledge base looks solid in that area!` : "No significant knowledge gaps detected. The knowledge base is in good shape!" }] };
      }

      let output = focus
        ? `**Knowledge gaps related to "${focus}" (${gaps.length} found):**\n`
        : `**Top knowledge gaps (${gaps.length} found):**\n`;

      gaps.forEach((g: any, i: number) => {
        const icon = g.gapType === 'missing_identity' ? '❓' : g.gapType === 'thin_knowledge' ? '📄' : g.gapType === 'missing_relationship' ? '🔗' : g.gapType === 'undescribed' ? '👻' : '⏰';
        output += `\n${i + 1}. ${icon} **${g.conceptName}** (${g.gapType.replace(/_/g, ' ')})\n`;
        output += `   ${g.question}\n`;
        if (g.context) output += `   _${g.context}_\n`;
      });

      output += `\nTo fill a gap, use \`raven_remember_preview\` with the answer text, then \`raven_remember_confirm\` to save it.`;

      return { content: [{ type: "text", text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 8: raven_gap_summary ─────────────────────────────────────────────────

server.tool(
  "raven_gap_summary",
  "Get a high-level summary of knowledge base health — how many concepts have identity, how many are thin, undescribed, or stale. Useful for understanding where the knowledge base needs attention.",
  {
    teamId: z.string().optional().describe("Team UUID (uses default if not provided)"),
  },
  async ({ teamId }) => {
    const tid = teamId || DEFAULT_TEAM_ID;
    if (!tid) {
      return { content: [{ type: "text", text: "Error: No teamId provided and RAVENLOOM_TEAM_ID not set." }] };
    }

    try {
      const data = await gql(
        `query GetGapSummary($teamId: ID!) {
          getGapSummary(teamId: $teamId) {
            totalConcepts
            totalTriples
            conceptsWithIdentity
            conceptsWithoutIdentity
            thinConcepts
            undescribedConcepts
            staleConcepts
            topGapAreas { area gapCount }
          }
        }`,
        { teamId: tid }
      );

      const s = data.getGapSummary;
      const identityPct = s.totalConcepts > 0 ? Math.round(s.conceptsWithIdentity / s.totalConcepts * 100) : 0;

      let output = `**Knowledge Base Health**\n`;
      output += `- **${s.totalConcepts}** concepts, **${s.totalTriples}** knowledge triples\n`;
      output += `- **${identityPct}%** of concepts have identity (${s.conceptsWithIdentity}/${s.totalConcepts})\n`;
      output += `- **${s.conceptsWithoutIdentity}** concepts missing identity ("what is this?")\n`;
      output += `- **${s.thinConcepts}** thin concepts (fewer than 3 facts)\n`;
      output += `- **${s.undescribedConcepts}** referenced but undescribed concepts\n`;
      output += `- **${s.staleConcepts}** stale concepts (no updates in 30+ days)\n`;

      if (s.topGapAreas?.length > 0) {
        output += `\n**Gap areas by type:**\n`;
        for (const a of s.topGapAreas) {
          output += `- ${a.area}: ${a.gapCount} gaps\n`;
        }
      }

      output += `\nUse \`raven_detect_gaps\` with a focus area to see specific questions.`;

      return { content: [{ type: "text", text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 9: raven_groom ───────────────────────────────────────────────────────

server.tool(
  "raven_groom",
  "Trigger knowledge graph grooming. This runs automated maintenance: merging duplicate concepts, pruning universal knowledge, discovering missing contexts, proposing inferences, and refining generic relationships. Returns a report of what was done.",
  {
    teamId: z.string().optional().describe("Team UUID (uses default if not provided)"),
  },
  async ({ teamId }) => {
    const tid = teamId || DEFAULT_TEAM_ID;
    if (!tid) {
      return { content: [{ type: "text", text: "Error: No teamId provided and RAVENLOOM_TEAM_ID not set." }] };
    }

    try {
      const data = await gql(
        `mutation GroomTripleGraph($teamId: ID!) {
          groomTripleGraph(teamId: $teamId) {
            decomposed pruned contextsDiscovered relationshipsRefined
            autoMerged mergeProposals { conceptA { name } conceptB { name } similarity }
            inferences
            stats { totalConcepts totalTriples orphanConcepts }
          }
        }`,
        { teamId: tid }
      );

      const r = data.groomTripleGraph;
      const mergeCount = r.autoMerged?.length || (typeof r.autoMerged === 'number' ? r.autoMerged : 0);
      const proposalCount = r.mergeProposals?.length || 0;
      const infCount = r.inferences?.length || (typeof r.inferences === 'number' ? r.inferences : 0);
      let output = `**Grooming Complete**\n\n`;
      output += `- Decomposed: ${r.decomposed}\n`;
      output += `- Auto-merged: ${mergeCount}\n`;
      output += `- Merge proposals: ${proposalCount}\n`;
      output += `- Pruned: ${r.pruned}\n`;
      output += `- Contexts discovered: ${r.contextsDiscovered}\n`;
      output += `- Inferences: ${infCount}\n`;
      output += `- Relationships refined: ${r.relationshipsRefined}\n`;
      if (r.stats) output += `\n**Graph:** ${r.stats.totalConcepts} concepts, ${r.stats.totalTriples} triples, ${r.stats.orphanConcepts} orphans\n`;
      if (proposalCount > 0) {
        output += `\n**Top merge proposals:**`;
        for (const p of r.mergeProposals.slice(0, 5)) {
          output += `\n- ${p.conceptA.name} ≈ ${p.conceptB.name} (${Math.round(p.similarity * 100)}%)`;
        }
      }

      return { content: [{ type: "text", text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Start Server ─────────────────────────────────────────────────────────────

const MCP_PORT = parseInt(process.env.MCP_PORT || "0", 10);
const MCP_MODE = process.env.MCP_MODE || (MCP_PORT > 0 ? "http" : "stdio");

async function main() {
  if (MCP_MODE === "http") {
    // HTTP transport — for claude.ai and remote clients
    const port = MCP_PORT || 3100;

    const httpServer = createServer(async (req, res) => {
      // CORS headers for claude.ai
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // Only handle /mcp path
      const url = new URL(req.url || "/", `http://localhost:${port}`);
      if (url.pathname !== "/mcp") {
        if (url.pathname === "/" || url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", server: "ravenloom-mcp", version: "1.0.0" }));
          return;
        }
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      // Create a transport per session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });

      // Connect server to this transport
      await server.connect(transport);

      // Handle the request
      await transport.handleRequest(req, res);
    });

    httpServer.listen(port, () => {
      console.error(`RavenLoom MCP server running on HTTP port ${port}`);
      console.error(`  Endpoint: http://localhost:${port}/mcp`);
      console.error(`  Health:   http://localhost:${port}/health`);
    });
  } else {
    // STDIO transport — for Claude Desktop and Claude Code
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("RavenLoom MCP server running on STDIO");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
