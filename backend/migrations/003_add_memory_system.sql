-- Migration 003: Add 3-Tier Memory System
-- Tier 1: Short-term (conversation summaries)
-- Tier 2: Medium-term (tactical memory)
-- Tier 3: Long-term (knowledge graph) - Added in future migration

-- ============================================
-- TIER 1: Short-term Memory (Conversation Summaries)
-- ============================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS last_summary_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS message_count_at_summary INTEGER DEFAULT 0;

-- ============================================
-- TIER 2: Medium-term Memory (Tactical Scratchpad)
-- ============================================

CREATE TABLE IF NOT EXISTS project_memory (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  memory_type VARCHAR(50) NOT NULL, -- 'fact', 'decision', 'blocker', 'preference', 'insight'
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  importance INTEGER DEFAULT 5, -- 1-10 scale (higher = more important)
  expires_at TIMESTAMP, -- NULL = never expires
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, key)
);

CREATE INDEX IF NOT EXISTS idx_project_memory_project ON project_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_project_memory_importance ON project_memory(importance DESC);
CREATE INDEX IF NOT EXISTS idx_project_memory_type ON project_memory(memory_type);

-- ============================================
-- TIER 3: Long-term Memory (Knowledge Graph)
-- To be added in future migration
-- ============================================

COMMENT ON TABLE project_memory IS 'Tier 2 tactical memory - finite scratchpad of important facts';
COMMENT ON COLUMN project_memory.memory_type IS 'Type: fact, decision, blocker, preference, insight';
COMMENT ON COLUMN project_memory.importance IS 'Importance score 1-10, used for pruning when at capacity';
COMMENT ON COLUMN project_memory.expires_at IS 'When this memory should be removed (NULL = permanent)';
