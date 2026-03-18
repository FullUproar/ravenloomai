-- ============================================
-- TRUST TIER + GRAPH-NATIVE TRUST DATA
-- Migration 207: Trust classification on facts, trust collection on graph edges
-- ============================================

-- Trust tier on the fact audit trail.
-- AI classifies at extraction time based on source characteristics:
--   official = contracts, SOWs, brand guides, handbooks, signed agreements
--   tribal   = Slack threads, meeting notes, pasted recaps, casual decisions
ALTER TABLE facts ADD COLUMN IF NOT EXISTS trust_tier VARCHAR(20);

COMMENT ON COLUMN facts.trust_tier IS 'official (canonical source docs) or tribal (flow of work). Classified by AI at extraction.';

-- Graph-native trust data on edges.
-- Trust = source × context, computed via graph traversal (Phase 2).
-- Phase 1 collects the raw data on every edge.
ALTER TABLE kg_edges ADD COLUMN IF NOT EXISTS trust_score FLOAT;
ALTER TABLE kg_edges ADD COLUMN IF NOT EXISTS confirmation_count INTEGER DEFAULT 0;
ALTER TABLE kg_edges ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMPTZ;
ALTER TABLE kg_edges ADD COLUMN IF NOT EXISTS source_fact_ids UUID[] DEFAULT '{}';

COMMENT ON COLUMN kg_edges.trust_score IS 'Computed trust score (Phase 2). NULL until trust model runs.';
COMMENT ON COLUMN kg_edges.confirmation_count IS 'Number of times this relationship has been confirmed by users.';
COMMENT ON COLUMN kg_edges.last_confirmed_at IS 'Most recent confirmation timestamp for this edge.';
COMMENT ON COLUMN kg_edges.source_fact_ids IS 'Array of fact IDs that contribute to/support this edge.';

-- Index for trust queries
CREATE INDEX IF NOT EXISTS idx_kg_edges_trust ON kg_edges(trust_score) WHERE trust_score IS NOT NULL;
