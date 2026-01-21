# Knowledge Architecture

## Overview

Raven's knowledge system stores organizational knowledge as atomic facts with entity relationships and contextual qualifiers. The system supports supervised learning (preview → confirm) for writes and instant retrieval for reads.

## Core Concepts

### Entities vs Contexts

**Entities** are the things - concepts with identity:
- "California Office" (not "Office" with California context)
- "Project Alpha"
- "Slack"

**Contexts** are qualifiers on relationships - temporal, conditional modifiers:
- "after 2025-01-01"
- "during Project Alpha"
- "when budget approved"

**Key distinction**: Geographic/organizational scope belongs in entity identity, not context. "California Office uses Slack" is correct. "Office uses Slack [context: California]" conflates entity refinement with relationship qualification.

### Fact Structure

```
[Entity A] --relationship--> [Entity B] {context: temporal/conditional}
```

Example:
```
[California Office] --uses--> [Slack] {context: since 2024}
```

### Database Schema

Facts table includes:
- `entity_type`, `entity_name` - Structured entity identification
- `content` - Human-readable fact statement
- `context_tags` - JSONB array of contextual qualifiers (temporal, conditional)
- `valid_from`, `valid_until` - Temporal bounds
- `source_quote`, `source_url` - Provenance tracking
- `scope_id` - Hierarchical organization scope

## Query Semantics

Context tags represent **minimum applicable scope**. Query interpretation determines inclusion:

### Example Facts
- "California Office uses Slack" → tags: `["since:2024"]`
- "All USA offices use Teams" → tags: `[]` (no temporal qualifier)

### Query Types

**Inclusive**: "What tools in California?"
- Returns California-specific facts AND USA-wide facts
- Query expands upward to include broader contexts that apply

**Universal**: "What's required across all USA sites?"
- Returns only USA-wide facts
- Excludes location-specific facts

The AI answering the query recognizes intent and filters appropriately.

## Implemented Features

### Ask (Read-only)
- Instant AI response to questions
- Searches facts, decisions, KB documents, knowledge graph
- Returns answer with source attribution and suggested follow-ups

### Remember (Supervised Write)
1. **Preview**: Extract atomic facts, detect conflicts
2. **Review**: User sees extracted facts, can skip conflicting updates
3. **Confirm**: Facts saved with provenance

### Source Attribution
- `source_quote` - Original verbatim text
- `source_url` - External reference (Google Doc, etc.)
- `source_type` - conversation, document, user_statement, integration

## Planned Features

### Context Tags (Migration 203)
- `context_tags JSONB` column on facts table
- GIN index for efficient querying
- Tags for temporal/conditional qualifiers only (not entity scope)

### Knowledge Grooming (Future)

**Refactoring Operations**:
- Context → Entity promotion: Split contextualized fact into entity-specific facts
- Entity → Context demotion: Merge specific facts into broader ones
- Entity merging: Combine facts about related entities

**Draft Refactors**:
- Create draft changes in preview layer
- Test queries against draft knowledge
- Validate outcomes before committing
- Discard if model doesn't behave as expected

**Large Refactor UX**:
- Summary view first (not 50 individual confirmations)
- Progressive disclosure for details
- Grouped changes as reviewable units
- Confidence tiers: auto-approve high-confidence, review ambiguous

## File Reference

### Backend
- `services/RavenService.js` - Ask/Remember implementation
- `services/KnowledgeService.js` - Fact CRUD, semantic search
- `services/AIService.js` - Embedding generation, fact extraction
- `graphql/schema.js` - AskResponse, RememberPreview, Fact types

### Frontend
- `components/RavenKnowledge.jsx` - Ask/Remember UI
- `components/RavenKnowledge.css` - Styles

### Migrations
- `200_scopes.sql` - Hierarchical scope structure
- `202_fact_attribution.sql` - source_quote, source_url
- `203_context_tags.sql` - context_tags JSONB column

## Design Decisions

1. **Entities over contexts for scope**: California is part of the entity name, not a contextual tag. This prevents confusion between "applies to California" vs "applies everywhere including California".

2. **Context tags for true qualifiers only**: Temporal (dates), conditional (budget approved), project-scoped (during Alpha) - not geographic/organizational hierarchy.

3. **Query-time hierarchy expansion**: Facts tagged with minimum scope. Queries expand to include parent scopes as needed.

4. **Supervised writes, instant reads**: Remember requires preview/confirm. Ask is immediate.

5. **Draft testing for refactors**: Large knowledge model changes should be testable before commit.
