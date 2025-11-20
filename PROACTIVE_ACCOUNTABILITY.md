# Proactive Accountability System

## Overview

The Proactive Accountability System transforms RavenLoom from a reactive tool into an active accountability partner. It monitors user activity patterns and proactively sends check-in messages when users haven't engaged with their projects.

## Key Features

### 🔒 Kill Switches (Cost Protection)
- **User-level kill switch**: Master toggle that disables all proactive features
- **Project-level kill switch**: Disable check-ins per project
- **Token budget limits**: Daily token usage caps to prevent runaway costs
- **Max check-ins per run**: Hard limit on check-ins per cron execution

### 📊 Activity Tracking
- Tracks last activity on projects (messages, tasks, sessions)
- Detects blocker signals in user messages (frustration keywords)
- Analyzes best work time patterns from session data
- Records when users repeatedly skip or reschedule tasks

### 💬 AI-Powered Check-Ins
- Generates contextual check-in messages using GPT-4o-mini
- Fallback templates when token budget is exhausted
- Respects user preferences and communication style
- Non-judgmental, curiosity-driven approach

### 🎯 Motivation Science Integration
- Implementation intentions (best work times)
- Pattern detection for intervention triggers
- Confidence scoring for detected patterns
- Long-term habit formation support

## Architecture

```
┌─────────────────┐
│  User Actions   │ (sendMessage, startSession, updateTask)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ ActivityTrackingService     │
│ - recordActivity()          │
│ - detectPatterns()          │
│ - getProjectsNeedingCheckIn()│
└────────────────┬────────────┘
                 │
                 ▼
┌──────────────────────────────┐        ┌───────────────────┐
│ ProactiveCheckInService      │────────▶│  OpenAI API       │
│ - generateCheckInMessage()   │        │  (gpt-4o-mini)    │
│ - processCheckIns() (CRON)   │        └───────────────────┘
│ - Token budget tracking      │
└──────────────────────────────┘
```

## Database Schema

### Users Table
```sql
ALTER TABLE users ADD COLUMN proactive_features_enabled BOOLEAN DEFAULT false;
```

### Projects Table
```sql
ALTER TABLE projects ADD COLUMN last_activity_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN last_check_in_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN check_ins_enabled BOOLEAN DEFAULT true;
```

### Activity Patterns Table
```sql
CREATE TABLE activity_patterns (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  pattern_type VARCHAR(50) NOT NULL,
  pattern_data JSONB NOT NULL,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confidence_score DECIMAL(3,2) DEFAULT 0.5
);
```

## Setup & Deployment

### 1. Run Database Migration

```bash
node backend/run-migration.js migrations/add_proactive_accountability_fields.sql
```

### 2. Configure Environment Variables

Add to `.env`:
```env
# Proactive Accountability Settings
DAILY_CHECKIN_TOKEN_BUDGET=10000        # Max tokens per day for check-ins
MAX_CHECKINS_PER_RUN=20                 # Max check-ins per cron execution
```

### 3. Enable for Test Users

Use GraphQL mutation to enable for specific users:

```graphql
mutation {
  setProactiveFeaturesEnabled(
    userId: "user_firebase_uid_here"
    enabled: true
  ) {
    success
    enabled
    message
  }
}
```

### 4. Schedule Cron Job

#### Option A: Heroku Scheduler
1. Install Heroku Scheduler addon:
   ```bash
   heroku addons:create scheduler:standard
   ```

2. Add job:
   ```bash
   heroku addons:open scheduler
   ```

3. Configure job to run 2-3 times per day:
   - **Command**: `node backend/scripts/run-proactive-checkins.js`
   - **Frequency**: Daily at 9:00 AM, 2:00 PM, 6:00 PM (adjust for your user timezone distribution)

#### Option B: Unix Cron
Edit crontab:
```bash
crontab -e
```

Add entries (adjust paths and times):
```cron
# Run proactive check-ins 3x daily
0 9,14,18 * * * cd /path/to/ravenloom/backend && node scripts/run-proactive-checkins.js >> /var/log/checkins.log 2>&1
```

#### Option C: Windows Task Scheduler
1. Open Task Scheduler
2. Create new task:
   - **Trigger**: Daily at 9:00 AM, 2:00 PM, 6:00 PM
   - **Action**: Start program
   - **Program**: `node`
   - **Arguments**: `C:\RavenLoom\ravenloom\backend\scripts\run-proactive-checkins.js`
   - **Start in**: `C:\RavenLoom\ravenloom\backend`

### 5. Manual Test Run

Test the system without waiting for cron:

```bash
cd backend
node scripts/run-proactive-checkins.js
```

Expected output:
```
🤖 ========================================
🤖 PROACTIVE CHECK-IN CRON JOB
🤖 ========================================

⏰ Started at: 1/15/2025, 2:30:00 PM
📊 Token budget: 10000 tokens/day
📊 Max check-ins per run: 20

📈 Token usage before run:
   Used: 0/10000 (0%)
   Remaining: 10000

[ProactiveCheckIn] Found 2 users with proactive features enabled
[ProactiveCheckIn] Found 1 project(s) needing check-ins
[ProactiveCheckIn] Generated check-in for project 42: "Hey! Haven't seen you working on Launch SaaS in a couple days. Everything going okay with it?"

📊 ========================================
📊 RESULTS
📊 ========================================

✅ Success! Sent 1 check-in(s)
🪙 Tokens used: 423
⏱️  Duration: 1247ms

📈 Token usage after run:
   Used: 423/10000 (4%)
   Remaining: 9577

📧 Check-ins sent to:
   1. user@example.com - Project: "Launch SaaS"

🤖 ========================================
🤖 CRON JOB COMPLETE
🤖 ========================================
```

## GraphQL API

### Queries

#### Get Proactive Features Status
```graphql
query {
  getProactiveFeaturesEnabled(userId: "user_id") # Returns Boolean
}
```

#### Get Project Check-In Settings
```graphql
query {
  getProjectCheckInSettings(projectId: 123) {
    projectId
    checkInsEnabled
    lastActivityAt
    lastCheckInAt
  }
}
```

#### Get Activity Patterns
```graphql
query {
  getActivityPatterns(
    userId: "user_id"
    projectId: 123
    patternType: "best_work_time"
    limit: 20
  ) {
    id
    patternType
    patternData
    detectedAt
    confidenceScore
  }
}
```

#### Get Token Usage Stats
```graphql
query {
  getProactiveTokenUsageStats {
    used
    budget
    remaining
    percentage
    lastReset
  }
}
```

### Mutations

#### Enable/Disable Proactive Features (Master Kill Switch)
```graphql
mutation {
  setProactiveFeaturesEnabled(
    userId: "user_id"
    enabled: true
  ) {
    success
    enabled
    message
  }
}
```

#### Enable/Disable Project Check-Ins
```graphql
mutation {
  setProjectCheckInsEnabled(
    projectId: 123
    enabled: false
  ) {
    success
    projectId
    enabled
    message
  }
}
```

#### Trigger Check-In Manually (Testing)
```graphql
mutation {
  triggerCheckIn(
    projectId: 123
    userId: "user_id"
  ) {
    success
    message
    checkInMessage
  }
}
```

## Activity Tracking Integration

Activity is automatically tracked when users:

### Send Messages
```javascript
// conversationResolvers.js
await ActivityTrackingService.recordActivity(projectId, userId);

// Also detects blocker signals
if (ActivityTrackingService.detectBlockerSignal(message)) {
  await ActivityTrackingService.recordPattern(
    userId, projectId, 'blocker_signal', { message }, 0.7
  );
}
```

### Start Work Sessions
```javascript
// workSessionResolvers.js
await ActivityTrackingService.recordActivity(projectId, userId);
ActivityTrackingService.detectBestWorkTimes(userId, projectId);
```

### Update Tasks
```javascript
// Task creation and updates automatically update projects.last_activity_at
// This happens via direct SQL in taskResolvers.js
```

## Pattern Types

### `best_work_time`
Detected from work session start times. Helps suggest optimal scheduling.

```json
{
  "hour": 9,
  "sessionCount": 15,
  "totalSessions": 23,
  "message": "You tend to have your most productive work sessions around 9:00"
}
```

### `blocker_signal`
Detected from user messages containing frustration keywords.

```json
{
  "message": "I'm stuck on authentication, can't figure out OAuth",
  "detectedAt": "2025-01-15T14:30:00Z"
}
```

### `skipped_task`
Detected when tasks are repeatedly rescheduled or skipped.

```json
{
  "taskId": 42,
  "taskTitle": "Write documentation",
  "dueDate": "2025-01-14",
  "skippedAt": "2025-01-15T10:00:00Z"
}
```

## Check-In Logic

### When Check-Ins Are Sent

A project is eligible for a check-in when:
1. ✅ User has `proactive_features_enabled = true`
2. ✅ Project has `check_ins_enabled = true`
3. ✅ Project status is `'active'`
4. ✅ Last activity > 24 hours ago (or NULL)
5. ✅ Last check-in was > 24 hours ago (or NULL)
6. ✅ Token budget not exhausted
7. ✅ Max check-ins per run not reached

### Check-In Message Generation

1. **AI-powered** (preferred):
   - Uses GPT-4o-mini for cost efficiency
   - Considers project context, inactivity duration
   - Persona-aware (matches user's chosen AI personality)
   - Warm, curious tone (not guilt-tripping)

2. **Template fallback**:
   - Used when token budget exhausted
   - Simple, friendly templates
   - Randomized to avoid repetition

### Check-In Examples

Good check-ins (warm, curious, open-ended):
- ✅ "Hey! Haven't seen you working on Launch SaaS in a couple days. Everything going okay with it?"
- ✅ "Just checking in on your workout routine. Has anything shifted with your priorities, or are you still planning to move forward?"
- ✅ "It's been a few days since we worked on the blog. What's on your mind about it?"

Bad check-ins (avoid):
- ❌ "You should work on your project!" (too pushy)
- ❌ "It's been 3 days. Ready to start?" (guilt-tripping)
- ❌ "Want to work on it now?" (closed question, not curious)

## Token Budget Management

### Budget Flow
1. Daily budget starts at configured limit (default: 10,000 tokens)
2. Each check-in estimates ~500 tokens
3. Actual usage tracked after API call
4. When budget exhausted, fallback templates used
5. Budget resets at midnight (based on last reset date check)

### Monitoring Token Usage

Via API:
```bash
curl -X POST https://your-app.com/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ getProactiveTokenUsageStats { used budget remaining percentage } }"
  }'
```

Via cron logs:
```
📈 Token usage after run:
   Used: 2341/10000 (23%)
   Remaining: 7659
```

### Cost Estimation

Assuming GPT-4o-mini pricing ($0.15/1M input tokens, $0.60/1M output tokens):

**Per check-in**:
- Input: ~300 tokens ($0.000045)
- Output: ~150 tokens ($0.00009)
- **Total: ~$0.000135 per check-in**

**Daily costs** (assuming 20 check-ins/day):
- **~$0.0027/day = $0.08/month**

Very affordable! The token budget acts as a safety net, not a cost-saving measure.

## Monitoring & Debugging

### Check Recent Activity
```sql
SELECT
  p.id,
  p.title,
  p.last_activity_at,
  p.last_check_in_at,
  p.check_ins_enabled,
  u.proactive_features_enabled
FROM projects p
JOIN users u ON p.user_id = u.firebase_uid
WHERE u.proactive_features_enabled = true
ORDER BY p.last_activity_at DESC;
```

### View Activity Patterns
```sql
SELECT
  pattern_type,
  pattern_data,
  detected_at,
  confidence_score
FROM activity_patterns
WHERE user_id = 'user_firebase_uid'
ORDER BY detected_at DESC
LIMIT 20;
```

### Check Cron Execution Logs

Heroku:
```bash
heroku logs --tail --app your-app-name | grep ProactiveCheckIn
```

Local:
```bash
tail -f /var/log/checkins.log
```

## Rollout Strategy

### Phase 1: Internal Testing (Week 1)
- Enable for your own account only
- Test check-in quality and timing
- Monitor token usage
- Adjust inactivity threshold if needed

### Phase 2: Beta Users (Week 2-3)
- Enable for 5-10 trusted users
- Gather feedback on check-in tone
- Iterate on message templates
- Monitor for any issues

### Phase 3: Opt-In Launch (Week 4)
- Add UI toggle in user settings
- Default: OFF (users must opt-in)
- Clear messaging about what to expect
- Easy way to disable

### Phase 4: Gradual Rollout (Month 2+)
- Offer during onboarding for new users
- Highlight value proposition
- Monitor engagement metrics
- Iterate based on data

## Future Enhancements

- ✨ **Smart timing**: Send check-ins at user's best work time
- ✨ **Multi-channel**: Email/SMS notifications in addition to in-app
- ✨ **Completion detection**: Celebrate when projects are completed
- ✨ **Progress nudges**: "You're 80% done, finish strong!"
- ✨ **Social accountability**: Share progress with accountability partners
- ✨ **Streak tracking**: Maintain daily engagement streaks
- ✨ **Intervention escalation**: Gentle → Direct → Concerned based on inactivity duration

## Troubleshooting

### Check-ins not sending?

1. **Verify proactive features enabled**:
   ```sql
   SELECT proactive_features_enabled FROM users WHERE firebase_uid = 'user_id';
   ```

2. **Check project settings**:
   ```sql
   SELECT check_ins_enabled, last_activity_at, last_check_in_at
   FROM projects WHERE id = 123;
   ```

3. **Verify cron is running**:
   - Check Heroku Scheduler logs
   - Verify cron job is active: `crontab -l`

4. **Check token budget**:
   ```graphql
   query { getProactiveTokenUsageStats { remaining } }
   ```

### Check-ins too frequent/infrequent?

Adjust inactivity threshold in `ActivityTrackingService.getProjectsNeedingCheckIn()`:

```javascript
// Change 24 hours to desired value
const projects = await ActivityTrackingService.getProjectsNeedingCheckIn(userId, 48); // 48 hours
```

### Token budget exhausted?

Increase daily budget in `.env`:
```env
DAILY_CHECKIN_TOKEN_BUDGET=20000
```

### Check-in quality issues?

Adjust system prompt in `ProactiveCheckInService.generateCheckInMessage()` to refine tone, style, or guidelines.

## Support

For issues or questions:
- File an issue on GitHub
- Contact: support@ravenloom.com
- Documentation: https://docs.ravenloom.com/proactive-accountability
