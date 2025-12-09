-- Add support for private Raven channels (DMs between user and Raven)
-- These are personal to each user but @raven commands still affect team knowledge

-- Add channel_type to distinguish channel types
ALTER TABLE channels ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'public';
-- Types: 'public' (normal team channel), 'raven_dm' (private Raven chat), 'calendar' (calendar channel)

-- Add owner_id for private channels (who owns this DM)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS owner_id VARCHAR(128) REFERENCES users(id);

-- Create index for finding user's Raven DM
CREATE INDEX IF NOT EXISTS idx_channels_raven_dm ON channels(team_id, owner_id) WHERE channel_type = 'raven_dm';

-- Update existing calendar channels
UPDATE channels SET channel_type = 'calendar' WHERE name = '#calendar';
