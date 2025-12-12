-- Migration: Focus, Blocked Status, and Team Spotlight
-- Enables:
-- 1. Personal focus items (pin tasks/goals/projects to top of digest)
-- 2. Blocked status on tasks (escalation for stuck team members)
-- 3. Team spotlight (manager-set priorities visible to all)

-- ============================================================================
-- PERSONAL FOCUS (per-user pinning of items)
-- ============================================================================

-- Focus on tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_focus BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS focus_set_by VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS focus_set_at TIMESTAMP WITH TIME ZONE;

-- Focus on goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS is_focus BOOLEAN DEFAULT FALSE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS focus_set_by VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS focus_set_at TIMESTAMP WITH TIME ZONE;

-- Focus on projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_focus BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS focus_set_by VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS focus_set_at TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- BLOCKED STATUS (task escalation)
-- ============================================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_by VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL;

-- Index for quick blocked task queries
CREATE INDEX IF NOT EXISTS idx_tasks_blocked ON tasks(team_id, is_blocked) WHERE is_blocked = TRUE;

-- ============================================================================
-- TEAM SPOTLIGHT (manager-broadcast priorities)
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_spotlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Can spotlight an existing item OR custom text
  item_type VARCHAR(32) NOT NULL, -- 'task', 'goal', 'project', 'custom'
  item_id UUID, -- NULL for custom spotlight
  custom_title TEXT, -- For custom spotlight
  custom_description TEXT,

  -- Who set it and when
  set_by VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Optional expiration
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Active status
  is_active BOOLEAN DEFAULT TRUE,

  -- Display order (lower = higher priority)
  sort_order INT DEFAULT 0
);

-- Index for active spotlights per team
CREATE INDEX IF NOT EXISTS idx_spotlights_active ON team_spotlights(team_id, is_active, sort_order)
  WHERE is_active = TRUE;

-- ============================================================================
-- USER FOCUS ITEMS TABLE (tracks which items each user has focused)
-- This allows different users to focus on different items
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_focus_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- The focused item
  item_type VARCHAR(32) NOT NULL, -- 'task', 'goal', 'project'
  item_id UUID NOT NULL,

  -- When focused
  focused_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Order (1, 2, 3 for max 3 focus items)
  focus_order INT DEFAULT 1,

  UNIQUE(user_id, team_id, item_type, item_id)
);

-- Index for user's focus items
CREATE INDEX IF NOT EXISTS idx_user_focus ON user_focus_items(user_id, team_id);

-- Constraint: max 3 focus items per user per team (enforced in application layer)
