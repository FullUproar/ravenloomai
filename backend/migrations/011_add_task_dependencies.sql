-- Migration: Add task dependency fields
-- Purpose: Support inter-task relationships using PMP-style dependencies
-- Date: 2025-11-07

-- Add dependency-related columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS depends_on JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS relates_to JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocks JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependency_notes TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_depends_on ON tasks USING GIN (depends_on);
CREATE INDEX IF NOT EXISTS idx_tasks_relates_to ON tasks USING GIN (relates_to);
CREATE INDEX IF NOT EXISTS idx_tasks_blocks ON tasks USING GIN (blocks);

-- Comments
COMMENT ON COLUMN tasks.depends_on IS 'Array of task IDs with dependency type: [{"taskId": 123, "type": "finish_to_start"}]';
COMMENT ON COLUMN tasks.relates_to IS 'Array of related task IDs with relationship type: [{"taskId": 456, "type": "related", "notes": "similar work"}]';
COMMENT ON COLUMN tasks.blocks IS 'Array of task IDs that this task blocks: [{"taskId": 789, "reason": "prerequisite"}]';
COMMENT ON COLUMN tasks.dependency_notes IS 'Plain text notes about dependencies and conditions';

/*
Dependency Types (PMP-style):
- finish_to_start (FS): Task B cannot start until Task A finishes
- start_to_start (SS): Task B cannot start until Task A starts
- finish_to_finish (FF): Task B cannot finish until Task A finishes
- start_to_finish (SF): Task B cannot finish until Task A starts

Relationship Types:
- related: General relationship
- similar: Similar work or domain
- prerequisite: Required knowledge or setup
- successor: Follows this task
- blocker: Blocked by this task
- dependency: Depends on this task
*/
