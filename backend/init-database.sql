-- Database initialization script for RavenLoom
-- This script ensures the database has the correct schema

-- Drop old plans table if it exists (from legacy version)
DROP TABLE IF EXISTS plans CASCADE;

-- Create projects table if it doesn't exist
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  domain VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}'
);

-- Create goals table if it doesn't exist
CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_value DECIMAL,
  current_value DECIMAL DEFAULT 0,
  unit VARCHAR(50),
  priority INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'active',
  target_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create tasks table if it doesn't exist
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  priority INTEGER DEFAULT 2,
  assigned_to VARCHAR(100) DEFAULT 'ai',
  requires_approval BOOLEAN DEFAULT FALSE,
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  config JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}'
);

-- Create metrics table if it doesn't exist
CREATE TABLE IF NOT EXISTS metrics (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  value DECIMAL NOT NULL,
  unit VARCHAR(50),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(100) DEFAULT 'manual',
  metadata JSONB DEFAULT '{}'
);

-- Create reminders table if it doesn't exist
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  due_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern VARCHAR(50),
  recurrence_interval INTEGER,
  recurrence_days JSONB,
  recurrence_end_date TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  completed_at TIMESTAMP,
  snoozed_until TIMESTAMP,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  metric_name VARCHAR(255),
  notification_methods JSONB DEFAULT '[]',
  notification_advance_minutes INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 2,
  metadata JSONB DEFAULT '{}'
);

-- Create chat_messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_project_id ON goals(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_metrics_project_id ON metrics(project_id);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id ON chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

-- Check if we need to insert sample data (only if projects table is empty)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects LIMIT 1) THEN
    -- Insert sample projects
    INSERT INTO projects (user_id, title, description, domain, config) VALUES
    ('test-user-001', 'E-commerce Startup', 'Building an online marketplace for handmade crafts', 'business',
    '{"business_model": "marketplace", "target_market": "crafters", "revenue_streams": ["commission", "subscription"]}'),
    ('test-user-001', 'Health & Fitness Journey', 'Lose weight, improve stamina, and develop healthy habits', 'health',
    '{"current_weight": 180, "target_weight": 160, "activity_level": "sedentary", "dietary_restrictions": []}');

    -- Insert sample goals
    INSERT INTO goals (project_id, title, description, target_value, unit, target_date) VALUES
    (1, 'Launch MVP', 'Get the minimum viable product live', 1, 'launch', '2025-09-01'),
    (1, 'First $10K Revenue', 'Reach first $10,000 in monthly recurring revenue', 10000, 'revenue', '2025-12-31'),
    (1, 'User Acquisition', 'Acquire first 1000 active users', 1000, 'users', '2025-10-31'),
    (2, 'Weight Loss', 'Lose 20 pounds safely and sustainably', 160, 'pounds', '2025-12-31'),
    (2, 'Daily Exercise', 'Exercise at least 30 minutes per day', 30, 'minutes', '2025-12-31'),
    (2, 'Healthy Meals', 'Eat 5 servings of fruits/vegetables daily', 5, 'servings', '2025-12-31');

    -- Update current_value for health goals
    UPDATE goals SET current_value = 180 WHERE project_id = 2 AND title = 'Weight Loss';
    UPDATE goals SET current_value = 0 WHERE project_id = 2 AND title = 'Daily Exercise';
    UPDATE goals SET current_value = 2 WHERE project_id = 2 AND title = 'Healthy Meals';

    -- Insert sample tasks
    INSERT INTO tasks (project_id, goal_id, title, description, type, priority, requires_approval) VALUES
    (1, 1, 'Market Research', 'Research competitor pricing and features', 'action', 1, false),
    (1, 1, 'Design Database Schema', 'Create database structure for products and users', 'action', 1, false),
    (1, 2, 'Set up payment processing', 'Integrate Stripe for payments', 'action', 1, true),
    (1, 3, 'Launch social media campaign', 'Create and execute marketing campaign', 'action', 2, true),
    (2, 4, 'Calculate daily calorie target', 'Determine optimal daily calorie intake for weight loss', 'action', 1, false),
    (2, 5, 'Create workout schedule', 'Design a sustainable 30-min daily exercise routine', 'action', 1, false),
    (2, 6, 'Plan weekly meals', 'Create meal plans with 5+ fruit/veggie servings', 'action', 1, false),
    (2, 4, 'Weekly weigh-in', 'Track weight progress every Sunday morning', 'measurement', 2, false);
  END IF;
END $$;