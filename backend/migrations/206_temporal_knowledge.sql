-- Migration: 206_temporal_knowledge.sql
-- Add temporal bounds and freshness tracking to knowledge graph
-- This enables:
-- - Valid time ranges for knowledge (when is this fact true?)
-- - Freshness tracking (when was this last validated?)
-- - Automatic staleness detection

-- ============================================================================
-- Add temporal columns to kg_nodes
-- ============================================================================

-- When this knowledge became valid (default: creation time)
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NOW();

-- When this knowledge stops being valid (NULL = still valid)
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- Last time this knowledge was validated/confirmed as still accurate
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ DEFAULT NOW();

-- Who last validated this knowledge (VARCHAR to match users.id type)
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS last_validated_by VARCHAR(255) REFERENCES users(id);

-- Confidence score (0-1) - can decay over time or with conflicting info
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) DEFAULT 1.0;

-- Status for lifecycle management
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'
  CHECK (status IN ('active', 'stale', 'archived', 'superseded'));

-- ============================================================================
-- Add temporal columns to facts table
-- ============================================================================

-- When this fact became valid
ALTER TABLE facts ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NOW();

-- When this fact stops being valid (NULL = still valid)
ALTER TABLE facts ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- Last validation time
ALTER TABLE facts ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ DEFAULT NOW();

-- Who last validated (VARCHAR to match users.id type)
ALTER TABLE facts ADD COLUMN IF NOT EXISTS last_validated_by VARCHAR(255) REFERENCES users(id);

-- Confidence score
ALTER TABLE facts ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) DEFAULT 1.0;

-- Freshness status
ALTER TABLE facts ADD COLUMN IF NOT EXISTS freshness_status VARCHAR(20) DEFAULT 'fresh'
  CHECK (freshness_status IN ('fresh', 'stale', 'expired', 'needs_review'));

-- ============================================================================
-- Indexes for efficient temporal queries
-- ============================================================================

-- Find active knowledge (not yet expired)
-- Note: Can't use NOW() in partial index, so we index on valid_until instead
CREATE INDEX IF NOT EXISTS idx_kg_nodes_active
  ON kg_nodes(team_id, status, valid_until)
  WHERE valid_until IS NULL;

-- Find stale knowledge needing review
CREATE INDEX IF NOT EXISTS idx_kg_nodes_stale
  ON kg_nodes(team_id, last_validated_at)
  WHERE status = 'stale';

-- Find facts by freshness
CREATE INDEX IF NOT EXISTS idx_facts_freshness
  ON facts(team_id, freshness_status)
  WHERE freshness_status != 'fresh';

-- Find facts needing validation (not validated in last N days)
CREATE INDEX IF NOT EXISTS idx_facts_validation
  ON facts(team_id, last_validated_at);

-- ============================================================================
-- View: Active knowledge (excludes expired/archived)
-- ============================================================================

CREATE OR REPLACE VIEW active_knowledge AS
SELECT
  f.id,
  f.team_id,
  f.content,
  f.category,
  f.confidence,
  f.freshness_status,
  f.valid_from,
  f.valid_until,
  f.last_validated_at,
  f.kg_node_id,
  kn.name as node_name,
  kn.type as node_type,
  kn.scale_level,
  -- Calculate days since validation
  EXTRACT(DAY FROM NOW() - f.last_validated_at) as days_since_validation,
  -- Flag if potentially stale (not validated in 90 days)
  CASE
    WHEN f.last_validated_at < NOW() - INTERVAL '90 days' THEN true
    ELSE false
  END as potentially_stale
FROM facts f
LEFT JOIN kg_nodes kn ON f.kg_node_id = kn.id
WHERE f.status = 'active'
  AND (f.valid_until IS NULL OR f.valid_until > NOW())
  AND f.freshness_status != 'expired';

-- ============================================================================
-- Function: Mark stale knowledge
-- Called periodically or on-demand to flag knowledge needing review
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_stale_knowledge(
  p_team_id UUID,
  p_stale_threshold_days INTEGER DEFAULT 90
)
RETURNS TABLE(
  facts_marked INTEGER,
  nodes_marked INTEGER
) AS $$
DECLARE
  v_facts_count INTEGER := 0;
  v_nodes_count INTEGER := 0;
  v_threshold TIMESTAMPTZ;
BEGIN
  v_threshold := NOW() - (p_stale_threshold_days || ' days')::INTERVAL;

  -- Mark facts as stale
  UPDATE facts
  SET freshness_status = 'stale'
  WHERE team_id = p_team_id
    AND status = 'active'
    AND freshness_status = 'fresh'
    AND last_validated_at < v_threshold;

  GET DIAGNOSTICS v_facts_count = ROW_COUNT;

  -- Mark nodes as stale
  UPDATE kg_nodes
  SET status = 'stale'
  WHERE team_id = p_team_id
    AND status = 'active'
    AND last_validated_at < v_threshold;

  GET DIAGNOSTICS v_nodes_count = ROW_COUNT;

  RETURN QUERY SELECT v_facts_count, v_nodes_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Validate knowledge (mark as fresh)
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_knowledge(
  p_fact_ids UUID[],
  p_user_id VARCHAR(255)
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE facts
  SET
    freshness_status = 'fresh',
    last_validated_at = NOW(),
    last_validated_by = p_user_id,
    confidence = LEAST(confidence + 0.1, 1.0)  -- Boost confidence slightly
  WHERE id = ANY(p_fact_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Expire knowledge (mark as no longer valid)
-- ============================================================================

CREATE OR REPLACE FUNCTION expire_knowledge(
  p_fact_id UUID,
  p_expired_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID AS $$
BEGIN
  UPDATE facts
  SET
    freshness_status = 'expired',
    valid_until = p_expired_at,
    status = 'superseded'
  WHERE id = p_fact_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Auto-detect temporal references in content
-- Flags facts that reference past dates for review
-- ============================================================================

CREATE OR REPLACE FUNCTION check_temporal_references()
RETURNS TRIGGER AS $$
DECLARE
  v_content TEXT;
  v_year INTEGER;
  v_current_year INTEGER;
BEGIN
  v_content := LOWER(NEW.content);
  v_current_year := EXTRACT(YEAR FROM NOW())::INTEGER;

  -- Check for year references (e.g., "in 2024", "Q1 2024")
  -- If a past year is mentioned, flag for review
  FOR v_year IN
    SELECT DISTINCT (regexp_matches(v_content, '\b(20[0-9]{2})\b', 'g'))[1]::INTEGER
  LOOP
    IF v_year < v_current_year THEN
      NEW.freshness_status := 'needs_review';
      EXIT;
    END IF;
  END LOOP;

  -- Check for past-tense temporal phrases
  IF v_content ~ '\b(last year|last month|last quarter|yesterday|last week)\b' THEN
    NEW.freshness_status := 'needs_review';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_check_temporal_refs'
  ) THEN
    CREATE TRIGGER trigger_check_temporal_refs
      BEFORE INSERT ON facts
      FOR EACH ROW
      EXECUTE FUNCTION check_temporal_references();
  END IF;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================

COMMENT ON COLUMN kg_nodes.valid_from IS 'When this knowledge became valid';
COMMENT ON COLUMN kg_nodes.valid_until IS 'When this knowledge expires (NULL = indefinite)';
COMMENT ON COLUMN kg_nodes.last_validated_at IS 'Last time this was confirmed as accurate';
COMMENT ON COLUMN kg_nodes.confidence IS 'Confidence score 0-1, may decay over time';
COMMENT ON COLUMN facts.freshness_status IS 'Knowledge freshness: fresh, stale, expired, needs_review';
