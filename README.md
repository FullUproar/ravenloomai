# RavenLoom AI - Your Personal PM in a Box

An AI-powered project management system with **intelligent personas** that adapt to your goals. Whether you're losing weight, building software, or planning your career - RavenLoom gives you an AI assistant that speaks your language.

## ✨ What Makes RavenLoom Different

- **6 AI Archetypes + 19 Specializations**: Fitness Coach, Software Development Maker, Business Strategist, and more
- **3-Tier Memory System**: Your AI remembers facts, decisions, preferences, and insights across sessions
- **Conversational PM**: Chat naturally - AI suggests tasks, tracks metrics, and keeps you on track
- **GTD-Enhanced Tasks**: Context-aware (@home, @office), energy-based, time-estimated tasks
- **Structured Chat Elements**: Accept task/milestone suggestions with one click

## 🚀 Live Demo

[ravenloom-shawns-projects-b61cab3a.vercel.app](https://ravenloom-shawns-projects-b61cab3a.vercel.app)

## 📚 Documentation

- **[GETTING_STARTED.md](GETTING_STARTED.md)** - Setup and first steps
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deploy to Vercel
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design
- **[MEMORY_IMPLEMENTATION_SUMMARY.md](MEMORY_IMPLEMENTATION_SUMMARY.md)** - How memory works
- **[STRUCTURED_CHAT_GUIDE.md](STRUCTURED_CHAT_GUIDE.md)** - Chat syntax guide

## 🎯 Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- PostgreSQL database (Railway recommended)
- OpenAI API key

### 1. Clone & Install

```bash
git clone https://github.com/FullUproar/ravenloomai.git
cd ravenloomai

# Install backend
cd backend
npm install

# Install frontend
cd ../frontend
npm install
```

### 2. Configure Environment

Create `backend/.env`:
```env
DATABASE_URL=postgresql://user:password@host:port/database
OPENAI_API_KEY=sk-proj-your-key-here
PORT=4013
```

### 3. Run Database Migrations

```bash
cd backend
node scripts/run-migration.js 001_add_personas.sql
node scripts/run-migration.js 002_fix_projects_table.sql
node scripts/run-migration.js 003_add_memory_system.sql
```

### 4. Start Development Servers

```bash
# Terminal 1 - Backend
cd backend
npm run dev
# Running on http://localhost:4013/graphql

# Terminal 2 - Frontend
cd frontend
npm run dev -- --host
# Running on http://localhost:5173
```

### 5. Open App

Visit [http://localhost:5173](http://localhost:5173) and click **"Continue as Test User"**

## 🏗️ Project Structure

```
ravenloom/
├── frontend/                # React + Vite + Apollo Client
│   ├── src/
│   │   ├── App.jsx          # Project creation & persona selection
│   │   ├── ProjectDashboard.jsx  # Chat interface
│   │   ├── ChatElements.jsx # Task/milestone cards
│   │   └── main.jsx         # Apollo setup
│   └── package.json
├── backend/                 # Node.js + GraphQL + PostgreSQL
│   ├── config/
│   │   └── archetypes.js    # 6 archetypes + 19 specializations
│   ├── graphql/
│   │   ├── schema.js        # GraphQL schema
│   │   └── resolvers/       # Query/mutation resolvers
│   ├── services/
│   │   ├── PersonaService.js
│   │   ├── ConversationService.js
│   │   ├── ShortTermMemory.js
│   │   └── MediumTermMemory.js
│   ├── migrations/          # Database migrations
│   └── index.js             # Apollo Server
├── api/
│   └── graphql.js           # Vercel serverless function
└── vercel.json              # Deployment config
```

## 🤖 AI Personas

### 6 Core Archetypes

1. **Coach** - Motivation, accountability, habit formation
   - Fitness Coach, Nutrition Coach, Habit Formation Coach, Mental Wellness Coach

2. **Strategist** - Planning, goal-setting, decision-making
   - Business Strategist, Career Development Strategist, Financial Planning Strategist

3. **Analyst** - Data-driven insights, optimization
   - Data Analyst, Research Analyst, Process Optimizer

4. **Maker** - Building, creating, shipping
   - Software Dev Maker, Creative Projects Maker, Product Development Maker

5. **Coordinator** - Organization, scheduling, workflow
   - Event Planning Coordinator, Team Coordinator, Workflow Manager

6. **Catalyst** - Innovation, change, growth
   - Innovation Catalyst, Change Management Catalyst, Growth Hacker

## 💾 3-Tier Memory System

**Tier 1: Short-term Memory**
- Auto-summarizes every 20 messages
- Keeps last 10 messages in full detail
- ~2000 token budget

**Tier 2: Medium-term Memory**
- Stores facts, decisions, blockers, preferences, insights
- Importance-based (1-10 scoring)
- Max 30 memories per project (auto-pruned)
- ~500 token budget

**Tier 3: Long-term Memory** *(Designed, not yet implemented)*
- Knowledge graph for strategic reasoning
- Pattern recognition across projects

## 📦 Deployment

### Deploy to Vercel (Recommended)

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com/new)
3. Set environment variables:
   - `DATABASE_URL` - PostgreSQL connection string
   - `OPENAI_API_KEY` - OpenAI API key
   - `NODE_ENV=production`
4. Deploy!
5. Run database migrations on your database

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## 🎨 Features

### Current (v1.0)
- ✅ AI persona selection based on goals
- ✅ Natural language chat interface
- ✅ Structured task/milestone suggestions
- ✅ 3-tier memory system (Tiers 1 & 2)
- ✅ GTD-style task management
- ✅ Project health scoring
- ✅ Habit streak tracking
- ✅ GraphQL API
- ✅ Dark theme UI

### Planned
- 🔜 Guided onboarding flows
- 🔜 Tier 3 knowledge graph
- 🔜 Automatic memory extraction
- 🔜 Multi-project insights
- 🔜 Team collaboration
- 🔜 Mobile app

## 🧪 Example Use Cases

**Weight Loss Project**
```
You: I want to lose 20 pounds
AI: *Creates Fitness Coach persona*
AI: [TASK: Meal prep Sunday | Cook 5 healthy lunches | context:@home | energy:medium | time:90]
AI: *Remembers your food allergies, workout schedule, and preferences*
```

**Software Project**
```
You: Building a mobile task management app
AI: *Creates Software Development Maker persona*
AI: [MILESTONE: MVP Release | Core features complete | date:2025-01-15]
AI: *Tracks tech decisions, velocity, and blockers*
```

**Career Development**
```
You: Want to become a senior engineer
AI: *Creates Career Development Strategist persona*
AI: [TASK: Practice system design | LeetCode hard problems | context:@computer | energy:high | time:60]
AI: *Remembers your strengths, target companies, interview dates*
```

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Apollo Client, ReactMarkdown
- **Backend**: Node.js, Apollo Server, GraphQL
- **Database**: PostgreSQL with JSONB
- **AI**: OpenAI GPT-4
- **Deployment**: Vercel (frontend + serverless functions)
- **Auth**: Firebase (optional, test user available)

## 📊 Database Schema

Key tables:
- `projects` - User projects with completion types
- `personas` - AI personas with specializations
- `conversations` - Chat conversations with summaries (Tier 1)
- `conversation_messages` - Individual messages
- `project_memory` - Tactical facts and decisions (Tier 2)
- `tasks` - GTD-enhanced tasks
- `metrics` - Time-series project metrics

## 🤝 Contributing

Contributions welcome! Areas of interest:
- Frontend UI/UX improvements
- Additional persona specializations
- Memory extraction algorithms
- Mobile app development

## 📝 License

MIT

## 🙏 Acknowledgments

Built with [Claude Code](https://claude.com/claude-code)

---

**Ready to get started?** See [GETTING_STARTED.md](GETTING_STARTED.md)

**Need help deploying?** See [DEPLOYMENT.md](DEPLOYMENT.md)
