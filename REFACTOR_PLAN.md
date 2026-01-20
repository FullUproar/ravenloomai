# RavenLoom Refactor: Intelligent Librarian Focus

## Vision

Transform RavenLoom from a "Slack + Asana + AI hybrid" into a focused **"Intelligent Librarian for Institutional Knowledge"**.

Core concept: **Knowledge + Proactive Recall**
- Evergreen knowledge: Facts, Decisions, Documents (always available when asked)
- Temporal knowledge: Recalls (knowledge with a delivery schedule)

A "task" is not a work item to manage—it's **knowledge the system should proactively surface at a specific time**.

---

## Future-Proof Design Note

Recall triggers should support multiple trigger types:
- **V1: Time-based** - "surface this knowledge on [datetime]"
- **V2: Event-based** - "surface this when [matching knowledge] appears"

Schema should accommodate this:
```javascript
Recall = {
  factId,                    // The knowledge to surface
  triggerType: "time",       // V1: only "time", V2: add "event"
  triggerCondition: {        // Flexible condition object
    datetime: "2026-01-20"   // V1
    // V2: matchPattern, entityType, etc.
  },
  status: "pending" | "triggered" | "completed",
  assignedTo                 // Optional: who to notify
}
```

---

## What to DELETE

### Backend Services (16 services, ~280KB)

| Service | Size | Reason |
|---------|------|--------|
| PMService.js | 55KB | Full PM suite (Gantt, WBS, Eisenhower, etc.) |
| TaskService.js | 11KB | PM-style task management |
| GoalService.js | 11KB | Goal hierarchy |
| ProjectService.js | 4KB | Project management |
| CalendarService.js | 7KB | Calendar/events |
| GoogleCalendarService.js | 9KB | Google Calendar sync |
| CeremonyService.js | 21KB | Morning Focus, Standups, Weekly Review |
| ProactiveService.js | 24KB | Task health, nudges, risk prediction |
| DigestBriefingService.js | 20KB | AI-generated briefings |
| UserDigestService.js | 17KB | Priority digest |
| DigestService.js | 6KB | Digest aggregation |
| FocusService.js | 13KB | Focus items, spotlights |
| WorkContextService.js | 21KB | Work context aggregation |
| PriorityService.js | 16KB | Priority inheritance |
| UXPreferencesService.js | 20KB | AI UI personalization |
| MeetingPrepService.js | 7KB | Meeting prep automation |

### Frontend Components

**Delete entirely:**
- `frontend/src/components/pm/` (entire folder)
  - EisenhowerMatrix.jsx
  - GanttChart.jsx
  - Milestones.jsx
  - TeamWorkload.jsx
  - TimeBlocks.jsx
  - WorkBreakdownStructure.jsx
  - WBSDraftEditor.jsx
  - PersonaSelector.jsx
  - ProModeSettings.jsx
  - PMStyles.css
  - index.js

- `frontend/src/components/`
  - WorkDashboard.jsx (PM work view)
  - GoalTree.jsx (Goal visualization)
  - DigestPage.jsx (AI briefings)

- `frontend/src/`
  - CalendarView.jsx
  - EventModal.jsx

### TeamDashboard Views to Remove

Remove these views and their nav items:
- `tasks` → Replace with `recalls`
- `goals` → Delete
- `projects` → Delete
- `calendar` → Delete
- `digest` → Delete (keep `raven` copilot)
- `insights` → Delete
- `workload` → Delete
- `eisenhower` → Delete
- `gantt` → Delete
- `timeblocks` → Delete
- `milestones` → Delete

### GraphQL Schema Removals

**Types to remove:**
- Goal, GoalInput, GoalUpdate, GoalTask, GoalProject
- Project, ProjectInput, ProjectUpdate, ProjectTemplate
- Task (replace with Recall), TaskInput, TaskUpdate, TaskComment, TaskActivity
- Event, EventInput (calendar)
- MorningFocus, DailyStandup, WeeklyReview
- ProactiveNudge, TaskHealth, WorkloadAnalysis
- UserDigest, DigestBriefing, FocusItem, BlockedTask
- TeamSpotlight, FocusPreferences, WorkDashboard, WorkContext
- TeamInsights, MeetingPrep
- UserAvailability, TimeOff, TaskContext (GTD)
- Milestone, TimeBlock, MeetingPreferences, SchedulingResult
- EisenhowerMatrix, GanttData, WorkloadHistogram
- WBSNode, WBSDraft
- UXPreferences, UserFeatureFlags (PM-related ones)

**Queries to remove:**
- goals, goal, goalTree
- projects, project
- tasks, task, myTasks, tasksByGoal
- events, event
- morningFocus, dailyStandup, weeklyReview
- proactiveNudges, taskHealth
- userDigest, digestBriefing
- focusItems, workContext, workDashboard
- teamInsights, meetingPrep
- userAvailability, milestones, timeBlocks
- eisenhowerMatrix, ganttData, teamWorkload
- wbsDrafts

**Mutations to remove:**
- createGoal, updateGoal, deleteGoal, linkTaskToGoal, etc.
- createProject, updateProject, deleteProject, etc.
- createTask, updateTask, deleteTask, completeTask, etc.
- createEvent, updateEvent, deleteEvent
- generateMorningFocus, completeMorningFocus
- generateDailyStandup, generateWeeklyReview
- dismissNudge, snoozeNudge
- All PM-related mutations

---

## What to KEEP

### Backend Services (Core ~210KB)

| Service | Size | Purpose |
|---------|------|---------|
| AIService.js | 67KB | @raven commands, embeddings, OpenAI |
| KnowledgeService.js | 10KB | Facts, decisions |
| KnowledgeGraphService.js | 26KB | GraphRAG, entity extraction |
| KnowledgeBaseService.js | 14KB | External source sync |
| DeepResearchService.js | 11KB | Complex Q&A |
| QuestionService.js | 9KB | Team Q&A |
| LearningObjectiveService.js | ~8KB | Research tool |
| MessageService.js | 66KB | Messaging, @raven parsing |
| ChannelService.js | 8KB | Channels |
| ThreadService.js | 5KB | Threads |
| TeamService.js | 11KB | Teams, invites |
| UserService.js | 15KB | User profiles |
| AlertService.js | 4KB | → Transform to RecallService |
| UploadService.js | 7KB | File uploads |
| DiscussionService.js | 2KB | Thread discussions |
| GoogleDriveService.js | 10KB | Knowledge base source |
| RateLimiterService.js | 7KB | Infrastructure |

### Frontend Components (Keep)

- `TeamDashboard.jsx` (heavily modify)
- `components/CommandPalette.jsx` (navigation)
- `components/RavenCopilot.jsx` (AI chat - core to librarian)
- `components/AIFocusSelector.jsx` (may simplify)
- `Login.jsx`, `App.jsx`, `main.jsx` (app shell)
- `HelpPage.jsx`, `InviteAccept.jsx` (utility)
- `PrivacyPolicy.jsx`, `TermsOfService.jsx` (legal)
- `Toast.jsx` (UI utility)

### TeamDashboard Views to Keep

- `chat` - Core messaging where knowledge is created
- `ask` - Q&A with knowledge base (core librarian feature)
- `raven` - AI copilot chat
- `knowledge` - Browse stored knowledge
- `learning` - Learning Objectives / research tool

### New View to Add

- `recalls` - Upcoming knowledge recalls (replaces tasks)

---

## What to TRANSFORM

### AlertService.js → RecallService.js

Current Alert:
```javascript
{
  message, triggerAt, recurrenceRule,
  relatedFactId, status, channelId, createdBy
}
```

New Recall:
```javascript
{
  // Link to knowledge
  factId,              // Required: the knowledge to surface

  // Trigger configuration (future-proof)
  triggerType: "time", // V1: only "time"
  triggerCondition: {
    datetime,          // When to surface
    recurrence         // Optional: repeat rule
  },

  // Status
  status: "pending" | "triggered" | "completed",
  triggeredAt,         // When it was surfaced
  completedAt,         // When marked done

  // Routing
  channelId,           // Where to surface (optional)
  assignedTo,          // Who to notify (optional)
  createdBy,

  // Metadata
  createdAt, updatedAt
}
```

Key changes:
1. `relatedFactId` → `factId` (required, not optional)
2. Add `triggerType` + `triggerCondition` (future-proof for event triggers)
3. Add `completed` status and `completedAt` timestamp
4. Keep `assignedTo` for personal recalls

### Database Migration

```sql
-- Rename alerts table to recalls
ALTER TABLE alerts RENAME TO recalls;

-- Add new columns
ALTER TABLE recalls ADD COLUMN trigger_type VARCHAR(20) DEFAULT 'time';
ALTER TABLE recalls ADD COLUMN trigger_condition JSONB;
ALTER TABLE recalls ADD COLUMN completed_at TIMESTAMP;

-- Make fact_id required for new recalls (keep nullable for migration)
-- Migrate existing data: create facts for alerts without related_fact_id

-- Update status enum to include 'completed'
-- Old: pending, sent, snoozed, cancelled
-- New: pending, triggered, completed, snoozed, cancelled
```

---

## Simplified Navigation Structure

```
RavenLoom (Librarian Mode)
├── Raven (AI Assistant)
│   └── Chat with the librarian
├── Channels
│   ├── #general
│   ├── #engineering
│   └── + Create Channel
├── Knowledge
│   ├── Browse Facts & Decisions
│   ├── Ask a Question
│   └── Learning Objectives (Research)
├── Recalls
│   ├── Upcoming
│   ├── Completed
│   └── + Create Recall
└── Settings
    ├── Team
    ├── Integrations (Google Drive)
    └── Admin
```

---

## Implementation Phases

### Phase 1: Backend Cleanup
1. Delete PM services (PMService, GoalService, ProjectService, etc.)
2. Delete productivity services (CeremonyService, ProactiveService, etc.)
3. Delete calendar services
4. Transform AlertService → RecallService
5. Clean up GraphQL schema (remove deleted types/queries/mutations)
6. Update resolvers

### Phase 2: Frontend Cleanup
1. Delete PM components folder
2. Delete CalendarView, EventModal, DigestPage, GoalTree, WorkDashboard
3. Strip TeamDashboard of deleted views
4. Simplify navigation to core views only

### Phase 3: Recalls UI
1. Create simple Recalls view (list of upcoming knowledge to surface)
2. Add "Create Recall" from facts/knowledge
3. Add recall completion flow
4. Integrate recall surfacing into Raven copilot

### Phase 4: Polish
1. Update @raven commands to work with new model
2. Clean up unused CSS
3. Update help documentation
4. Test knowledge flow end-to-end

---

## Estimated Reduction

- **Backend**: ~280KB removed → ~210KB remaining (57% reduction in services)
- **Frontend**: ~150KB+ removed (PM components, views)
- **GraphQL**: ~50+ types removed, ~100+ queries/mutations removed
- **Complexity**: From "everything app" to focused knowledge tool

---

## What This Enables

1. **Clearer value prop**: "The AI that remembers everything for your team"
2. **Simpler onboarding**: No PM features to explain
3. **Focused development**: All effort goes into knowledge quality
4. **Future expansion**: Event-based recalls, smarter retrieval, better AI

The goal isn't to build Slack or Asana. It's to build the **memory layer** that makes any team smarter.
