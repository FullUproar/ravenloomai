-- Migration: User Digest Tracking Tables
-- Supports the personalized digest/landing page feature

-- Track when users last viewed each channel (for unread message counts)
CREATE TABLE IF NOT EXISTS channel_last_seen (
  user_id VARCHAR(128) REFERENCES users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_last_seen_user ON channel_last_seen(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_last_seen_channel ON channel_last_seen(channel_id);

-- Track when users viewed specific items (to clear "updated" notifications)
CREATE TABLE IF NOT EXISTS digest_item_views (
  user_id VARCHAR(128) REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL,  -- 'goal', 'project', 'task'
  item_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_digest_item_views_user ON digest_item_views(user_id);
CREATE INDEX IF NOT EXISTS idx_digest_item_views_item ON digest_item_views(item_type, item_id);

-- Track when users last viewed the digest page (for 24h timeout on update notifications)
CREATE TABLE IF NOT EXISTS user_digest_views (
  user_id VARCHAR(128) REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_user_digest_views_user ON user_digest_views(user_id);

-- Add index for efficient "updated since" queries on goals
CREATE INDEX IF NOT EXISTS idx_goals_updated_at ON goals(team_id, updated_at DESC);

-- Add index for efficient "updated since" queries on projects
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(team_id, updated_at DESC);

-- Add index for efficient task assignment + update queries
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_updated ON tasks(assigned_to, updated_at DESC);
