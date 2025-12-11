-- WBS Drafts - Generic Ephemeral Tree Structure
-- Stores arbitrary tree structures that can be materialized into projects/tasks via AI
-- Run: DATABASE_URL="$DB_POSTGRES_URL" node run-migration.js migrations/129_wbs_drafts.sql

-- WBS Drafts table - stores the root of each WBS draft
CREATE TABLE IF NOT EXISTS wbs_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  -- The entire tree stored as JSONB for maximum flexibility
  -- Structure: { nodes: [{ id, label, estimatedHours, children: [...] }] }
  tree_data JSONB NOT NULL DEFAULT '{"nodes": []}',
  -- Track if this has been materialized into a project
  materialized_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  materialized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_wbs_drafts_team ON wbs_drafts(team_id);
CREATE INDEX IF NOT EXISTS idx_wbs_drafts_created_by ON wbs_drafts(created_by);
CREATE INDEX IF NOT EXISTS idx_wbs_drafts_materialized ON wbs_drafts(materialized_project_id) WHERE materialized_project_id IS NOT NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_wbs_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wbs_drafts_updated_at ON wbs_drafts;
CREATE TRIGGER wbs_drafts_updated_at
  BEFORE UPDATE ON wbs_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_wbs_drafts_updated_at();

COMMENT ON TABLE wbs_drafts IS 'Generic Work Breakdown Structure drafts - arbitrary tree structures that can be AI-materialized into projects/tasks';
COMMENT ON COLUMN wbs_drafts.tree_data IS 'JSONB tree: { nodes: [{ id, label, estimatedHours, children: [...recursive...] }] }';
