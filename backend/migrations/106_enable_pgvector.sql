-- Ensure pgvector extension is enabled for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to facts table if it doesn't exist
ALTER TABLE facts ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add confidence_score column if it doesn't exist
ALTER TABLE facts ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2);

-- Add index for faster vector similarity search (only if we have data)
-- Note: ivfflat index needs at least some data, so we use a simpler index for now
CREATE INDEX IF NOT EXISTS idx_facts_embedding_cosine ON facts USING hnsw (embedding vector_cosine_ops);
