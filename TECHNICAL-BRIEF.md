# RavenLoom Technical Architecture Brief

**Version:** March 2026 | **Status:** Active Development (Phase 1 — POC/Dogfooding)

---

## 1. What RavenLoom Is

RavenLoom is an AI-powered knowledge system with **supervised fact extraction**. Users paste text (Slack threads, meeting notes, docs), Raven extracts atomic facts as knowledge graph triples, humans confirm/edit/reject each one, and confirmed triples become queryable with full source attribution. It never guesses. The knowledge base is a byproduct of work, not a wiki anyone maintains.

**Positioning:** "The thing that answers questions so your team doesn't have to."

**Core differentiator:** No mainstream tool makes mandatory atomic confirmation the default ingestion path. Every competitor (Glean, Notion AI, Guru, Tettra) either automates ingestion unsupervised or requires manual wiki authoring.

---

## 2. System Architecture

```
                    Claude.ai / Claude Desktop / Claude Code
                                    |
                              MCP Protocol
                                    |
                          RavenLoom MCP Server
                          (stateless JSON-RPC)
                                    |
    Browser (React SPA) -----> Vercel Serverless -----> PostgreSQL + pgvector
         |                    /api/graphql               (Prisma Postgres)
         |                    /api/mcp
         |                    /api/ask-stream (SSE)
         |                         |
         +--- Firebase Auth -------+--- OpenAI (embeddings)
                                   +--- Claude Sonnet 4.6 (extraction, answers)
                                   +--- GPT-4o-mini (classification, routing)
```

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 + Apollo Client 3 |
| Backend | Node/Express + Apollo Server 4 (GraphQL) |
| Database | PostgreSQL + pgvector (1536-dim embeddings) |
| Deployment | Vercel (serverless functions + static SPA) |
| Auth | Firebase Auth (Google OAuth + email/password) |
| AI — Extraction | Claude Sonnet 4.6 (primary), GPT-4o (fallback) |
| AI — Retrieval | GPT-4o-mini (classification, routing, reranking) |
| AI — Embeddings | OpenAI text-embedding-3-small (1536-dim) |
| MCP | Stateless JSON-RPC over HTTP (claude.ai compatible) |

---

## 3. The Triple-Based Knowledge Graph

### 3.1 Why Triples, Not Documents

Traditional RAG indexes chunks of documents. RavenLoom decomposes text into **atomic triples**: `Subject → Relationship → Object`. This enables:

- **Precise retrieval** — find the specific fact, not a paragraph that contains it
- **Conflict detection** — two triples with the same subject+relationship but different objects = conflict
- **Graph traversal** — follow connections (A manufactures B, B ships via C → A's supply chain)
- **Trust per-fact** — each triple carries its own confidence, source, and trust tier
- **Temporal validity** — facts can have valid_from/valid_until without versioning documents

### 3.2 Core Schema (3 Tables)

#### `concepts` — Nodes in the graph

```sql
concepts (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL,
  canonical_name TEXT NOT NULL,      -- lowercase, trimmed (dedup key)
  name TEXT NOT NULL,                -- display name with original casing
  type TEXT,                         -- person, product, company, concept, date, event, location
  aliases TEXT[] DEFAULT '{}',       -- alternate names (auto-merged)
  embedding vector(1536),            -- for fuzzy concept matching
  mention_count INTEGER DEFAULT 1,   -- frequency tracking
  properties JSONB DEFAULT '{}',     -- extensible metadata
  UNIQUE(team_id, canonical_name, type)
)
```

**Design decision:** `canonical_name` normalization means "HacK YoUr DeCk", "hack your deck", and "Hack Your Deck" all resolve to the same concept automatically at insert time. No post-hoc dedup needed for name variants.

#### `triples` — Atoms of knowledge

```sql
triples (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL,
  scope_id UUID,                          -- which scope this fact belongs to
  subject_id UUID REFERENCES concepts,    -- the entity this fact is about
  relationship TEXT NOT NULL,             -- natural verb phrase: "launches on", "manufactures"
  object_id UUID REFERENCES concepts,     -- the target entity
  display_text TEXT,                      -- cached human-readable: "Hack Your Deck launches July 1"

  -- DUAL EMBEDDINGS (key innovation)
  embedding_with_context vector(1536),    -- "HYD launches July 1 [Mayhem Machine, Q3 2026]"
  embedding_without_context vector(1536), -- "HYD launches July 1"

  -- Trust & Confidence
  confidence FLOAT DEFAULT 0.9,          -- extraction confidence (0.0-1.0)
  trust_tier TEXT DEFAULT 'tribal',      -- 'official' (canonical docs) or 'tribal' (conversation)

  -- Lifecycle
  status TEXT DEFAULT 'active',          -- active, superseded, archived, pruned
  superseded_by UUID,                    -- pointer to newer triple
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,

  -- Grooming metadata
  is_chunky BOOLEAN DEFAULT false,       -- flagged for decomposition
  is_universal BOOLEAN DEFAULT false,    -- "JavaScript is a language" (prune candidate)
  is_protected BOOLEAN DEFAULT false,    -- immutable (canonical documentation)
  groomed_from_id UUID,                  -- parent triple if this was decomposed from another

  -- Provenance
  source_text TEXT,                      -- verbatim original input
  source_url TEXT,
  source_type TEXT,                      -- user_statement, document, conversation, grooming, inference
  created_by VARCHAR(128)
)
```

**Dual embeddings explained:** Every triple stores TWO embeddings of its display text:
- `with_context`: includes scope/context tags — better for scoped queries ("In Q2 2026, what launches?")
- `without_context`: raw fact only — better for cross-scope aggregation ("List all launches by date")

This lets the same table serve both scoped and unscoped search without query complexity.

#### `context_nodes` — Situational conditions

```sql
context_nodes (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL,
  name TEXT NOT NULL,                -- "Q1 2026", "Client X", "Marketing Team"
  type TEXT,                         -- temporal, spatial, organizational, conditional
  parent_id UUID,                    -- forms a tree (Q1 2026 → 2026 → All Time)
  is_dynamic BOOLEAN DEFAULT false,  -- resolves at query time ("current quarter")
  UNIQUE(team_id, name, type)
)
```

**Context gating:** Triples are linked to contexts via a `triple_contexts` junction table. Query-time filtering: "What's true in Q1 2026?" only returns triples gated to Q1 2026 or its ancestors.

### 3.3 Graph Topology

The graph naturally forms a **hierarchical structure**:

```
Full Uproar Games (company, degree 200+)
├── Fugly's Mayhem Machine Line (concept, degree 20)
│   ├── Hack Your Deck (product, degree 16)
│   │   ├── launches on → July 1, 2026
│   │   ├── modifies → card-based games
│   │   └── manufactured by → Panda Games
│   ├── Splice Your Dice (product)
│   ├── Crime and Funishment (product)
│   └── Dumbest Ways To Win (product)
├── Afterroar HQ (product, degree 40+)
│   ├── has pricing → Free / Pro $5/mo / Venue $10/mo
│   ├── launches on → May 1, 2026
│   └── has features → Venue Ecosystem (category)
│       ├── venue profiles
│       ├── game lending
│       └── analytics dashboard
├── Technology Stack (concept)
│   ├── Stripe → payments
│   ├── Vercel → hosting
│   └── Supabase → Chaos Agent backend
└── Revenue Targets (concept)
    ├── $10-20M by March 2028
    └── $100M by 2031
```

**Fan-out mitigation:** When extraction detects 4+ triples from the same subject with semantically similar relationships, it auto-creates an intermediate **category node**:

```
Before: FUG → uses → Stripe, FUG → uses → Vercel, FUG → uses → Supabase
After:  FUG → has tech stack → Technology Stack
        Technology Stack → uses → Stripe
        Technology Stack → uses → Vercel
        Technology Stack → uses → Supabase
```

Bridge edge confidence inherits from children: `max(0.85, avg(child_confidence) * 0.98)`.

---

## 4. The Remember Pipeline (Ingestion)

```
User pastes text
    ↓
previewRemember mutation
    ↓
┌─────────────────────────────────────────────┐
│ TripleExtractionService                      │
│                                              │
│ 1. LLM Extraction (Claude Sonnet 4.6)       │
│    - System prompt enforces atomicity        │
│    - Rejects universal knowledge             │
│    - Detects updates vs new facts            │
│    - Extracts: subject, relationship, object,│
│      confidence, trustTier, contexts         │
│                                              │
│ 2. Fan-Out Detection                         │
│    - Groups triples by subject               │
│    - If 4+ similar relationships → cluster   │
│    - Auto-creates category nodes             │
│                                              │
│ 3. Conflict Detection                        │
│    - Embeds each new triple                  │
│    - Cosine similarity against existing      │
│    - >0.95 = duplicate, >0.85 = conflict     │
│    - Same subject+rel+different obj = update  │
│                                              │
│ 4. Concept Resolution                        │
│    - Exact match on canonical_name            │
│    - Fuzzy match via embedding (>0.92)        │
│    - Reuses existing concepts, avoids dupes   │
└─────────────────────────────────────────────┘
    ↓
Returns: previewId, extractedTriples[], conflicts[]
    ↓
User reviews, edits, confirms
    ↓
confirmRemember mutation
    ↓
┌─────────────────────────────────────────────┐
│ TripleService                                │
│                                              │
│ 1. Upsert concepts (ON CONFLICT merge)       │
│ 2. Create triples with dual embeddings       │
│ 3. Link to contexts                          │
│ 4. Handle conflicts (supersede old triples)  │
│ 5. Log confirmation event (for trust model)  │
│ 6. Place in SST (Semantic Scope Tree)        │
└─────────────────────────────────────────────┘
```

### Extraction Prompt Design

The Claude Sonnet 4.6 extraction prompt enforces:

- **Atomicity:** "If input says 'A is X and Y', split into two triples"
- **Institutional knowledge only:** "Blue is a color" is rejected; "Our booth is #1847 at Gen Con" is kept
- **Existing concept reuse:** "Prefer reusing existing concepts by canonical name"
- **Completeness:** "If input lists 3 products, extract 3 separate triples"
- **Natural relationships:** "launches on" not "LAUNCHES_ON"
- **Update detection:** Signals like "pushed back to", "changed to", "now using" trigger supersession logic

---

## 5. The Ask Pipeline (Retrieval)

```
User asks question
    ↓
askRaven query
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Conversation Context                                     │
│   - Detect follow-ups ("What about that?")                       │
│   - Rewrite as standalone question using history                 │
│                                                                  │
│ Step 2: Query Planning (GPT-4o-mini, ~200ms)                    │
│   - Classify: factual, listing, counting, timeline, exhaustive   │
│   - For listing/counting: pre-scan graph for structured results  │
│                                                                  │
│ Step 2a: SST Routing                                             │
│   - Route query to most relevant part of the graph               │
│   - Cache → Vector similarity → LLM disambiguation (fallback)   │
│                                                                  │
│ Step 3: Four-Strategy Search (TripleRetrievalService)            │
│   ┌──────────────────────────────────────────────────┐           │
│   │ Strategy 1: with_context embedding search         │           │
│   │ Strategy 2: without_context embedding search      │           │
│   │ Strategy 3: Concept-anchored search               │           │
│   │   a) Embedding similarity on concepts             │           │
│   │   b) Keyword matching with word-count scoring     │           │
│   │   c) LLM entity extraction                        │           │
│   │   d) Collection node detection (contains/includes)│           │
│   │ Strategy 4: Trust-weighted blending               │           │
│   └──────────────────────────────────────────────────┘           │
│   Results merged by max similarity per triple                    │
│                                                                  │
│ Step 4: Multi-Hop Expansion (ALWAYS runs)                        │
│   - 3 hops max, 0.85 decay per hop                              │
│   - Hub detection (degree > 60) limits traversal                 │
│   - Similarity capped at 0.6 (below embedding results)          │
│                                                                  │
│ Step 4b: Collection Expansion (mandatory 2-hop)                  │
│   - For every concept in results, fetch ALL connected triples    │
│   - Then fetch THEIR connected triples (grandchildren)           │
│   - Ensures: Line → contains → HYD → modifies → card games      │
│   - Similarity: children 0.65, grandchildren 0.55               │
│                                                                  │
│ Step 5: Filter + Rerank                                          │
│   - Filter: similarity > 0.3                                     │
│   - If >30 triples: skip LLM rerank, use similarity sort        │
│   - If ≤30: LLM rerank (GPT-4o-mini selects most relevant)      │
│   - Top 15 selected for answer context                           │
│                                                                  │
│ Step 6: Answer Generation (Claude Sonnet 4.6)                    │
│   - System prompt: ONLY use provided knowledge statements        │
│   - Relevance check before answering                             │
│   - Returns: answer, confidence (0.0-1.0), follow-ups            │
│   - If no relevant knowledge: "I don't have confirmed knowledge" │
└─────────────────────────────────────────────────────────────────┘
```

### Word-Count Scoring for Entity Resolution

When matching query terms to concepts by keyword, similarity is scored by how many question words appear in the concept name:

```
similarity = 0.70 + 0.08 × matchCount
```

| Matches | Score | Example |
|---------|-------|---------|
| 1 word | 0.78 | "games" matches "Full Uproar **Games** trademark" |
| 2 words | 0.86 | "mayhem machine" matches "Fugly's **Mayhem Machine**" |
| 3 words | 0.94 | "mayhem machine line" matches "Fugly's **Mayhem Machine Line**" |

Concept filter threshold: **0.82** — keeps 2+ word matches, filters single-word noise.

### Hub Node Handling

High-degree concepts (degree > 50) get a **0.15 similarity penalty** and are limited to **5 triples** in concept-anchored search. This prevents the company hub ("Full Uproar Games, Inc." with 200+ connections) from dominating every query.

### Dual Embedding Search Strategy

Every triple has two embeddings:

| Embedding | Content | Best For |
|-----------|---------|----------|
| `with_context` | "HYD launches July 1 [Mayhem Machine, Q3]" | Scoped queries, context filtering |
| `without_context` | "HYD launches July 1" | Cross-scope aggregation, broad search |

Both are searched in parallel, results merged by max similarity per triple.

---

## 6. Trust Model

### Beta Distribution Scoring

Trust is modeled as a Beta distribution per (source, topic) pair:

```
score = α / (α + β)

where:
  α = confirmed_count + prior_α
  β = rejected_count + prior_β
```

**Cold start priors:**
- Official sources: Beta(3, 1) = 0.75 (biased toward trust)
- Tribal sources: Beta(1, 1) = 0.50 (neutral)

**Outcome recording:**
| Action | α change | β change |
|--------|----------|----------|
| Confirmed without edit | +1 | 0 |
| Auto-confirmed | +1 | 0 |
| Confirmed with edit | +0.5 | +0.5 |
| Rejected | 0 | +1 |
| Corrected by another user | 0 | +2 |

### Hierarchical Topic Resolution

Trust isn't global — the same source can be trusted on Product topics but untrusted on Personnel:

1. Check exact topic match: `topic_id = <specific context>`
2. Walk up context tree: Q1 2026 → 2026 → All Time
3. Fall back to global trust: `topic_id = NULL`
4. Default: Beta(1,1) = 0.5

### Two Trust Tiers on Every Triple

- **Official:** Extracted from canonical documents (contracts, brand guides, SOWs). Higher default authority.
- **Tribal:** Extracted from flow of work (Slack, meeting notes, pasted recaps). Lower default authority. When answering, Raven communicates the distinction.

---

## 7. Semantic Scope Tree (SST)

The SST is an **internal routing tree** that localizes queries to the most relevant part of the graph. Users see flat scopes; SST is invisible infrastructure.

### Routing Algorithm

```
1. Check route cache (instant, free)         → 80%+ of queries
2. Vector similarity on SST node embeddings  → fast fallback
3. LLM disambiguation (GPT-4o-mini)          → only if top 2 candidates within 0.08
```

**Clear winner condition:** If top candidate leads second by > 0.08 similarity, use it directly without LLM. This makes 80%+ of routing free after warmup.

### Automatic Tree Growth

When new triples are added, the SST places them:
1. If tree is empty → create root
2. Find best existing node by embedding similarity
3. If similarity > 0.75 → tag triple to that node
4. If no good match → create new SST node

---

## 8. Graph Grooming (On-Demand)

All grooming operations are triggered by the user via a "Groom" button — never automatic.

### Operations

| Operation | What It Does | Algorithm |
|-----------|-------------|-----------|
| **Decompose Chunky** | Split compound triples into atomic ones | LLM decomposition (GPT-4o) |
| **Merge Duplicates** | Consolidate similar concepts | Embedding similarity > 0.90, auto-merge > 0.97 |
| **Prune Universal** | Remove "JavaScript is a language" type facts | LLM classification (conservative) |
| **Refine Relationships** | "is related to" → "manufactures" | LLM refinement |
| **Recalculate Edge Weights** | Update based on fact count + recency + trust | SQL formula |
| **Orphan Cleanup** | Find disconnected nodes | SQL: no edges, no facts, no chunks |

### Audit Trail

Grooming **never deletes**. Instead:
- Archive: `status = 'archived'`
- Supersede: `status = 'superseded', superseded_by = new_id`
- Prune: `status = 'pruned', is_universal = true`
- Decompose: `groomed_from_id = parent_id, source_type = 'grooming'`

Full provenance chain is always preserved.

---

## 9. Knowledge Gap Detection

Five strategies identify missing knowledge:

| Strategy | Finds | Example |
|----------|-------|---------|
| Missing Identity | Concepts with 3+ triples but no "is a" definition | "Hack Your Deck has 8 facts but we never said what it IS" |
| Thin Knowledge | Named concepts with only 1-2 triples | "Panda Games mentioned once, never described" |
| Missing Common Relationships | Products without launch date, people without role | "Crime and Funishment has no launch date" |
| Referenced but Undescribed | High mention count, no description | "Full Uproar mentioned 47 times but never described" |
| Stale Concepts | No new triples in 30+ days | "Q1 2026 metrics haven't been updated" |

Gaps are converted to natural questions by LLM for users to fill.

---

## 10. MCP Integration

The MCP server enables Claude (via claude.ai, Desktop, or Code) to interact with the knowledge base directly.

### Tools

| Tool | Purpose |
|------|---------|
| `raven_ask` | Query the knowledge base with natural language |
| `raven_remember_preview` | Extract triples from text (returns preview for review) |
| `raven_remember_confirm` | Confirm and save triples from a preview |
| `raven_search_facts` | Search by keyword across all knowledge |
| `raven_list_scopes` | List available scopes |
| `raven_node_inspect` | Deep-inspect a concept: degree, edges, neighbors |
| `raven_graph_stats` | Graph topology metrics |
| `raven_groom` | Trigger grooming operations |
| `raven_detect_gaps` | Find missing knowledge |

### Architecture

Stateless JSON-RPC handler at `/api/mcp`. Each tool call makes a GraphQL request to the same backend. Supports both STDIO (Claude Desktop/Code) and HTTP (claude.ai) transports.

---

## 11. LLM Usage Map

| Service | Model | Purpose | Tokens | Temp |
|---------|-------|---------|--------|------|
| Triple Extraction | Claude Sonnet 4.6 | Extract triples from text | 4000 | 0 |
| Answer Generation | Claude Sonnet 4.6 | Generate answers from knowledge | 800 | 0.3 |
| Query Classification | GPT-4o-mini | Classify question type | 80 | 0 |
| Entity Extraction | GPT-4o-mini | Extract entity names from questions | 50 | 0 |
| SST Routing | GPT-4o-mini | Disambiguate query routing | 5 | 0 |
| Relationship Clustering | GPT-4o-mini | Cluster similar relationships for fan-out | 200 | 0 |
| Triple Reranking | GPT-4o-mini | Select most relevant triples | 100 | 0 |
| Chunky Decomposition | GPT-4o | Decompose compound triples | 500 | 0 |
| Universal Pruning | GPT-4o-mini | Classify institutional vs universal | 200 | 0 |
| Embeddings | text-embedding-3-small | All embedding generation | 1536-dim | — |

---

## 12. Known Issues & Active Work

| Issue | Status | Impact |
|-------|--------|--------|
| "What products do we make?" routes to trademark node | Open | Entity resolution prefers high-degree sub-nodes over company entity |
| Confirm times out for 25+ triples | Open | Vercel 30s function limit; need to batch or stream |
| Org roles can't be listed | Open | Same traversal depth issue — roles exist but 2nd hop doesn't surface responsibilities |
| Revenue targets flagged as false conflict | Open | Sequential targets (2028 vs 2031) treated as contradictions |

---

## 13. Research Questions for Further Investigation

These questions are intended for a research agent to investigate. Findings should inform the next iteration of the architecture.

### Graph RAG & Retrieval

1. **What are the latest (2025-2026) Graph RAG architectures?** Specifically: how do Microsoft's GraphRAG, LightRAG, and Neo4j's GenAI stack handle multi-hop traversal? How does our 4-strategy search + collection expansion compare? Are there published benchmarks for hierarchical knowledge graph traversal?

2. **Are there better strategies than dual embeddings (with-context vs without-context) for triple retrieval?** Any papers on contextual vs decontextualized embeddings for knowledge graphs? Is there evidence that separate embeddings outperform a single embedding with metadata filtering?

3. **How are production systems handling the "hub node problem"?** High-degree entities that match every query — are there published approaches beyond our hub penalty + degree cap? Does PageRank-style authority scoring help for knowledge graphs specifically?

### Memory Science & Knowledge Representation

4. **What does cognitive science say about how humans organize institutional/team knowledge?** Specifically: episodic vs semantic memory, and how that maps to our "tribal vs official" knowledge tiers. Is there research supporting the two-tier model, or does human memory use more dimensions?

5. **Are there models from memory research for knowledge decay/staleness that go beyond simple time-based deprecation?** Our current model uses event-driven staleness (check when queried, not on a schedule). Is there cognitive science support for this approach vs periodic review? What about "forgetting curves" applied to organizational knowledge?

6. **What's the latest on "spacing effect" and "testing effect" in memory?** Can we apply these to how Raven surfaces recalls? Should Raven re-surface facts at increasing intervals to reinforce them, similar to spaced repetition systems like Anki?

### Trust & Confirmation

7. **What systems exist for learned trust models in collaborative knowledge bases?** Any production examples of source x context trust scoring? Our Beta distribution model with hierarchical topic resolution — is this approach validated in the literature? Are there better alternatives (e.g., ELO-style ratings, Bayesian networks)?

8. **How do Wikipedia, Wikidata, or other collaborative knowledge systems handle conflicting edits and trust signals at scale?** What can we learn about conflict resolution UX from systems with millions of editors?

### Graph Maintenance

9. **What are state-of-the-art approaches to automated knowledge graph refinement/grooming?** Entity resolution, relationship normalization, ontology alignment — what do production systems at Google (Knowledge Graph), Meta (Llama Index), or Diffbot use? Any papers on LLM-driven graph maintenance?

10. **How do production knowledge graphs handle schema evolution?** When the types of relationships or entity categories need to change over time — is there a migration strategy? Our schema is flexible (TEXT types, not enums), but is there a better approach for maintaining consistency as the graph grows?

---

## 14. Metrics & Current State

As of March 2026:

- **~1,400 active triples** in the Full Uproar Games team
- **~350 concepts** (entities) in the graph
- **Average concept degree:** ~8 edges
- **Hub nodes:** Full Uproar Games Inc. (200+), Afterroar HQ (40+), Fugly's Mayhem Machine (27)
- **Ask confidence range:** 10-95% depending on query specificity
- **Extraction model:** Claude Sonnet 4.6 (primary)
- **Embedding dimension:** 1536 (text-embedding-3-small)
- **Vercel function timeout:** 30s (constrains preview/confirm for large batches)
