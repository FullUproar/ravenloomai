-- Migration 120: Deep Research Sessions
-- Stores research sessions for iterative KB/KG exploration

CREATE TABLE IF NOT EXISTS deep_research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Research question and status
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress, synthesizing, complete, failed

  -- Research progress
  learning_objectives JSONB DEFAULT '[]',      -- Array of objectives with search queries
  findings JSONB DEFAULT '[]',                  -- Accumulated findings from each step
  current_step INTEGER DEFAULT 0,

  -- Final output
  report TEXT,                                  -- Synthesized research report

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deep_research_team ON deep_research_sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_deep_research_user ON deep_research_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_deep_research_status ON deep_research_sessions(team_id, status);
CREATE INDEX IF NOT EXISTS idx_deep_research_created ON deep_research_sessions(team_id, created_at DESC);
