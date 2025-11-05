-- Migration 005: Add Recurring Tasks
-- Adds support for recurring/repeating tasks

-- ============================================================================
-- ADD RECURRING TASK FIELDS TO TASKS TABLE
-- ============================================================================

-- Is this a recurring task template or instance?
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
-- true = this is a recurring template (generates instances)

-- Link recurring instances to their template
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE;
-- If set, this is an instance of a recurring task

-- Recurrence pattern
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(50);
-- Options: 'daily', 'weekly', 'monthly', 'yearly', 'custom'

-- Recurrence interval (e.g., every 2 days, every 3 weeks)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1;
-- For daily: every N days
-- For weekly: every N weeks
-- For monthly: every N months

-- Days of week for weekly recurrence (JSONB array)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_days JSONB DEFAULT '[]';
-- For weekly: [1, 3, 5] = Monday, Wednesday, Friday (1=Mon, 7=Sun)
-- For monthly: [1, 15] = 1st and 15th of month

-- Recurrence end condition
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_end_type VARCHAR(50) DEFAULT 'never';
-- Options: 'never', 'after_date', 'after_count'

-- Recurrence end date (if recurrence_end_type = 'after_date')
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMP;

-- Recurrence end count (if recurrence_end_type = 'after_count')
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_end_count INTEGER;

-- Track how many instances have been generated
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_instances_generated INTEGER DEFAULT 0;

-- When was the last instance generated?
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_instance_generated_at TIMESTAMP;

-- Is this recurring task paused?
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_paused BOOLEAN DEFAULT false;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tasks_is_recurring ON tasks(is_recurring);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_type ON tasks(recurrence_type);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
