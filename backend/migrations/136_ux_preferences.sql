-- Migration: 136_ux_preferences.sql
-- AI-Controlled UX Personalization
-- Team defaults + user overrides, all controlled through Raven (no UI settings)

-- Team-level UX defaults (set by admins via Raven)
CREATE TABLE IF NOT EXISTS team_ux_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Navigation
  nav_order JSONB DEFAULT '["digest","raven","channels","tasks","goals","projects","calendar","insights","team","knowledge"]',
  nav_hidden JSONB DEFAULT '[]',  -- Items to hide by default
  nav_collapsed JSONB DEFAULT '["tasks","goals","projects","team","knowledge"]',

  -- Layout & Density
  card_density VARCHAR(20) DEFAULT 'comfortable',  -- compact, comfortable, spacious
  default_view VARCHAR(50) DEFAULT 'digest',
  sidebar_width VARCHAR(20) DEFAULT 'normal',  -- narrow, normal, wide

  -- Features
  animations_enabled BOOLEAN DEFAULT true,
  show_badges BOOLEAN DEFAULT true,
  show_ai_summaries BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id)
);

-- User-level UX preferences (overrides team defaults)
CREATE TABLE IF NOT EXISTS user_ux_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(128) NOT NULL,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Navigation (null = use team default)
  nav_order JSONB,
  nav_hidden JSONB,
  nav_collapsed JSONB,

  -- Layout & Density
  card_density VARCHAR(20),
  default_view VARCHAR(50),
  sidebar_width VARCHAR(20),

  -- Features
  animations_enabled BOOLEAN,
  show_badges BOOLEAN,
  show_ai_summaries BOOLEAN,

  -- AI Learning
  last_raven_suggestion TIMESTAMPTZ,
  suggestion_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, team_id)
);

-- Track usage patterns for AI learning
CREATE TABLE IF NOT EXISTS ux_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(128) NOT NULL,
  team_id UUID NOT NULL,

  event_type VARCHAR(50) NOT NULL,  -- nav_click, view_change, feature_use
  event_target VARCHAR(100),         -- calendar, tasks, etc.
  event_context JSONB,               -- Additional context

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_ux_defaults_team ON team_ux_defaults(team_id);
CREATE INDEX IF NOT EXISTS idx_user_ux_preferences_user_team ON user_ux_preferences(user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_ux_usage_user_team ON ux_usage_events(user_id, team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ux_usage_type ON ux_usage_events(event_type, created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ux_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_team_ux_defaults_updated ON team_ux_defaults;
CREATE TRIGGER trigger_team_ux_defaults_updated
  BEFORE UPDATE ON team_ux_defaults
  FOR EACH ROW EXECUTE FUNCTION update_ux_preferences_timestamp();

DROP TRIGGER IF EXISTS trigger_user_ux_preferences_updated ON user_ux_preferences;
CREATE TRIGGER trigger_user_ux_preferences_updated
  BEFORE UPDATE ON user_ux_preferences
  FOR EACH ROW EXECUTE FUNCTION update_ux_preferences_timestamp();

-- Insert default team UX settings for existing teams
INSERT INTO team_ux_defaults (team_id)
SELECT id FROM teams
WHERE NOT EXISTS (
  SELECT 1 FROM team_ux_defaults WHERE team_ux_defaults.team_id = teams.id
)
ON CONFLICT (team_id) DO NOTHING;
