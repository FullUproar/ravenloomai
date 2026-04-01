-- ============================================================================
-- Migration 302: Memory Architecture
-- Adds: PageRank, ACT-R activation, episodic memory, procedural memory
-- ============================================================================

-- ── PageRank on concepts ────────────────────────────────────────────────────
-- Used for entity resolution: company entities rank above their sub-nodes
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS pagerank FLOAT DEFAULT 0.0;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS authority_score FLOAT DEFAULT 0.0;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS last_pagerank_at TIMESTAMPTZ;

-- ── ACT-R Activation on triples ─────────────────────────────────────────────
-- activation = f(recency, frequency) — replaces binary staleness
ALTER TABLE triples ADD COLUMN IF NOT EXISTS activation_score FLOAT DEFAULT 1.0;
ALTER TABLE triples ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;
ALTER TABLE triples ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
ALTER TABLE triples ADD COLUMN IF NOT EXISTS memory_strength FLOAT DEFAULT 1.0;

-- ── ACT-R Activation on concepts ────────────────────────────────────────────
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS activation_score FLOAT DEFAULT 1.0;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- ── Episodic Memory ─────────────────────────────────────────────────────────
-- Logs every query, answer, correction, and confirmation as typed events
-- Enables: "this question was asked 5 times" → knowledge gap signal
-- Enables: "this triple was corrected 3 times" → reliability signal
CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id VARCHAR(128),

  -- Episode type
  episode_type TEXT NOT NULL,  -- 'query', 'answer', 'correction', 'confirmation',
                               -- 'rejection', 'grooming', 'conflict_resolution', 'recall'

  -- What happened
  content TEXT NOT NULL,        -- The question asked, fact confirmed, correction made
  metadata JSONB DEFAULT '{}', -- Flexible: confidence, triples_used, answer_text, etc.

  -- Connections to knowledge
  related_triple_ids UUID[] DEFAULT '{}',   -- Triples involved in this episode
  related_concept_ids UUID[] DEFAULT '{}',  -- Concepts involved

  -- Temporal context
  created_at TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT,              -- Group episodes from same interaction

  -- For pattern detection
  query_embedding vector(1536)  -- Embed queries for "similar questions" detection
);

CREATE INDEX IF NOT EXISTS idx_episodes_team ON episodes(team_id, episode_type);
CREATE INDEX IF NOT EXISTS idx_episodes_created ON episodes(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_type ON episodes(episode_type, team_id);

-- ── Procedural Memory (Decision Rules & Playbooks) ──────────────────────────
-- Encodes HOW the organization makes decisions, not just WHAT it knows
-- "When asked about pricing, always check the most recent quarter"
-- "When a product launch date changes, flag marketing and manufacturing"
CREATE TABLE IF NOT EXISTS procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- What this procedure is
  name TEXT NOT NULL,                    -- "Product Launch Date Change Protocol"
  description TEXT,                      -- Natural language description
  procedure_type TEXT NOT NULL,          -- 'decision_rule', 'playbook', 'escalation',
                                         -- 'verification', 'reasoning_pattern', 'constraint'

  -- The rule itself
  trigger_condition TEXT NOT NULL,       -- "When: a product launch date triple is superseded"
  action_steps JSONB NOT NULL,           -- [{step: 1, action: "Flag manufacturing triples...", ...}]

  -- Scope and applicability
  scope_id UUID REFERENCES scopes(id),  -- Which scope this applies to (NULL = global)
  applies_to_types TEXT[] DEFAULT '{}',  -- Concept types this rule applies to: ['product', 'date']
  applies_to_relationships TEXT[] DEFAULT '{}', -- Relationship types: ['launches on', 'ships via']

  -- Trust and confidence
  confidence FLOAT DEFAULT 0.9,         -- How reliable is this rule
  trust_tier TEXT DEFAULT 'official',    -- Official rules vs tribal conventions
  source TEXT,                           -- Who/what created this rule
  created_by VARCHAR(128),

  -- Lifecycle
  status TEXT DEFAULT 'active',          -- active, deprecated, proposed
  is_auto_generated BOOLEAN DEFAULT false, -- Was this inferred from patterns?

  -- Activation tracking (how often is this rule triggered)
  trigger_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,

  -- Metadata
  embedding vector(1536),               -- For matching queries to relevant procedures
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedures_team ON procedures(team_id, status);
CREATE INDEX IF NOT EXISTS idx_procedures_type ON procedures(team_id, procedure_type);

-- ── Causal Chains ───────────────────────────────────────────────────────────
-- Links triples that have causal/dependency relationships
-- "If launch date changes → manufacturing timeline changes → shipping estimate changes"
CREATE TABLE IF NOT EXISTS causal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  cause_triple_id UUID NOT NULL REFERENCES triples(id) ON DELETE CASCADE,
  effect_triple_id UUID NOT NULL REFERENCES triples(id) ON DELETE CASCADE,

  link_type TEXT NOT NULL,       -- 'depends_on', 'triggers', 'blocks', 'invalidates', 'updates'
  confidence FLOAT DEFAULT 0.8,

  -- Was this auto-detected or manually specified?
  source TEXT DEFAULT 'inferred', -- 'inferred', 'user_specified', 'rule_generated'
  reasoning TEXT,                 -- Why this causal link exists

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(cause_triple_id, effect_triple_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_causal_links_cause ON causal_links(cause_triple_id);
CREATE INDEX IF NOT EXISTS idx_causal_links_effect ON causal_links(effect_triple_id);
CREATE INDEX IF NOT EXISTS idx_causal_links_team ON causal_links(team_id);

-- ── Frequently Asked Questions (auto-detected from episodes) ────────────────
CREATE TABLE IF NOT EXISTS detected_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  pattern_type TEXT NOT NULL,     -- 'frequent_question', 'correction_cluster',
                                  -- 'source_reliability', 'knowledge_gap', 'decision_pattern'

  description TEXT NOT NULL,      -- "The question 'What products do we make?' has been asked 7 times"
  evidence JSONB DEFAULT '{}',    -- Episode IDs, triple IDs, timestamps

  -- What to do about it
  suggested_action TEXT,           -- "Create a high-level product catalog triple"
  action_taken BOOLEAN DEFAULT false,

  -- Scoring
  frequency INTEGER DEFAULT 1,
  confidence FLOAT DEFAULT 0.5,
  first_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, pattern_type, description)
);

CREATE INDEX IF NOT EXISTS idx_patterns_team ON detected_patterns(team_id, pattern_type);
