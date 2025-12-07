-- Attachments table for storing uploaded files (images, etc.)
-- Files can be attached to messages or team question answers

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  uploaded_by VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- File info
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,

  -- Storage location (could be local path or cloud URL)
  storage_type VARCHAR(20) DEFAULT 'local',  -- local, s3, gcs
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,  -- Public URL to access the file

  -- Association (one of these will be set)
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  team_question_id UUID REFERENCES team_questions(id) ON DELETE CASCADE,

  -- Metadata
  width INTEGER,  -- For images
  height INTEGER,
  thumbnail_url TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_question ON attachments(team_question_id);
CREATE INDEX IF NOT EXISTS idx_attachments_team ON attachments(team_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploader ON attachments(uploaded_by);

-- Add attachments column to messages for quick reference
ALTER TABLE messages ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN DEFAULT FALSE;
