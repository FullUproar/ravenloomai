-- Migration 003: Add Debug Mode
-- Adds debug mode settings to projects for development visibility

-- Add debug mode columns to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS debug_mode_enabled BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS debug_mode_activated_at TIMESTAMP;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_projects_debug_mode ON projects(debug_mode_enabled) WHERE debug_mode_enabled = true;

-- Add debug mode flag to conversation messages (for debug-only messages)
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS is_debug_message BOOLEAN DEFAULT false;
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS debug_data JSONB;

-- Index for filtering out debug messages in normal view
CREATE INDEX IF NOT EXISTS idx_conversation_messages_debug ON conversation_messages(conversation_id, is_debug_message);
