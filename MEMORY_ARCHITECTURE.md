# RavenLoom Memory Architecture

## Overview

A 3-tier memory system that enables long-lived AI personas to maintain context, learn patterns, and reason strategically over extended project timelines.

## Design Philosophy

1. **Finite Context Window** - LLMs have token limits, we need smart memory management
2. **Relevance Over Recency** - Important facts stay accessible, not just recent ones
3. **Strategic Reasoning** - Connect facts to enable higher-order thinking
4. **Managed Complexity** - Each tier has clear boundaries and management rules

---

## Tier 1: Short-Term Memory (Conversational)

### Purpose
Immediate conversational context - what we're talking about RIGHT NOW.

### Contents
- Last 10-20 messages from current conversation
- Compressed summaries of older messages (if relevant to current topic)
- Current session context (what user just asked about)

### Implementation

**Database Schema:**
```sql
-- Already exists: conversation_messages table
-- No additional tables needed

-- But add a summary field to conversations
ALTER TABLE conversations ADD COLUMN summary TEXT;
ALTER TABLE conversations ADD COLUMN last_summary_at TIMESTAMP;
```

**Service: `ShortTermMemory.js`**
```javascript
class ShortTermMemory {
  // Get recent messages for LLM context
  async getConversationContext(conversationId, limit = 10) {
    // Last N messages
    const recent = await getRecentMessages(conversationId, limit);

    // If conversation is long, prepend summary of older messages
    const conversation = await getConversation(conversationId);
    if (conversation.summary) {
      return [
        { role: 'system', content: `Previous context: ${conversation.summary}` },
        ...recent
      ];
    }

    return recent;
  }

  // Summarize old messages when conversation gets long
  async summarizeOldMessages(conversationId, keepRecentCount = 10) {
    const allMessages = await getAllMessages(conversationId);

    if (allMessages.length <= keepRecentCount * 2) {
      return; // Not long enough to summarize yet
    }

    const toSummarize = allMessages.slice(0, -keepRecentCount);
    const summary = await this._generateSummary(toSummarize);

    await updateConversationSummary(conversationId, summary);
  }

  // Use LLM to create compressed summary
  async _generateSummary(messages) {
    const prompt = `Summarize this conversation, focusing on:
    - Key decisions made
    - Tasks created or completed
    - Important facts revealed
    - Current project state

    Be concise but preserve critical details.`;

    return await generateChatCompletion([
      { role: 'system', content: prompt },
      ...messages
    ], { maxTokens: 500 });
  }
}
```

**Management Rules:**
- Keep last 10-20 messages in full
- When conversation exceeds 50 messages, summarize messages 1-30
- Summary updates every 20 new messages
- Max summary length: 500 tokens

---

## Tier 2: Medium-Term Memory (Tactical Scratch Pad)

### Purpose
Active working memory - facts we need RIGHT NOW for the current phase of work.

### Contents
- Current sprint/milestone focus
- Active blockers or issues
- Key metrics being tracked
- Recent important decisions
- User preferences and patterns (discovered during project)

### Implementation

**Database Schema:**
```sql
CREATE TABLE project_memory (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  memory_type VARCHAR(50) NOT NULL, -- 'fact', 'decision', 'blocker', 'preference', 'insight'
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  importance INTEGER DEFAULT 5, -- 1-10 scale
  expires_at TIMESTAMP, -- Some facts expire (e.g., "user on vacation this week")
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(50), -- persona_id or user_id

  UNIQUE(project_id, key)
);

CREATE INDEX idx_project_memory_importance ON project_memory(project_id, importance DESC);
CREATE INDEX idx_project_memory_type ON project_memory(project_id, memory_type);
CREATE INDEX idx_project_memory_expires ON project_memory(expires_at) WHERE expires_at IS NOT NULL;
```

**Service: `MediumTermMemory.js`**
```javascript
class MediumTermMemory {
  // Store a fact
  async remember(projectId, key, value, options = {}) {
    const {
      type = 'fact',
      importance = 5,
      expiresAt = null,
      createdBy = 'system'
    } = options;

    await db.query(`
      INSERT INTO project_memory (project_id, memory_type, key, value, importance, expires_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (project_id, key)
      DO UPDATE SET value = $4, importance = $5, updated_at = CURRENT_TIMESTAMP
    `, [projectId, type, key, value, importance, expiresAt, createdBy]);
  }

  // Retrieve facts for LLM context
  async getContext(projectId, options = {}) {
    const { limit = 20, minImportance = 3 } = options;

    const result = await db.query(`
      SELECT memory_type, key, value, importance
      FROM project_memory
      WHERE project_id = $1
        AND importance >= $2
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY importance DESC, updated_at DESC
      LIMIT $3
    `, [projectId, minImportance, limit]);

    return this._formatForLLM(result.rows);
  }

  // Format memories into LLM-readable context
  _formatForLLM(memories) {
    const sections = {
      fact: [],
      decision: [],
      blocker: [],
      preference: [],
      insight: []
    };

    memories.forEach(m => {
      sections[m.memory_type]?.push(`${m.key}: ${m.value}`);
    });

    let context = 'ACTIVE PROJECT MEMORY:\n\n';

    if (sections.blocker.length) {
      context += 'Current Blockers:\n' + sections.blocker.join('\n') + '\n\n';
    }
    if (sections.decision.length) {
      context += 'Recent Decisions:\n' + sections.decision.join('\n') + '\n\n';
    }
    if (sections.preference.length) {
      context += 'User Preferences:\n' + sections.preference.join('\n') + '\n\n';
    }
    if (sections.fact.length) {
      context += 'Key Facts:\n' + sections.fact.join('\n') + '\n\n';
    }
    if (sections.insight.length) {
      context += 'Insights:\n' + sections.insight.join('\n') + '\n\n';
    }

    return context;
  }

  // Auto-prune low-importance or expired memories
  async prune(projectId) {
    // Remove expired memories
    await db.query(`
      DELETE FROM project_memory
      WHERE project_id = $1 AND expires_at < CURRENT_TIMESTAMP
    `, [projectId]);

    // If over limit, remove lowest importance memories
    const count = await this._getMemoryCount(projectId);
    const MAX_MEMORIES = 50;

    if (count > MAX_MEMORIES) {
      await db.query(`
        DELETE FROM project_memory
        WHERE id IN (
          SELECT id FROM project_memory
          WHERE project_id = $1
          ORDER BY importance ASC, updated_at ASC
          LIMIT $2
        )
      `, [projectId, count - MAX_MEMORIES]);
    }
  }

  // Extract facts from conversation and store
  async extractAndStore(projectId, conversationMessages) {
    const prompt = `Extract key facts from this conversation that should be remembered:
    - User preferences (work style, communication, constraints)
    - Important decisions made
    - Blockers or challenges mentioned
    - Insights about the user or project

    Format as JSON array: [{ type, key, value, importance }]`;

    const extraction = await generateStructuredOutput([
      { role: 'system', content: prompt },
      ...conversationMessages
    ]);

    for (const fact of extraction) {
      await this.remember(projectId, fact.key, fact.value, {
        type: fact.type,
        importance: fact.importance
      });
    }
  }
}
```

**Management Rules:**
- Max 50 memories per project
- Auto-prune when over limit (remove lowest importance + oldest)
- Importance scoring: 1-10
  - 10: Critical project constraint ("Budget is $10k")
  - 8-9: Major decisions or blockers
  - 5-7: Useful context
  - 1-4: Nice-to-know (pruned first)
- Some memories expire (temporary blockers, time-bound facts)
- Extract facts every 10 messages using LLM

**Example Memories:**
```javascript
// User preference
remember(projectId, 'work_hours', 'User works 6am-2pm EST', {
  type: 'preference',
  importance: 7
});

// Active blocker
remember(projectId, 'api_access_pending', 'Waiting for Stripe API keys from client', {
  type: 'blocker',
  importance: 9,
  expiresAt: '2024-12-01' // Expected resolution date
});

// Key decision
remember(projectId, 'framework_choice', 'Decided to use React instead of Vue', {
  type: 'decision',
  importance: 8
});

// Insight
remember(projectId, 'user_pattern', 'User tends to overcommit - suggest smaller tasks', {
  type: 'insight',
  importance: 6
});
```

---

## Tier 3: Long-Term Memory (Strategic Knowledge Graph)

### Purpose
Strategic memory - patterns, relationships, and learned knowledge that persists across project phases.

### Contents
- Concept relationships (e.g., "React" relates to "Frontend", "Component-based")
- User behavior patterns (cross-project)
- Domain knowledge accumulated
- Historical outcomes and lessons learned
- Skill assessments and growth areas

### Implementation

**Database Schema:**
```sql
-- Entities: Concepts, skills, patterns
CREATE TABLE knowledge_entities (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL, -- 'concept', 'skill', 'pattern', 'lesson'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(entity_type, name)
);

-- Relationships: How entities connect
CREATE TABLE knowledge_relationships (
  id SERIAL PRIMARY KEY,
  from_entity_id INTEGER REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  to_entity_id INTEGER REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL, -- 'requires', 'relates_to', 'blocks', 'enables'
  strength FLOAT DEFAULT 1.0, -- 0-1 confidence
  evidence TEXT, -- Why we think this relationship exists
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(from_entity_id, to_entity_id, relationship_type)
);

-- Link entities to projects (what's relevant to this project?)
CREATE TABLE project_knowledge_links (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  entity_id INTEGER REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  relevance FLOAT DEFAULT 1.0, -- How relevant is this entity to this project?
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(project_id, entity_id)
);

-- User-level patterns (cross-project)
CREATE TABLE user_patterns (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  pattern_type VARCHAR(50) NOT NULL, -- 'work_style', 'communication', 'goal_setting', 'completion_rate'
  pattern_data JSONB NOT NULL,
  confidence FLOAT DEFAULT 0.5, -- How confident are we in this pattern?
  sample_size INTEGER DEFAULT 1, -- How many data points support this?
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, pattern_type)
);

CREATE INDEX idx_knowledge_entities_type ON knowledge_entities(entity_type);
CREATE INDEX idx_knowledge_relationships_from ON knowledge_relationships(from_entity_id);
CREATE INDEX idx_knowledge_relationships_to ON knowledge_relationships(to_entity_id);
CREATE INDEX idx_project_knowledge_relevance ON project_knowledge_links(project_id, relevance DESC);
```

**Service: `LongTermMemory.js`**
```javascript
class LongTermMemory {
  // Add concept to knowledge graph
  async addConcept(name, description, metadata = {}) {
    const result = await db.query(`
      INSERT INTO knowledge_entities (entity_type, name, description, metadata)
      VALUES ('concept', $1, $2, $3)
      ON CONFLICT (entity_type, name) DO UPDATE SET description = $2, metadata = $3
      RETURNING id
    `, [name, description, metadata]);

    return result.rows[0].id;
  }

  // Link concepts
  async linkConcepts(fromName, toName, relationshipType, strength = 1.0, evidence = '') {
    const from = await this._getOrCreateConcept(fromName);
    const to = await this._getOrCreateConcept(toName);

    await db.query(`
      INSERT INTO knowledge_relationships (from_entity_id, to_entity_id, relationship_type, strength, evidence)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (from_entity_id, to_entity_id, relationship_type)
      DO UPDATE SET strength = $4, evidence = $5
    `, [from, to, relationshipType, strength, evidence]);
  }

  // Get relevant knowledge for project
  async getProjectContext(projectId, options = {}) {
    const { maxEntities = 10 } = options;

    // Get entities linked to this project, sorted by relevance
    const entities = await db.query(`
      SELECT e.name, e.description, e.metadata, pkl.relevance
      FROM knowledge_entities e
      JOIN project_knowledge_links pkl ON e.id = pkl.entity_id
      WHERE pkl.project_id = $1
      ORDER BY pkl.relevance DESC
      LIMIT $2
    `, [projectId, maxEntities]);

    // Get relationships between these entities
    const entityIds = entities.rows.map(e => e.id);
    const relationships = await this._getRelationshipsBetween(entityIds);

    return this._formatKnowledgeForLLM(entities.rows, relationships);
  }

  // Infer new relationships from conversation
  async inferFromConversation(projectId, messages) {
    // Use LLM to extract concepts and relationships mentioned
    const prompt = `Extract concepts and their relationships from this conversation.

    Identify:
    1. Key concepts/technologies/skills mentioned
    2. How they relate (requires, enables, blocks, relates_to)
    3. Confidence in each relationship (0-1)

    Return JSON: { concepts: [], relationships: [] }`;

    const inference = await generateStructuredOutput([
      { role: 'system', content: prompt },
      ...messages
    ]);

    // Add to knowledge graph
    for (const concept of inference.concepts) {
      await this.addConcept(concept.name, concept.description);
    }

    for (const rel of inference.relationships) {
      await this.linkConcepts(
        rel.from,
        rel.to,
        rel.type,
        rel.confidence,
        `Inferred from conversation on ${new Date().toISOString()}`
      );
    }
  }

  // Track user patterns across projects
  async updateUserPattern(userId, patternType, patternData) {
    await db.query(`
      INSERT INTO user_patterns (user_id, pattern_type, pattern_data, sample_size)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (user_id, pattern_type) DO UPDATE SET
        pattern_data = user_patterns.pattern_data || $3,
        sample_size = user_patterns.sample_size + 1,
        confidence = LEAST(1.0, (user_patterns.sample_size + 1) * 0.1),
        updated_at = CURRENT_TIMESTAMP
    `, [userId, patternType, patternData]);
  }

  // Get user patterns for personalization
  async getUserPatterns(userId) {
    const result = await db.query(`
      SELECT pattern_type, pattern_data, confidence, sample_size
      FROM user_patterns
      WHERE user_id = $1 AND confidence > 0.3
      ORDER BY confidence DESC
    `, [userId]);

    return result.rows;
  }

  // Format knowledge graph for LLM context
  _formatKnowledgeForLLM(entities, relationships) {
    let context = 'RELEVANT KNOWLEDGE:\n\n';

    // List concepts
    context += 'Concepts:\n';
    entities.forEach(e => {
      context += `- ${e.name}: ${e.description}\n`;
    });

    // Show relationships
    if (relationships.length > 0) {
      context += '\nRelationships:\n';
      relationships.forEach(r => {
        context += `- ${r.from_name} ${r.relationship_type} ${r.to_name}\n`;
      });
    }

    return context;
  }
}
```

**Management Rules:**
- Concepts accumulate over time (not pruned)
- Weak relationships (strength < 0.3) get pruned monthly
- User patterns require 3+ data points before confident
- Only top 10 most relevant entities included in LLM context
- Background job: Infer new relationships weekly from completed conversations

**Example Knowledge Graph:**
```
[React] --requires--> [JavaScript]
[React] --relates_to--> [Component-based Architecture]
[React] --enables--> [Interactive UIs]
[Redux] --requires--> [React]
[Redux] --blocks--> [Simple State Management] (if overused)

User Pattern: "completion_rate"
{
  "morning_tasks": 0.85,
  "afternoon_tasks": 0.60,
  "evening_tasks": 0.30
} --> Insight: Suggest important tasks in morning

User Pattern: "work_style"
{
  "prefers_small_tasks": true,
  "avg_task_duration": 25,
  "break_frequency": "hourly"
} --> Insight: Suggest 25-min tasks with hourly check-ins
```

---

## Integration: How All 3 Tiers Work Together

### Context Building for LLM

When user sends a message, we build context in this order:

```javascript
async function buildCompleteLLMContext(projectId, userId, conversationId) {
  const parts = [];

  // 1. System prompt (persona + structured elements instructions)
  parts.push(await PersonaPromptBuilder.buildPrompt(persona, project));

  // 2. TIER 3: Strategic knowledge (10 most relevant concepts)
  const longTermContext = await LongTermMemory.getProjectContext(projectId, { maxEntities: 10 });
  parts.push(longTermContext);

  // 3. TIER 3: User patterns (cross-project learnings)
  const userPatterns = await LongTermMemory.getUserPatterns(userId);
  if (userPatterns.length > 0) {
    parts.push(formatUserPatterns(userPatterns));
  }

  // 4. TIER 2: Tactical memory (current sprint/phase facts)
  const mediumTermContext = await MediumTermMemory.getContext(projectId, { limit: 20 });
  parts.push(mediumTermContext);

  // 5. TIER 1: Recent conversation (last 10 messages + summary)
  const conversationContext = await ShortTermMemory.getConversationContext(conversationId, 10);
  parts.push(...conversationContext);

  return parts;
}
```

**Token Budget:**
- System prompt: ~500 tokens
- Tier 3 (Long-term): ~300 tokens (10 concepts + relationships)
- Tier 3 (User patterns): ~200 tokens
- Tier 2 (Medium-term): ~500 tokens (20 memories)
- Tier 1 (Short-term): ~2000 tokens (10 messages + summary)
- User message: ~200 tokens
- **Total input: ~3700 tokens** (well under GPT-4's 8k context window)
- Leaves ~4000 tokens for response

### Memory Update Flow

After each AI response:

```javascript
async function updateMemories(projectId, userId, conversationId, newMessages) {
  // TIER 1: Auto-summarize if conversation getting long
  const messageCount = await getMessageCount(conversationId);
  if (messageCount > 50 && messageCount % 20 === 0) {
    await ShortTermMemory.summarizeOldMessages(conversationId);
  }

  // TIER 2: Extract new facts every 10 messages
  if (messageCount % 10 === 0) {
    await MediumTermMemory.extractAndStore(projectId, newMessages);
    await MediumTermMemory.prune(projectId); // Keep under 50 memories
  }

  // TIER 3: Infer concepts weekly (background job)
  // Run separately to avoid slowing down conversation
}
```

---

## Practical Examples

### Example 1: Weight Loss Project

**Tier 1 (Short-term):**
```
Recent messages:
- User: "I ate pizza last night"
- AI: "That's okay! What triggered that decision?"
- User: "Stressful day at work"
- AI: "Let's identify your stress triggers..."
```

**Tier 2 (Medium-term):**
```
ACTIVE PROJECT MEMORY:

Current Blockers:
- gym_access: "Gym closed for renovations until Dec 15"

Recent Decisions:
- calorie_target: "Set daily target at 1800 calories"
- workout_schedule: "M/W/F cardio, T/Th strength"

User Preferences:
- meal_prep_day: "User preps meals on Sunday"
- tracking_app: "Uses MyFitnessPal"

Insights:
- stress_eating_trigger: "User stress-eats when work is overwhelming"
- adherence_pattern: "80% adherence on weekdays, 50% on weekends"
```

**Tier 3 (Long-term):**
```
RELEVANT KNOWLEDGE:

Concepts:
- Calorie Deficit: Creating energy imbalance for weight loss
- Stress Management: Techniques to reduce emotional eating
- Progressive Overload: Gradually increasing workout intensity

Relationships:
- Stress Management enables Calorie Deficit
- Sleep Quality affects Calorie Deficit
- Consistency requires Habit Formation

User Patterns (cross-project):
- work_style: { "morning_productive": true, "evening_low_energy": true }
- completion_rate: { "small_tasks": 0.85, "large_tasks": 0.40 }
--> Insight: Suggest small, morning-focused tasks
```

### Example 2: Software Project

**Tier 1 (Short-term):**
```
Summary of older messages: "User is building a React app with Firebase auth. Decided on Tailwind for styling. Completed user login component."

Recent messages:
- User: "How do I protect routes?"
- AI: "You'll need a PrivateRoute component..."
```

**Tier 2 (Medium-term):**
```
ACTIVE PROJECT MEMORY:

Current Blockers:
- firebase_quota: "Free tier limit reached, upgrade pending"

Recent Decisions:
- state_management: "Using Context API instead of Redux for MVP"
- deployment: "Deploy to Vercel for easy CI/CD"

Key Facts:
- tech_stack: "React 18, Firebase, Tailwind CSS, Vercel"
- deadline: "MVP launch target: Jan 15, 2025"

Preferences:
- code_style: "User prefers functional components over class components"
```

**Tier 3 (Long-term):**
```
RELEVANT KNOWLEDGE:

Concepts:
- React: Component-based UI library
- Firebase: BaaS platform for auth and database
- Protected Routes: Authentication-gated navigation

Relationships:
- Protected Routes requires Authentication
- Firebase Auth enables Protected Routes
- Context API relates_to State Management
- Context API blocks Large-scale State (if misused)

User Patterns:
- skill_level: { "react": "intermediate", "backend": "beginner" }
- learning_style: { "prefers_examples": true, "likes_documentation": false }
--> Insight: Provide code examples over theory
```

---

## Implementation Priority

### Phase 1 (Now)
1. ✅ Tier 1: Basic (already have recent messages)
2. 🔨 Tier 1: Add conversation summaries
3. 🔨 Tier 2: Create project_memory table
4. 🔨 Tier 2: Basic remember/recall functions
5. 🔨 Integration: Include Tier 2 in LLM context

### Phase 2 (Next Week)
6. Tier 2: Auto-extraction from conversations
7. Tier 2: Importance scoring and pruning
8. Tier 1: Smart summarization with LLM
9. Integration: Token budget management

### Phase 3 (Later)
10. Tier 3: Knowledge graph schema
11. Tier 3: Concept extraction
12. Tier 3: Relationship inference
13. Tier 3: User pattern tracking
14. Background jobs: Weekly knowledge graph updates

---

## Success Metrics

**Memory System Working Well:**
- ✅ Persona remembers user's work hours without being reminded
- ✅ Persona recalls past decisions when making new suggestions
- ✅ Persona identifies patterns ("You usually struggle on weekends")
- ✅ Persona connects concepts ("Since you know React, learning Next.js will be easier")
- ✅ Token usage stays under 4k for input context

**Memory System Needs Tuning:**
- ❌ Persona forgets important constraints
- ❌ Persona repeats suggestions user already rejected
- ❌ Context window overflow errors
- ❌ Irrelevant memories taking up space
- ❌ No pattern recognition across conversations

This memory architecture enables the AI to act as a true long-term partner, not just a chatbot that forgets everything between sessions!
