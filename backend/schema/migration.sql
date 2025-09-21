-- Migration from business plans to generic project model
-- Drop old table if exists
DROP TABLE IF EXISTS plans;

-- Create new generic project structure
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  domain VARCHAR(100) NOT NULL, -- 'business', 'health', 'creative', 'personal', etc.
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'completed', 'archived'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  config JSONB DEFAULT '{}', -- domain-specific configuration
  metadata JSONB DEFAULT '{}' -- extensible metadata
);

CREATE TABLE goals (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_value DECIMAL,
  current_value DECIMAL DEFAULT 0,
  unit VARCHAR(50), -- 'revenue', 'weight', 'days', 'count', etc.
  priority INTEGER DEFAULT 1, -- 1=high, 2=medium, 3=low
  status VARCHAR(50) DEFAULT 'active',
  target_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(100) NOT NULL, -- 'action', 'decision', 'measurement', 'automation'
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'skipped'
  priority INTEGER DEFAULT 2,
  assigned_to VARCHAR(100) DEFAULT 'ai', -- 'ai', 'user', 'automated'
  requires_approval BOOLEAN DEFAULT FALSE,
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  config JSONB DEFAULT '{}', -- task-specific configuration
  result JSONB DEFAULT '{}' -- execution results and data
);

CREATE TABLE metrics (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  value DECIMAL NOT NULL,
  unit VARCHAR(50),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(100) DEFAULT 'manual', -- 'manual', 'automated', 'api'
  metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_goals_project_id ON goals(project_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_metrics_project_id ON metrics(project_id);
CREATE INDEX idx_metrics_recorded_at ON metrics(recorded_at);

-- Insert sample data for testing

-- Sample Business Project
INSERT INTO projects (user_id, title, description, domain, config) VALUES 
('test-user-001', 'E-commerce Startup', 'Building an online marketplace for handmade crafts', 'business', 
'{"business_model": "marketplace", "target_market": "crafters", "revenue_streams": ["commission", "subscription"]}');

-- Sample Health Project  
INSERT INTO projects (user_id, title, description, domain, config) VALUES 
('test-user-001', 'Health & Fitness Journey', 'Lose weight, improve stamina, and develop healthy habits', 'health',
'{"current_weight": 180, "target_weight": 160, "activity_level": "sedentary", "dietary_restrictions": []}');

-- Goals for business project
INSERT INTO goals (project_id, title, description, target_value, unit, target_date) VALUES 
(1, 'Launch MVP', 'Get the minimum viable product live', 1, 'launch', '2025-09-01'),
(1, 'First $10K Revenue', 'Reach first $10,000 in monthly recurring revenue', 10000, 'revenue', '2025-12-31'),
(1, 'User Acquisition', 'Acquire first 1000 active users', 1000, 'users', '2025-10-31');

-- Goals for health project
INSERT INTO goals (project_id, title, description, target_value, current_value, unit, target_date) VALUES 
(2, 'Weight Loss', 'Lose 20 pounds safely and sustainably', 160, 180, 'pounds', '2025-12-31'),
(2, 'Daily Exercise', 'Exercise at least 30 minutes per day', 30, 0, 'minutes', '2025-12-31'),
(2, 'Healthy Meals', 'Eat 5 servings of fruits/vegetables daily', 5, 2, 'servings', '2025-12-31');

-- Sample tasks for business project
INSERT INTO tasks (project_id, goal_id, title, description, type, priority, requires_approval) VALUES 
(1, 1, 'Market Research', 'Research competitor pricing and features', 'action', 1, false),
(1, 1, 'Design Database Schema', 'Create database structure for products and users', 'action', 1, false),
(1, 2, 'Set up payment processing', 'Integrate Stripe for payments', 'action', 1, true),
(1, 3, 'Launch social media campaign', 'Create and execute marketing campaign', 'action', 2, true);

-- Sample tasks for health project  
INSERT INTO tasks (project_id, goal_id, title, description, type, priority, requires_approval) VALUES 
(2, 1, 'Calculate daily calorie target', 'Determine optimal daily calorie intake for weight loss', 'action', 1, false),
(2, 2, 'Create workout schedule', 'Design a sustainable 30-min daily exercise routine', 'action', 1, false),
(2, 3, 'Plan weekly meals', 'Create meal plans with 5+ fruit/veggie servings', 'action', 1, false),
(2, 1, 'Weekly weigh-in', 'Track weight progress every Sunday morning', 'measurement', 2, false);