-- Migration 205: Facts-Knowledge Graph Integration
-- Links the facts table to kg_nodes for unified knowledge retrieval
-- Facts can now be attached to specific entities in the knowledge graph

-- ============================================================================
-- LINK FACTS TO KNOWLEDGE GRAPH NODES
-- ============================================================================

-- Foreign key to kg_nodes - facts can optionally belong to an entity
-- Example: "MSRP is $29.99" attached to the "Echo" (game) node
ALTER TABLE facts ADD COLUMN IF NOT EXISTS kg_node_id UUID REFERENCES kg_nodes(id) ON DELETE SET NULL;

-- Index for fast fact-to-node lookups
CREATE INDEX IF NOT EXISTS idx_facts_kg_node ON facts(kg_node_id) WHERE kg_node_id IS NOT NULL;

-- Composite index for getting all facts for nodes in a team
CREATE INDEX IF NOT EXISTS idx_facts_team_node ON facts(team_id, kg_node_id) WHERE kg_node_id IS NOT NULL;

-- ============================================================================
-- VIEW: UNIFIED KNOWLEDGE WITH HIERARCHY
-- Joins facts with their parent node hierarchy for context-aware queries
-- ============================================================================

CREATE OR REPLACE VIEW knowledge_with_hierarchy AS
SELECT
  f.id as fact_id,
  f.team_id,
  f.content as fact_content,
  f.category,
  f.entity_type,
  f.entity_name,
  f.source_type,
  f.source_url,
  f.valid_from,
  f.valid_until,
  f.created_at as fact_created_at,
  f.embedding as fact_embedding,

  -- Node info (if fact is attached to a node)
  n.id as node_id,
  n.name as node_name,
  n.type as node_type,
  n.scale_level,
  n.summary as node_summary,
  n.parent_node_id,
  n.path as ancestor_path,

  -- Parent node info (one level up)
  pn.id as parent_id,
  pn.name as parent_name,
  pn.type as parent_type

FROM facts f
LEFT JOIN kg_nodes n ON f.kg_node_id = n.id
LEFT JOIN kg_nodes pn ON n.parent_node_id = pn.id
WHERE f.valid_until IS NULL;  -- Only active facts

COMMENT ON VIEW knowledge_with_hierarchy IS 'Facts joined with their knowledge graph node hierarchy';

-- ============================================================================
-- FUNCTION: GET FACTS FOR NODE AND DESCENDANTS
-- Returns all facts attached to a node or any of its descendants
-- ============================================================================

CREATE OR REPLACE FUNCTION get_facts_for_subtree(root_node_id UUID)
RETURNS TABLE(
  fact_id UUID,
  content TEXT,
  category VARCHAR(100),
  node_id UUID,
  node_name TEXT,
  depth INTEGER
) AS $$
BEGIN
  RETURN QUERY
  -- Facts directly on the root node
  SELECT f.id, f.content, f.category, f.kg_node_id, n.name, 0
  FROM facts f
  JOIN kg_nodes n ON f.kg_node_id = n.id
  WHERE f.kg_node_id = root_node_id
    AND f.valid_until IS NULL

  UNION ALL

  -- Facts on descendant nodes (using path array)
  SELECT f.id, f.content, f.category, f.kg_node_id, n.name,
         array_length(n.path, 1) - array_position(n.path, root_node_id) + 1
  FROM facts f
  JOIN kg_nodes n ON f.kg_node_id = n.id
  WHERE root_node_id = ANY(n.path)
    AND f.valid_until IS NULL
  ORDER BY depth, node_name;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_facts_for_subtree(UUID) IS 'Returns all facts for a node and its descendants';

-- ============================================================================
-- FUNCTION: COUNT FACTS FOR NODE SUBTREE
-- Returns fact count for a node including all descendants
-- ============================================================================

CREATE OR REPLACE FUNCTION count_facts_for_subtree(root_node_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO total
  FROM facts f
  JOIN kg_nodes n ON f.kg_node_id = n.id
  WHERE (f.kg_node_id = root_node_id OR root_node_id = ANY(n.path))
    AND f.valid_until IS NULL;

  RETURN total;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION count_facts_for_subtree(UUID) IS 'Counts facts for a node and all descendants';
