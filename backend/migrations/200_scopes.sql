-- ============================================
-- SCOPE-BASED KNOWLEDGE ARCHITECTURE
-- Migration 200: Add scopes system
-- ============================================

-- ============================================
-- 1. CREATE SCOPES TABLE
-- ============================================

CREATE TABLE scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    parent_scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE,

    -- Scope type
    type VARCHAR(20) NOT NULL CHECK (type IN ('team', 'project', 'private')),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    summary TEXT, -- AI-generated summary for parent scope awareness

    -- For private scopes
    owner_id VARCHAR(128) REFERENCES users(id) ON DELETE CASCADE,
    coupled_scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE,

    -- Metadata
    created_by VARCHAR(128) REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for scopes
CREATE INDEX idx_scopes_team ON scopes(team_id);
CREATE INDEX idx_scopes_parent ON scopes(parent_scope_id);
CREATE INDEX idx_scopes_owner ON scopes(owner_id) WHERE type = 'private';
CREATE INDEX idx_scopes_type ON scopes(team_id, type);

-- ============================================
-- 2. ADD scope_id TO KNOWLEDGE TABLES
-- ============================================

-- Facts
ALTER TABLE facts ADD COLUMN IF NOT EXISTS scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_facts_scope ON facts(scope_id);

-- Decisions
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_decisions_scope ON decisions(scope_id);

-- Documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_documents_scope ON documents(scope_id);

-- Alerts (Recalls)
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(128) REFERENCES users(id);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_alerts_scope ON alerts(scope_id);

-- Learning Objectives
ALTER TABLE learning_objectives ADD COLUMN IF NOT EXISTS scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_learning_objectives_scope ON learning_objectives(scope_id);

-- Team Questions
ALTER TABLE team_questions ADD COLUMN IF NOT EXISTS scope_id UUID REFERENCES scopes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_team_questions_scope ON team_questions(scope_id);

-- ============================================
-- 3. ADD SUPERSEDES TRACKING TO FACTS
-- ============================================

-- Add status for superseded facts
ALTER TABLE facts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived'));
ALTER TABLE facts ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_facts_status ON facts(scope_id, status);

-- ============================================
-- 4. CREATE SCOPE CONVERSATIONS TABLE
-- ============================================

-- Scope conversations (replaces channel-based chat for team scopes)
CREATE TABLE scope_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_id UUID NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    user_id VARCHAR(128) REFERENCES users(id), -- NULL for private scope's single user

    -- For private scopes, this links user to their conversation in that scope
    -- For team scopes, there's one shared conversation (user_id NULL)

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(scope_id, user_id)
);

CREATE INDEX idx_scope_conversations_scope ON scope_conversations(scope_id);
CREATE INDEX idx_scope_conversations_user ON scope_conversations(user_id);

-- Scope messages (Raven conversations within a scope)
CREATE TABLE scope_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES scope_conversations(id) ON DELETE CASCADE,
    scope_id UUID NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,

    user_id VARCHAR(128) REFERENCES users(id), -- NULL if AI message
    content TEXT NOT NULL,
    is_ai BOOLEAN DEFAULT FALSE,

    -- For AI messages, track what knowledge was used
    referenced_facts UUID[] DEFAULT '{}',

    -- For threading (corrections/replies)
    reply_to_message_id UUID REFERENCES scope_messages(id) ON DELETE SET NULL,

    -- AI command parsing (same as messages table)
    ai_command VARCHAR(50),
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_scope_messages_conversation ON scope_messages(conversation_id);
CREATE INDEX idx_scope_messages_scope ON scope_messages(scope_id);
CREATE INDEX idx_scope_messages_created ON scope_messages(created_at DESC);
CREATE INDEX idx_scope_messages_reply ON scope_messages(reply_to_message_id);

-- ============================================
-- 5. UPDATE TRIGGERS
-- ============================================

-- Scope updated_at trigger
CREATE OR REPLACE FUNCTION update_scope_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scope_updated ON scopes;
CREATE TRIGGER scope_updated
    BEFORE UPDATE ON scopes
    FOR EACH ROW
    EXECUTE FUNCTION update_scope_timestamp();

-- Update conversation last_message_at when message added
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE scope_conversations
    SET last_message_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversation_message_added ON scope_messages;
CREATE TRIGGER conversation_message_added
    AFTER INSERT ON scope_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_last_message();

-- ============================================
-- 6. MIGRATION: Create default scopes for existing teams
-- ============================================

-- Create team root scope for each existing team
INSERT INTO scopes (team_id, type, name, description)
SELECT id, 'team', name, 'Team-wide knowledge and conversations'
FROM teams
WHERE id NOT IN (SELECT team_id FROM scopes WHERE type = 'team');

-- Create private scopes for each team member (coupled to team scope)
INSERT INTO scopes (team_id, parent_scope_id, type, name, owner_id, coupled_scope_id, created_by)
SELECT
    tm.team_id,
    NULL, -- private scopes don't have a parent in the hierarchy
    'private',
    'Private',
    tm.user_id,
    (SELECT id FROM scopes WHERE team_id = tm.team_id AND type = 'team' LIMIT 1),
    tm.user_id
FROM team_members tm
WHERE NOT EXISTS (
    SELECT 1 FROM scopes s
    WHERE s.team_id = tm.team_id
    AND s.type = 'private'
    AND s.owner_id = tm.user_id
);

-- ============================================
-- 7. MIGRATION: Update existing data to use team scope
-- ============================================

-- Move existing facts to team scope
UPDATE facts f
SET scope_id = (SELECT id FROM scopes WHERE team_id = f.team_id AND type = 'team' LIMIT 1)
WHERE scope_id IS NULL;

-- Move existing decisions to team scope
UPDATE decisions d
SET scope_id = (SELECT id FROM scopes WHERE team_id = d.team_id AND type = 'team' LIMIT 1)
WHERE scope_id IS NULL;

-- Move existing documents to team scope
UPDATE documents d
SET scope_id = (SELECT id FROM scopes WHERE team_id = d.team_id AND type = 'team' LIMIT 1)
WHERE scope_id IS NULL;

-- Move existing alerts to team scope
UPDATE alerts a
SET scope_id = (SELECT id FROM scopes WHERE team_id = a.team_id AND type = 'team' LIMIT 1)
WHERE scope_id IS NULL;

-- Move existing learning objectives to team scope
UPDATE learning_objectives lo
SET scope_id = (SELECT id FROM scopes WHERE team_id = lo.team_id AND type = 'team' LIMIT 1)
WHERE scope_id IS NULL;

-- Move existing team questions to team scope
UPDATE team_questions tq
SET scope_id = (SELECT id FROM scopes WHERE team_id = tq.team_id AND type = 'team' LIMIT 1)
WHERE scope_id IS NULL;

-- ============================================
-- 8. CREATE SCOPE CONVERSATION FOR EXISTING TEAM SCOPES
-- ============================================

-- Create a shared conversation for each team scope
INSERT INTO scope_conversations (scope_id, user_id)
SELECT id, NULL
FROM scopes
WHERE type = 'team'
AND id NOT IN (SELECT scope_id FROM scope_conversations WHERE user_id IS NULL);

-- Create private conversations for each user's private scope
INSERT INTO scope_conversations (scope_id, user_id)
SELECT s.id, s.owner_id
FROM scopes s
WHERE s.type = 'private'
AND NOT EXISTS (
    SELECT 1 FROM scope_conversations sc
    WHERE sc.scope_id = s.id AND sc.user_id = s.owner_id
);
