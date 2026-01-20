-- ============================================
-- FACT ATTRIBUTION
-- Migration 202: Add source quote for provenance tracking
-- ============================================

-- Add source_quote column - stores the original verbatim text that created this fact
-- For user statements: "The release date is Q4 2026"
-- For imports: excerpt from document that was parsed
ALTER TABLE facts ADD COLUMN IF NOT EXISTS source_quote TEXT;

-- Add source_url for external references (Google Doc URLs, etc.)
ALTER TABLE facts ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Index for finding facts by source
CREATE INDEX IF NOT EXISTS idx_facts_source_type ON facts(source_type);
CREATE INDEX IF NOT EXISTS idx_facts_source_id ON facts(source_id);
