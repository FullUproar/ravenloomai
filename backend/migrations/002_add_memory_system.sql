-- Migration 002: Add Memory System
-- Adds episodic memory (conversation summaries) and semantic memory (knowledge graph nodes with vector search)

-- ============================================================================
-- ENABLE PGVECTOR EXTENSION (for vector similarity search)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- EPISODIC MEMORY (Conversation Episode Summaries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_episodes (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,

  -- Episode boundaries
  start_message_id INTEGER REFERENCES conversation_messages(id),
  end_message_id INTEGER REFERENCES conversation_messages(id),
  message_count INTEGER NOT NULL,

  -- Summary content
  topic VARCHAR(500), -- Brief topic: "Discussed workout schedule challenges"
  summary TEXT NOT NULL, -- Narrative summary (2-3 sentences)
  key_points JSONB DEFAULT '[]', -- Array of strings: ["Decided to switch to evening workouts", "Concerned about motivation"]

  -- Extracted insights
  decisions_made JSONB DEFAULT '[]', -- [{"decision": "...", "reasoning": "..."}]
  emotions_detected VARCHAR(100), -- "frustrated, determined, hopeful"
  user_state VARCHAR(50), -- "blocked", "progressing", "celebrating", "planning"

  -- Vector embedding for semantic similarity
  embedding vector(1536), -- OpenAI ada-002 embedding dimension

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_episodes_conversation ON conversation_episodes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_episodes_project ON conversation_episodes(project_id);
CREATE INDEX IF NOT EXISTS idx_episodes_user ON conversation_episodes(user_id);
CREATE INDEX IF NOT EXISTS idx_episodes_created ON conversation_episodes(created_at DESC);

-- Vector similarity index (using HNSW for fast approximate nearest neighbor search)
CREATE INDEX IF NOT EXISTS idx_episodes_embedding ON conversation_episodes USING hnsw (embedding vector_cosine_ops);


-- ============================================================================
-- SEMANTIC MEMORY (Knowledge Graph Nodes - Facts about user/project)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, -- NULL for user-level facts

  -- Node classification
  node_type VARCHAR(50) NOT NULL,
  -- Types: 'preference', 'work_pattern', 'blocker', 'strength', 'goal', 'belief', 'success_pattern', 'trigger'

  label VARCHAR(500) NOT NULL, -- Human-readable fact: "Prefers morning check-ins", "Struggles with procrastination"

  -- Additional context
  properties JSONB DEFAULT '{}', -- Flexible metadata: {"context": "fitness", "severity": "high"}

  -- Provenance (where did this come from?)
  source_episode_id INTEGER REFERENCES conversation_episodes(id),
  source_message_id INTEGER REFERENCES conversation_messages(id),

  -- Confidence & recency
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1), -- Decays over time, increases with reinforcement
  last_reinforced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  times_mentioned INTEGER DEFAULT 1,

  -- For conflict detection
  contradicted_by INTEGER REFERENCES knowledge_nodes(id), -- Points to contradicting fact
  is_active BOOLEAN DEFAULT true, -- False if contradicted or outdated

  -- Vector embedding for semantic similarity
  embedding vector(1536), -- OpenAI ada-002 embedding

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kn_user ON knowledge_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_kn_project ON knowledge_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_kn_type ON knowledge_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_kn_active ON knowledge_nodes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_kn_confidence ON knowledge_nodes(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_kn_reinforced ON knowledge_nodes(last_reinforced_at DESC);

-- Vector similarity index
CREATE INDEX IF NOT EXISTS idx_kn_embedding ON knowledge_nodes USING hnsw (embedding vector_cosine_ops);


-- ============================================================================
-- MEMORY CONFIGURATION (per user/project settings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_config (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,

  -- Episode creation settings
  episode_message_threshold INTEGER DEFAULT 15, -- Create episode after N messages
  episode_inactivity_minutes INTEGER DEFAULT 30, -- Create episode after N minutes of inactivity

  -- Fact extraction settings
  fact_extraction_enabled BOOLEAN DEFAULT true,
  fact_confidence_threshold FLOAT DEFAULT 0.7, -- Only store facts with confidence >= this

  -- Retrieval settings
  max_episodes_retrieved INTEGER DEFAULT 3, -- How many recent episodes to include
  max_facts_retrieved INTEGER DEFAULT 10, -- How many relevant facts to include

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, project_id)
);


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get similar episodes by vector similarity
CREATE OR REPLACE FUNCTION get_similar_episodes(
  query_embedding vector(1536),
  filter_user_id VARCHAR(255),
  filter_project_id INTEGER,
  limit_count INTEGER DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  episode_id INTEGER,
  topic VARCHAR(500),
  summary TEXT,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.topic,
    ce.summary,
    1 - (ce.embedding <=> query_embedding) as similarity
  FROM conversation_episodes ce
  WHERE ce.user_id = filter_user_id
    AND (filter_project_id IS NULL OR ce.project_id = filter_project_id)
    AND ce.embedding IS NOT NULL
    AND 1 - (ce.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;


-- Function to get similar knowledge nodes by vector similarity
CREATE OR REPLACE FUNCTION get_similar_knowledge(
  query_embedding vector(1536),
  filter_user_id VARCHAR(255),
  filter_project_id INTEGER,
  filter_types VARCHAR(50)[] DEFAULT NULL,
  limit_count INTEGER DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  node_id INTEGER,
  node_type VARCHAR(50),
  label VARCHAR(500),
  confidence FLOAT,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kn.id,
    kn.node_type,
    kn.label,
    kn.confidence,
    1 - (kn.embedding <=> query_embedding) as similarity
  FROM knowledge_nodes kn
  WHERE kn.user_id = filter_user_id
    AND (filter_project_id IS NULL OR kn.project_id = filter_project_id OR kn.project_id IS NULL)
    AND kn.is_active = true
    AND kn.embedding IS NOT NULL
    AND (filter_types IS NULL OR kn.node_type = ANY(filter_types))
    AND 1 - (kn.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY kn.embedding <=> query_embedding
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
