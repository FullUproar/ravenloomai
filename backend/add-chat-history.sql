-- Add chat history table for multi-turn conversations
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}' -- for storing function calls, actions taken, etc.
);

-- Index for efficient conversation retrieval
CREATE INDEX IF NOT EXISTS idx_chat_messages_project_user ON chat_messages(project_id, user_id, created_at);

-- Clear any existing test data and add some sample conversation
DELETE FROM chat_messages WHERE user_id = 'test-user-001';