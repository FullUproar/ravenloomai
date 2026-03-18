-- ============================================
-- CONFLICT OVERRIDES
-- Migration 206: Track conflict resolution decisions
-- ============================================

-- When Remember detects a conflict between a new fact and an existing one,
-- the user decides: override the old fact, keep the existing one, or skip.
-- Currently skipConflictIds is passed but never persisted. This fixes that.

CREATE TABLE IF NOT EXISTS conflict_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preview_id UUID NOT NULL REFERENCES remember_previews(id) ON DELETE CASCADE,
    existing_fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    new_fact_id UUID REFERENCES facts(id) ON DELETE SET NULL,
    conflict_type VARCHAR(20) NOT NULL,
    user_decision VARCHAR(20) NOT NULL CHECK (user_decision IN ('override', 'keep_existing', 'skip')),
    user_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conflict_overrides_preview ON conflict_overrides(preview_id);
CREATE INDEX IF NOT EXISTS idx_conflict_overrides_existing ON conflict_overrides(existing_fact_id);

COMMENT ON TABLE conflict_overrides IS 'Records how users resolved fact conflicts. Feeds trust model and knowledge quality tracking.';
