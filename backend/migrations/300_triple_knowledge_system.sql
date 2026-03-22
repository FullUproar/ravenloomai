-- Migration 300: Triple-Based Knowledge System
-- Replaces flat facts + sparse entity graph with triple-based knowledge model
-- where (Subject --relationship--> Object) [Contexts] is the atom of knowledge.

BEGIN;

-- ============================================================================
-- 1. NEW TABLES
-- ============================================================================

-- Concepts: nodes in the knowledge graph (things that exist)
CREATE TABLE IF NOT EXISTS concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    scope_id UUID REFERENCES scopes(id) ON DELETE SET NULL,

    name TEXT NOT NULL,
    canonical_name TEXT NOT NULL,        -- lowercase, trimmed for dedup matching
    type TEXT NOT NULL,                  -- person, product, company, concept, date, event, location
    description TEXT,
    aliases TEXT[] DEFAULT '{}',

    embedding vector(1536),             -- for concept search and dedup

    mention_count INTEGER DEFAULT 1,
    properties JSONB DEFAULT '{}',      -- extensible metadata

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(team_id, canonical_name, type)
);

-- Triples: the atom of knowledge
-- Replaces: facts, kg_edges, kg_chunks
CREATE TABLE IF NOT EXISTS triples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    scope_id UUID REFERENCES scopes(id) ON DELETE SET NULL,

    -- The triple itself
    subject_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL,          -- free-text verb phrase: "has the color", "launches on", "works at"
    object_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,

    -- Human-readable rendering (cached)
    display_text TEXT NOT NULL,          -- "Hack Your Deck works with Card Based Games"

    -- Dual embeddings: the core retrieval strategy
    embedding_with_context vector(1536),     -- "HYD works with Card Based Games [for Full Uproar product line]"
    embedding_without_context vector(1536),  -- "HYD works with Card Based Games"

    -- Confidence and trust
    confidence FLOAT DEFAULT 0.8,
    trust_tier TEXT DEFAULT 'tribal' CHECK (trust_tier IN ('official', 'tribal')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived', 'pruned')),

    -- Provenance
    source_text TEXT,                    -- original verbatim text this was extracted from
    source_url TEXT,                     -- external reference URL
    source_type TEXT NOT NULL DEFAULT 'user_statement'
        CHECK (source_type IN ('user_statement', 'document', 'conversation', 'integration', 'inference', 'grooming')),
    created_by VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL,

    -- Grooming metadata
    is_chunky BOOLEAN DEFAULT FALSE,     -- flagged for decomposition during grooming
    is_universal BOOLEAN DEFAULT FALSE,  -- flagged as "LLM already knows this"
    groomed_at TIMESTAMPTZ,
    groomed_from_id UUID REFERENCES triples(id) ON DELETE SET NULL,  -- if decomposed from a larger triple

    -- Temporal validity
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    superseded_by UUID REFERENCES triples(id) ON DELETE SET NULL,
    superseded_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Context nodes: hierarchical context taxonomy
-- Contexts are situational conditions under which a triple is true
CREATE TABLE IF NOT EXISTS context_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

    name TEXT NOT NULL,                  -- "Earth", "Q1 2026", "client-facing", "Full Uproar"
    type TEXT NOT NULL                   -- temporal, spatial, organizational, conditional, audience, formality, work_stage
        CHECK (type IN ('temporal', 'spatial', 'organizational', 'conditional', 'audience', 'formality', 'work_stage')),
    parent_id UUID REFERENCES context_nodes(id) ON DELETE SET NULL,

    description TEXT,

    -- Dynamic contexts resolve at query time (e.g., "current quarter")
    is_dynamic BOOLEAN DEFAULT FALSE,
    dynamic_resolver TEXT,               -- resolver function name or expression

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(team_id, name, type)
);

-- Junction table: which contexts gate each triple
CREATE TABLE IF NOT EXISTS triple_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triple_id UUID NOT NULL REFERENCES triples(id) ON DELETE CASCADE,
    context_node_id UUID NOT NULL REFERENCES context_nodes(id) ON DELETE CASCADE,

    -- How this context was assigned
    source TEXT DEFAULT 'extracted'
        CHECK (source IN ('extracted', 'inferred', 'user_assigned', 'groomed')),
    confidence FLOAT DEFAULT 0.8,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(triple_id, context_node_id)
);

-- ============================================================================
-- 2. ADAPT EXISTING TABLES
-- ============================================================================

-- Add triple support to remember_previews
ALTER TABLE remember_previews
    ADD COLUMN IF NOT EXISTS extracted_triples JSONB DEFAULT '[]';

-- Add triple support to confirmation_events
ALTER TABLE confirmation_events
    ADD COLUMN IF NOT EXISTS triple_id UUID REFERENCES triples(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

-- Concepts
CREATE INDEX IF NOT EXISTS idx_concepts_team ON concepts(team_id);
CREATE INDEX IF NOT EXISTS idx_concepts_canonical ON concepts(team_id, canonical_name);
CREATE INDEX IF NOT EXISTS idx_concepts_type ON concepts(team_id, type);

-- Triples
CREATE INDEX IF NOT EXISTS idx_triples_team ON triples(team_id);
CREATE INDEX IF NOT EXISTS idx_triples_scope ON triples(scope_id);
CREATE INDEX IF NOT EXISTS idx_triples_subject ON triples(subject_id);
CREATE INDEX IF NOT EXISTS idx_triples_object ON triples(object_id);
CREATE INDEX IF NOT EXISTS idx_triples_status ON triples(team_id, status);
CREATE INDEX IF NOT EXISTS idx_triples_relationship ON triples(team_id, relationship);
CREATE INDEX IF NOT EXISTS idx_triples_groomed_from ON triples(groomed_from_id);

-- Context nodes
CREATE INDEX IF NOT EXISTS idx_context_nodes_team ON context_nodes(team_id);
CREATE INDEX IF NOT EXISTS idx_context_nodes_parent ON context_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_context_nodes_type ON context_nodes(team_id, type);

-- Triple contexts
CREATE INDEX IF NOT EXISTS idx_triple_contexts_triple ON triple_contexts(triple_id);
CREATE INDEX IF NOT EXISTS idx_triple_contexts_context ON triple_contexts(context_node_id);

-- Vector indexes (ivfflat) — create after initial data load for best performance
-- For small datasets (<1000 rows), sequential scan is faster than ivfflat
-- These can be created later when data volume justifies it:
-- CREATE INDEX idx_concepts_embedding ON concepts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX idx_triples_embed_with ON triples USING ivfflat (embedding_with_context vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX idx_triples_embed_without ON triples USING ivfflat (embedding_without_context vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Get all ancestor context IDs for a given context (walks up the tree)
CREATE OR REPLACE FUNCTION get_context_ancestors(context_id UUID)
RETURNS UUID[] AS $$
DECLARE
    ancestors UUID[] := '{}';
    current_id UUID := context_id;
    parent UUID;
BEGIN
    LOOP
        SELECT cn.parent_id INTO parent
        FROM context_nodes cn
        WHERE cn.id = current_id;

        EXIT WHEN parent IS NULL;
        ancestors := ancestors || parent;
        current_id := parent;
    END LOOP;

    RETURN ancestors;
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if a context is an ancestor of another (child implies parent)
CREATE OR REPLACE FUNCTION is_context_ancestor(child_id UUID, potential_ancestor_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN potential_ancestor_id = ANY(get_context_ancestors(child_id));
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 5. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS concepts_updated_at ON concepts;
CREATE TRIGGER concepts_updated_at
    BEFORE UPDATE ON concepts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS triples_updated_at ON triples;
CREATE TRIGGER triples_updated_at
    BEFORE UPDATE ON triples
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
