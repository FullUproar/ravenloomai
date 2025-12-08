-- Knowledge Base Sources
-- Tracks folders/files linked from external sources (Google Drive, etc.) to team knowledge base

CREATE TABLE IF NOT EXISTS knowledge_base_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Source info
  provider TEXT NOT NULL, -- 'google_drive', 'notion', 'dropbox', etc.
  source_type TEXT NOT NULL, -- 'folder', 'file'
  source_id TEXT NOT NULL, -- External ID (Google Drive folder/file ID)
  source_name TEXT NOT NULL, -- Display name
  source_path TEXT, -- Full path for display (e.g., "My Drive / Projects / Docs")
  source_mime_type TEXT, -- For files: application/vnd.google-apps.document, etc.
  source_url TEXT, -- Direct link to open in source app

  -- Sync status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'syncing', 'synced', 'error'
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  file_count INTEGER DEFAULT 0, -- For folders: number of files synced

  -- Metadata
  added_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by team
CREATE INDEX IF NOT EXISTS idx_kb_sources_team ON knowledge_base_sources(team_id);

-- Index for finding by provider and source
CREATE INDEX IF NOT EXISTS idx_kb_sources_provider ON knowledge_base_sources(team_id, provider, source_id);

-- Knowledge Base Documents
-- Individual documents extracted from sources, with content for RAG
CREATE TABLE IF NOT EXISTS knowledge_base_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  source_id UUID REFERENCES knowledge_base_sources(id) ON DELETE CASCADE,

  -- Document info
  external_id TEXT NOT NULL, -- Google Drive file ID, etc.
  title TEXT NOT NULL,
  mime_type TEXT,
  external_url TEXT, -- Link to open in source app

  -- Content
  content TEXT, -- Extracted text content
  content_hash TEXT, -- Hash to detect changes

  -- Embedding for semantic search (using pgvector if available)
  -- embedding VECTOR(1536), -- Uncomment when pgvector is enabled

  -- Metadata
  last_modified_external TIMESTAMPTZ, -- Last modified in source
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_kb_docs_team ON knowledge_base_documents(team_id);
CREATE INDEX IF NOT EXISTS idx_kb_docs_source ON knowledge_base_documents(source_id);
CREATE INDEX IF NOT EXISTS idx_kb_docs_external ON knowledge_base_documents(team_id, external_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_kb_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS kb_sources_updated_at ON knowledge_base_sources;
CREATE TRIGGER kb_sources_updated_at
  BEFORE UPDATE ON knowledge_base_sources
  FOR EACH ROW EXECUTE FUNCTION update_kb_updated_at();

DROP TRIGGER IF EXISTS kb_docs_updated_at ON knowledge_base_documents;
CREATE TRIGGER kb_docs_updated_at
  BEFORE UPDATE ON knowledge_base_documents
  FOR EACH ROW EXECUTE FUNCTION update_kb_updated_at();
