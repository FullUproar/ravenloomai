-- Reminders framework for RavenLoom
-- Supports recurring reminders, one-time reminders, and future extensibility for push/email/SMS

CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  
  -- Basic reminder info
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL DEFAULT 'reminder', -- 'reminder', 'task_due', 'metric_reminder', 'goal_check'
  
  -- Scheduling
  due_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Recurrence (for recurring reminders)
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern VARCHAR(50), -- 'daily', 'weekly', 'monthly', 'custom'
  recurrence_interval INTEGER DEFAULT 1, -- every N days/weeks/months
  recurrence_days JSONB, -- [1,2,3,4,5] for weekdays, [0,6] for weekends, etc.
  recurrence_end_date DATE, -- when to stop recurring
  
  -- Status and completion
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'snoozed', 'dismissed', 'overdue'
  completed_at TIMESTAMP,
  snoozed_until TIMESTAMP,
  
  -- Associations
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  metric_name VARCHAR(255), -- for metric reminders like "weigh yourself"
  
  -- Notification preferences (for future mobile/email/SMS)
  notification_methods JSONB DEFAULT '["in_app"]', -- ["in_app", "email", "push", "sms"]
  notification_advance_minutes INTEGER DEFAULT 0, -- notify X minutes before due_at
  
  -- Metadata
  priority INTEGER DEFAULT 2, -- 1=high, 2=medium, 3=low
  metadata JSONB DEFAULT '{}' -- extensible for custom data
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_reminders_user_status ON reminders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_project_due ON reminders(project_id, due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at) WHERE status IN ('pending', 'snoozed');
CREATE INDEX IF NOT EXISTS idx_reminders_recurring ON reminders(is_recurring, due_at) WHERE is_recurring = true;

-- Function to generate next occurrence for recurring reminders
CREATE OR REPLACE FUNCTION generate_next_reminder_occurrence(
  reminder_id INTEGER,
  current_due_at TIMESTAMP
) RETURNS TIMESTAMP AS $$
DECLARE
  reminder_record RECORD;
  next_due TIMESTAMP;
BEGIN
  SELECT * INTO reminder_record FROM reminders WHERE id = reminder_id;
  
  IF NOT reminder_record.is_recurring THEN
    RETURN NULL;
  END IF;
  
  CASE reminder_record.recurrence_pattern
    WHEN 'daily' THEN
      next_due := current_due_at + (reminder_record.recurrence_interval || ' days')::INTERVAL;
    WHEN 'weekly' THEN
      next_due := current_due_at + (reminder_record.recurrence_interval || ' weeks')::INTERVAL;
    WHEN 'monthly' THEN
      next_due := current_due_at + (reminder_record.recurrence_interval || ' months')::INTERVAL;
    ELSE
      next_due := current_due_at + '1 day'::INTERVAL; -- fallback
  END CASE;
  
  -- Check if we've passed the end date
  IF reminder_record.recurrence_end_date IS NOT NULL AND 
     next_due::DATE > reminder_record.recurrence_end_date THEN
    RETURN NULL;
  END IF;
  
  RETURN next_due;
END;
$$ LANGUAGE plpgsql;

-- Insert some sample reminders for testing
INSERT INTO reminders (project_id, user_id, title, description, type, due_at, is_recurring, recurrence_pattern, priority) VALUES
-- Daily weigh-in reminder
(2, 'test-user-001', 'Daily Weigh-In', 'Time to step on the scale and record your weight', 'metric_reminder', 
 CURRENT_TIMESTAMP + INTERVAL '8 hours', true, 'daily', 1),

-- Weekly meal planning
(2, 'test-user-001', 'Plan Next Week''s Meals', 'Review and plan healthy meals for the upcoming week', 'task_due',
 CURRENT_TIMESTAMP + INTERVAL '2 days', true, 'weekly', 2),

-- Monthly progress review
(2, 'test-user-001', 'Monthly Health Review', 'Review your progress, update goals, and plan improvements', 'goal_check',
 CURRENT_TIMESTAMP + INTERVAL '1 week', true, 'monthly', 1),

-- One-time reminder
(2, 'test-user-001', 'Doctor Appointment', 'Annual physical checkup appointment', 'reminder',
 CURRENT_TIMESTAMP + INTERVAL '3 days', false, NULL, 1);

-- Update tasks table to support reminder generation
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_id INTEGER REFERENCES reminders(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS generates_reminders BOOLEAN DEFAULT FALSE;