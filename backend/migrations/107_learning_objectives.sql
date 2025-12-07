-- Learning Objectives: Research projects that aggregate questions/answers around a topic
-- Can be assigned to humans or Raven (null assigned_to = Raven)

-- Create learning_objectives table
CREATE TABLE IF NOT EXISTS learning_objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

    -- What we're trying to learn
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Status tracking
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),

    -- Assignment (null = Raven is responsible)
    assigned_to VARCHAR(128) REFERENCES users(id) ON DELETE SET NULL,
    created_by VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- For Raven-assigned LOs: track question generation state
    questions_asked INT DEFAULT 0,
    max_questions INT DEFAULT 20, -- Safety limit

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Add parent_question_id for threaded follow-up questions
ALTER TABLE team_questions
ADD COLUMN IF NOT EXISTS parent_question_id UUID REFERENCES team_questions(id) ON DELETE CASCADE;

-- Add learning_objective_id to link questions to LOs
ALTER TABLE team_questions
ADD COLUMN IF NOT EXISTS learning_objective_id UUID REFERENCES learning_objectives(id) ON DELETE SET NULL;

-- Add source field to track if question was asked by Raven or human
ALTER TABLE team_questions
ADD COLUMN IF NOT EXISTS asked_by_raven BOOLEAN DEFAULT false;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_learning_objectives_team ON learning_objectives(team_id);
CREATE INDEX IF NOT EXISTS idx_learning_objectives_status ON learning_objectives(status);
CREATE INDEX IF NOT EXISTS idx_learning_objectives_assigned ON learning_objectives(assigned_to);
CREATE INDEX IF NOT EXISTS idx_team_questions_parent ON team_questions(parent_question_id);
CREATE INDEX IF NOT EXISTS idx_team_questions_lo ON team_questions(learning_objective_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_learning_objectives_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS learning_objectives_updated ON learning_objectives;
CREATE TRIGGER learning_objectives_updated
    BEFORE UPDATE ON learning_objectives
    FOR EACH ROW
    EXECUTE FUNCTION update_learning_objectives_timestamp();
