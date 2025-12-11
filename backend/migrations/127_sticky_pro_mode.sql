-- Sticky Pro Mode Toggle
-- Makes Pro Mode a separate master toggle that persists across persona changes
-- Run: DATABASE_URL="$DB_POSTGRES_URL" node run-migration.js migrations/127_sticky_pro_mode.sql

-- Add master pro mode toggle to user_feature_flags
-- When false, all PM features are hidden regardless of individual flags
ALTER TABLE user_feature_flags
ADD COLUMN IF NOT EXISTS pro_mode_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_feature_flags.pro_mode_enabled IS
'Master toggle for Pro Mode. When false, all PM features are hidden regardless of individual feature flags.';
