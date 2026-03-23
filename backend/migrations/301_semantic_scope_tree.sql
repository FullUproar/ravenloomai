-- Migration 301: Semantic Scope Tree (SST)
-- Internal routing tree for query localization. Users don't see this.

CREATE TABLE IF NOT EXISTS sst_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Tree structure
  parent_id UUID REFERENCES sst_nodes(id) ON DELETE SET NULL,
  depth INTEGER NOT NULL DEFAULT 0,

  -- Identity
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL, -- lowercase, trimmed
  description TEXT NOT NULL DEFAULT '', -- semantic description for LLM navigation

  -- Embedding for vector routing
  embedding vector(1536),

  -- Link to user-defined scope (optional — many SST nodes won't have one)
  scope_id UUID REFERENCES scopes(id) ON DELETE SET NULL,

  -- Stats for routing confidence
  triple_count INTEGER NOT NULL DEFAULT 0,
  query_count INTEGER NOT NULL DEFAULT 0,
  last_query_at TIMESTAMPTZ,

  -- Metadata
  is_root BOOLEAN NOT NULL DEFAULT false,
  auto_generated BOOLEAN NOT NULL DEFAULT true, -- false if user explicitly created

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sst_team ON sst_nodes(team_id);
CREATE INDEX IF NOT EXISTS idx_sst_parent ON sst_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_sst_canonical ON sst_nodes(team_id, canonical_name);
CREATE INDEX IF NOT EXISTS idx_sst_scope ON sst_nodes(scope_id);

-- Vector index for routing
CREATE INDEX IF NOT EXISTS idx_sst_embedding ON sst_nodes
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- Add sst_node_id to triples for scope tagging
ALTER TABLE triples ADD COLUMN IF NOT EXISTS sst_node_id UUID REFERENCES sst_nodes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_triples_sst ON triples(sst_node_id);

-- Routing cache: query text → sst_node_id (skips LLM for repeated patterns)
CREATE TABLE IF NOT EXISTS sst_route_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  query_pattern TEXT NOT NULL, -- canonicalized query or keyword
  sst_node_id UUID NOT NULL REFERENCES sst_nodes(id) ON DELETE CASCADE,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sst_cache_lookup ON sst_route_cache(team_id, query_pattern);
