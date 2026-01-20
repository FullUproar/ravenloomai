-- ============================================
-- TEAM-LEVEL INTEGRATIONS
-- Migration 201: Move integrations from user to team level
-- ============================================

-- Add team_id column to user_integrations
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

-- Create index for team lookups
CREATE INDEX IF NOT EXISTS idx_user_integrations_team ON user_integrations(team_id);

-- Drop the old unique constraint and create new one that includes team_id
-- First, we need to handle existing data
-- Set team_id for existing integrations (pick first team the user belongs to)
UPDATE user_integrations ui
SET team_id = (
  SELECT tm.team_id
  FROM team_members tm
  WHERE tm.user_id = ui.user_id
  LIMIT 1
)
WHERE team_id IS NULL;

-- Now we can add the new unique constraint
-- Drop old constraint first
ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS user_integrations_user_id_provider_key;

-- Add new constraint with team_id
ALTER TABLE user_integrations ADD CONSTRAINT user_integrations_user_team_provider_key UNIQUE (user_id, team_id, provider);
