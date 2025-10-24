# Getting Started with RavenLoom

## 🎉 Your Application is Running!

**Backend:** http://localhost:4013/graphql
**Frontend:** http://localhost:5173

## Quick Start

1. **Open the frontend:** http://localhost:5173
2. **Sign in** with Firebase Auth (or skip if using test user)
3. **Create your first project:**
   - Click "Create Project"
   - Describe your goal in natural language
   - The AI will select the best persona for you
   - Customize communication preferences
4. **Start chatting** with your AI coach!
5. **Complete tasks** in the sidebar as your coach suggests them

## What You Built

### Frontend Features ✅
- **Chat-First Interface** - Main interaction is conversation with AI persona
- **AI Persona Creation** - Describe goal → AI selects archetype + specialization
- **Communication Preferences** - Tone, verbosity, emoji, platitudes
- **GTD Task Management** - Context-based filtering (@home, @office, etc.)
- **Real-time Updates** - Messages poll every 5 seconds
- **Dark Theme** - Matching existing purple/dark aesthetic

### Backend Features ✅
- **6 Archetypes** - Coach, Advisor, Strategist, Partner, Manager, Coordinator
- **19 Specializations** - Health, Business, Technical, etc.
- **GPT-4 Integration** - Intelligent, contextual responses
- **GTD Task System** - Energy levels, contexts, time estimates
- **Conversation History** - Full message threading
- **Database** - PostgreSQL with all migrations applied

## Project Structure

```
ravenloom/
├── backend/                    # Node.js + GraphQL API
│   ├── index.js               # Server (port 4013)
│   ├── graphql/
│   │   ├── schema.js          # GraphQL schema
│   │   └── resolvers/         # Query/mutation resolvers
│   ├── services/              # Business logic
│   │   ├── PersonaService.js
│   │   ├── ConversationService.js
│   │   └── PersonaFactory.js  # AI persona creation
│   ├── config/
│   │   └── archetypes.js      # Persona definitions
│   └── migrations/            # Database migrations
│
└── frontend/                  # React + Vite
    ├── src/
    │   ├── App.jsx            # Main app + project creation
    │   ├── ProjectDashboard.jsx  # Chat + tasks view
    │   ├── Login.jsx          # Firebase auth
    │   └── main.jsx           # Apollo Client setup
    └── package.json
```

## User Flow

### 1. Create Project
```
User describes goal in natural language
  ↓
Backend sends goal to GPT-4 with archetype descriptions
  ↓
GPT-4 suggests best archetype + specialization
  ↓
PersonaFactory creates persona with user preferences
  ↓
Project + Persona created and linked
```

### 2. Chat with Persona
```
User sends message
  ↓
ConversationService loads context (project, persona, history)
  ↓
PersonaPromptBuilder creates persona-specific system prompt
  ↓
GPT-4 generates response in persona's voice
  ↓
Message stored and returned to user
```

### 3. Complete Tasks
```
Persona suggests tasks in conversation
  ↓
User or AI creates task with GTD properties
  ↓
Tasks appear in sidebar filtered by context
  ↓
User checks off tasks → AI responds to progress
```

## Example Conversation

**User:** "I want to lose 20 pounds by eating healthier and exercising regularly."

**AI Response:** Creates Health Coach persona (Coach + Health specialization)

**Chat:**
```
User: What should I focus on first?

Health Coach: Start by tracking your daily calories for one week.
This will give us a baseline. Also, aim for 30 minutes of
activity 3x per week. What type of exercise do you enjoy?

User: I like walking and swimming.

Health Coach: Perfect! Let's create some tasks:
- Track calories daily (use MyFitnessPal)
- Walk 30 min on M/W/F
- Swim 30 min on T/Th

Which would you like to start with?
```

## Key Features Demonstrated

### AI Persona System
- ✅ **Archetype Selection** - AI chooses best fit from 6 archetypes
- ✅ **Specialization** - Adds domain-specific knowledge
- ✅ **Communication Preferences** - Respects user's style choices
- ✅ **Contextual Responses** - Remembers project goal and history

### GTD Task Management
- ✅ **Contexts** - @home, @office, @computer, @errands, @phone, @anywhere
- ✅ **Energy Levels** - High, medium, low (color-coded)
- ✅ **Time Estimates** - Quick view of task duration
- ✅ **Status Toggle** - Click to complete/uncomplete

### Modern UI/UX
- ✅ **Dark Theme** - Purple accent (#5D4B8C) matching existing style
- ✅ **Chat Bubbles** - User (right) vs Persona (left)
- ✅ **Avatars** - Visual distinction between speakers
- ✅ **Timestamps** - See when messages sent
- ✅ **Auto-scroll** - Always see latest message
- ✅ **Enter to Send** - Shift+Enter for new line

## Testing the MVP

### Test Case 1: Weight Loss
1. Create project: "I want to lose 20 pounds"
2. AI should select: **Health Coach** (Coach + Health)
3. Chat about nutrition and exercise
4. Complete suggested tasks

### Test Case 2: Build a Product
1. Create project: "I want to launch a SaaS product"
2. AI should select: **Product Strategist** (Strategist + Product)
3. Chat about MVP, features, go-to-market
4. Complete business tasks

### Test Case 3: Learn Programming
1. Create project: "I want to learn React and build projects"
2. AI should select: **Learning Partner** (Partner + Learning)
3. Chat about curriculum and practice
4. Complete coding tasks

## Environment Variables

Make sure both backend and frontend have access to:

```env
# Backend (.env in /backend)
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...

# Frontend (uses backend automatically)
# No additional vars needed for local dev
```

## Troubleshooting

### Backend won't start
- Check `DATABASE_URL` is set
- Check `OPENAI_API_KEY` is set
- Ensure PostgreSQL is running
- Check port 4013 is available

### Frontend won't connect
- Check backend is running on port 4013
- Check Apollo Client URI in `frontend/src/main.jsx`
- Open browser console for GraphQL errors

### AI responses not working
- Check OpenAI API key is valid
- Check API usage limits
- Look for errors in backend console

### Tasks not showing
- Check GraphQL query in browser DevTools
- Verify project has persona created
- Check backend resolvers for errors

## Next Steps

### Enhancements to Try
1. **Add Task Creation from Chat**
   - Parse AI responses for task suggestions
   - Add "Create Task" button on suggestions

2. **Project Progress Visualization**
   - Show completion percentage
   - Add streak tracking for habits

3. **Better Mobile Support**
   - Collapsible task sidebar
   - Touch-friendly interactions

4. **Notification System**
   - Desktop notifications for AI responses
   - Task due date reminders

5. **Multi-Persona (Phase 2)**
   - Allow multiple personas per project
   - Enable persona debates

## Architecture Highlights

### Why This Stack?
- **GraphQL** - Flexible queries, type-safe
- **PostgreSQL** - Reliable, supports JSONB for flexibility
- **React** - Component-based, great ecosystem
- **OpenAI GPT-4** - Best-in-class language model
- **Firebase Auth** - Easy authentication
- **Vite** - Fast dev server and builds

### Design Decisions
1. **Chat-First** - Main interaction is natural language
2. **Single Persona MVP** - Simpler to start, expandable later
3. **GTD Methodology** - Proven system for task management
4. **Dark Theme** - Reduces eye strain, looks professional
5. **Polling vs WebSockets** - Simpler to implement, good enough for MVP

## Resources

- **Architecture Doc:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Test Results:** [backend/TEST_RESULTS.md](backend/TEST_RESULTS.md)
- **MVP Status:** [MVP_STATUS.md](MVP_STATUS.md)
- **Frontend Guide:** [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md)

## Support

If you encounter issues:
1. Check backend console for errors
2. Check frontend console for errors
3. Verify both servers are running
4. Check database connectivity
5. Verify OpenAI API key

---

**Built with RavenLoom - PM in a box. Just add any human.** 🪶
