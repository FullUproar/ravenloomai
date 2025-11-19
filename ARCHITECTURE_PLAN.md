# RavenLoom Architecture Plan
## Making It Actually Work

### Core Principles
1. **Conversational First** - Chat is primary, UI is supportive
2. **Episode-Based** - Bounded interactions with closure, not endless scrolling
3. **Proactive** - System messages user at right times
4. **Intuitive** - Zero learning curve
5. **Mobile-Native** - Design for Android from day 1
6. **Memory-Enabled** - Never forget, never ask twice

---

## Phase 1: Fix The Foundation (CRITICAL)

### 1.1 Make AI Reliable
**Problem:** AI says it did things but doesn't actually do them

**Fix:**
- [ ] Add function call verification logging
- [ ] Make AI show what functions it's calling (transparent)
- [ ] Add "undo" capability for AI actions
- [ ] Strengthen function calling in system prompt with examples from actual failures

### 1.2 Project Dashboard (Replace Chat as Default)
**Problem:** No quick way to see "where am I?"

**Fix:**
- [ ] Create ProjectOverview component
- [ ] Show: Health, Next Actions (max 3), Blockers, Recent Progress
- [ ] Make this the DEFAULT view, not chat
- [ ] Add "Start Working" button that opens focused chat session

**Design:**
```
┌─────────────────────────────────┐
│ 🎯 Launch Fitness App           │
│ Health: 🟢 On Track             │
├─────────────────────────────────┤
│ UP NEXT                         │
│ ├─ Call vendor (due today)      │
│ ├─ Review mockups               │
│ └─ Set up staging               │
├─────────────────────────────────┤
│ ⚠️  BLOCKED                     │
│ └─ Auth integration (3 days)    │
├─────────────────────────────────┤
│ 📈 PROGRESS                     │
│ ├─ 12 tasks completed this week │
│ └─ 3 goals on track             │
├─────────────────────────────────┤
│ [Start Work Session] [Quick Add]│
└─────────────────────────────────┘
```

---

## Phase 2: Episode-Based Interaction

### 2.1 Work Sessions
**Concept:** Bounded work periods with focus

**Schema:**
```sql
CREATE TABLE work_sessions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  user_id VARCHAR(255),
  title VARCHAR(255), -- "MVP Launch Prep"
  focus_area TEXT, -- What we're working on
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_minutes INTEGER,
  tasks_completed INTEGER[],
  tasks_created INTEGER[],
  notes TEXT,
  summary TEXT, -- AI-generated summary
  mood VARCHAR(50), -- productive, struggling, blocked
  status VARCHAR(50) -- active, completed, abandoned
);
```

**Flow:**
1. User clicks "Start Work Session"
2. AI asks: "What are we focusing on?"
3. Session creates a scoped conversation
4. When done, creates summary card
5. Session collapses into history

### 2.2 Chat Episodes
**Problem:** Chat is endless scroll

**Fix:**
- [ ] Group messages into episodes (natural conversation breaks)
- [ ] Each episode has topic/title
- [ ] Episodes can be collapsed/expanded
- [ ] Can reopen past episodes

**Visual:**
```
┌─────────────────────────────────┐
│ 📝 Today's Work Session         │
│ Started 2 hours ago  [End]      │
│                                 │
│ [Active conversation here]      │
│                                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ ✓ Planning MVP Launch           │
│ 30 min • 3 tasks created        │
│ [Expand to see details]         │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ ✓ Weekly Review                 │
│ Yesterday • 5 tasks completed   │
└─────────────────────────────────┘
```

---

## Phase 3: Proactive Intelligence

### 3.1 Smart Notifications
**When to message user:**
- Morning: "Ready to plan your day?"
- Task due soon: "Vendor call in 1 hour"
- Blocked task aging: "Auth integration blocked for 3 days - need help?"
- End of day: "Quick recap?"
- Milestone approaching: "MVP demo in 2 days - on track?"

**Schema:**
```sql
CREATE TABLE proactive_messages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER,
  user_id VARCHAR(255),
  trigger_type VARCHAR(50), -- morning_checkin, task_due, blocked_aging
  scheduled_for TIMESTAMP,
  sent_at TIMESTAMP,
  message TEXT,
  response_action VARCHAR(50), -- start_session, review_tasks, etc.
  status VARCHAR(50) -- pending, sent, responded, dismissed
);
```

**Rules:**
- Max 3 messages per day (not annoying)
- Respect user's quiet hours
- Learn from response patterns (if user ignores morning messages, stop sending)

### 3.2 Context Awareness
**AI should know:**
- Time of day → morning = planning, evening = review
- Day of week → Friday = wrap up, Monday = plan week
- Project phase → early = brainstorm, late = execution
- User patterns → best work time, typical task duration

---

## Phase 4: Memory That's Useful

### 4.1 Memory UI
**Show user what AI remembers:**

```
┌─────────────────────────────────┐
│ 🧠 What I Know About This       │
│                                 │
│ EPISODES                        │
│ ├─ Discussed MVP scope (3 days)│
│ ├─ Reviewed design (last week) │
│ └─ Set launch date (2 weeks)   │
│                                 │
│ KEY FACTS                       │
│ ├─ Target: 100 beta users      │
│ ├─ Budget: $5k                 │
│ └─ Deadline: March 15          │
│                                 │
│ PREFERENCES                     │
│ ├─ Prefers morning standups    │
│ └─ Works best in 90min blocks  │
└─────────────────────────────────┘
```

### 4.2 Search Memory
- "What did we decide about user auth?"
- "When did we last discuss pricing?"
- AI pulls from episodic memory, shows relevant conversations

---

## Phase 5: Mobile-First Design

### 5.1 Navigation
**Keep it simple:**
```
Bottom Nav:
[Overview] [Work] [Tasks] [Settings]

Not:
[Chat] [Tasks] [Goals] [Metrics] [Connections] [Project] [Settings]
```

### 5.2 Gestures
- Swipe task right → Complete
- Swipe task left → Defer/Delete
- Long press → Quick actions
- Pull to start new session

### 5.3 Offline-First
- Queue actions when offline
- Sync when back online
- Show sync status clearly

---

## Implementation Priority

### Week 1: Foundation
1. Fix AI reliability (function calling)
2. Create Project Overview component
3. Make Overview the default view
4. Add "Start Work Session" flow

### Week 2: Sessions
1. Work session database schema
2. Session UI (start, active, end)
3. Session summaries
4. Session history

### Week 3: Episodes
1. Chat episode grouping
2. Episode collapse/expand
3. Episode reopen
4. Episode search

### Week 4: Proactive
1. Notification scheduler
2. Morning/evening check-ins
3. Task due reminders
4. Blocked task alerts

### Week 5: Memory
1. Memory UI component
2. Memory search
3. "What do you know about X?"
4. Memory editing/correction

### Week 6: Polish
1. Mobile gestures
2. Offline support
3. Performance optimization
4. Android prep

---

## Success Metrics

**User Completes Onboarding:**
- Has 1 project with clear goal
- Has 3 actionable tasks
- Completed 1 work session
- Responded to 1 proactive message

**Daily Active Use:**
- Opens app in morning
- Starts 1+ work session
- Completes 2+ tasks
- Feels progress (not overwhelmed)

**Intuitive = Zero Docs Needed:**
- New user figures it out in < 2 minutes
- Every action has clear outcome
- AI never confuses or frustrates

---

## Technical Stack Notes

**Frontend (Mobile-Ready):**
- React (works for web + React Native)
- Keep components simple, reusable
- Minimize dependencies
- Offline-first architecture

**Backend:**
- GraphQL (good for mobile battery)
- Subscriptions for proactive messages
- Efficient polling (not constant)

**Database:**
- PostgreSQL (keep it)
- Proper indexes for fast queries
- Archival strategy for old episodes

**AI:**
- Function calling (keep improving)
- Streaming responses (feels faster)
- Smart context windowing (don't send whole history)
- Memory-augmented generation

---

## The North Star

**User opens RavenLoom:**

1. Sees clear status: "3 things to do today, 1 blocker"
2. Clicks "Start Working"
3. AI: "Let's tackle the vendor call first?"
4. User works, AI helps, tasks get done
5. Session ends: "Great session! Completed 2 tasks, created 1."
6. User feels accomplished, closes app
7. Later: Proactive message "MVP demo tomorrow - ready?"
8. User feels supported, not nagged

**This is conversational productivity.**
**This is what RavenLoom should be.**
