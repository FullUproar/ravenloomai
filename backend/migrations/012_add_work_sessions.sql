-- Work Sessions Table
-- Bounded work periods with focus and summaries

CREATE TABLE IF NOT EXISTS work_sessions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,

  -- Session details
  title VARCHAR(255), -- "MVP Launch Prep", "Bug Fixes", etc.
  focus_area TEXT, -- What user is working on

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,

  -- Outcomes
  tasks_completed INTEGER[] DEFAULT '{}',
  tasks_created INTEGER[] DEFAULT '{}',
  notes TEXT,
  summary TEXT, -- AI-generated summary

  -- Metrics
  mood VARCHAR(50), -- productive, struggling, blocked, focused
  interruptions INTEGER DEFAULT 0,
  breaks_taken INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, completed, abandoned

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_work_sessions_project_id ON work_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_user_id ON work_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);
CREATE INDEX IF NOT EXISTS idx_work_sessions_started_at ON work_sessions(started_at DESC);

-- Comments
COMMENT ON TABLE work_sessions IS 'Bounded work periods - episodic interface for focused work';
COMMENT ON COLUMN work_sessions.focus_area IS 'What the user is working on this session';
COMMENT ON COLUMN work_sessions.summary IS 'AI-generated summary of accomplishments';
COMMENT ON COLUMN work_sessions.mood IS 'User productivity/emotional state during session';
