-- ============================================
-- CONFIRMATION EVENTS
-- Migration 204: Track every confirmation decision for trust model training
-- Phase 1 data requirement (Brief Section 5g)
-- ============================================

-- Every time a user confirms, edits, or rejects a fact during Remember,
-- we record the event. This is the primary training data for the adaptive
-- trust model (Phase 2). The confirming user may differ from the stating user.

CREATE TABLE IF NOT EXISTS confirmation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    preview_id UUID,
    fact_id UUID REFERENCES facts(id) ON DELETE SET NULL,
    confirming_user_id VARCHAR(128) NOT NULL,
    stating_user_id VARCHAR(128),
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('confirmed', 'edited', 'rejected')),
    original_content TEXT,
    edited_content TEXT,
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confirmation_events_team ON confirmation_events(team_id);
CREATE INDEX IF NOT EXISTS idx_confirmation_events_fact ON confirmation_events(fact_id);
CREATE INDEX IF NOT EXISTS idx_confirmation_events_user ON confirmation_events(confirming_user_id);
CREATE INDEX IF NOT EXISTS idx_confirmation_events_outcome ON confirmation_events(team_id, outcome);

COMMENT ON TABLE confirmation_events IS 'Audit trail of every fact confirmation decision. Training data for the adaptive trust model.';
COMMENT ON COLUMN confirmation_events.outcome IS 'confirmed = accepted as-is, edited = accepted with changes, rejected = discarded';
COMMENT ON COLUMN confirmation_events.response_time_ms IS 'Time from preview display to user action. Fast confirms suggest high trust in source.';
