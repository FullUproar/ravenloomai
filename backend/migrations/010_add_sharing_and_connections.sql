-- Migration 010: Add Project Sharing, User Connections, and Messaging
-- This enables collaboration features: sharing projects, connecting users, and messaging

-- User connections (friend-like system without the term "friend")
CREATE TABLE IF NOT EXISTS user_connections (
  id SERIAL PRIMARY KEY,
  requester_id VARCHAR(255) NOT NULL, -- User who sent the connection request
  recipient_id VARCHAR(255) NOT NULL, -- User who received the request
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, accepted, declined, blocked
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(requester_id, recipient_id),
  CHECK (requester_id != recipient_id) -- Can't connect to yourself
);

CREATE INDEX idx_connections_requester ON user_connections(requester_id);
CREATE INDEX idx_connections_recipient ON user_connections(recipient_id);
CREATE INDEX idx_connections_status ON user_connections(status);

-- Project shares (for collaboration)
CREATE TABLE IF NOT EXISTS project_shares (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  owner_id VARCHAR(255) NOT NULL, -- Original project owner
  shared_with_id VARCHAR(255) NOT NULL, -- User the project is shared with
  permission_level VARCHAR(20) NOT NULL DEFAULT 'view', -- view, comment, edit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, shared_with_id)
);

CREATE INDEX idx_shares_project ON project_shares(project_id);
CREATE INDEX idx_shares_user ON project_shares(shared_with_id);
CREATE INDEX idx_shares_owner ON project_shares(owner_id);

-- User-to-user messages
CREATE TABLE IF NOT EXISTS user_messages (
  id SERIAL PRIMARY KEY,
  sender_id VARCHAR(255) NOT NULL,
  recipient_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CHECK (sender_id != recipient_id)
);

CREATE INDEX idx_messages_sender ON user_messages(sender_id);
CREATE INDEX idx_messages_recipient ON user_messages(recipient_id);
CREATE INDEX idx_messages_read ON user_messages(read);
CREATE INDEX idx_messages_created ON user_messages(created_at);

-- Message threads (for organizing conversations)
CREATE TABLE IF NOT EXISTS message_threads (
  id SERIAL PRIMARY KEY,
  participant_1_id VARCHAR(255) NOT NULL,
  participant_2_id VARCHAR(255) NOT NULL,
  last_message_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(participant_1_id, participant_2_id),
  CHECK (participant_1_id < participant_2_id) -- Ensures only one thread per pair
);

CREATE INDEX idx_threads_participant1 ON message_threads(participant_1_id);
CREATE INDEX idx_threads_participant2 ON message_threads(participant_2_id);
CREATE INDEX idx_threads_last_message ON message_threads(last_message_at);
