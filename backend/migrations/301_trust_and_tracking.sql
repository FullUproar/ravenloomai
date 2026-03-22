-- Migration 301: Trust model + token tracking + user model support
-- Adds: token_usage, trust_scores tables
-- Modifies: triples (challenge_flags, auto_confirmed), scopes (user_model type),
--           confirmation_events (auto_confirmed outcome)

BEGIN;

-- ============================================================================
-- 1. TOKEN USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id VARCHAR(128),
    operation TEXT NOT NULL,  -- ask, extract, embed, groom, challenge, rerank, etc.
    model TEXT NOT NULL,      -- gpt-4o, gpt-4o-mini, text-embedding-3-small, etc.
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd FLOAT DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_team
    ON token_usage(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_team_user
    ON token_usage(team_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_operation
    ON token_usage(team_id, operation, created_at DESC);

-- ============================================================================
-- 2. SOURCE x TOPIC TRUST SCORES (Beta Distribution)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trust_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    source_id VARCHAR(128) NOT NULL,     -- user ID or source identifier
    source_type TEXT NOT NULL DEFAULT 'user',  -- user, document, integration
    topic_id UUID REFERENCES context_nodes(id) ON DELETE CASCADE,  -- NULL = global trust
    alpha FLOAT DEFAULT 1.0,             -- Beta distribution: success count + prior
    beta FLOAT DEFAULT 1.0,              -- Beta distribution: failure count + prior
    sample_count INTEGER DEFAULT 0,      -- total observations
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trust_scores_unique
    ON trust_scores(team_id, source_id, source_type, COALESCE(topic_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_trust_scores_lookup
    ON trust_scores(team_id, source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_trust_scores_topic
    ON trust_scores(team_id, topic_id);

-- ============================================================================
-- 3. CHALLENGE FLAGS + AUTO-CONFIRM ON TRIPLES
-- ============================================================================

ALTER TABLE triples ADD COLUMN IF NOT EXISTS challenge_flags JSONB DEFAULT '[]';
-- e.g. [{"type": "contradiction", "detail": "conflicts with triple X", "severity": "hard"}]

ALTER TABLE triples ADD COLUMN IF NOT EXISTS auto_confirmed BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 4. EXTEND SCOPE TYPES FOR USER MODEL
-- ============================================================================

-- Drop and recreate check constraint to add 'user_model'
DO $$
BEGIN
    ALTER TABLE scopes DROP CONSTRAINT IF EXISTS scopes_type_check;
    ALTER TABLE scopes ADD CONSTRAINT scopes_type_check
        CHECK (type IN ('team', 'project', 'private', 'user_model'));
EXCEPTION WHEN OTHERS THEN
    -- Constraint may not exist in this form
    NULL;
END $$;

-- ============================================================================
-- 5. EXTEND SOURCE_TYPE FOR USER MODEL TRIPLES
-- ============================================================================

ALTER TABLE triples DROP CONSTRAINT IF EXISTS triples_source_type_check;
ALTER TABLE triples ADD CONSTRAINT triples_source_type_check
    CHECK (source_type IN ('user_statement', 'document', 'conversation',
           'integration', 'inference', 'grooming', 'user_model'));

-- ============================================================================
-- 6. EXTEND CONFIRMATION OUTCOMES FOR AUTO-CONFIRM
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE confirmation_events DROP CONSTRAINT IF EXISTS confirmation_events_outcome_check;
    ALTER TABLE confirmation_events ADD CONSTRAINT confirmation_events_outcome_check
        CHECK (outcome IN ('confirmed', 'edited', 'rejected', 'auto_confirmed'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Compute trust score from Beta distribution
CREATE OR REPLACE FUNCTION trust_score(alpha FLOAT, beta FLOAT)
RETURNS FLOAT AS $$
BEGIN
    RETURN alpha / (alpha + beta);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Compute trust confidence (sample size indicator)
CREATE OR REPLACE FUNCTION trust_confidence(alpha FLOAT, beta FLOAT)
RETURNS TEXT AS $$
DECLARE
    sample_size FLOAT;
    score FLOAT;
BEGIN
    sample_size := alpha + beta - 2;  -- subtract prior
    score := alpha / (alpha + beta);
    IF sample_size < 3 THEN RETURN 'unknown';
    ELSIF score >= 0.8 AND sample_size >= 5 THEN RETURN 'high';
    ELSIF score >= 0.5 THEN RETURN 'medium';
    ELSE RETURN 'low';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMIT;
