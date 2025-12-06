-- Goals, Projects, and Task Comments Enhancement
-- Adds goal hierarchy and task collaboration features

-- ============================================
-- GOALS (High-level objectives)
-- ============================================

CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

    -- Goal content
    title VARCHAR(500) NOT NULL,
    description TEXT,

    -- Timeframe
    target_date DATE,
    start_date DATE DEFAULT CURRENT_DATE,

    -- Status tracking
    status VARCHAR(50) DEFAULT 'active', -- active, achieved, abandoned, paused
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

    -- Ownership
    owner_id VARCHAR(128) REFERENCES users(id),
    created_by VARCHAR(128) REFERENCES users(id),

    -- Hierarchy (goals can have parent goals)
    parent_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- UPDATE PROJECTS - Link to Goals
-- ============================================

-- Add goal_id to projects if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'goal_id'
    ) THEN
        ALTER TABLE projects ADD COLUMN goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
    END IF;

    -- Add color for visual organization
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'color'
    ) THEN
        ALTER TABLE projects ADD COLUMN color VARCHAR(7) DEFAULT '#5D4B8C';
    END IF;

    -- Add due_date
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'due_date'
    ) THEN
        ALTER TABLE projects ADD COLUMN due_date DATE;
    END IF;

    -- Add owner
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE projects ADD COLUMN owner_id VARCHAR(128) REFERENCES users(id);
    END IF;
END $$;

-- ============================================
-- TASK COMMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL REFERENCES users(id),

    content TEXT NOT NULL,

    -- For threaded replies
    parent_comment_id UUID REFERENCES task_comments(id) ON DELETE CASCADE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TASK ACTIVITY LOG (for history)
-- ============================================

CREATE TABLE IF NOT EXISTS task_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id VARCHAR(128) REFERENCES users(id),

    -- What changed
    action VARCHAR(50) NOT NULL, -- created, status_changed, assigned, commented, due_date_set, etc.
    old_value TEXT,
    new_value TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- UPDATE TASKS - Add more fields
-- ============================================

DO $$
BEGIN
    -- Add start_date for scheduling
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'start_date'
    ) THEN
        ALTER TABLE tasks ADD COLUMN start_date DATE;
    END IF;

    -- Add estimated hours
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'estimated_hours'
    ) THEN
        ALTER TABLE tasks ADD COLUMN estimated_hours DECIMAL(5,2);
    END IF;

    -- Add actual hours (for tracking)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'actual_hours'
    ) THEN
        ALTER TABLE tasks ADD COLUMN actual_hours DECIMAL(5,2);
    END IF;

    -- Add tags as JSONB array
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'tags'
    ) THEN
        ALTER TABLE tasks ADD COLUMN tags JSONB DEFAULT '[]';
    END IF;

    -- Add sort order for manual ordering
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================
-- INDEXES
-- ============================================

-- Goals
CREATE INDEX IF NOT EXISTS idx_goals_team ON goals(team_id);
CREATE INDEX IF NOT EXISTS idx_goals_owner ON goals(owner_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(team_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id);

-- Projects to goals
CREATE INDEX IF NOT EXISTS idx_projects_goal ON projects(goal_id);

-- Task comments
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user ON task_comments(user_id);

-- Task activity
CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_created ON task_activity(task_id, created_at DESC);

-- Tasks by project
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(project_id, sort_order);
