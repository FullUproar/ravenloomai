-- Migration 003: Add Raven (Push Notification) Support
-- Creates tables for push subscriptions and raven tracking

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  privacy_level VARCHAR(20) DEFAULT 'balanced',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_active ON push_subscriptions(active);

-- Ravens sent table (for tracking and analytics)
CREATE TABLE IF NOT EXISTS ravens_sent (
  id SERIAL PRIMARY KEY,
  raven_id VARCHAR(100) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  type VARCHAR(20) NOT NULL, -- checkin, achievement, strategy, action, urgent
  template VARCHAR(50) NOT NULL, -- morning_checkin, task_reminder, etc.
  sent_at TIMESTAMP DEFAULT NOW(),
  action_taken VARCHAR(50), -- completed, skipped, snoozed, opened, dismissed
  action_taken_at TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_ravens_user ON ravens_sent(user_id);
CREATE INDEX idx_ravens_project ON ravens_sent(project_id);
CREATE INDEX idx_ravens_sent_at ON ravens_sent(sent_at);
CREATE INDEX idx_ravens_action ON ravens_sent(action_taken);

-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  privacy_level VARCHAR(20) DEFAULT 'balanced', -- sealed, balanced, open
  quiet_hours_start TIME, -- e.g., 22:00:00
  quiet_hours_end TIME,   -- e.g., 08:00:00
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Notification type preferences
  checkins_enabled BOOLEAN DEFAULT true,
  achievements_enabled BOOLEAN DEFAULT true,
  strategy_enabled BOOLEAN DEFAULT true,
  reminders_enabled BOOLEAN DEFAULT true,

  -- Frequency settings
  max_ravens_per_day INTEGER DEFAULT 5,
  min_hours_between_ravens INTEGER DEFAULT 2,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);

-- Project-specific notification settings
CREATE TABLE IF NOT EXISTS project_notification_settings (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  ravens_enabled BOOLEAN DEFAULT true,
  preferred_time TIME, -- Best time for check-ins for this project
  privacy_override VARCHAR(20), -- Can override user's default privacy level
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_notif_settings_project ON project_notification_settings(project_id);
CREATE INDEX idx_project_notif_settings_user ON project_notification_settings(user_id);

-- Raven schedule (for planned/recurring ravens)
CREATE TABLE IF NOT EXISTS raven_schedule (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  schedule_type VARCHAR(20) NOT NULL, -- daily, weekly, custom
  time_of_day TIME NOT NULL,
  days_of_week INTEGER[], -- 0=Sunday, 1=Monday, etc.
  template VARCHAR(50) NOT NULL,
  raven_type VARCHAR(20) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_raven_schedule_user ON raven_schedule(user_id);
CREATE INDEX idx_raven_schedule_enabled ON raven_schedule(enabled);
