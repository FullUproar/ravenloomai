-- Migration 119: User Nodes in Knowledge Graph
-- Allows team members to be represented in the KG with their preferences/facts

-- Add user_id column to kg_nodes for direct user linking
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS user_id VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL;

-- Create index for fast user node lookups
CREATE INDEX IF NOT EXISTS idx_kg_nodes_user ON kg_nodes(team_id, user_id) WHERE user_id IS NOT NULL;

-- Add 'team_member' as a recognized entity type
-- (No schema change needed, just documenting the convention)
-- type = 'team_member' with user_id set identifies user nodes

-- Create user_facts table for storing personal preferences and info
-- These are facts specifically about/from a user (e.g., "call me Shawn")
CREATE TABLE IF NOT EXISTS user_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The fact itself
  fact_type TEXT NOT NULL,              -- 'nickname', 'preference', 'role', 'contact', 'note'
  key TEXT NOT NULL,                     -- 'nickname', 'preferred_name', 'timezone', etc.
  value TEXT NOT NULL,                   -- The actual value

  -- Context
  context TEXT,                          -- Where/why this was learned
  confidence FLOAT DEFAULT 1.0,          -- How sure we are (1.0 = user stated directly)

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One value per key per user per team
  UNIQUE(team_id, user_id, fact_type, key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_facts_user ON user_facts(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_facts_type ON user_facts(team_id, fact_type);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_facts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_facts_updated_at ON user_facts;
CREATE TRIGGER user_facts_updated_at
  BEFORE UPDATE ON user_facts
  FOR EACH ROW EXECUTE FUNCTION update_user_facts_updated_at();
