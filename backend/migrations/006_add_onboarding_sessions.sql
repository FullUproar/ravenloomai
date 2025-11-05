-- Migration 006: Add onboarding sessions table
-- Tracks conversational onboarding flows for projects, goals, and tasks

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  flow_id VARCHAR(50) NOT NULL, -- 'project', 'goal', 'task'
  status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
  collected_data JSONB NOT NULL DEFAULT '{}', -- Data collected during onboarding
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_project_id ON onboarding_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status ON onboarding_sessions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_flow_id ON onboarding_sessions(flow_id);

-- Index for finding active sessions
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_active
  ON onboarding_sessions(user_id, status)
  WHERE status = 'in_progress';

COMMENT ON TABLE onboarding_sessions IS 'Tracks conversational onboarding flows with prerequisite-based question sequencing';
COMMENT ON COLUMN onboarding_sessions.flow_id IS 'Type of onboarding flow: project, goal, or task';
COMMENT ON COLUMN onboarding_sessions.collected_data IS 'JSON object containing all data collected during the onboarding process';
COMMENT ON COLUMN onboarding_sessions.status IS 'Current status of the onboarding session';
