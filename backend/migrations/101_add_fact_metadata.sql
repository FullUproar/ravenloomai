-- Add metadata column to facts table for rich data (URLs, structured data)
ALTER TABLE facts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add index for metadata queries
CREATE INDEX IF NOT EXISTS idx_facts_metadata ON facts USING GIN(metadata);
