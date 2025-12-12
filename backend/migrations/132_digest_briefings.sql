-- Migration: Digest AI Briefings Cache
-- Stores AI-generated briefings for the digest page to avoid regenerating on every page load

CREATE TABLE IF NOT EXISTS user_digest_briefings (
  user_id VARCHAR(128) REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  digest_hash VARCHAR(64) NOT NULL,  -- Hash of digest state to detect changes
  briefing TEXT NOT NULL,             -- The AI-generated briefing text
  context_summary TEXT,               -- Optional: summary of what context was used
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, team_id)
);

-- Index for cleanup queries (delete old briefings)
CREATE INDEX IF NOT EXISTS idx_briefings_generated ON user_digest_briefings(generated_at);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_briefings_user_team ON user_digest_briefings(user_id, team_id);
