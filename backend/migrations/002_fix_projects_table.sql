-- Migration 002: Fix projects table
-- Removes old columns that are no longer needed

-- Drop domain column (no longer used in persona architecture)
ALTER TABLE projects DROP COLUMN IF EXISTS domain;

-- Make sure all new columns exist with proper defaults
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completion_type VARCHAR(50) DEFAULT 'milestone';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS habit_streak_current INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS habit_streak_longest INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS habit_streak_target INTEGER DEFAULT 30;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS recurring_goal JSONB DEFAULT NULL;
