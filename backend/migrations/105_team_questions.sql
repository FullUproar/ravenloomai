-- Team Questions: Questions posted when Raven doesn't have a confident answer
-- Questions can be assigned to team members who can provide answers

-- Create team_questions table
CREATE TABLE IF NOT EXISTS team_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    asked_by VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,

    -- The AI's initial answer attempt (if any)
    ai_answer TEXT,
    ai_confidence DECIMAL(3,2) DEFAULT 0,

    -- Status tracking
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),

    -- The accepted human answer
    answer TEXT,
    answered_by VARCHAR(128) REFERENCES users(id),
    answered_at TIMESTAMPTZ,

    -- Optional context
    channel_id UUID REFERENCES channels(id),
    context TEXT, -- Any additional context the user provided

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create question_assignees junction table (many-to-many)
CREATE TABLE IF NOT EXISTS question_assignees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES team_questions(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by VARCHAR(128) REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    notified BOOLEAN DEFAULT false,
    UNIQUE(question_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_team_questions_team ON team_questions(team_id);
CREATE INDEX IF NOT EXISTS idx_team_questions_status ON team_questions(status);
CREATE INDEX IF NOT EXISTS idx_team_questions_asked_by ON team_questions(asked_by);
CREATE INDEX IF NOT EXISTS idx_team_questions_answered_by ON team_questions(answered_by);
CREATE INDEX IF NOT EXISTS idx_question_assignees_question ON question_assignees(question_id);
CREATE INDEX IF NOT EXISTS idx_question_assignees_user ON question_assignees(user_id);

-- Add update trigger
CREATE OR REPLACE FUNCTION update_team_questions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_questions_updated ON team_questions;
CREATE TRIGGER team_questions_updated
    BEFORE UPDATE ON team_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_team_questions_timestamp();
