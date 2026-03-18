-- ============================================
-- REMEMBER PREVIEWS (PERSISTENT)
-- Migration 205: Move preview storage from in-memory Map to database
-- ============================================

-- Currently previews live in an in-memory Map with 1-hour expiry.
-- This migration persists them so they survive server restarts and
-- provide an audit trail of what was extracted vs. what was confirmed.

CREATE TABLE IF NOT EXISTS remember_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL,
    source_text TEXT NOT NULL,
    source_url TEXT,
    extracted_facts JSONB NOT NULL DEFAULT '[]',
    conflicts JSONB NOT NULL DEFAULT '[]',
    is_mismatch BOOLEAN DEFAULT FALSE,
    mismatch_suggestion TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_remember_previews_team ON remember_previews(team_id);
CREATE INDEX IF NOT EXISTS idx_remember_previews_user ON remember_previews(user_id, status);
CREATE INDEX IF NOT EXISTS idx_remember_previews_status ON remember_previews(status) WHERE status = 'pending';

COMMENT ON TABLE remember_previews IS 'Persistent storage for Remember preview sessions. Replaces in-memory Map.';
COMMENT ON COLUMN remember_previews.extracted_facts IS 'JSON array of facts extracted by AI before user confirmation';
COMMENT ON COLUMN remember_previews.conflicts IS 'JSON array of detected conflicts with existing facts';
