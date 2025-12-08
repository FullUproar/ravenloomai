-- Migration 115: Calendar Events
-- Adds calendar functionality with Google Calendar integration support

-- ============================================================================
-- EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Content
  title VARCHAR(500) NOT NULL,
  description TEXT,
  location VARCHAR(255),

  -- Timing
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN DEFAULT FALSE,
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Google Calendar Sync
  google_event_id VARCHAR(255),
  google_calendar_id VARCHAR(255),
  sync_status VARCHAR(50) DEFAULT 'local', -- local, synced, sync_error
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,

  -- Recurrence (RRULE format)
  recurrence_rule VARCHAR(255),

  -- Links to other RavenLoom objects
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Metadata
  color VARCHAR(7) DEFAULT '#3B82F6',
  reminder_minutes INTEGER DEFAULT 15,
  created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Team lookup
CREATE INDEX IF NOT EXISTS idx_events_team ON events(team_id);

-- Date range queries (most common for calendar views)
CREATE INDEX IF NOT EXISTS idx_events_date_range ON events(team_id, start_at, end_at);

-- Start date sorting
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);

-- Google Calendar sync lookups
CREATE INDEX IF NOT EXISTS idx_events_google ON events(google_event_id) WHERE google_event_id IS NOT NULL;

-- Task/Project links
CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id) WHERE project_id IS NOT NULL;

-- Created by user
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_events_updated_at();
