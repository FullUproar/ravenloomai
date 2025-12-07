-- Active discussions table for Raven-led facilitated discussions
-- Tracks ongoing discussions in channels

CREATE TABLE IF NOT EXISTS active_discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  started_by VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

-- Partial unique index to prevent multiple active discussions in same channel
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_per_channel
  ON active_discussions(channel_id)
  WHERE is_active = TRUE;

-- Index for finding active discussions
CREATE INDEX IF NOT EXISTS idx_active_discussions_channel
  ON active_discussions(channel_id)
  WHERE is_active = TRUE;
