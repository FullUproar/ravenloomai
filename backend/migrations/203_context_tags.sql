-- ============================================
-- CONTEXT TAGS
-- Migration 203: Add context tags for contextual knowledge scoping
-- ============================================

-- Add context_tags column - stores array of context strings
-- Examples: ["project:alpha", "2024-q1", "california", "usa"]
-- Used for contextual filtering of facts (project-specific, temporal, geographic, etc.)
ALTER TABLE facts ADD COLUMN IF NOT EXISTS context_tags JSONB DEFAULT '[]'::jsonb;

-- GIN index for efficient querying of context tags
-- Enables queries like: WHERE context_tags @> '["california"]'
CREATE INDEX IF NOT EXISTS idx_facts_context_tags ON facts USING GIN (context_tags);

-- Comment for documentation
COMMENT ON COLUMN facts.context_tags IS 'Array of context strings for scoping facts. Include parent contexts (e.g., california + usa). Common patterns: project:name, temporal (q1-2024), geographic (city, state, country), organizational (team, department).';
