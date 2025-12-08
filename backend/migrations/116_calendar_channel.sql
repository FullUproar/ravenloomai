-- Migration 116: Add #calendar channel to existing teams
-- This channel is special - Raven auto-responds to all messages

-- Add calendar channel to teams that don't have one
INSERT INTO channels (team_id, name, description, is_default, created_by)
SELECT
  t.id as team_id,
  'calendar' as name,
  'Calendar management - Raven responds to all messages here' as description,
  false as is_default,
  (SELECT user_id FROM team_members WHERE team_id = t.id AND role = 'owner' LIMIT 1) as created_by
FROM teams t
WHERE NOT EXISTS (
  SELECT 1 FROM channels c WHERE c.team_id = t.id AND c.name = 'calendar'
);
