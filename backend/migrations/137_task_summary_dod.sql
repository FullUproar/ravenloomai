-- Migration 137: Add summary and definition_of_done to tasks
-- These fields help users better understand task objectives and completion criteria

-- Add summary field (brief objective of the task)
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add definition_of_done field (criteria for completion)
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS definition_of_done TEXT;

-- Add comment for documentation
COMMENT ON COLUMN tasks.summary IS 'Brief summary or objective of the task';
COMMENT ON COLUMN tasks.definition_of_done IS 'Criteria that must be met for the task to be considered complete';
