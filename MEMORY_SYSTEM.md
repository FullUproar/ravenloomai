# Agent Memory System

## Overview

RavenLoom now implements a sophisticated 4-tier memory architecture that allows AI personas to remember important information across conversations and over long periods of time.

## Architecture

### Tier 1: Short-Term Memory (Existing)
- **Scope**: Current conversation session
- **Content**: Last 10-20 messages
- **Implementation**: `ShortTermMemory.js`
- **Purpose**: Immediate conversational context

### Tier 2: Medium-Term Memory (Existing)
- **Scope**: Project-level tactical information
- **Content**: Active decisions, blockers, and preferences
- **Implementation**: `MediumTermMemory.js`
- **Purpose**: Project-specific working memory

### Tier 3: Episodic Memory (NEW)
- **Scope**: Conversation history summaries
- **Content**: Summarized conversation episodes with key insights
- **Storage**: `conversation_episodes` table
- **Features**:
  - Auto-summarization every 15 messages
  - Captures: topic, summary, key points, decisions, emotions, user state
  - Vector embeddings for semantic search
- **Purpose**: Compressed long-term conversation history

### Tier 4: Semantic Memory - Knowledge Graph (NEW)
- **Scope**: Long-term facts about user and projects
- **Content**: Extracted facts as graph nodes
- **Storage**: `knowledge_nodes` table
- **Node Types**:
  - `preference`: User preferences
  - `work_pattern`: How user works
  - `blocker`: Challenges and obstacles
  - `strength`: User's strengths
  - `goal`: User's goals
  - `belief`: User's beliefs about themselves
  - `success_pattern`: What works well for user
- **Features**:
  - Automatic fact extraction from conversations
  - Vector embeddings for semantic similarity search
  - Confidence scoring and reinforcement
  - Contradiction detection
- **Purpose**: Persistent knowledge about user's patterns, preferences, and context

## How It Works

### 1. During Conversation

When a user sends a message:
1. Message is stored in `conversation_messages`
2. System checks if 15+ messages since last episode → triggers background summarization
3. Retrieves relevant long-term memories using vector similarity search
4. Injects memory context into AI prompt:
   - Recent episode summaries (last 3)
   - Relevant facts similar to current topic
   - Known blockers and strengths
5. AI generates response with full context

### 2. Episode Summarization (Background)

After every ~15 messages:
1. GPT-4-mini reads the message batch
2. Generates structured summary:
   - Topic (brief title)
   - Narrative summary (2-3 sentences)
   - Key points (bullet list)
   - Decisions made
   - Emotions detected
   - User state (blocked/progressing/celebrating/planning/stuck)
3. Creates vector embedding of summary
4. Stores in `conversation_episodes` table

### 3. Fact Extraction (Background)

After episode creation:
1. GPT-4-mini analyzes conversation for memorable facts
2. Extracts structured knowledge:
   - Type classification (preference/blocker/strength/etc)
   - Clear fact statement
   - Confidence score (0-1)
3. Generates vector embedding for each fact
4. Checks for similar existing facts (0.9+ similarity)
   - If similar: reinforces existing fact (increment mention count, boost confidence)
   - If new: creates new knowledge node
5. Stores in `knowledge_nodes` table

### 4. Memory Retrieval

Before generating AI response:
1. **Episodic Retrieval**:
   - Get last 3 episodes chronologically
   - OR search by vector similarity to current message
2. **Semantic Retrieval**:
   - Generate embedding of current user message
   - Find top 10 most similar knowledge nodes (0.7+ cosine similarity)
   - Filter by relevance: blockers, strengths, preferences, etc.
3. **Format for Prompt**:
   ```
   === MEMORY CONTEXT ===

   Recent Conversation History:
   1. 2 days ago: Discussed workout schedule
      User decided to switch to morning workouts...

   Known Challenges/Blockers:
   - Difficulty waking at 6am (confidence: 85%, mentioned 3x)

   Known Strengths/Success Patterns:
   - Consistent when accountability partner involved

   === END MEMORY CONTEXT ===
   ```

## Database Schema

### `conversation_episodes`
```sql
- id
- conversation_id
- project_id, user_id
- start_message_id, end_message_id, message_count
- topic VARCHAR(500)
- summary TEXT
- key_points JSONB
- decisions_made JSONB
- emotions_detected VARCHAR(100)
- user_state VARCHAR(50)
- embedding vector(1536)  -- OpenAI ada-002 embeddings
- created_at
```

### `knowledge_nodes`
```sql
- id
- user_id
- project_id (NULL for user-level facts)
- node_type VARCHAR(50)
- label VARCHAR(500)
- properties JSONB
- source_episode_id, source_message_id
- confidence FLOAT
- last_reinforced_at
- times_mentioned INT
- contradicted_by INT (points to contradicting node)
- is_active BOOLEAN
- embedding vector(1536)
- created_at
```

### `memory_config` (per-user/project settings)
```sql
- episode_message_threshold (default: 15)
- episode_inactivity_minutes (default: 30)
- fact_extraction_enabled (default: true)
- fact_confidence_threshold (default: 0.7)
- max_episodes_retrieved (default: 3)
- max_facts_retrieved (default: 10)
```

## Vector Search (pgvector)

We use PostgreSQL's `pgvector` extension with HNSW indexing for fast approximate nearest neighbor search.

**Cosine similarity** is used to find relevant memories:
- Similarity score: `1 - (embedding <=> query_embedding)`
- Threshold: 0.7 for general retrieval, 0.9 for duplicate detection

**Indexes**:
```sql
CREATE INDEX idx_episodes_embedding ON conversation_episodes
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_kn_embedding ON knowledge_nodes
  USING hnsw (embedding vector_cosine_ops);
```

## API (GraphQL)

### Queries

```graphql
# Get full memory context for conversation
getMemoryContext(
  userId: String!
  projectId: ID!
  currentContext: String  # Optional: current message for similarity search
): MemoryContext!

# Get episode history
getConversationEpisodes(
  projectId: ID!
  limit: Int
): [ConversationEpisode!]!

# Get knowledge facts
getKnowledgeNodes(
  userId: String!
  projectId: ID
  nodeTypes: [String!]  # Filter by type
): [KnowledgeNode!]!

# Search memories by semantic similarity
searchMemory(
  userId: String!
  projectId: ID
  query: String!
): MemoryContext!
```

### Mutations

```graphql
# Manually trigger episode summarization
triggerEpisodeSummarization(
  conversationId: ID!
): ConversationEpisode!

# Manually extract facts from episode
extractKnowledgeFacts(
  conversationId: ID!
  episodeId: ID!
): [KnowledgeNode!]!
```

## Implementation Files

- **Migration**: `backend/migrations/002_add_memory_system.sql`
- **Service**: `backend/services/MemoryService.js`
- **GraphQL Schema**: `backend/graphql/schema.js` (lines 228-306, 482-486, 546-548)
- **Resolvers**: `backend/resolvers.js` (lines 185-255, 774-792)
- **Integration**: `backend/services/ConversationService.js` (lines 14, 163-178, 378-393)
- **Prompt Builder**: `backend/services/PersonaPromptBuilder.js` (updated to accept longTermMemory)

## Configuration

Environment variables needed:
```bash
OPENAI_API_KEY=sk-...  # For embeddings (text-embedding-ada-002) and summarization (gpt-4o-mini)
DATABASE_URL=postgresql://...  # PostgreSQL with pgvector extension
```

## Running the Migration

```bash
# Run the migration
cd backend
node run-migration.js migrations/002_add_memory_system.sql
```

**Note**: Ensure your PostgreSQL database has the `pgvector` extension available. If not:
```sql
CREATE EXTENSION vector;
```

## Cost Considerations

### Embeddings
- Model: `text-embedding-ada-002`
- Cost: ~$0.0001 per 1K tokens
- Frequency: Once per episode summary + once per extracted fact
- Example: 15 messages → 1 summary + 3 facts = 4 embeddings = ~$0.0004

### Summarization
- Model: `gpt-4o-mini`
- Cost: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- Frequency: Every 15 messages
- Example: 15 messages (~3K tokens) → summary (~300 tokens) = ~$0.0007

**Total per 15 messages: ~$0.0011** (very affordable!)

## Future Enhancements (Not Yet Implemented)

### Phase 3: Knowledge Graph Relationships
- `knowledge_edges` table for relationships between facts
- Inference engine: "What blocks this goal?" "What conflicts with that?"
- Relationship types: `blocks`, `enables`, `conflicts_with`, `related_to`, `caused_by`

### Phase 4: Structured Metrics
- `metric_schemas` table: Define trackable metrics per project
- `metric_data` table: Time-series data (weight, calories, mood, etc.)
- AI extracts and records structured data from conversations
- Trend analysis and correlations

## Testing

The system is designed to work automatically in the background. To test:

1. Have a conversation (send 15+ messages)
2. Check that episode was created:
   ```graphql
   query {
     getConversationEpisodes(projectId: "123", limit: 5) {
       id
       topic
       summary
       keyPoints
     }
   }
   ```

3. Check that facts were extracted:
   ```graphql
   query {
     getKnowledgeNodes(userId: "user123", projectId: "123") {
       id
       nodeType
       label
       confidence
       timesMentioned
     }
   }
   ```

4. Verify memory is being used in responses:
   - Look for references to past conversations
   - AI should remember your preferences and patterns
   - Logs will show: `[ConversationService] Created episode X: <topic>`

## Benefits

1. **Continuity**: AI remembers conversations from days/weeks ago
2. **Personalization**: Learns user's unique patterns and preferences
3. **Scalability**: Compressed summaries instead of raw messages
4. **Discoverability**: Vector search finds relevant memories by meaning
5. **Intelligence**: AI builds knowledge graph of user over time
6. **Privacy**: User-specific, encrypted, can be deleted

## Privacy & Data Control

- All memories are user-specific and project-specific
- Embeddings are semantic (not verbatim text storage)
- Users can query and view all stored facts about them
- Future: UI for users to view/edit/delete memory nodes
- Complies with data minimization principles (only stores extracted facts, not full transcripts)
