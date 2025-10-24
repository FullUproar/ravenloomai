-- Migration 001: Add Personas System
-- Adds tables and columns needed for the persona-based architecture

-- ============================================================================
-- PERSONAS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS personas (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,

  -- Core Identity
  archetype VARCHAR(50) NOT NULL, -- 'coach', 'advisor', 'strategist', 'partner', 'manager', 'coordinator'
  specialization VARCHAR(100) NOT NULL, -- 'health', 'financial', 'creative', etc.
  display_name VARCHAR(255) NOT NULL, -- 'Health Coach', 'Financial Advisor'

  -- Archetype-Derived Attributes (computed from archetype)
  voice VARCHAR(50), -- 'encouraging', 'analytical', 'direct', etc.
  intervention_style VARCHAR(50), -- 'frequent', 'milestone', 'proactive', etc.
  focus_area VARCHAR(50), -- 'habits', 'decisions', 'execution', etc.

  -- Domain Knowledge (JSONB arrays)
  domain_knowledge JSONB DEFAULT '[]', -- ["nutrition", "exercise_science"]
  domain_metrics JSONB DEFAULT '[]', -- ["weight", "workout_minutes"]

  -- User Customization
  custom_instructions TEXT, -- "Be direct, no motivational platitudes"
  communication_preferences JSONB DEFAULT '{}',
  -- {tone: 'direct', verbosity: 'concise', emoji: false, platitudes: false}

  -- Persona-Specific Context (e.g., triggers, current phase)
  context JSONB DEFAULT '{}',

  -- State
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for personas
CREATE INDEX IF NOT EXISTS idx_personas_project_id ON personas(project_id);
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);
CREATE INDEX IF NOT EXISTS idx_personas_active ON personas(active);

-- ============================================================================
-- UPDATE PROJECTS TABLE
-- ============================================================================

-- Completion type (how this project completes)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completion_type VARCHAR(50) DEFAULT 'milestone';
-- Options: 'binary' (win/lose), 'milestone', 'ongoing', 'habit_formation'

-- Outcome definition
ALTER TABLE projects ADD COLUMN IF NOT EXISTS outcome TEXT;
-- "What does 'done' look like?"

-- AI-computed health score
ALTER TABLE projects ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 0;
-- 0-100, computed by AI based on activity

-- Last activity timestamp
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Habit formation fields (for completion_type = 'habit_formation')
ALTER TABLE projects ADD COLUMN IF NOT EXISTS habit_streak_current INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS habit_streak_longest INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS habit_streak_target INTEGER DEFAULT 30; -- days

-- Recurring goal (for completion_type = 'ongoing')
ALTER TABLE projects ADD COLUMN IF NOT EXISTS recurring_goal JSONB DEFAULT NULL;
-- Example: {frequency: 'daily', target: 30, unit: 'minutes'}

-- ============================================================================
-- UPDATE TASKS TABLE (GTD + Context)
-- ============================================================================

-- GTD task type
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS gtd_type VARCHAR(50) DEFAULT 'next_action';
-- Options: 'next_action', 'waiting_for', 'someday_maybe', 'reference'

-- Context tags (GTD-style)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS context VARCHAR(50);
-- Examples: '@home', '@office', '@phone', '@computer', '@deep-work'

-- Energy level required
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS energy_level VARCHAR(20);
-- Options: 'high', 'medium', 'low'

-- Time estimate in minutes
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS time_estimate INTEGER;

-- Task dependencies (array of task IDs)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS depends_on JSONB DEFAULT '[]';

-- Blocked by (freeform or task ID)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_by VARCHAR(255);

-- Scheduled for specific time
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP;

-- Was this auto-scheduled by AI?
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_scheduled BOOLEAN DEFAULT false;

-- Who created this task?
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by VARCHAR(50);
-- Values: 'user' or personaId

-- ============================================================================
-- CONVERSATIONS TABLE (Replaces chat_messages)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,

  -- Conversation context
  topic VARCHAR(500), -- What is being discussed?
  decision_required BOOLEAN DEFAULT false, -- Does this need user decision?

  -- State
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'resolved', 'archived'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- ============================================================================
-- CONVERSATION MESSAGES TABLE (New structure)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Sender information
  sender_id VARCHAR(255) NOT NULL, -- userId or personaId
  sender_type VARCHAR(50) NOT NULL, -- 'user', 'persona', 'system'
  sender_name VARCHAR(255) NOT NULL, -- Display name
  sender_avatar VARCHAR(255), -- Emoji or image URL

  -- Message content
  content TEXT NOT NULL,

  -- Context (for multi-persona future)
  addressed_to JSONB DEFAULT '[]', -- Array of personaIds
  in_reply_to INTEGER REFERENCES conversation_messages(id), -- Thread support

  -- Metadata
  intent VARCHAR(50), -- 'question', 'suggestion', 'objection', 'agreement', 'synthesis'
  confidence DECIMAL(3,2), -- 0.00-1.00 (AI confidence in response)

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_created_at ON conversation_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_sender_id ON conversation_messages(sender_id);

-- ============================================================================
-- TRIGGERS TABLE (Create if not exists, then add persona ownership)
-- ============================================================================

CREATE TABLE IF NOT EXISTS triggers (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,

  -- Trigger type
  type VARCHAR(50) NOT NULL, -- 'time', 'event', 'inactivity', 'pattern'

  -- Configuration (JSONB for flexibility)
  config JSONB DEFAULT '{}',

  -- Action
  action JSONB DEFAULT '{}',

  -- State
  enabled BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE triggers ADD COLUMN IF NOT EXISTS created_by VARCHAR(50);
-- personaId if persona created this trigger

CREATE INDEX IF NOT EXISTS idx_triggers_project_id ON triggers(project_id);
CREATE INDEX IF NOT EXISTS idx_triggers_user_id ON triggers(user_id);
CREATE INDEX IF NOT EXISTS idx_triggers_enabled ON triggers(enabled);

-- ============================================================================
-- DATA MIGRATION (If needed)
-- ============================================================================

-- Migrate existing chat_messages to conversation_messages (if chat_messages exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages') THEN
    -- Create a default conversation for each project that has chat messages
    INSERT INTO conversations (project_id, user_id, status, created_at)
    SELECT DISTINCT project_id, user_id, 'active', MIN(created_at)
    FROM chat_messages
    GROUP BY project_id, user_id
    ON CONFLICT DO NOTHING;

    -- Migrate messages to new structure
    INSERT INTO conversation_messages (
      conversation_id,
      sender_id,
      sender_type,
      sender_name,
      content,
      created_at
    )
    SELECT
      c.id as conversation_id,
      cm.user_id as sender_id,
      cm.role as sender_type,
      CASE
        WHEN cm.role = 'user' THEN 'You'
        WHEN cm.role = 'assistant' THEN 'RavenLoom AI'
        ELSE 'System'
      END as sender_name,
      cm.content,
      cm.created_at
    FROM chat_messages cm
    JOIN conversations c ON c.project_id = cm.project_id AND c.user_id = cm.user_id;

    -- Archive the old table (don't drop in case we need to rollback)
    ALTER TABLE chat_messages RENAME TO chat_messages_archived;
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
