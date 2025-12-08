-- Migration 114: Knowledge Graph for GraphRAG
-- Creates tables for entity nodes, relationship edges, and text chunks
-- Enables semantic vector search for graph entry points

-- ============================================================================
-- KNOWLEDGE GRAPH NODES (Entities extracted from all knowledge sources)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Entity information
  name TEXT NOT NULL,                      -- "Fugly", "Launch Date", "Panda Manufacturing"
  type TEXT NOT NULL,                      -- person, product, company, concept, date, event, location
  description TEXT,                        -- Brief description if available
  aliases TEXT[] DEFAULT '{}',             -- Alternative names for this entity

  -- Vector embedding for semantic search entry
  embedding vector(1536),

  -- Provenance tracking
  source_type TEXT NOT NULL,               -- fact, decision, document, message, answer
  source_id UUID,                          -- Reference to source record

  -- Metadata
  properties JSONB DEFAULT '{}',           -- Flexible attributes
  mention_count INTEGER DEFAULT 1,         -- How often this entity appears

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One canonical node per entity per team
  UNIQUE(team_id, name, type)
);

-- ============================================================================
-- KNOWLEDGE GRAPH EDGES (Relationships between entities)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  source_node_id UUID NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,

  -- Relationship info
  relationship TEXT NOT NULL,              -- IS_A, HAS, WORKS_WITH, RELATED_TO, PART_OF, CREATED_BY, etc.
  weight FLOAT DEFAULT 1.0,                -- Strength of relationship (increases with mentions)

  -- Provenance
  source_type TEXT,
  source_id UUID,

  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One edge per unique relationship
  UNIQUE(source_node_id, target_node_id, relationship)
);

-- ============================================================================
-- KNOWLEDGE GRAPH CHUNKS (Text chunks linked to entity nodes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Chunk content
  content TEXT NOT NULL,                   -- The actual text chunk (~500 chars)
  embedding vector(1536),                  -- For direct chunk similarity search

  -- Source tracking
  source_type TEXT NOT NULL,               -- document, fact, decision, message, answer
  source_id UUID,
  source_title TEXT,                       -- Document name, channel name, etc.

  -- Graph linkage - which entities are mentioned in this chunk
  linked_node_ids UUID[] DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR FAST RETRIEVAL
-- ============================================================================

-- Node lookups
CREATE INDEX IF NOT EXISTS idx_kg_nodes_team ON kg_nodes(team_id);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON kg_nodes(team_id, type);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_name ON kg_nodes(team_id, lower(name));

-- Vector similarity search on nodes (IVFFlat for speed)
-- Note: May need to run separately after data is loaded for optimal index
CREATE INDEX IF NOT EXISTS idx_kg_nodes_embedding ON kg_nodes
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Edge lookups (for graph traversal)
CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON kg_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_team ON kg_edges(team_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_relationship ON kg_edges(team_id, relationship);

-- Chunk lookups
CREATE INDEX IF NOT EXISTS idx_kg_chunks_team ON kg_chunks(team_id);
CREATE INDEX IF NOT EXISTS idx_kg_chunks_source ON kg_chunks(team_id, source_type, source_id);

-- Vector similarity search on chunks
CREATE INDEX IF NOT EXISTS idx_kg_chunks_embedding ON kg_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- GIN index for array containment queries (finding chunks by linked nodes)
CREATE INDEX IF NOT EXISTS idx_kg_chunks_nodes ON kg_chunks USING gin(linked_node_ids);

-- ============================================================================
-- TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_kg_node_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kg_nodes_updated_at ON kg_nodes;
CREATE TRIGGER kg_nodes_updated_at
  BEFORE UPDATE ON kg_nodes
  FOR EACH ROW EXECUTE FUNCTION update_kg_node_updated_at();
