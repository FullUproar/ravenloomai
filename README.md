# RavenLoom - AI Project Management

An AI-powered project management tool designed for everyday users to manage personal goals, health journeys, finances, and small businesses.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- OpenAI API key

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/FullUproar/ravenloomai.git
cd ravenloomai
```

2. **Set up the backend**
```bash
cd backend
npm install

# Create .env file (copy from .env.example)
cp .env.example .env

# Edit .env with your credentials:
# - OPENAI_API_KEY: Your OpenAI API key
# - DATABASE_URL: Your PostgreSQL connection string
# - PORT: Server port (default: 4000)
```

3. **Initialize the database**
```bash
# Run the database initialization script
node init-db.js
```

4. **Start the backend server**
```bash
npm run dev  # Development mode with hot reload
# or
npm start    # Production mode
```

5. **Set up the frontend**
```bash
cd ../frontend
npm install
npm run dev  # Development server on http://localhost:5173
```

## 🗄️ Database Setup

If you're encountering database errors like "relation 'plans' does not exist", run:

```bash
cd backend
node init-db.js
```

This will:
- Drop any legacy tables
- Create the new schema (projects, goals, tasks, metrics, reminders, chat_messages)
- Add sample data for testing

## 📦 Deployment

### Vercel (Frontend)
1. Connect your GitHub repo to Vercel
2. Set root directory to `frontend`
3. Deploy

### Railway/Render (Backend)
1. Set environment variables:
   - `OPENAI_API_KEY`
   - `DATABASE_URL`
   - `PORT`
2. Set start command: `cd backend && npm start`

## 🔧 Environment Variables

### Backend (.env)
```env
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_URL=postgresql://username:password@host:port/database
PORT=4000
```

### Frontend
Update the GraphQL endpoint in `frontend/src/main.jsx` if not using default localhost:4000

## 🏗️ Project Structure
```
ravenloom/
├── backend/
│   ├── index.js           # Express/Apollo server
│   ├── schema.js          # GraphQL schema
│   ├── resolvers.js       # GraphQL resolvers
│   ├── init-db.js        # Database initialization
│   ├── execution/        # Task execution engines
│   └── llm/             # AI chat integration
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Main app component
│   │   ├── ProjectDashboard.jsx  # Project management UI
│   │   └── firebase.js   # Authentication
│   └── index.html
└── README.md
```

## 🎯 Features
- Multi-domain project management (business, health, personal, creative)
- AI-powered task suggestions and chat
- Goal tracking with metrics
- Task automation and execution
- Reminders system
- Firebase authentication

## 📝 License
MIT