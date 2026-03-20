# RavenLoom Technical Handoff — March 2026

## What This Is

RavenLoom is an AI-powered knowledge system with **supervised fact extraction**. Users paste text (Slack threads, meeting notes, docs) → Raven extracts atomic facts → humans confirm/edit/reject → confirmed facts become queryable with full source attribution. It never guesses. The knowledge base is a byproduct of work, not a wiki anyone maintains.

**Positioning:** "The thing that answers questions so your team doesn't have to."

**Core differentiator:** No mainstream tool makes mandatory atomic confirmation the default ingestion path. Every competitor (Glean, Notion AI, Guru, Tettra) either automates ingestion unsupervised or requires manual wiki authoring. RavenLoom sits in the middle: AI extracts, humans gate.

## Design Doc Status

The [v5.0 Design Document](Project%20Brief.pdf) (17 pages, synthesized from 5 AI models + founder) is **still the canonical source of truth**. Nothing we've built contradicts it. We've implemented a Phase 1 subset.

---

## Architecture

### Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 7 + Apollo Client 3 | SPA, dark theme, mobile-responsive |
| UI System | MUI 7 + vanilla CSS custom properties | Dark-first, no Tailwind |
| Backend | Node/Express + Apollo Server 4 (GraphQL) | Single server, port 4000 |
| Database | PostgreSQL + pgvector (1536-dim embeddings) | 70 migrations |
| Auth | Firebase Auth | Google OAuth + email/password |
| AI | OpenAI GPT-4o | Extraction, retrieval, graph construction |
| Mobile | Capacitor 7 | iOS/Android wrapper (not actively tested) |

### Frontend Structure

```
frontend/src/
├── main.jsx          # Routes: /oracle, /team/:teamId/:view, /help, /invite/:token
├── App.jsx           # Auth state, team selection, routes to Shell
├── Shell.jsx         # NEW — minimal layout (287 lines, replaces 4,683-line monolith)
├── Login.jsx         # Firebase auth UI
├── Toast.jsx         # Toast notification system
├── firebase.js       # Firebase config
├── styles.css        # Global CSS: design tokens, dark theme, animations
│
├── components/
│   ├── RavenHome.jsx          # Primary surface — wraps RavenKnowledge + scope toggle
│   ├── RavenKnowledge.jsx     # CORE — Ask/Remember with confidence badges, thinking states
│   ├── RavenKnowledge.css     # Full dark theme, mobile responsive, iOS zoom fixes
│   ├── Onboarding.jsx         # 5-screen first-time flow (Brief Section 7)
│   ├── Onboarding.css         # Staggered animations, mobile responsive
│   ├── RavenOracle.jsx        # Constellation viz (canvas, particle system, category clusters)
│   ├── EntityTreeExplorer.jsx # Knowledge graph tree browser
│   ├── KnowledgeGraphViz.jsx  # SVG graph visualization
│   ├── FreshnessDashboard.jsx # Knowledge staleness monitoring
│   ├── CommandPalette.jsx     # Cmd+K navigation (legacy, not in Shell)
│   └── RavenCopilot.jsx       # Side panel assistant (legacy, not in Shell)
│
├── pages/
│   ├── AdminDashboard.jsx     # Super admin: users, teams, access codes
│   ├── DataImportPage.jsx     # Slack/Teams import with channel mapping
│   └── OraclePage.jsx         # Full-screen constellation wrapper
│
└── TeamDashboard.jsx          # LEGACY MONOLITH (187KB) — being replaced by Shell
```

**Active UI flow:**
```
Login → Team Selector → Shell
                          ├── Onboarding (first visit, lazy-loaded)
                          │   └── Paste → Confirm → Ask → Simulate Teammate → Tease
                          ├── RavenHome (primary)
                          │   ├── Scope Toggle (Just Me / My Team)
                          │   └── RavenKnowledge
                          │       ├── Ask → Answer + Confidence + Sources + Follow-ups
                          │       └── Remember → Preview → Confirm/Edit/Reject → Saved
                          └── Explore (placeholder — Knowledge Explorer not built yet)
```

### Backend Structure

```
backend/
├── index.js                    # Express + Apollo Server entry point
├── db.js                       # PostgreSQL pool (pg + pgvector)
├── graphql/
│   ├── schema.js               # 1,222 lines — all types, queries, mutations
│   └── resolvers/
│       └── index.js            # 1,359 lines — all resolvers (monolithic)
│
├── services/                   # 24 service files
│   ├── RavenService.js         # CORE — Ask (semantic + graph search), Remember (preview→confirm)
│   ├── AIService.js            # OpenAI GPT-4o calls (extraction, retrieval, embeddings)
│   ├── KnowledgeGraphService.js # Graph nodes, edges, hierarchy, temporal context
│   ├── KnowledgeService.js     # Facts CRUD, semantic search, decisions
│   ├── ConfirmationEventService.js # Logs confirmation outcomes for trust model training
│   ├── RecallService.js        # Proactive fact surfacing (backend complete, UI NOT wired)
│   ├── AlertService.js         # Alert CRUD (original, RecallService wraps this)
│   ├── KnowledgeFreshnessService.js # Staleness detection, validation scheduling
│   ├── ScopeService.js         # Scope hierarchy (Team → Project → Sub-scope → Private)
│   ├── KnowledgeBaseService.js # External source monitoring (Google Drive)
│   ├── GoogleDriveService.js   # Drive OAuth, file reading, change detection
│   ├── TeamService.js          # Team CRUD, members, invites
│   ├── UserService.js          # User CRUD, preferences
│   ├── ChannelService.js       # Chat channels (legacy feature, still functional)
│   ├── MessageService.js       # Messages (legacy)
│   ├── ThreadService.js        # Threads (legacy)
│   ├── QuestionService.js      # Team questions (legacy peer review system)
│   ├── LearningObjectiveService.js # Learning objectives (legacy)
│   ├── ConversationImportService.js # Import ChatGPT/Claude conversations
│   ├── DeepResearchService.js  # Deep research feature
│   ├── DiscussionService.js    # Discussion threads
│   ├── RateLimiterService.js   # Rate limiting
│   ├── SlackImportService.js   # Slack export import (disabled)
│   └── UploadService.js        # File uploads
│
└── migrations/                 # 70 SQL files
    ├── 208_billing_and_quotas.sql           # Stripe-ready schema
    ├── 207_trust_tier_and_graph_trust.sql   # Trust scores on nodes/edges
    ├── 206_conflict_overrides.sql           # Override tracking
    ├── 205_remember_previews.sql            # DB-persisted previews (was in-memory)
    ├── 204_confirmation_events.sql          # Confirmation outcome logging
    ├── 203_context_tags.sql                 # Context metadata
    ├── 202_fact_attribution.sql             # Source tracking
    ├── 201_team_integrations.sql            # Integration management
    ├── 200_scopes.sql                       # Scope hierarchy (core v5.0)
    └── 100-137_*.sql                        # Legacy features
```

### Core Data Flow: Remember

```
User pastes text
  → previewRemember mutation
    → AIService.extractFacts(text) — GPT-4o extracts atomic facts with:
        content, entityType, entityName, category, confidenceScore,
        trustTier (official/tribal), contextEntities [{name, type, relationship}]
    → RavenService.detectConflicts() — semantic similarity + Levenshtein
    → Stores preview in remember_previews table (DB, not in-memory)
    → Returns: previewId, extractedFacts[], conflicts[], isMismatch, suggestedParent

User reviews, edits, confirms
  → confirmRemember mutation
    → Creates facts in facts table with full metadata
    → Logs to confirmation_events table (outcome, confirming user, timestamp)
    → KnowledgeGraphService.processFactIntoGraph():
        - Extracts entities via GPT-4o
        - Upserts kg_nodes with embeddings
        - Creates kg_edges (concept→relationship→concept)
        - Handles temporal hierarchy (year→quarter→month)
        - Suggests parent node placement
    → Returns: factsCreated[], factsUpdated[], nodeCreated, message
```

### Core Data Flow: Ask

```
User asks question
  → askRaven query
    → AIService generates embedding for question
    → Semantic search: pgvector cosine similarity on facts table
    → Graph traversal: KnowledgeGraphService.graphRAGSearch()
        - Find matching nodes by embedding similarity
        - Traverse edges (1-hop default, configurable)
        - Collect connected facts
    → Merge and deduplicate results
    → AIService.generateAnswer(question, relevantFacts)
    → Returns: answer, confidence (0-1), factsUsed[], suggestedFollowups[]
    → If no confirmed facts match: "I don't have anything confirmed on that"
```

### Key Database Tables

```sql
-- Core knowledge
facts (id, team_id, scope_id, content, category, entity_type, entity_name,
       source_quote, source_url, embedding vector(1536), status,
       trust_tier, trust_score, context_formality, context_work_stage,
       context_audience, context_intent,
       valid_from, valid_until, created_by, confirmed_by, confirmed_at)

-- Knowledge graph
kg_nodes (id, team_id, scope_id, name, type, description, scale_level,
          parent_id, embedding vector(1536), trust_density, confirmation_count)

kg_edges (id, team_id, source_node_id, target_node_id, relationship_type,
          weight, trust_score, source_fact_ids uuid[])

-- Trust model data collection (Phase 1 — learning happens Phase 2)
confirmation_events (id, team_id, fact_id, user_id, source_identity,
                     context_metadata jsonb, outcome varchar,
                     original_content, edited_content, override_reason)

-- Previews persisted to DB
remember_previews (id, team_id, scope_id, user_id, source_text,
                   extracted_facts jsonb, conflicts jsonb, status, expires_at)

-- Scopes
scopes (id, team_id, parent_id, type, name, description, visibility)

-- Billing (schema ready, not wired)
billing_accounts, usage_records, subscription_tiers
```

---

## What's Built vs. What's Planned

### BUILT (Phase 1 — POC)

| Feature | Status | Brief Section |
|---------|--------|---------------|
| Shell architecture (replaced monolith) | Done | — |
| Ask flow (semantic + graph search, confidence, sources) | Done | 3b |
| Remember flow (extract → preview → confirm with conflicts) | Done | 3b |
| Onboarding (Paste → Confirm → Ask → Simulate → Tease) | Done | 7 |
| Two trust tiers (official/tribal) on facts | Done | 4a |
| Scope hierarchy (Team → Project → Sub-scope → Private) | Done | 4b |
| Conflict detection (semantic similarity + Levenshtein) | Done | 4c |
| "Just Me / My Team" privacy toggle | Done | 4b |
| Context metadata on facts (formality, stage, audience, intent) | Done | 5b |
| Confirmation event logging (outcome, user, timestamp) | Done | 5g |
| Source identity tracking (person, document, composite) | Done | 5a |
| Knowledge graph (entities, relationships, temporal hierarchy) | Done | — |
| Fact counter ("Raven knows X things") | Done | 7 |
| Dark theme design system with elevation tokens | Done | — |
| Mobile responsive with iOS zoom prevention | Done | — |
| "Brought to you by Full Uproar" footer | Done | — |
| Billing/quota DB schema (Stripe-ready) | Schema only | 10a |
| RecallService (proactive fact surfacing) | Backend only | 3b |

### NOT BUILT YET

| Feature | Phase | Brief Section | Notes |
|---------|-------|---------------|-------|
| Knowledge Explorer view | Phase 1 | — | Placeholder exists in Shell |
| RecallService UI (alerts in Shell) | Phase 1 | 3b | Backend + GraphQL complete |
| Event-driven staleness checks | Phase 2 | 4e | FreshnessService exists, not wired to Shell |
| Adaptive trust model (active learning) | Phase 2 | 5c | Data collection is Phase 1, learning is Phase 2 |
| Auto-confirmation for high-trust source×context | Phase 2 | 5c | Needs enough confirmation data first |
| Risk-aware override layer | Phase 2 | 5d | Trust-risk matrix not implemented |
| Constellation view with trust density | Phase 2 | 5e | RavenOracle exists but no trust overlay |
| Inference and deduction | Phase 2+ | 4d | Explicitly deferred in brief |
| Knowledge decay / deprioritization | Phase 2 | 4e | Schema supports it, no logic |
| Slack answer bot (@Raven) | Phase 1.5 | 10 | Not started |
| Google Drive watch (auto-extraction) | Phase 2 | 3c | GoogleDriveService exists for manual import |
| Multi-tenancy isolation | Phase 3 | — | Single-tenant currently |
| Stripe billing integration | Phase 4 | 10a | Schema ready, no UI or Stripe SDK |
| Team invites / onboarding for non-admin | Phase 3 | — | Invite system exists but not polished |

---

## Super-Phase Roadmap

### Phase 1: POC (Current)
Prove the core loop works. Shawn uses it daily. Remember + Ask + confirm flow is tight. Onboarding converts a first-timer in under 5 minutes.

**Remaining work:** Wire RecallService into Shell UI, build Knowledge Explorer, test bed, fix medium-priority arch issues.

### Phase 2: Stable Full Uproar Tool
Shawn's team uses it. Activate adaptive trust model. Constellation view with trust density. Event-driven staleness. Inference (propose-for-confirmation only). Slack bot (read-only answers). Google Drive watch.

**Kill criteria:** 80% of confirmed facts queried within 30 days. Self-reported reduction in repeat Slack questions.

### Phase 3: Multi-Tenant Shared
Auth hardening, tenant isolation, team onboarding polish, invite flows, access codes (already built). Scale to indie creative communities via founder's network.

**Kill criteria:** 50 signups, 30 paste, 20 confirm, 15 ask (from Brief Section 10).

### Phase 4: Monetized
Stripe integration, solo tier (free), team tier (per active querier). Usage-based billing. The upgrade trigger is self-validating: Dana doesn't pay until her team is actually asking Raven questions.

---

## Known Issues (Medium Priority)

1. **HTML-to-text conversion** is regex-based (loses document structure). Should use cheerio.
2. **Similarity threshold** for conflict detection is hardcoded at 0.7. Should be configurable.
3. **Graph processing errors** are caught and console.logged, not sent to monitoring.
4. **Bundle size** is 763KB (Apollo + ReactMarkdown). Should code-split.
5. **TeamDashboard.jsx** (187KB legacy monolith) still exists. Can be deleted once Shell covers all active features.
6. **Resolvers are monolithic** (1,359 lines). Should split by domain.

## Design Principles (from Brief)

1. **Nothing enters without human approval.** The knowledge base earns trust over time.
2. **No jargon in UI.** If "atomic facts," "scopes," "embeddings," or "trust scores" leak into copy, the product has failed the Dana test.
3. **Confirmation must feel like approving, not data entry.** Quick sanity check, not a form.
4. **When Raven doesn't know, it says so.** Never guesses. Every answer has source citations.
5. **Facts are scoped to context.** Telling Raven "we use Net 30" for one client doesn't assert Net 30 for all clients.
6. **Recall is magic, not a feature.** Don't lead with it in positioning. Let users discover it.
7. **The team's existing work IS the input.** No wiki to maintain. Raven reads docs so nobody else has to.

## Primary Persona: Dana Reeves

- Ops manager, 34, 14-person digital marketing agency
- Moderate tech comfort — adopts tools, won't configure them
- Tried and abandoned Notion wiki, considered Guru
- Pain: "I can't get through a day without people asking me things I already answered"
- Hook: "Paste the Slack thread. Confirm in 10 seconds. Next time someone asks, Raven answers."
- Lose her: setup > 2 min, jargon, feels like guessing, confirmation feels like data entry
