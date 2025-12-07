-- Integrations table for storing OAuth tokens and integration settings
-- Supports Google Drive and future integrations

CREATE TABLE IF NOT EXISTS user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,  -- google, notion, etc.
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scope TEXT,  -- OAuth scopes granted
  provider_user_id VARCHAR(255),  -- User's ID on the provider
  provider_email VARCHAR(255),
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, provider)
);

-- Index for looking up integrations
CREATE INDEX IF NOT EXISTS idx_user_integrations_user ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_provider ON user_integrations(provider);

-- Table for tracking synced/indexed files from integrations
CREATE TABLE IF NOT EXISTS integration_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  provider_file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500),
  file_type VARCHAR(50),  -- document, spreadsheet, presentation, folder
  mime_type VARCHAR(100),
  parent_folder_id VARCHAR(255),
  last_synced_at TIMESTAMPTZ,
  content_hash VARCHAR(64),
  is_indexed BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(integration_id, provider_file_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_files_integration ON integration_files(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_files_team ON integration_files(team_id);
