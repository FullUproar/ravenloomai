-- Migration 004: Add task notifications and due date/time support
-- This enables scheduled Ravens (notifications) for tasks

-- Add due time to tasks (due_date already exists as DATE, we need TIMESTAMP)
ALTER TABLE tasks
DROP COLUMN IF EXISTS due_date CASCADE;

ALTER TABLE tasks
ADD COLUMN due_datetime TIMESTAMP WITH TIME ZONE;

-- Create user_settings table for notification preferences (we don't have a users table)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id VARCHAR(255) PRIMARY KEY,
  fcm_token TEXT,
  ravens_enabled BOOLEAN DEFAULT false,
  notification_privacy VARCHAR(20) DEFAULT 'balanced', -- 'sealed', 'balanced', 'open'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create ravens table for scheduled notifications
CREATE TABLE IF NOT EXISTS ravens (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'task_reminder', 'checkin', 'achievement', etc.
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'sent', 'failed', 'cancelled'
  payload JSONB, -- Notification data (task details, custom message, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ravens_user_id ON ravens(user_id);
CREATE INDEX IF NOT EXISTS idx_ravens_task_id ON ravens(task_id);
CREATE INDEX IF NOT EXISTS idx_ravens_scheduled_for ON ravens(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_ravens_status ON ravens(status);

-- Create push_subscriptions table for web push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  privacy_level VARCHAR(20) DEFAULT 'balanced',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(active);

-- Create ravens_sent table to track sent notifications
CREATE TABLE IF NOT EXISTS ravens_sent (
  id SERIAL PRIMARY KEY,
  raven_id VARCHAR(100) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  template VARCHAR(50),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  action_taken VARCHAR(50), -- 'opened', 'dismissed', 'quick-done', 'snoozed', etc.
  action_taken_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_ravens_sent_user_id ON ravens_sent(user_id);
CREATE INDEX IF NOT EXISTS idx_ravens_sent_raven_id ON ravens_sent(raven_id);
CREATE INDEX IF NOT EXISTS idx_ravens_sent_project_id ON ravens_sent(project_id);
