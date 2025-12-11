-- Work Breakdown Structure (WBS) Feature Flag
-- Run: DATABASE_URL="$DB_POSTGRES_URL" node run-migration.js migrations/128_wbs_feature_flag.sql

-- Add WBS feature flag to user_feature_flags
ALTER TABLE user_feature_flags
ADD COLUMN IF NOT EXISTS show_wbs BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_feature_flags.show_wbs IS
'Enable Work Breakdown Structure view for hierarchical project decomposition';
