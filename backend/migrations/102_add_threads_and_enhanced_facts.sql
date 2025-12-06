-- ============================================
-- RavenLoom Migration 102: Threads & Enhanced Facts
-- Adds threaded conversations and structured knowledge model
-- ============================================

-- ============================================
-- THREADS - Conversations within Channels (Spaces)
-- ============================================

-- Threads are conversation groups within a channel
CREATE TABLE IF NOT EXISTS threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title VARCHAR(255), -- Optional title, auto-generated from first message if null
    started_by VARCHAR(128) REFERENCES users(id),
    message_count INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_resolved BOOLEAN DEFAULT FALSE, -- For Q&A threads
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add thread_id to messages (nullable for backward compatibility)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES threads(id) ON DELETE CASCADE;

-- Index for thread lookups
CREATE INDEX IF NOT EXISTS idx_threads_channel ON threads(channel_id);
CREATE INDEX IF NOT EXISTS idx_threads_activity ON threads(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

-- ============================================
-- ENHANCED FACTS MODEL
-- Structured entity-attribute-value model
-- ============================================

-- Add structured fields to facts table
ALTER TABLE facts ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);
ALTER TABLE facts ADD COLUMN IF NOT EXISTS entity_name VARCHAR(255);
ALTER TABLE facts ADD COLUMN IF NOT EXISTS attribute VARCHAR(255);
ALTER TABLE facts ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2) DEFAULT 1.00;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index for entity lookups
CREATE INDEX IF NOT EXISTS idx_facts_entity ON facts(team_id, entity_type, entity_name);
CREATE INDEX IF NOT EXISTS idx_facts_confidence ON facts(confidence_score);

-- ============================================
-- USER PREFERENCES
-- Digest settings and notification preferences
-- ============================================

-- Add user preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_time TIME DEFAULT '09:00:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/Los_Angeles';
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- TEAM MEMBER SETTINGS
-- Per-team notification preferences
-- ============================================

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS mentions_only BOOLEAN DEFAULT FALSE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- DIGEST LOG
-- Track sent digests to avoid duplicates
-- ============================================

CREATE TABLE IF NOT EXISTS digest_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    digest_date DATE NOT NULL,
    content_hash VARCHAR(64), -- To detect if content changed
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, team_id, digest_date)
);

CREATE INDEX IF NOT EXISTS idx_digest_log_date ON digest_log(digest_date DESC);

-- ============================================
-- KNOWLEDGE QUERIES LOG
-- Track "Ask the Company" questions for analytics
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id VARCHAR(128) REFERENCES users(id),
    query TEXT NOT NULL,
    answer TEXT,
    facts_used UUID[] DEFAULT '{}',
    confidence_score DECIMAL(3,2),
    helpful BOOLEAN, -- User feedback
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_queries_team ON knowledge_queries(team_id);

-- ============================================
-- TRIGGER: Update thread message count and activity
-- ============================================

CREATE OR REPLACE FUNCTION update_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.thread_id IS NOT NULL THEN
        UPDATE threads
        SET
            message_count = message_count + 1,
            last_activity_at = NOW(),
            updated_at = NOW()
        WHERE id = NEW.thread_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_thread_stats ON messages;
CREATE TRIGGER trigger_update_thread_stats
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_stats();

-- ============================================
-- TRIGGER: Auto-generate thread title from first message
-- ============================================

CREATE OR REPLACE FUNCTION auto_generate_thread_title()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.title IS NULL THEN
        -- Will be updated after first message is added
        NEW.title := 'New Thread';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_thread_title ON threads;
CREATE TRIGGER trigger_auto_thread_title
    BEFORE INSERT ON threads
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_thread_title();
