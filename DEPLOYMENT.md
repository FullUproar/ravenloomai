# RavenLoom Deployment Guide

## Overview

RavenLoom consists of:
- **Frontend**: React + Vite (static build)
- **Backend**: Node.js + Apollo GraphQL (serverless function)
- **Database**: PostgreSQL (Railway)

## Deployment to Vercel

### Prerequisites

1. Vercel account
2. GitHub repository connected
3. Railway PostgreSQL database (already set up)
4. OpenAI API key

### Step 1: Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository: `FullUproar/ravenloomai`
4. Vercel will auto-detect the configuration

### Step 2: Configure Build Settings

Vercel should auto-detect settings from `vercel.json`, but verify:

- **Framework Preset**: Vite
- **Root Directory**: `./`
- **Build Command**: `cd frontend && npm install && npm run build`
- **Output Directory**: `frontend/dist`
- **Install Command**: `npm install`

### Step 3: Set Environment Variables

In Vercel Project Settings → Environment Variables, add:

#### Required Variables:

```bash
# Database (Railway)
DATABASE_URL=postgresql://postgres:...@mainline.proxy.rlwy.net:58045/railway

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Node Environment
NODE_ENV=production
```

#### Optional Variables:

```bash
# Firebase (if using real auth)
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
```

### Step 4: Deploy

1. Click "Deploy"
2. Vercel will:
   - Install dependencies
   - Build the frontend
   - Deploy serverless functions
   - Configure routing

### Step 5: Run Database Migrations

After first deployment, run migrations:

```bash
# Connect to your Vercel project
vercel env pull .env.production

# Run migrations locally against production DB
cd backend
node scripts/run-migration.js 001_add_personas.sql
node scripts/run-migration.js 002_fix_projects_table.sql
node scripts/run-migration.js 003_add_memory_system.sql
```

Or run them directly from Railway's database console.

## Database Migrations (Railway)

### Option 1: Railway Console

1. Go to Railway project
2. Click on PostgreSQL database
3. Open "Query" tab
4. Copy/paste SQL from each migration file:
   - `backend/migrations/001_add_personas.sql`
   - `backend/migrations/002_fix_projects_table.sql`
   - `backend/migrations/003_add_memory_system.sql`
5. Execute each one in order

### Option 2: Command Line

```bash
# Set DATABASE_URL in .env
export DATABASE_URL="postgresql://..."

# Run migrations
cd backend
node scripts/run-migration.js 001_add_personas.sql
node scripts/run-migration.js 002_fix_projects_table.sql
node scripts/run-migration.js 003_add_memory_system.sql
```

## Project Structure for Vercel

```
ravenloom/
├── api/
│   └── graphql.js          # Serverless function (wraps backend)
├── frontend/
│   ├── src/
│   ├── dist/               # Build output
│   └── package.json
├── backend/
│   ├── config/
│   ├── graphql/
│   ├── services/
│   ├── migrations/
│   └── index.js
├── vercel.json             # Vercel configuration
└── package.json
```

## Routing Configuration

`vercel.json` routes:
- `/api/graphql` → Serverless function
- `/health` → Serverless function
- All other routes → Frontend static files

## Environment-Specific Behavior

### Development (Local)
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4013/graphql`
- Frontend connects to local backend

### Production (Vercel)
- Frontend: Static files served from CDN
- Backend: Serverless function at `/api/graphql`
- Frontend connects to same-domain API

Code in `frontend/src/main.jsx`:
```javascript
const client = new ApolloClient({
  uri: process.env.NODE_ENV === 'production'
    ? '/api/graphql'  // Production: same domain
    : 'http://localhost:4013/graphql', // Dev: local backend
  // ...
});
```

## Monitoring & Debugging

### Vercel Dashboard
- View deployment logs
- Check function execution logs
- Monitor performance metrics

### Common Issues

**Issue**: GraphQL endpoint not found
- **Solution**: Check `api/graphql.js` exports correctly
- Verify routing in `vercel.json`

**Issue**: Database connection fails
- **Solution**: Verify `DATABASE_URL` in environment variables
- Check Railway database is accessible
- Verify IP whitelist if enabled

**Issue**: OpenAI API errors
- **Solution**: Check `OPENAI_API_KEY` is set
- Verify API key has sufficient credits
- Check rate limits

**Issue**: Frontend shows "Failed to fetch"
- **Solution**: Check CORS settings in backend
- Verify `/api/graphql` route is working
- Check browser console for exact error

## Testing Production Deployment

After deployment, test these endpoints:

### 1. Health Check
```bash
curl https://your-app.vercel.app/health
```

Should return: `{"status":"ok"}`

### 2. GraphQL Introspection
```bash
curl https://your-app.vercel.app/api/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name } } }"}'
```

Should return schema information.

### 3. Test Query
```bash
curl https://your-app.vercel.app/api/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { getProjects(userId: \"test-user-123\") { id title } }"}'
```

Should return projects list.

## Continuous Deployment

Once set up, Vercel automatically deploys on:
- Push to `main` branch → Production deployment
- Pull request → Preview deployment

## Performance Optimization

### Frontend
- Vite produces optimized production builds
- Code splitting enabled by default
- Assets served from Vercel CDN

### Backend
- Serverless functions auto-scale
- Database connection pooling in PostgreSQL
- LLM calls cached where appropriate

## Costs

### Free Tier Limits:
- **Vercel**: 100GB bandwidth, 100 serverless function executions/day
- **Railway**: $5/month starter plan
- **OpenAI**: Pay-per-use (GPT-4: ~$0.03 per 1K tokens)

### Estimated Monthly Cost:
- Small usage (<100 users): ~$10-20/month
- Medium usage (100-1000 users): ~$50-100/month

## Rollback

If deployment fails:
1. Go to Vercel Dashboard
2. Click "Deployments"
3. Find previous working deployment
4. Click "..." → "Promote to Production"

## Local Production Testing

Test production build locally:

```bash
# Build frontend
cd frontend
npm run build
npm run preview  # Serves production build

# Run backend in production mode
cd ../backend
NODE_ENV=production npm start
```

## Next Steps

After initial deployment:
1. Set up custom domain (optional)
2. Configure Firebase authentication (optional)
3. Set up monitoring/analytics
4. Configure error tracking (Sentry, etc.)
5. Set up backup strategy for database

## Support

- Vercel Docs: https://vercel.com/docs
- Railway Docs: https://docs.railway.app
- Apollo GraphQL: https://www.apollographql.com/docs
