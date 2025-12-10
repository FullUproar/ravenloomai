-- Team Settings and Rate Limiting Migration
-- Adds team-level settings for proactive AI and API rate limiting

-- ============================================
-- TEAM SETTINGS
-- ============================================

-- Add settings column to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Default settings include:
-- {
--   "proactiveAI": {
--     "enabled": true,
--     "morningFocusEnabled": true,
--     "smartNudgesEnabled": true,
--     "insightsEnabled": true,
--     "meetingPrepEnabled": true
--   }
-- }

-- ============================================
-- API RATE LIMITING
-- ============================================

-- Table to track AI API usage per team for rate limiting
CREATE TABLE IF NOT EXISTS ai_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

    -- Rate limit tracking
    window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    call_count INTEGER NOT NULL DEFAULT 0,
    token_count INTEGER NOT NULL DEFAULT 0,

    -- Window type: 'minute', 'hour', 'day'
    window_type VARCHAR(20) NOT NULL DEFAULT 'hour',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(team_id, window_type)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_team_window ON ai_rate_limits(team_id, window_type);

-- ============================================
-- AI API CALL LOG (for debugging and audit)
-- ============================================

CREATE TABLE IF NOT EXISTS ai_api_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id VARCHAR(128) REFERENCES users(id),

    -- Call metadata
    service VARCHAR(100) NOT NULL, -- 'proactive', 'ceremony', 'meeting_prep', 'chat', etc.
    operation VARCHAR(100) NOT NULL, -- 'generate_nudges', 'morning_focus', etc.
    model VARCHAR(50), -- 'gpt-4o', 'gpt-4o-mini', etc.

    -- Usage metrics
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,

    -- Timing
    duration_ms INTEGER, -- How long the call took

    -- Status
    success BOOLEAN DEFAULT true,
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_ai_calls_team ON ai_api_calls(team_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_created ON ai_api_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_service ON ai_api_calls(team_id, service);

-- ============================================
-- UPDATE EXISTING TEAMS WITH DEFAULT SETTINGS
-- ============================================

UPDATE teams
SET settings = jsonb_set(
    COALESCE(settings, '{}'),
    '{proactiveAI}',
    '{"enabled": true, "morningFocusEnabled": true, "smartNudgesEnabled": true, "insightsEnabled": true, "meetingPrepEnabled": true}'::jsonb
)
WHERE settings IS NULL OR NOT (settings ? 'proactiveAI');
