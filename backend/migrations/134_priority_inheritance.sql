-- Migration: Priority Inheritance System
-- Enables:
-- 1. Goal priorities that cascade to linked tasks
-- 2. Effective priority scores computed from task + goal priorities
-- 3. Priority conflict detection

-- ============================================================================
-- GOAL PRIORITY
-- ============================================================================

-- Add priority field to goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS priority_score DECIMAL(3,2) DEFAULT 0.50;

-- Constraint on valid priorities
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_priority_check;
ALTER TABLE goals ADD CONSTRAINT goals_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));

-- ============================================================================
-- TASK EFFECTIVE PRIORITY
-- ============================================================================

-- Add computed priority fields to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS effective_priority_score DECIMAL(3,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority_source VARCHAR(50) DEFAULT 'manual';
-- priority_source: 'manual' = user set, 'goal' = inherited from goal, 'project' = inherited via project

-- ============================================================================
-- PRIORITY SCORE MAPPING FUNCTION
-- ============================================================================

-- Function to convert priority text to score
CREATE OR REPLACE FUNCTION priority_to_score(p VARCHAR(20))
RETURNS DECIMAL(3,2) AS $$
BEGIN
  RETURN CASE p
    WHEN 'critical' THEN 1.00
    WHEN 'urgent' THEN 1.00  -- alias for critical
    WHEN 'high' THEN 0.75
    WHEN 'medium' THEN 0.50
    WHEN 'low' THEN 0.25
    ELSE 0.50
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- EFFECTIVE PRIORITY VIEW
-- Computes effective priority as weighted average of task and goal priorities
-- Task priority: 40% weight
-- Highest linked goal priority: 60% weight
-- ============================================================================

CREATE OR REPLACE VIEW task_effective_priorities AS
SELECT
  t.id as task_id,
  t.team_id,
  t.priority as task_priority,
  priority_to_score(t.priority) as task_priority_score,

  -- Get highest priority from linked goals (direct or inherited)
  COALESCE(
    (
      SELECT MAX(g.priority_score)
      FROM goals g
      LEFT JOIN goal_tasks gt ON gt.goal_id = g.id AND gt.task_id = t.id
      LEFT JOIN goal_projects gp ON gp.goal_id = g.id
      LEFT JOIN projects p ON p.id = gp.project_id AND p.id = t.project_id AND p.goals_inherit = true
      WHERE gt.task_id = t.id OR (gp.project_id = t.project_id AND p.goals_inherit = true)
    ),
    0.50
  ) as max_goal_priority_score,

  -- Effective priority = 40% task + 60% highest goal
  ROUND(
    priority_to_score(t.priority) * 0.4 +
    COALESCE(
      (
        SELECT MAX(g.priority_score)
        FROM goals g
        LEFT JOIN goal_tasks gt ON gt.goal_id = g.id AND gt.task_id = t.id
        LEFT JOIN goal_projects gp ON gp.goal_id = g.id
        LEFT JOIN projects p ON p.id = gp.project_id AND p.id = t.project_id AND p.goals_inherit = true
        WHERE gt.task_id = t.id OR (gp.project_id = t.project_id AND p.goals_inherit = true)
      ),
      0.50
    ) * 0.6,
    2
  ) as effective_score,

  -- Detect priority conflict (task priority < max goal priority)
  CASE WHEN priority_to_score(t.priority) <
    COALESCE(
      (
        SELECT MAX(g.priority_score)
        FROM goals g
        LEFT JOIN goal_tasks gt ON gt.goal_id = g.id AND gt.task_id = t.id
        LEFT JOIN goal_projects gp ON gp.goal_id = g.id
        LEFT JOIN projects p ON p.id = gp.project_id AND p.id = t.project_id AND p.goals_inherit = true
        WHERE gt.task_id = t.id OR (gp.project_id = t.project_id AND p.goals_inherit = true)
      ),
      0.50
    )
  THEN true ELSE false END as has_priority_conflict

FROM tasks t
WHERE t.status != 'done';

-- ============================================================================
-- INDEX FOR PRIORITY QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_goals_priority ON goals(team_id, priority, priority_score);
CREATE INDEX IF NOT EXISTS idx_tasks_effective_priority ON tasks(team_id, effective_priority_score DESC NULLS LAST);

-- ============================================================================
-- TRIGGER TO UPDATE EFFECTIVE PRIORITY ON TASK CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION update_task_effective_priority()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the effective priority score
  UPDATE tasks
  SET
    effective_priority_score = (
      SELECT effective_score FROM task_effective_priorities WHERE task_id = NEW.id
    ),
    priority_source = CASE
      WHEN EXISTS (
        SELECT 1 FROM goal_tasks WHERE task_id = NEW.id
      ) THEN 'goal'
      WHEN NEW.project_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM goal_projects gp
        JOIN projects p ON p.id = gp.project_id
        WHERE p.id = NEW.project_id AND p.goals_inherit = true
      ) THEN 'project'
      ELSE 'manual'
    END
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on task insert/update
DROP TRIGGER IF EXISTS trg_task_effective_priority ON tasks;
CREATE TRIGGER trg_task_effective_priority
  AFTER INSERT OR UPDATE OF priority, project_id ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_task_effective_priority();

-- ============================================================================
-- TRIGGER TO PROPAGATE GOAL PRIORITY CHANGES TO TASKS
-- ============================================================================

CREATE OR REPLACE FUNCTION propagate_goal_priority_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update all tasks linked to this goal (direct or via project)
  UPDATE tasks t
  SET effective_priority_score = (
    SELECT effective_score FROM task_effective_priorities WHERE task_id = t.id
  )
  FROM (
    -- Direct links
    SELECT gt.task_id FROM goal_tasks gt WHERE gt.goal_id = NEW.id
    UNION
    -- Inherited links
    SELECT t2.id FROM tasks t2
    JOIN projects p ON p.id = t2.project_id AND p.goals_inherit = true
    JOIN goal_projects gp ON gp.project_id = p.id AND gp.goal_id = NEW.id
  ) linked
  WHERE t.id = linked.task_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on goal priority change
DROP TRIGGER IF EXISTS trg_goal_priority_propagate ON goals;
CREATE TRIGGER trg_goal_priority_propagate
  AFTER UPDATE OF priority, priority_score ON goals
  FOR EACH ROW
  EXECUTE FUNCTION propagate_goal_priority_change();

-- ============================================================================
-- INITIAL POPULATION
-- ============================================================================

-- Set priority_score for existing goals based on their priority text (if any match)
UPDATE goals SET priority_score = priority_to_score(priority) WHERE priority_score IS NULL OR priority_score = 0.50;

-- Set default priority for goals without one
UPDATE goals SET priority = 'medium', priority_score = 0.50 WHERE priority IS NULL;

-- Compute initial effective priorities for all non-done tasks
UPDATE tasks t
SET effective_priority_score = tep.effective_score
FROM task_effective_priorities tep
WHERE t.id = tep.task_id AND t.status != 'done';
