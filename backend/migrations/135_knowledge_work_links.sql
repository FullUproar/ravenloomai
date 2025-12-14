-- Migration: Knowledge-Work Integration
-- Enables:
-- 1. Linking facts/decisions/questions to tasks and goals
-- 2. Learning objectives linked to work items
-- 3. Converting questions to tasks
-- 4. Tracking knowledge produced by tasks

-- ============================================================================
-- TASK KNOWLEDGE LINKS
-- Links facts, decisions, and questions to tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- Knowledge type and reference
  knowledge_type VARCHAR(20) NOT NULL, -- 'fact', 'decision', 'question'
  knowledge_id UUID NOT NULL,

  -- Link semantics
  link_type VARCHAR(20) NOT NULL DEFAULT 'related',
  -- 'required' = task needs this knowledge to proceed
  -- 'related' = useful context for the task
  -- 'produced' = this knowledge was discovered/created during the task

  -- Optional notes explaining the link
  notes TEXT,

  -- Audit
  created_by VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate links
  UNIQUE(task_id, knowledge_type, knowledge_id)
);

-- Constraint on valid knowledge types
ALTER TABLE task_knowledge ADD CONSTRAINT task_knowledge_type_check
  CHECK (knowledge_type IN ('fact', 'decision', 'question'));

-- Constraint on valid link types
ALTER TABLE task_knowledge ADD CONSTRAINT task_knowledge_link_type_check
  CHECK (link_type IN ('required', 'related', 'produced'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_knowledge_task ON task_knowledge(task_id);
CREATE INDEX IF NOT EXISTS idx_task_knowledge_knowledge ON task_knowledge(knowledge_type, knowledge_id);
CREATE INDEX IF NOT EXISTS idx_task_knowledge_required ON task_knowledge(task_id) WHERE link_type = 'required';

-- ============================================================================
-- GOAL KNOWLEDGE LINKS
-- Links facts, decisions, and questions to goals
-- ============================================================================

CREATE TABLE IF NOT EXISTS goal_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,

  -- Knowledge type and reference
  knowledge_type VARCHAR(20) NOT NULL, -- 'fact', 'decision', 'question'
  knowledge_id UUID NOT NULL,

  -- Link semantics
  link_type VARCHAR(20) NOT NULL DEFAULT 'related',
  -- 'required' = goal depends on validating this knowledge
  -- 'related' = useful context for the goal
  -- 'supports' = this knowledge validates/supports the goal

  -- Optional notes
  notes TEXT,

  -- Audit
  created_by VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate links
  UNIQUE(goal_id, knowledge_type, knowledge_id)
);

-- Constraint on valid knowledge types
ALTER TABLE goal_knowledge ADD CONSTRAINT goal_knowledge_type_check
  CHECK (knowledge_type IN ('fact', 'decision', 'question'));

-- Constraint on valid link types
ALTER TABLE goal_knowledge ADD CONSTRAINT goal_knowledge_link_type_check
  CHECK (link_type IN ('required', 'related', 'supports'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_goal_knowledge_goal ON goal_knowledge(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_knowledge_knowledge ON goal_knowledge(knowledge_type, knowledge_id);

-- ============================================================================
-- LEARNING OBJECTIVE WORK LINKS
-- Links learning objectives (research projects) to tasks and goals they support
-- ============================================================================

ALTER TABLE learning_objectives
  ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;

-- Index for finding LOs by linked work
CREATE INDEX IF NOT EXISTS idx_lo_linked_task ON learning_objectives(linked_task_id) WHERE linked_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lo_linked_goal ON learning_objectives(linked_goal_id) WHERE linked_goal_id IS NOT NULL;

-- ============================================================================
-- QUESTION TO TASK CONVERSION
-- Track when a team question produces a task
-- ============================================================================

ALTER TABLE team_questions
  ADD COLUMN IF NOT EXISTS produced_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Index for finding questions that produced tasks
CREATE INDEX IF NOT EXISTS idx_questions_produced_task ON team_questions(produced_task_id) WHERE produced_task_id IS NOT NULL;

-- ============================================================================
-- VIEW: TASK KNOWLEDGE REQUIREMENTS
-- Shows all knowledge linked to a task, with status
-- ============================================================================

CREATE OR REPLACE VIEW task_knowledge_status AS
SELECT
  tk.task_id,
  tk.knowledge_type,
  tk.knowledge_id,
  tk.link_type,
  tk.notes,

  -- For questions, include answered status
  CASE
    WHEN tk.knowledge_type = 'question' THEN (
      SELECT tq.status FROM team_questions tq WHERE tq.id = tk.knowledge_id
    )
    ELSE 'available'
  END as knowledge_status,

  -- For questions, include the answer if available
  CASE
    WHEN tk.knowledge_type = 'question' THEN (
      SELECT tq.answer FROM team_questions tq WHERE tq.id = tk.knowledge_id
    )
    ELSE NULL
  END as question_answer

FROM task_knowledge tk;

-- ============================================================================
-- VIEW: KNOWLEDGE GAPS
-- Shows tasks with required knowledge that isn't yet available
-- ============================================================================

CREATE OR REPLACE VIEW task_knowledge_gaps AS
SELECT
  t.id as task_id,
  t.title as task_title,
  t.team_id,
  tk.knowledge_type,
  tk.knowledge_id,
  tk.notes as requirement_notes,

  -- Question details for open questions
  tq.question as open_question,
  tq.asked_by

FROM tasks t
JOIN task_knowledge tk ON tk.task_id = t.id AND tk.link_type = 'required'
LEFT JOIN team_questions tq ON tk.knowledge_type = 'question' AND tk.knowledge_id = tq.id

WHERE t.status != 'done'
  AND (
    -- Question is not answered
    (tk.knowledge_type = 'question' AND tq.status != 'answered')
    -- Or fact is invalidated (has superseded_by)
    OR (tk.knowledge_type = 'fact' AND EXISTS (
      SELECT 1 FROM facts f WHERE f.id = tk.knowledge_id AND f.superseded_by IS NOT NULL
    ))
  );

-- ============================================================================
-- FUNCTION: GET KNOWLEDGE CONTEXT FOR TASK
-- Returns all linked knowledge for AI context
-- ============================================================================

CREATE OR REPLACE FUNCTION get_task_knowledge_context(p_task_id UUID)
RETURNS TABLE (
  knowledge_type VARCHAR(20),
  knowledge_id UUID,
  link_type VARCHAR(20),
  content TEXT,
  category VARCHAR(100),
  status VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tk.knowledge_type,
    tk.knowledge_id,
    tk.link_type,
    CASE tk.knowledge_type
      WHEN 'fact' THEN (SELECT f.content FROM facts f WHERE f.id = tk.knowledge_id)
      WHEN 'decision' THEN (SELECT d.what FROM decisions d WHERE d.id = tk.knowledge_id)
      WHEN 'question' THEN (SELECT tq.question FROM team_questions tq WHERE tq.id = tk.knowledge_id)
    END as content,
    CASE tk.knowledge_type
      WHEN 'fact' THEN (SELECT f.category FROM facts f WHERE f.id = tk.knowledge_id)
      ELSE NULL
    END as category,
    CASE tk.knowledge_type
      WHEN 'question' THEN (SELECT tq.status FROM team_questions tq WHERE tq.id = tk.knowledge_id)
      ELSE 'available'
    END as status
  FROM task_knowledge tk
  WHERE tk.task_id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: GET KNOWLEDGE CONTEXT FOR GOAL
-- Returns all linked knowledge for AI context
-- ============================================================================

CREATE OR REPLACE FUNCTION get_goal_knowledge_context(p_goal_id UUID)
RETURNS TABLE (
  knowledge_type VARCHAR(20),
  knowledge_id UUID,
  link_type VARCHAR(20),
  content TEXT,
  category VARCHAR(100),
  status VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gk.knowledge_type,
    gk.knowledge_id,
    gk.link_type,
    CASE gk.knowledge_type
      WHEN 'fact' THEN (SELECT f.content FROM facts f WHERE f.id = gk.knowledge_id)
      WHEN 'decision' THEN (SELECT d.what FROM decisions d WHERE d.id = gk.knowledge_id)
      WHEN 'question' THEN (SELECT tq.question FROM team_questions tq WHERE tq.id = gk.knowledge_id)
    END as content,
    CASE gk.knowledge_type
      WHEN 'fact' THEN (SELECT f.category FROM facts f WHERE f.id = gk.knowledge_id)
      ELSE NULL
    END as category,
    CASE gk.knowledge_type
      WHEN 'question' THEN (SELECT tq.status FROM team_questions tq WHERE tq.id = gk.knowledge_id)
      ELSE 'available'
    END as status
  FROM goal_knowledge gk
  WHERE gk.goal_id = p_goal_id;
END;
$$ LANGUAGE plpgsql;
