-- RavenLoom Clean Slate Migration
-- Team Knowledge Hub Schema
-- Compatible with Prisma Data Platform / Vercel Postgres / Standard PostgreSQL

-- ============================================
-- CORE TABLES
-- ============================================

-- Teams (companies/organizations)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users (auth handled by Firebase, this stores profile)
CREATE TABLE users (
    id VARCHAR(128) PRIMARY KEY, -- Firebase UID
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team membership
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member', -- owner, admin, member
    display_name VARCHAR(255), -- Optional override for team context
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- Team invitations
CREATE TABLE team_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    invited_by VARCHAR(128) NOT NULL REFERENCES users(id),
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CHANNELS & MESSAGES
-- ============================================

-- Channels (chat rooms within a team)
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    ai_mode VARCHAR(50) NOT NULL DEFAULT 'mentions_only', -- mentions_only, active, silent
    is_default BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(128) REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, name)
);

-- Messages in channels
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id VARCHAR(128) REFERENCES users(id), -- NULL if AI message
    content TEXT NOT NULL,
    is_ai BOOLEAN DEFAULT FALSE,
    mentions_ai BOOLEAN DEFAULT FALSE,
    ai_command VARCHAR(50), -- 'remember', 'query', 'remind', etc.
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- KNOWLEDGE BASE
-- ============================================

-- Facts (atomic pieces of knowledge)
CREATE TABLE facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    category VARCHAR(100), -- product, manufacturing, marketing, sales, general
    source_type VARCHAR(50) NOT NULL, -- conversation, document, manual, integration
    source_id UUID, -- message_id, document_id, etc.
    created_by VARCHAR(128) REFERENCES users(id),
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE, -- NULL means still valid
    superseded_by UUID REFERENCES facts(id), -- If this fact was updated
    embedding vector(1536), -- OpenAI ada-002 embeddings for semantic search
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Decisions (choices made with rationale)
CREATE TABLE decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    what TEXT NOT NULL, -- The decision
    why TEXT, -- Rationale
    alternatives JSONB DEFAULT '[]', -- Other options considered
    made_by VARCHAR(128) REFERENCES users(id),
    source_id UUID, -- message_id if from conversation
    related_facts UUID[] DEFAULT '{}', -- Links to relevant facts
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents (for Phase 2 - ingested files)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50), -- pdf, docx, xlsx, gdoc, etc.
    source_url TEXT, -- Original URL if from integration
    storage_path TEXT, -- Where file is stored
    content_text TEXT, -- Extracted text content
    uploaded_by VARCHAR(128) REFERENCES users(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ALERTS & REMINDERS
-- ============================================

-- Alerts (proactive nudges)
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    created_by VARCHAR(128) REFERENCES users(id),

    -- What triggers this alert
    trigger_type VARCHAR(50) NOT NULL, -- date, recurring, condition
    trigger_at TIMESTAMP WITH TIME ZONE, -- For date-based
    recurrence_rule TEXT, -- RRULE for recurring (Phase 2)

    -- What to say
    message TEXT NOT NULL,
    related_fact_id UUID REFERENCES facts(id),

    -- State
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, snoozed, cancelled
    sent_at TIMESTAMP WITH TIME ZONE,
    snoozed_until TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PROJECTS & TASKS (Simplified)
-- ============================================

-- Projects (lightweight grouping)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active', -- active, completed, archived
    created_by VARCHAR(128) REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL, -- Where task was created

    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo', -- todo, in_progress, done
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent

    assigned_to VARCHAR(128) REFERENCES users(id),
    due_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    created_by VARCHAR(128) REFERENCES users(id),
    source_message_id UUID REFERENCES messages(id), -- If created from chat

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Team lookups
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_team_invites_email ON team_invites(email);
CREATE INDEX idx_team_invites_token ON team_invites(token);

-- Channel lookups
CREATE INDEX idx_channels_team ON channels(team_id);
CREATE INDEX idx_messages_channel ON messages(channel_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- Knowledge lookups
CREATE INDEX idx_facts_team ON facts(team_id);
CREATE INDEX idx_facts_category ON facts(team_id, category);
CREATE INDEX idx_facts_valid ON facts(team_id, valid_until) WHERE valid_until IS NULL;
CREATE INDEX idx_decisions_team ON decisions(team_id);
CREATE INDEX idx_documents_team ON documents(team_id);

-- Alert lookups
CREATE INDEX idx_alerts_pending ON alerts(status, trigger_at) WHERE status = 'pending';
CREATE INDEX idx_alerts_team ON alerts(team_id);

-- Task lookups
CREATE INDEX idx_tasks_team ON tasks(team_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE status != 'done';
CREATE INDEX idx_tasks_due ON tasks(due_at) WHERE status != 'done';
CREATE INDEX idx_projects_team ON projects(team_id);

-- ============================================
-- ENABLE VECTOR EXTENSION (for embeddings)
-- ============================================
-- Note: Run this separately if pgvector not enabled:
-- CREATE EXTENSION IF NOT EXISTS vector;
