-- Migration 121: Daily/Weekly Ceremonies and AI Insights
-- Implements productivity rituals inspired by Motion, Reclaim, DailyBot

-- ============================================================================
-- CEREMONIES (Daily Standups, Weekly Reviews)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Ceremony type
  ceremony_type TEXT NOT NULL,  -- 'morning_focus', 'daily_standup', 'weekly_review', 'end_of_day'

  -- Ceremony content
  responses JSONB DEFAULT '{}',  -- User responses to ceremony questions
  ai_summary TEXT,               -- AI-generated summary/insights
  ai_plan JSONB,                 -- AI-generated action plan (for morning_focus)

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'skipped'
  scheduled_for DATE NOT NULL,             -- The day this ceremony is for
  completed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ceremonies_team_user ON ceremonies(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ceremonies_scheduled ON ceremonies(team_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_ceremonies_type_status ON ceremonies(team_id, ceremony_type, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ceremonies_unique ON ceremonies(team_id, user_id, ceremony_type, scheduled_for);

-- ============================================================================
-- AI INSIGHTS CACHE (Team productivity insights)
-- ============================================================================

CREATE TABLE IF NOT EXISTS insights_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Insight type and scope
  insight_type TEXT NOT NULL,  -- 'daily', 'weekly', 'task_health', 'team_pulse', 'knowledge_gaps'
  scope TEXT DEFAULT 'team',   -- 'team', 'user', 'project'
  scope_id VARCHAR(128),       -- user_id or project_id if scoped

  -- Insight content
  insights JSONB NOT NULL,     -- Array of insight objects
  summary TEXT,                -- AI-generated summary
  metrics JSONB,               -- Computed metrics

  -- Validity
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL,  -- When to regenerate

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insights_team ON insights_cache(team_id);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights_cache(team_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_validity ON insights_cache(valid_until);

-- ============================================================================
-- FOCUS TIME PREFERENCES (User work preferences)
-- ============================================================================

CREATE TABLE IF NOT EXISTS focus_time_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Focus time settings
  preferred_focus_hours JSONB DEFAULT '{"start": 9, "end": 12}',  -- Morning focus block
  min_focus_block_minutes INT DEFAULT 60,
  max_meetings_per_day INT DEFAULT 4,

  -- Work day settings
  work_start_hour INT DEFAULT 9,
  work_end_hour INT DEFAULT 17,
  work_days JSONB DEFAULT '[1,2,3,4,5]',  -- Mon-Fri (0=Sun)

  -- Ceremony preferences
  morning_focus_enabled BOOLEAN DEFAULT true,
  morning_focus_time TIME DEFAULT '09:00',
  daily_standup_enabled BOOLEAN DEFAULT false,
  daily_standup_time TIME DEFAULT '10:00',
  weekly_review_enabled BOOLEAN DEFAULT true,
  weekly_review_day INT DEFAULT 5,  -- Friday
  weekly_review_time TIME DEFAULT '16:00',
  end_of_day_enabled BOOLEAN DEFAULT false,
  end_of_day_time TIME DEFAULT '17:00',

  -- Notification preferences
  nudge_overdue_tasks BOOLEAN DEFAULT true,
  nudge_stale_tasks BOOLEAN DEFAULT true,
  nudge_upcoming_deadlines BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(team_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_focus_prefs_team_user ON focus_time_preferences(team_id, user_id);

-- ============================================================================
-- PROACTIVE NUDGES (Smart reminders from Raven)
-- ============================================================================

CREATE TABLE IF NOT EXISTS proactive_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Nudge content
  nudge_type TEXT NOT NULL,  -- 'overdue_task', 'stale_task', 'upcoming_deadline', 'workload_high', 'meeting_prep', 'follow_up'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',  -- 'low', 'medium', 'high', 'urgent'

  -- Related entities
  related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  related_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  related_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,

  -- Actions
  suggested_actions JSONB,  -- [{action: 'extend_deadline', label: 'Extend by 2 days'}, ...]

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'shown', 'acted', 'dismissed', 'expired'
  shown_at TIMESTAMPTZ,
  acted_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nudges_user ON proactive_nudges(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_nudges_status ON proactive_nudges(team_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_nudges_type ON proactive_nudges(team_id, nudge_type);

-- ============================================================================
-- TASK HEALTH METRICS (For predictive analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- Health indicators
  health_score FLOAT NOT NULL,  -- 0.0 (critical) to 1.0 (healthy)
  risk_level TEXT NOT NULL,     -- 'low', 'medium', 'high', 'critical'

  -- Risk factors
  days_until_due INT,
  estimated_completion_days FLOAT,  -- Based on similar tasks
  velocity_ratio FLOAT,             -- actual_progress / expected_progress
  has_blockers BOOLEAN DEFAULT false,
  blocker_description TEXT,

  -- AI analysis
  ai_assessment TEXT,
  suggested_interventions JSONB,  -- [{intervention: '...', impact: 'high'}, ...]

  -- Metadata
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only keep latest health metric per task
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_health_unique ON task_health_metrics(task_id);
CREATE INDEX IF NOT EXISTS idx_task_health_score ON task_health_metrics(health_score);
CREATE INDEX IF NOT EXISTS idx_task_health_risk ON task_health_metrics(risk_level);

-- ============================================================================
-- MEETING PREP CACHE (Context for upcoming meetings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS meeting_prep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Prep content
  related_facts JSONB,           -- Relevant facts from KB
  related_decisions JSONB,       -- Related decisions
  related_tasks JSONB,           -- Tasks that might be discussed
  suggested_agenda JSONB,        -- AI-suggested agenda items
  context_summary TEXT,          -- AI summary of relevant context

  -- Status
  status TEXT DEFAULT 'generated',  -- 'generated', 'viewed', 'used'
  viewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_prep_unique ON meeting_prep(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_prep_event ON meeting_prep(event_id);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_ceremonies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ceremonies_updated_at ON ceremonies;
CREATE TRIGGER ceremonies_updated_at
  BEFORE UPDATE ON ceremonies
  FOR EACH ROW EXECUTE FUNCTION update_ceremonies_updated_at();

CREATE OR REPLACE FUNCTION update_focus_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS focus_prefs_updated_at ON focus_time_preferences;
CREATE TRIGGER focus_prefs_updated_at
  BEFORE UPDATE ON focus_time_preferences
  FOR EACH ROW EXECUTE FUNCTION update_focus_prefs_updated_at();
