-- Migration 104: Goal Associations (Many-to-Many)
-- Goals become associative/thematic rather than hierarchical parents
-- Tasks inherit goals from projects by default, with optional overrides

-- ============================================================================
-- Junction Tables
-- ============================================================================

-- Goals linked to Projects
CREATE TABLE IF NOT EXISTS goal_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(goal_id, project_id)
);

-- Goals linked directly to Tasks (additional/override goals)
CREATE TABLE IF NOT EXISTS goal_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(goal_id, task_id)
);

-- ============================================================================
-- Project Setting for Inheritance
-- ============================================================================

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS goals_inherit BOOLEAN DEFAULT true;

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Junction table indexes (team-scoped queries will use these with JOINs)
CREATE INDEX IF NOT EXISTS idx_goal_projects_goal ON goal_projects(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_projects_project ON goal_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal ON goal_tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_task ON goal_tasks(task_id);

-- Ensure team_id indexes exist on main tables (for scoped queries)
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_team ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_goals_team ON goals(team_id);

-- ============================================================================
-- Migrate Existing Data
-- ============================================================================

-- Move existing project.goal_id relationships to junction table
INSERT INTO goal_projects (goal_id, project_id)
SELECT goal_id, id FROM projects WHERE goal_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Remove the old foreign key column (optional - can keep for backwards compat)
-- ALTER TABLE projects DROP COLUMN goal_id;

-- ============================================================================
-- Helper View: Task Effective Goals (for simpler queries)
-- ============================================================================

CREATE OR REPLACE VIEW task_effective_goals AS
SELECT
  t.id AS task_id,
  t.team_id,
  g.id AS goal_id,
  g.title AS goal_title,
  CASE
    WHEN gt.id IS NOT NULL THEN 'direct'
    ELSE 'inherited'
  END AS link_type
FROM tasks t
-- Direct goal links
LEFT JOIN goal_tasks gt ON gt.task_id = t.id
-- Inherited from project (if goals_inherit = true)
LEFT JOIN projects p ON t.project_id = p.id AND p.goals_inherit = true
LEFT JOIN goal_projects gp ON gp.project_id = p.id
-- Get the actual goal
JOIN goals g ON g.id = COALESCE(gt.goal_id, gp.goal_id)
WHERE gt.goal_id IS NOT NULL OR gp.goal_id IS NOT NULL;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE goal_projects IS 'Many-to-many: Goals associated with Projects';
COMMENT ON TABLE goal_tasks IS 'Many-to-many: Goals directly associated with Tasks (beyond inheritance)';
COMMENT ON COLUMN projects.goals_inherit IS 'If true, tasks inherit goals from this project. Default true.';
COMMENT ON VIEW task_effective_goals IS 'Computed view of all goals for each task (direct + inherited)';
