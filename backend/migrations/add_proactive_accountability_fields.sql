-- Proactive Accountability System Fields
-- Adds activity tracking and check-in management

-- Add activity tracking to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS check_ins_enabled BOOLEAN DEFAULT true;

-- Add global feature flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS proactive_features_enabled BOOLEAN DEFAULT false;

-- Add activity patterns table for motivation intelligence
CREATE TABLE IF NOT EXISTS activity_patterns (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  pattern_type VARCHAR(50) NOT NULL, -- 'best_work_time', 'skipped_task', 'blocker_signal'
  pattern_data JSONB NOT NULL,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confidence_score DECIMAL(3,2) DEFAULT 0.5,
  FOREIGN KEY (user_id) REFERENCES users(firebase_uid) ON DELETE CASCADE
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_activity_patterns_user_project ON activity_patterns(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_projects_last_activity ON projects(last_activity_at);

-- Comments for documentation
COMMENT ON COLUMN projects.last_activity_at IS 'Last time user interacted with project (message, task, session)';
COMMENT ON COLUMN projects.last_check_in_at IS 'Last time AI sent proactive check-in message';
COMMENT ON COLUMN projects.check_ins_enabled IS 'User preference: allow proactive check-ins for this project';
COMMENT ON COLUMN users.proactive_features_enabled IS 'Global kill switch: enable proactive accountability features';
