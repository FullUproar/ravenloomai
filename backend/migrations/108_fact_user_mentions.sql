-- Add user mentions to facts for knowledge graph
-- Tracks which users are mentioned/associated with facts
-- Enables queries like "who knows about X" or "what is @person responsible for"

-- Table to link facts with mentioned users
CREATE TABLE IF NOT EXISTS fact_user_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mention_type VARCHAR(50) DEFAULT 'mentioned',  -- mentioned, responsible, expert, source
  context TEXT,  -- optional context about why user was mentioned
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(fact_id, user_id, mention_type)
);

-- Index for looking up facts by user
CREATE INDEX IF NOT EXISTS idx_fact_user_mentions_user ON fact_user_mentions(user_id);
CREATE INDEX IF NOT EXISTS idx_fact_user_mentions_fact ON fact_user_mentions(fact_id);

-- Add source_user_id to facts to track who provided the fact
ALTER TABLE facts ADD COLUMN IF NOT EXISTS source_user_id VARCHAR(255) REFERENCES users(id);

-- Index for looking up facts by source
CREATE INDEX IF NOT EXISTS idx_facts_source_user ON facts(source_user_id);
