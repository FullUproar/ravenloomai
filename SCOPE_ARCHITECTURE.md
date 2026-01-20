# RavenLoom Scope Architecture

## Vision

Transform RavenLoom from channel-based chat to **scope-based knowledge management**. Scopes provide hierarchical context for knowledge storage, retrieval, and AI conversation.

---

## Core Concepts

### What is a Scope?

A scope is a **knowledge boundary** that:
- Contains facts, decisions, and documents
- Has a parent scope (except team root)
- Knows about its child scopes (via summaries)
- Provides context for Raven conversations

### Scope Types

```
Team Scope (root)
├── Project Scopes (created by users)
│   └── Sub-scopes (nested as needed)
└── Private Scopes (one per user, parallel to each public scope)
```

**Public scopes** (Team, Project, Sub-scope):
- Visible to all team members
- Knowledge is shared
- Raven conversations are shared (like threads)

**Private scopes**:
- One private scope per user per public scope
- Only owner can see
- Can READ from coupled public scope
- All WRITES stay private

---

## Knowledge Flow

### Writing (Creating Knowledge)

Knowledge is always created at the **current scope level**:

```
User in "Product X" scope says: "@raven remember the launch is Q3"
→ Fact created with scopeId = Product X scope
```

```
User in "Private + Product X" scope says: "@raven remember John is struggling with this"
→ Fact created with scopeId = User's private scope (coupled to Product X)
```

### Reading (Querying Knowledge)

Reading flows **down** the hierarchy:

```
Query in "Product X V2 Launch" scope searches:
1. V2 Launch scope (most specific)
2. Product X scope (parent)
3. Team scope (root)
```

Private scopes read from their coupled public scope + ancestors:

```
Query in "Private + Product X" scope searches:
1. User's private scope (coupled to Product X)
2. Product X scope
3. Team scope
```

### Cross-Scope Queries (Tool Calls)

Parent scopes can query child scopes via tool calls:

```
User in Team scope: "When is Product X releasing?"

Raven (Team scope):
1. Searches Team knowledge → nothing specific
2. Checks child scope summaries → "Product X" is relevant
3. Tool call: queryChildScope("Product X", "release date")
4. Returns: "Based on the Product X scope: V2 targets Q3 2026"
5. Suggests: "Switch to Product X scope for details?"
```

This keeps parent context clean while still being helpful.

---

## Scope Data Model

```javascript
Scope = {
  id: UUID,
  teamId: UUID,
  parentScopeId: UUID | null,    // null for team root scope

  type: 'team' | 'project' | 'private',
  name: String,
  summary: String,               // AI-generated or user-provided

  // For private scopes
  ownerId: UUID | null,          // user who owns this private scope
  coupledScopeId: UUID | null,   // which public scope this is private for

  createdAt: DateTime,
  updatedAt: DateTime
}

// Every team automatically gets:
// - One root team scope (type: 'team', parentScopeId: null)
// - One private scope per user coupled to team scope
```

### Fact Model Updates

```javascript
Fact = {
  id: UUID,
  teamId: UUID,
  scopeId: UUID,                 // NEW: which scope owns this fact

  content: String,
  factType: 'fact' | 'decision' | 'sop' | ...,

  // ... existing fields
}
```

### Scope Summary Updates

Summaries are auto-generated or user-edited:

```javascript
// Triggered when:
// - Scope is created (initial summary from name/description)
// - Significant knowledge is added
// - User manually updates

generateScopeSummary(scopeId) {
  // AI summarizes: what is this scope about?
  // Used by parent scopes to know when to delegate queries
}
```

---

## Raven Behavior

### Conversation Threading

Each scope has its own Raven conversation:

```
Team Scope → Team Raven thread
Product X Scope → Product X Raven thread
Private + Team → User's private Team thread
Private + Product X → User's private Product X thread
```

Switching scopes = switching threads. History does not follow.

### Context Window

When Raven responds in a scope:

1. **Primary context**: Current scope's knowledge
2. **Secondary context**: Parent scope knowledge (inherited)
3. **Awareness context**: Child scope summaries (for delegation)
4. **Private overlay**: If in private mode, user's private facts

### The "Scope Suggestion" Pattern

```
User: "What's the status of the beta?"
Raven: "I don't have specific beta information at the team level,
        but I see there's a 'Product X > V2 Launch' scope that
        might have details. Would you like to:

        1. Switch to that scope for detailed discussion
        2. Let me query that scope and summarize here"
```

---

## Feature Integration

### Research (Learning Objectives)

Learning Objectives are **scoped**:

```javascript
LearningObjective = {
  // ... existing fields
  scopeId: UUID,    // NEW: which scope this research belongs to
}
```

**Behavior:**
- Creating a research objective in "Product X" scope → LO scoped to Product X
- Follow-up questions research within that scope's context
- Knowledge generated gets stored at that scope level
- Research can READ from parent scopes (for context)

**UI:**
- Research view shows LOs for current scope
- Option to see "all research" across scopes (flattened view)

### Ask the Team

Questions are **scoped**:

```javascript
TeamQuestion = {
  // ... existing fields
  scopeId: UUID,    // NEW: which scope this question is about
}
```

**Behavior options:**

**Option A: Questions visible by scope**
- Question asked in "Product X" scope → only visible when in that scope
- Team members in that scope see and can answer
- Keeps questions contextual

**Option B: Questions always team-wide, answers scoped**
- All questions visible at team level
- When marking an answer as knowledge, choose which scope
- More visibility, but noisier

**Recommendation:** Option A - scoped questions. If you need team-wide visibility, ask at team scope level.

### Recalls (Temporal Knowledge)

Recalls are **scoped**:

```javascript
Recall = {
  // ... existing fields
  scopeId: UUID,    // NEW: which scope this recall belongs to
}
```

**Behavior:**
- Recall created in "Product X" scope → surfaces when in that scope
- Recall at team scope → surfaces regardless of current scope
- Private recalls → only surface for that user

---

## UI / Navigation

### Proposed Navigation Structure

```
┌─────────────────────────────────────┐
│ [Scope Selector: Team ▼]            │  ← Dropdown to switch scopes
│   ☐ Include Private                 │  ← Toggle private overlay
├─────────────────────────────────────┤
│                                     │
│ 🪶 Raven                            │  ← Chat with Raven (in current scope)
│                                     │
│ 📚 Knowledge                        │  ← Browse knowledge (filtered by scope)
│    • Facts & Decisions              │
│    • Documents                      │
│                                     │
│ 🔔 Recalls                          │  ← Upcoming recalls (filtered by scope)
│                                     │
│ 🔬 Research                         │  ← Learning objectives (filtered by scope)
│                                     │
│ ❓ Ask the Team                     │  ← Q&A (filtered by scope)
│                                     │
│ ⚙️ Scope Settings                   │  ← Manage current scope
│    • Create sub-scope               │
│    • Edit summary                   │
│    • Members (future: scope-level)  │
│                                     │
├─────────────────────────────────────┤
│ Scopes                              │  ← Quick scope navigation
│   📁 Product X                      │
│      📁 V2 Launch                   │
│   📁 Product Y                      │
│   + New Scope                       │
└─────────────────────────────────────┘
```

### Scope Selector Behavior

- Shows current scope path: `Team > Product X > V2 Launch`
- Dropdown shows full scope tree
- "Include Private" checkbox toggles private overlay
- When private is enabled, badge shows: `🔒 Private`

### Creating Knowledge

When saving a fact/decision, default to current scope:

```
"Save to: [Current Scope ▼]"
  - Team (root)
  - Product X
  - V2 Launch ← current, default
  - 🔒 Private
```

---

## Migration Path

### Phase 1: Database Schema
1. Create `scopes` table
2. Add `scope_id` to facts, learning_objectives, team_questions, alerts (recalls)
3. Create default team scope for each team
4. Create default private scope for each user in each team
5. Migrate existing data to team scope

### Phase 2: Backend Services
1. Create ScopeService
2. Update KnowledgeService to be scope-aware
3. Update AIService to handle scope context
4. Add scope-aware search/retrieval
5. Implement cross-scope query tool

### Phase 3: Frontend
1. Replace channel navigation with scope navigation
2. Add scope selector component
3. Update all views to filter by scope
4. Add private toggle
5. Update knowledge creation to include scope selection

### Phase 4: Polish
1. Auto-generate scope summaries
2. Smart scope suggestions in Raven
3. Scope-aware notifications/recalls

---

## Design Decisions

### 1. Knowledge Visibility (Future: V2)

For specialized use cases (e.g., medical device company with Sales scope):

| Tier | Behavior | Example |
|------|----------|---------|
| **Serve** | Actively surface, explain fully | Sales-appropriate product info |
| **Reference** | Acknowledge exists, don't elaborate | "Technical docs exist in Engineering" |
| **Restrict** | Don't mention at all | Sensitive internal testing data |

This isn't binary permissions - it's **knowledge classification per audience**.

```javascript
// Future: V2
ScopeKnowledgeRule = {
  scopeId: "sales-scope",
  sourceScope: "engineering-scope",
  visibility: "serve" | "reference" | "restrict"
}
```

**V1**: All team members see all scopes. Keep it simple.

### 2. Scope Archival

Self-solving: If scope summaries are accurate, old/completed projects naturally become less relevant. Raven won't suggest them unless asked. No explicit archive needed.

Future consideration: "Archive" flag that removes from quick navigation but keeps searchable.

### 3. Private Scope Granularity

**Decision**: One private scope per public scope.

When user switches to "Product X" scope with private enabled:
- Reading: Private-Product-X + Product X + Team
- Writing: Always to Private-Product-X

This keeps private context organized by project.

### 4. Team Scope Conversation Model

Team scope Raven is **not Slack**. It's a supervised AI model:

```
┌─────────────────────────────────────────────────┐
│ Team Scope: Product X                           │
├─────────────────────────────────────────────────┤
│ Alice: @raven what's the release date?          │
│                                                 │
│ 🪶 Raven: Based on our planning docs, V2 is    │
│    targeting Q3 2026.                           │
│                                                 │
│ Bob: (replying to Raven) Actually, we pushed   │
│    to Q4 after the last meeting.                │
│                                                 │
│ 🪶 Raven: Thanks for the correction! I've      │
│    updated my knowledge. V2 is now targeting   │
│    Q4 2026.                                     │
└─────────────────────────────────────────────────┘
```

**Key characteristics:**
- Raven-centric: Raven is the primary responder
- Collaborative: Team members can correct/clarify
- Corrections become knowledge: Human feedback trains the system
- Not free-form chat: Purpose is knowledge Q&A, not general discussion

**Private Raven**: Pure 1-1 chat. Just user and Raven.

### 5. Correction Flow (Supervised Learning)

Raven learns from team conversations through a **propose-confirm** pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│ John: What is the process for filing a new design template?     │
│                                                                 │
│ 🪶 Raven: File form 1234A                                       │
│     │                                                           │
│     └─ reply from John: Didn't we just revise this to          │
│        version B? ie 1234B?                                     │
│     │                                                           │
│     └─ reply from Daniel: @Jen would know                       │
│     │                                                           │
│     └─ reply from Jen: Yes, this should now be 1234B            │
│     │                                                           │
│     └─ 🪶 Raven: Seems like this knowledge needs to be          │
│        updated. Shall I remember that new design templates      │
│        are filed with updated form 1234B? I'll also remember    │
│        that the previous version was 1234A and is now           │
│        superseded.                                              │
│     │                                                           │
│     └─ reply from John: Yes, thank you.                         │
│     │                                                           │
│     └─ 🪶 Raven: OK, I've remembered it.                        │
└─────────────────────────────────────────────────────────────────┘
```

**How it works:**

1. **Raven monitors replies** to its own messages
2. **Context clues trigger proposal**:
   - "Didn't we change this?"
   - "Actually, it's now..."
   - Authoritative confirmation from a team member
3. **Raven proposes specific update**:
   - New knowledge value
   - What it supersedes (audit trail)
   - Explicit confirmation request
4. **Human confirms** → Raven saves to current scope
5. **Fallback**: If Raven misses clues, user can always say `@raven remember...`

**What gets saved:**
```javascript
// New fact
{
  content: "New design templates are filed with form 1234B",
  scopeId: currentScope,
  supersedes: previousFactId  // Links to the old fact
}

// Old fact updated
{
  id: previousFactId,
  status: "superseded",
  supersededBy: newFactId,
  supersededAt: timestamp
}
```

This creates an audit trail - you can see what changed and when.

---

## Open Questions

1. **Cross-scope knowledge**: Can a fact exist in multiple scopes?
   - Current thinking: No, facts live in one scope
   - Alternative: Facts can be "linked" to multiple scopes

---

## Summary

The scope model transforms RavenLoom from a chat tool into a **hierarchical knowledge system**:

- **Scopes** replace channels as the primary organizational unit
- **Knowledge flows down** (child scopes inherit parent knowledge)
- **Summaries flow up** (parents know what children are about)
- **Private is parallel** (personal memory at every level)
- **Raven is scope-aware** (context changes with scope)

This enables focused, context-appropriate conversations without cognitive overload from unrelated information.
