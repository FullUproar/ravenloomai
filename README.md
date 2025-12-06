# RavenLoom - Team Knowledge Hub

An AI-powered knowledge hub for teams. Tell Raven once, anyone can recall it later. Built for teams who need institutional memory and proactive nudges.

## What It Does

**Institutional Memory** - Your team's decisions, facts, and context stored and searchable by anyone
- `@raven remember we decided to use React Native for mobile`
- `@raven what did we decide about mobile?`

**Proactive Nudges** - Set reminders and alerts that Raven will surface
- `@raven remind me to follow up with the manufacturer in 2 weeks`

**Team Channels** - Slack-like channels for different topics, with @raven available in all of them

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (Vercel Postgres / Prisma / Neon)
- OpenAI API key

### 1. Clone & Install

```bash
git clone https://github.com/FullUproar/ravenloomai.git
cd ravenloomai

# Install dependencies
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure Environment

Create `backend/.env`:
```env
POSTGRES_URL=postgresql://user:password@host:port/database
OPENAI_API_KEY=sk-proj-your-key-here
PORT=4000
```

### 3. Run Database Migration

```bash
node scripts/setup-database.js
```

### 4. Start Development

```bash
# Terminal 1 - Backend
cd backend && npm run dev
# Running on http://localhost:4000/graphql

# Terminal 2 - Frontend
cd frontend && npm run dev
# Running on http://localhost:5173
```

## @raven Commands

Talk to Raven by mentioning `@raven` in any message:

| Command | Example | What It Does |
|---------|---------|--------------|
| **remember** | `@raven remember API keys are in 1Password` | Saves a fact to team knowledge |
| **decision** | `@raven decision: we're using Stripe for payments` | Records a team decision |
| **remind** | `@raven remind me to check inventory Friday` | Creates an alert/reminder |
| **task** | `@raven task: update the product photos` | Creates a task |
| **query** | `@raven what's our return policy?` | Searches knowledge and answers |

## Architecture

```
Frontend (React + Vite)
├── Login.jsx          # Firebase auth
├── App.jsx            # Team selector
├── TeamDashboard.jsx  # Channels + chat
└── styles.css         # Dark theme

Backend (Node.js + GraphQL)
├── services/
│   ├── TeamService.js      # Team/member management
│   ├── ChannelService.js   # Channel CRUD
│   ├── MessageService.js   # Messages + @raven parsing
│   ├── KnowledgeService.js # Facts, decisions, search
│   ├── AIService.js        # OpenAI integration
│   ├── AlertService.js     # Reminders/nudges
│   └── TaskService.js      # Task management
└── graphql/
    ├── schema.js           # GraphQL types
    └── resolvers/index.js  # Query/mutation handlers

Database (PostgreSQL)
├── teams, team_members, team_invites
├── channels, messages
├── facts, decisions, documents
├── alerts, projects, tasks
```

## Database Schema

Key tables:
- **teams** - Workspaces for groups
- **channels** - Topic-based conversations
- **messages** - Chat messages with @raven detection
- **facts** - Team knowledge ("API keys in 1Password")
- **decisions** - Recorded decisions with context
- **alerts** - Scheduled reminders/nudges

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in [Vercel](https://vercel.com/new)
3. Set environment variables:
   - `POSTGRES_URL`
   - `OPENAI_API_KEY`
4. Deploy

### Environment Variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_URL` | PostgreSQL connection string |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4 |
| `PORT` | Backend port (default: 4000) |

## Tech Stack

- **Frontend**: React 19, Vite, Apollo Client, React Router
- **Backend**: Node.js, Apollo Server, GraphQL
- **Database**: PostgreSQL
- **AI**: OpenAI GPT-4o
- **Auth**: Firebase Authentication
- **Deployment**: Vercel

## Roadmap

### Current (v2.0)
- Team-based workspaces
- Channel-based chat
- @raven knowledge commands
- Fact/decision storage
- Alert/reminder system

### Planned
- Gmail integration (auto-extract decisions from email)
- Google Docs integration (search team documents)
- Semantic search (vector embeddings)
- Mobile app (Capacitor)
- Proactive daily digests

## License

MIT

---

Built with [Claude Code](https://claude.com/claude-code)
