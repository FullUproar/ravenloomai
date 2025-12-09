# GraphRAG Implementation Plan

## Overview
Transform RavenLoom's knowledge system from simple keyword search to a proper GraphRAG (Graph-based Retrieval Augmented Generation) system that:
1. Builds a Knowledge Graph from all knowledge sources (GDocs, facts, Q&A, Raven commands)
2. Uses vector embeddings for semantic entry points
3. Traverses the graph to find related context
4. Returns relevant chunks to the LLM for answering

## Current State
- **Facts table**: Already has `embedding vector(1536)` column (pgvector)
- **Decisions table**: Has embeddings
- **AIService**: Has `generateEmbedding()` and `extractAtomicFacts()` functions
- **Database**: Vercel Postgres (Neon) - supports pgvector
- **Knowledge sources**:
  - Raven `@remember` commands → facts table
  - Q&A answers → can extract facts
  - Google Docs → knowledge_base_documents table (content extracted)

## Architecture

### Phase 1: Knowledge Graph Schema

```sql
-- Enable pgvector if not already
CREATE EXTENSION IF NOT EXISTS vector;

-- KG Nodes (entities extracted from all sources)
CREATE TABLE kg_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Entity info
  name TEXT NOT NULL,                    -- "Fugly", "Launch Date", "Panda Manufacturing"
  type TEXT NOT NULL,                    -- person, product, company, concept, date, event
  description TEXT,                      -- Brief description if available

  -- Vector for semantic search entry
  embedding vector(1536),

  -- Provenance
  source_type TEXT NOT NULL,             -- fact, decision, document, message, answer
  source_id UUID,                        -- Reference to source record

  -- Metadata
  properties JSONB DEFAULT '{}',         -- Flexible attributes
  mention_count INTEGER DEFAULT 1,       -- How often this entity appears

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, name, type)            -- One node per entity per team
);

-- KG Edges (relationships between entities)
CREATE TABLE kg_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  source_node_id UUID NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,

  relationship TEXT NOT NULL,            -- IS_A, HAS, WORKS_WITH, RELATED_TO, PART_OF, etc.
  weight FLOAT DEFAULT 1.0,              -- Strength of relationship

  -- Provenance
  source_type TEXT,
  source_id UUID,

  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source_node_id, target_node_id, relationship)
);

-- KG Chunks (text chunks linked to nodes)
CREATE TABLE kg_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  content TEXT NOT NULL,                 -- The actual text chunk
  embedding vector(1536),                -- For direct chunk search

  -- Source tracking
  source_type TEXT NOT NULL,             -- document, fact, decision, message, answer
  source_id UUID,
  source_title TEXT,                     -- Document name, channel name, etc.

  -- Linked entities (for graph traversal)
  linked_node_ids UUID[] DEFAULT '{}',   -- Nodes mentioned in this chunk

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast retrieval
CREATE INDEX idx_kg_nodes_team ON kg_nodes(team_id);
CREATE INDEX idx_kg_nodes_type ON kg_nodes(team_id, type);
CREATE INDEX idx_kg_nodes_embedding ON kg_nodes USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX idx_kg_edges_source ON kg_edges(source_node_id);
CREATE INDEX idx_kg_edges_target ON kg_edges(target_node_id);
CREATE INDEX idx_kg_edges_team ON kg_edges(team_id);

CREATE INDEX idx_kg_chunks_team ON kg_chunks(team_id);
CREATE INDEX idx_kg_chunks_embedding ON kg_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_kg_chunks_nodes ON kg_chunks USING gin(linked_node_ids);
```

### Phase 2: Extraction Pipeline

#### 2.1 Entity & Relationship Extraction Service
```javascript
// New service: KnowledgeGraphService.js

export async function extractEntitiesAndRelationships(text, context = {}) {
  // Use GPT-4 to extract structured data
  const prompt = `Extract entities and relationships from this text.

  Return JSON:
  {
    "entities": [
      {"name": "Entity Name", "type": "person|product|company|concept|date|event", "description": "brief desc"}
    ],
    "relationships": [
      {"source": "Entity1", "target": "Entity2", "relationship": "WORKS_FOR|HAS|IS_A|RELATED_TO|etc"}
    ]
  }`;

  // ... call OpenAI, parse response
}

export async function processDocument(teamId, document) {
  // 1. Chunk the document (by paragraphs or ~500 chars)
  const chunks = chunkText(document.content, 500);

  // 2. For each chunk:
  for (const chunk of chunks) {
    // a. Extract entities and relationships
    const extracted = await extractEntitiesAndRelationships(chunk);

    // b. Create/update nodes
    const nodeIds = [];
    for (const entity of extracted.entities) {
      const node = await upsertNode(teamId, entity);
      nodeIds.push(node.id);
    }

    // c. Create edges
    for (const rel of extracted.relationships) {
      await createEdge(teamId, rel);
    }

    // d. Store chunk with linked nodes
    await createChunk(teamId, {
      content: chunk,
      embedding: await generateEmbedding(chunk),
      sourceType: 'document',
      sourceId: document.id,
      sourceTitle: document.title,
      linkedNodeIds: nodeIds
    });
  }
}
```

#### 2.2 Ingestion Triggers
- **On document sync**: Process document → extract → store
- **On fact creation**: Extract entities → link to fact
- **On Q&A answer**: Extract facts from answer → process each
- **On Raven remember**: Already extracts entities → also add to KG

### Phase 3: GraphRAG Retrieval

```javascript
export async function graphRAGSearch(teamId, query, options = {}) {
  const { topK = 5, hopDepth = 1 } = options;

  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // 2. Vector search for entry point nodes
  const entryNodes = await db.query(`
    SELECT id, name, type, 1 - (embedding <=> $1) as similarity
    FROM kg_nodes
    WHERE team_id = $2
    ORDER BY embedding <=> $1
    LIMIT $3
  `, [pgvector(queryEmbedding), teamId, topK]);

  // 3. Hop to related nodes (1 hop by default)
  const entryNodeIds = entryNodes.rows.map(n => n.id);
  const relatedNodes = await db.query(`
    SELECT DISTINCT target_node_id as id
    FROM kg_edges
    WHERE source_node_id = ANY($1)
    UNION
    SELECT DISTINCT source_node_id as id
    FROM kg_edges
    WHERE target_node_id = ANY($1)
  `, [entryNodeIds]);

  // 4. Collect all relevant node IDs
  const allNodeIds = [...new Set([
    ...entryNodeIds,
    ...relatedNodes.rows.map(n => n.id)
  ])];

  // 5. Get chunks linked to these nodes
  const chunks = await db.query(`
    SELECT DISTINCT content, source_title, source_type
    FROM kg_chunks
    WHERE team_id = $1
      AND linked_node_ids && $2
    ORDER BY created_at DESC
    LIMIT 10
  `, [teamId, allNodeIds]);

  return {
    entryNodes: entryNodes.rows,
    relatedNodes: relatedNodes.rows,
    chunks: chunks.rows
  };
}
```

### Phase 4: Integration with Ask the Company

```javascript
// Update askCompany resolver
askCompany: async (_, { teamId, input }, { userId }) => {
  // 1. GraphRAG search
  const graphContext = await KnowledgeGraphService.graphRAGSearch(
    teamId,
    input.question,
    { topK: 5, hopDepth: 1 }
  );

  // 2. Also get traditional facts/decisions (for backwards compat)
  const knowledge = await KnowledgeService.getKnowledgeContext(teamId, input.question);

  // 3. Build combined context for AI
  const context = {
    graphChunks: graphContext.chunks,
    facts: knowledge.facts,
    decisions: knowledge.decisions
  };

  // 4. Generate answer with graph context
  return AIService.generateCompanyAnswer(input.question, context);
}
```

## Implementation Steps

### Step 1: Database Migration (1 file)
- Create kg_nodes, kg_edges, kg_chunks tables
- Enable pgvector extension
- Add indexes

### Step 2: KnowledgeGraphService (1 file)
- `extractEntitiesAndRelationships()` - GPT extraction
- `upsertNode()` - Create/update entity nodes
- `createEdge()` - Create relationships
- `createChunk()` - Store text chunks
- `graphRAGSearch()` - The main retrieval function

### Step 3: Update Document Sync
- Modify `KnowledgeBaseService.syncDocument()` to also process into KG

### Step 4: Update Fact Creation
- Modify `KnowledgeService.createFact()` to also add to KG

### Step 5: Update Ask the Company
- Integrate GraphRAG search into `askCompany` resolver
- Update `generateCompanyAnswer()` to use graph context

### Step 6: Background Processing (optional)
- Queue system for processing large documents
- Batch embedding generation

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `migrations/114_knowledge_graph.sql` | CREATE | KG schema |
| `services/KnowledgeGraphService.js` | CREATE | Entity extraction, graph ops, retrieval |
| `services/KnowledgeBaseService.js` | MODIFY | Add KG processing on doc sync |
| `services/KnowledgeService.js` | MODIFY | Add KG processing on fact create |
| `services/AIService.js` | MODIFY | Update answer generation for graph context |
| `graphql/resolvers/index.js` | MODIFY | Integrate GraphRAG in askCompany |

## Estimated Complexity
- **Migration**: Simple
- **KnowledgeGraphService**: Medium (main new logic)
- **Integration**: Simple (wiring existing code)

## Notes
- Start with 1-hop traversal, can expand to multi-hop later
- Chunk size of ~500 chars balances context vs token usage
- May need to tune embedding similarity threshold
- Consider rate limiting GPT calls for entity extraction on large documents
