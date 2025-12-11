-- Channel AI Focus - Set context items for AI conversations
-- Run: DATABASE_URL="$DB_POSTGRES_URL" node run-migration.js migrations/130_channel_ai_focus.sql

-- Add focus columns to channels table
-- When set, AI will have these items in context for all messages in the channel
ALTER TABLE channels
ADD COLUMN IF NOT EXISTS focus_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS focus_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS focus_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_channels_focus_goal ON channels(focus_goal_id) WHERE focus_goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_focus_project ON channels(focus_project_id) WHERE focus_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_focus_task ON channels(focus_task_id) WHERE focus_task_id IS NOT NULL;

COMMENT ON COLUMN channels.focus_goal_id IS 'Goal to keep in AI context for all messages in this channel';
COMMENT ON COLUMN channels.focus_project_id IS 'Project to keep in AI context for all messages in this channel';
COMMENT ON COLUMN channels.focus_task_id IS 'Task to keep in AI context for all messages in this channel';
