-- Project Management Enhancement Features
-- Designed for modularity - each feature section can be removed independently
-- Run: DATABASE_URL="$DB_POSTGRES_URL" node run-migration.js migrations/125_pm_features.sql

-- ============================================
-- SECTION 1: User Availability & Work Schedule
-- ============================================

-- User work schedule preferences (extends existing user_preferences or creates standalone)
CREATE TABLE IF NOT EXISTS user_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

  -- Work schedule
  timezone VARCHAR(64) DEFAULT 'America/New_York',
  work_day_start TIME DEFAULT '09:00',
  work_day_end TIME DEFAULT '17:00',
  work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Sun, 1=Mon, etc.

  -- Capacity (hours per week available for tasks)
  weekly_capacity_hours DECIMAL(5,2) DEFAULT 40.0,

  -- Pro mode flag
  pro_mode_enabled BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_user_availability_user ON user_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_user_availability_team ON user_availability(team_id);

-- Time off / vacation tracking
CREATE TABLE IF NOT EXISTS time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type VARCHAR(32) DEFAULT 'vacation', -- vacation, sick, personal, holiday
  description TEXT,
  is_half_day BOOLEAN DEFAULT FALSE,
  half_day_period VARCHAR(10), -- 'morning' or 'afternoon'

  -- Status for approval workflows (optional feature)
  status VARCHAR(20) DEFAULT 'approved', -- pending, approved, rejected
  approved_by VARCHAR(255) REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_off_user ON time_off(user_id);
CREATE INDEX IF NOT EXISTS idx_time_off_dates ON time_off(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_time_off_team ON time_off(team_id);

-- ============================================
-- SECTION 2: GTD Contexts
-- ============================================

-- Add context field to tasks for GTD methodology
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS context VARCHAR(64);
-- Common contexts: @computer, @phone, @errands, @home, @office, @anywhere

CREATE INDEX IF NOT EXISTS idx_tasks_context ON tasks(context);

-- Predefined contexts per team (optional customization)
CREATE TABLE IF NOT EXISTS task_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  icon VARCHAR(32), -- emoji or icon name
  color VARCHAR(7), -- hex color
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, name)
);

-- ============================================
-- SECTION 3: Project Stages & Milestones
-- ============================================

-- Project stages for tracking lifecycle
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage VARCHAR(64) DEFAULT 'active';
-- Default stages: concept, design, development, testing, launch, maintenance

-- Milestone tracking (distinct from goals - more date-focused)
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_date DATE,
  completed_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, missed

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  -- Optional: link to a goal
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,

  created_by VARCHAR(255) REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_team ON milestones(team_id);
CREATE INDEX IF NOT EXISTS idx_milestones_target ON milestones(target_date);

-- Project templates for quick setup
CREATE TABLE IF NOT EXISTS project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Template data stored as JSONB for flexibility
  -- Contains: default_stages, milestone_templates, task_templates
  template_data JSONB DEFAULT '{}',

  -- Product company specific: industry type
  industry_type VARCHAR(64), -- consumer_goods, software, manufacturing, etc.

  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(255) REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_templates_team ON project_templates(team_id);

-- ============================================
-- SECTION 4: Eisenhower Matrix Support
-- ============================================

-- Add urgency field to tasks (importance already exists via priority)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS importance VARCHAR(10) DEFAULT 'normal'; -- low, normal, high, critical

CREATE INDEX IF NOT EXISTS idx_tasks_urgency ON tasks(is_urgent);
CREATE INDEX IF NOT EXISTS idx_tasks_importance ON tasks(importance);

-- ============================================
-- SECTION 5: Time Blocking
-- ============================================

-- Time blocks - scheduled focus time for specific tasks
CREATE TABLE IF NOT EXISTS time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

  -- What this block is for
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(255), -- Optional custom title if not linked to task

  -- When
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,

  -- Status
  status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, in_progress, completed, skipped

  -- Calendar sync (no FK - calendar_events may not exist)
  calendar_event_id UUID,
  google_event_id VARCHAR(255),

  -- Productivity tracking
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  focus_score INTEGER, -- 1-10 self-reported focus quality
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_blocks_user ON time_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_time_blocks_task ON time_blocks(task_id);
CREATE INDEX IF NOT EXISTS idx_time_blocks_time ON time_blocks(start_time, end_time);

-- ============================================
-- SECTION 6: Resource Allocation Views
-- ============================================

-- Materialized view for user workload (can be refreshed periodically)
-- Note: Using regular view for now to avoid refresh complexity
CREATE OR REPLACE VIEW user_workload AS
SELECT
  u.id as user_id,
  u.display_name,
  t.id as team_id,
  tm.team_id as member_team_id,
  COUNT(DISTINCT tk.id) FILTER (WHERE tk.status != 'done') as open_tasks,
  COUNT(DISTINCT tk.id) FILTER (WHERE tk.status != 'done' AND tk.due_at < NOW()) as overdue_tasks,
  COUNT(DISTINCT tk.id) FILTER (WHERE tk.status != 'done' AND tk.due_at BETWEEN NOW() AND NOW() + INTERVAL '7 days') as due_this_week,
  COALESCE(SUM(tk.estimated_hours) FILTER (WHERE tk.status != 'done'), 0) as total_estimated_hours,
  COALESCE(ua.weekly_capacity_hours, 40) as weekly_capacity,
  COALESCE(SUM(tk.estimated_hours) FILTER (WHERE tk.status != 'done'), 0) / NULLIF(COALESCE(ua.weekly_capacity_hours, 40), 0) * 100 as utilization_percent
FROM users u
LEFT JOIN team_members tm ON u.id = tm.user_id
LEFT JOIN teams t ON tm.team_id = t.id
LEFT JOIN tasks tk ON tk.assigned_to = u.id AND tk.status != 'done'
LEFT JOIN user_availability ua ON ua.user_id = u.id AND ua.team_id = tm.team_id
GROUP BY u.id, u.display_name, t.id, tm.team_id, ua.weekly_capacity_hours;

-- ============================================
-- SECTION 7: Quick Task Badges (2-min rule)
-- ============================================

-- Add quick_task flag for sub-15-minute tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_quick_task BOOLEAN DEFAULT FALSE;

-- Auto-set based on estimated_hours (trigger can be added if needed)
-- For now, we'll handle this in the application layer

-- ============================================
-- SECTION 8: Smart Scheduling Support
-- ============================================

-- Meeting preferences per user
CREATE TABLE IF NOT EXISTS meeting_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,

  -- Preferred meeting times
  preferred_meeting_start TIME DEFAULT '09:00',
  preferred_meeting_end TIME DEFAULT '17:00',

  -- Buffer time between meetings (minutes)
  buffer_before INTEGER DEFAULT 5,
  buffer_after INTEGER DEFAULT 5,

  -- Max meetings per day
  max_meetings_per_day INTEGER DEFAULT 8,

  -- No-meeting days (0=Sun, 1=Mon, etc.)
  no_meeting_days INTEGER[] DEFAULT ARRAY[]::INTEGER[],

  -- Focus time protection - don't schedule meetings during these blocks
  protected_focus_start TIME,
  protected_focus_end TIME,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- ============================================
-- SECTION 9: Pro Mode Feature Flags
-- ============================================

-- Feature flags table for granular pro mode control
CREATE TABLE IF NOT EXISTS user_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,

  -- Individual feature toggles
  show_gantt_chart BOOLEAN DEFAULT FALSE,
  show_time_tracking BOOLEAN DEFAULT FALSE,
  show_dependencies_graph BOOLEAN DEFAULT FALSE,
  show_resource_allocation BOOLEAN DEFAULT FALSE,
  show_critical_path BOOLEAN DEFAULT FALSE,
  show_eisenhower_matrix BOOLEAN DEFAULT FALSE,
  show_workload_histogram BOOLEAN DEFAULT FALSE,
  show_milestones BOOLEAN DEFAULT FALSE,
  show_time_blocking BOOLEAN DEFAULT FALSE,
  show_contexts BOOLEAN DEFAULT FALSE,

  -- Productivity method preferences
  preferred_productivity_method VARCHAR(32) DEFAULT 'gtd', -- gtd, eisenhower, eat_the_frog, time_blocking

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- ============================================
-- SECTION 10: Indexes for Performance
-- ============================================

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_status ON tasks(due_at, status) WHERE status != 'done';

-- ============================================
-- HELPFUL COMMENTS FOR FUTURE REMOVAL
-- ============================================

-- To remove a feature section, you can run these DROP statements:
--
-- Remove User Availability:
--   DROP TABLE IF EXISTS time_off CASCADE;
--   DROP TABLE IF EXISTS user_availability CASCADE;
--
-- Remove GTD Contexts:
--   ALTER TABLE tasks DROP COLUMN IF EXISTS context;
--   DROP TABLE IF EXISTS task_contexts CASCADE;
--
-- Remove Milestones:
--   DROP TABLE IF EXISTS milestones CASCADE;
--   DROP TABLE IF EXISTS project_templates CASCADE;
--   ALTER TABLE projects DROP COLUMN IF EXISTS stage;
--
-- Remove Eisenhower:
--   ALTER TABLE tasks DROP COLUMN IF EXISTS is_urgent;
--   ALTER TABLE tasks DROP COLUMN IF EXISTS importance;
--
-- Remove Time Blocking:
--   DROP TABLE IF EXISTS time_blocks CASCADE;
--
-- Remove Resource Views:
--   DROP VIEW IF EXISTS user_workload;
--
-- Remove Quick Task:
--   ALTER TABLE tasks DROP COLUMN IF EXISTS is_quick_task;
--
-- Remove Meeting Preferences:
--   DROP TABLE IF EXISTS meeting_preferences CASCADE;
--
-- Remove Feature Flags:
--   DROP TABLE IF EXISTS user_feature_flags CASCADE;
