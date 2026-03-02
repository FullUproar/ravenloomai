-- Migration 204: Nested Knowledge Graph Support
-- Adds hierarchy to kg_nodes for scale-aware knowledge organization
-- Enables "Gen Con 2026" to contain "Booth Logistics", "Demo Schedule", etc.

-- ============================================================================
-- ADD HIERARCHY COLUMNS TO KG_NODES
-- ============================================================================

-- Parent reference for hierarchy (NULL = root level node)
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS parent_node_id UUID REFERENCES kg_nodes(id) ON DELETE SET NULL;

-- Scale level indicates node granularity:
-- 0 = atomic (individual facts, specific details)
-- 1 = grouping (logical groupings like "Booth Logistics", "Demo Schedule")
-- 2 = container (top-level like "Gen Con 2026", "Product Launch")
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS scale_level INTEGER DEFAULT 0;

-- AI-generated summary of child content (used when querying at higher levels)
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS summary TEXT;

-- Cached count of direct children (for UI display without extra queries)
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS child_count INTEGER DEFAULT 0;

-- Materialized path of ancestor IDs from root (for efficient descendant queries)
-- Example: For node C with path A→B→C, this stores [A.id, B.id]
-- Enables fast "get all descendants" without recursive CTE
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS path UUID[] DEFAULT '{}';

-- ============================================================================
-- INDEXES FOR HIERARCHY TRAVERSAL
-- ============================================================================

-- Fast lookup of children by parent
CREATE INDEX IF NOT EXISTS idx_kg_nodes_parent ON kg_nodes(parent_node_id);

-- Fast lookup by scale level (e.g., "all containers in this team")
CREATE INDEX IF NOT EXISTS idx_kg_nodes_scale ON kg_nodes(team_id, scale_level);

-- GIN index for path containment queries (find all descendants of a node)
-- Query: WHERE $nodeId = ANY(path)
CREATE INDEX IF NOT EXISTS idx_kg_nodes_path ON kg_nodes USING gin(path);

-- Composite index for team + parent queries (common access pattern)
CREATE INDEX IF NOT EXISTS idx_kg_nodes_team_parent ON kg_nodes(team_id, parent_node_id);

-- ============================================================================
-- HELPER FUNCTION: UPDATE NODE PATH
-- Called when a node's parent changes to maintain path array
-- ============================================================================

CREATE OR REPLACE FUNCTION update_kg_node_path()
RETURNS TRIGGER AS $$
DECLARE
  parent_path UUID[];
BEGIN
  -- If no parent, path is empty
  IF NEW.parent_node_id IS NULL THEN
    NEW.path := '{}';
  ELSE
    -- Get parent's path and append parent's ID
    SELECT COALESCE(path, '{}') || id INTO parent_path
    FROM kg_nodes
    WHERE id = NEW.parent_node_id;

    NEW.path := COALESCE(parent_path, '{}');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update path on insert or parent change
DROP TRIGGER IF EXISTS kg_nodes_path_trigger ON kg_nodes;
CREATE TRIGGER kg_nodes_path_trigger
  BEFORE INSERT OR UPDATE OF parent_node_id ON kg_nodes
  FOR EACH ROW EXECUTE FUNCTION update_kg_node_path();

-- ============================================================================
-- HELPER FUNCTION: UPDATE CHILD COUNT
-- Maintains child_count when nodes are added/removed/reparented
-- ============================================================================

CREATE OR REPLACE FUNCTION update_kg_node_child_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrement old parent's count (if changed or deleted)
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.parent_node_id IS DISTINCT FROM NEW.parent_node_id) THEN
    IF OLD.parent_node_id IS NOT NULL THEN
      UPDATE kg_nodes SET child_count = GREATEST(0, child_count - 1)
      WHERE id = OLD.parent_node_id;
    END IF;
  END IF;

  -- Increment new parent's count (if inserted or reparented)
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.parent_node_id IS DISTINCT FROM NEW.parent_node_id) THEN
    IF NEW.parent_node_id IS NOT NULL THEN
      UPDATE kg_nodes SET child_count = child_count + 1
      WHERE id = NEW.parent_node_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain child counts
DROP TRIGGER IF EXISTS kg_nodes_child_count_trigger ON kg_nodes;
CREATE TRIGGER kg_nodes_child_count_trigger
  AFTER INSERT OR UPDATE OF parent_node_id OR DELETE ON kg_nodes
  FOR EACH ROW EXECUTE FUNCTION update_kg_node_child_count();

-- ============================================================================
-- RECURSIVE FUNCTION: GET ALL DESCENDANTS
-- Utility function for queries that need full subtree
-- ============================================================================

CREATE OR REPLACE FUNCTION get_kg_node_descendants(root_id UUID)
RETURNS TABLE(id UUID, name TEXT, type TEXT, scale_level INTEGER, depth INTEGER) AS $$
WITH RECURSIVE descendants AS (
  -- Base case: direct children
  SELECT n.id, n.name, n.type, n.scale_level, 1 as depth
  FROM kg_nodes n
  WHERE n.parent_node_id = root_id

  UNION ALL

  -- Recursive case: children of children
  SELECT n.id, n.name, n.type, n.scale_level, d.depth + 1
  FROM kg_nodes n
  JOIN descendants d ON n.parent_node_id = d.id
  WHERE d.depth < 10  -- Safety limit
)
SELECT * FROM descendants;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN kg_nodes.parent_node_id IS 'Parent node ID for hierarchy. NULL = root level node.';
COMMENT ON COLUMN kg_nodes.scale_level IS 'Granularity: 0=atomic, 1=grouping, 2=container';
COMMENT ON COLUMN kg_nodes.summary IS 'AI-generated summary of child content for high-level queries';
COMMENT ON COLUMN kg_nodes.child_count IS 'Cached count of direct children';
COMMENT ON COLUMN kg_nodes.path IS 'Materialized ancestor path for efficient descendant queries';
COMMENT ON FUNCTION get_kg_node_descendants(UUID) IS 'Returns all descendants of a node with depth';
