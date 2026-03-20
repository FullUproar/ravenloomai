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
import { z } from "zod";

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
            extractedFacts {
              content
              entityType
              entityName
              category
              confidenceScore
            }
            conflicts {
              existingFact { id content }
              conflictType
              explanation
            }
            isMismatch
            mismatchSuggestion
          }
        }`,
        { scopeId: sid, statement: text }
      );

      const r = data.previewRemember;
      let output = `**Preview ID:** \`${r.previewId}\`\n`;
      output += `**Extracted ${r.extractedFacts.length} facts:**\n`;

      r.extractedFacts.forEach((fact: any, i: number) => {
        const cat = fact.category ? `[${fact.category.toUpperCase()}]` : "";
        const entity = fact.entityName ? `${fact.entityName} →` : "";
        const conf = fact.confidenceScore != null ? ` (confidence: ${Math.round(fact.confidenceScore * 100)}%)` : "";
        output += `\n${i + 1}. ${cat} ${entity} "${fact.content}"${conf}`;
      });

      if (r.conflicts?.length > 0) {
        output += `\n\n**Conflicts detected:**`;
        for (const c of r.conflicts) {
          output += `\n⚠ ${c.conflictType}: ${c.explanation}`;
          output += `\n  Existing: "${c.existingFact.content}"`;
        }
      }

      if (r.isMismatch) {
        output += `\n\n⚠ ${r.mismatchSuggestion || "This looks like a question — did you mean to use raven_ask instead?"}`;
      }

      output += `\n\n**To save these facts**, call \`raven_remember_confirm\` with preview ID \`${r.previewId}\`.`;

      return { content: [{ type: "text", text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 3: raven_remember_confirm ───────────────────────────────────────────

server.tool(
  "raven_remember_confirm",
  "Confirm and save facts from a remember preview. Pass the preview ID from raven_remember_preview. Optionally skip specific conflict IDs to keep existing facts instead of overwriting.",
  {
    previewId: z.string().describe("The preview ID from raven_remember_preview"),
    skipConflictIds: z.array(z.string()).optional().describe("IDs of existing facts to keep (don't overwrite)"),
  },
  async ({ previewId, skipConflictIds }) => {
    try {
      const data = await gql(
        `mutation ConfirmRemember($previewId: ID!, $skipConflictIds: [ID!]) {
          confirmRemember(previewId: $previewId, skipConflictIds: $skipConflictIds) {
            success
            factsCreated { id content }
            factsUpdated { id content }
            nodeCreated { id name type }
            attachedToNodeId
            message
          }
        }`,
        { previewId, skipConflictIds: skipConflictIds || [] }
      );

      const r = data.confirmRemember;
      let output = r.success ? "**Confirmed!**\n" : "**Failed to confirm.**\n";
      if (r.message) output += `${r.message}\n`;

      if (r.factsCreated?.length > 0) {
        output += `\n**New facts saved (${r.factsCreated.length}):**`;
        for (const f of r.factsCreated) {
          output += `\n- ${f.content}`;
        }
      }

      if (r.factsUpdated?.length > 0) {
        output += `\n\n**Updated facts (${r.factsUpdated.length}):**`;
        for (const f of r.factsUpdated) {
          output += `\n- ${f.content}`;
        }
      }

      if (r.nodeCreated) {
        output += `\n\n**Knowledge graph:** Created/updated node "${r.nodeCreated.name}" (${r.nodeCreated.type})`;
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
  "Search confirmed facts in the knowledge base. Returns matching facts with their content, category, source, and when they were confirmed.",
  {
    query: z.string().describe("Search terms or keywords"),
    teamId: z.string().optional().describe("Team UUID (uses default if not provided)"),
    category: z.string().optional().describe("Filter by category: product, process, people, policy, technical, sales, marketing, financial, legal, general"),
    limit: z.number().optional().describe("Max results to return (default: 20)"),
  },
  async ({ query, teamId, category, limit }) => {
    const tid = teamId || DEFAULT_TEAM_ID;
    if (!tid) {
      return { content: [{ type: "text", text: "Error: No teamId provided and RAVENLOOM_TEAM_ID not set." }] };
    }

    try {
      // Use getFacts with client-side filtering (semantic search via askRaven is also available)
      const data = await gql(
        `query GetFacts($teamId: ID!, $category: String, $limit: Int) {
          getFacts(teamId: $teamId, category: $category, limit: $limit) {
            id
            content
            category
            entityType
            entityName
            trustTier
            sourceQuote
            sourceUrl
            createdByUser { displayName email }
            createdAt
          }
        }`,
        { teamId: tid, category: category || null, limit: limit || 200 }
      );

      const facts = data.getFacts || [];

      // Client-side keyword filter
      const q = query.toLowerCase();
      const filtered = facts.filter((f: any) =>
        f.content.toLowerCase().includes(q) ||
        (f.entityName || "").toLowerCase().includes(q) ||
        (f.sourceQuote || "").toLowerCase().includes(q)
      ).slice(0, limit || 20);

      if (filtered.length === 0) {
        return { content: [{ type: "text", text: `No confirmed facts found matching "${query}".` }] };
      }

      let output = `**Found ${filtered.length} facts matching "${query}":**\n`;

      for (const f of filtered) {
        const cat = f.category ? `[${f.category}]` : "";
        const tier = f.trustTier === "official" ? " (Official)" : "";
        const date = f.createdAt ? new Date(f.createdAt).toLocaleDateString() : "";
        const who = f.createdByUser?.displayName || f.createdByUser?.email || "";

        output += `\n- ${cat} ${f.content}${tier}`;
        if (date || who) output += `\n  ${who ? `Confirmed by ${who}` : ""}${date ? ` on ${date}` : ""}`;
        if (f.sourceQuote) output += `\n  Source: "${f.sourceQuote.substring(0, 80)}..."`;
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

// ── Start Server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("RavenLoom MCP server running on STDIO");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
