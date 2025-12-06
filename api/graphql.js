/**
 * Vercel Serverless GraphQL API Endpoint
 *
 * This is the production endpoint for the RavenLoom GraphQL API.
 * It uses the same schema and resolvers as the development backend.
 */

import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import pg from 'pg';
import OpenAI from 'openai';

// Import schema and resolvers from backend
import typeDefs from '../backend/graphql/schema.js';
import resolvers from '../backend/graphql/resolvers/index.js';

// Import services
import { initializeLLM } from '../backend/utils/llm.js';

const { Pool } = pg;

// Initialize PostgreSQL connection for Vercel
let pool;
function getPool() {
  if (!pool) {
    // Vercel Postgres uses DB_POSTGRES_URL prefix when linked
    const connString = process.env.POSTGRES_URL || process.env.DB_POSTGRES_URL || process.env.DATABASE_URL;
    console.log('🔌 DB connected:', connString ? 'yes' : 'NO CONNECTION STRING!');
    pool = new Pool({
      connectionString: connString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

// Initialize OpenAI for Vercel
if (!global.openaiInitialized) {
  initializeLLM(process.env.OPENAI_API_KEY);
  global.openaiInitialized = true;
}

// Create Apollo Server with persona-based schema
const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true, // Enable GraphQL Playground in production
  formatError: (error) => {
    console.error('GraphQL Error:', error);
    return error;
  },
});

// Create context with database connection and user ID
const createContext = async (req) => {
  // Extract user ID from x-user-id header (set by Apollo Client on frontend)
  const userId = req.headers['x-user-id'] || null;

  return {
    req,
    db: getPool(),
    userId,
  };
};

// Create the base handler
const baseHandler = startServerAndCreateNextHandler(server, {
  context: createContext,
});

// Wrap with CORS headers for native app support
const handler = async (req, res) => {
  // Set CORS headers
  const allowedOrigins = [
    'https://localhost', // Capacitor native apps
    'capacitor://localhost',
    'https://ravenloom-ai-site.vercel.app',
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || origin?.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Apollo-Require-Preflight, x-user-id');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  return baseHandler(req, res);
};

export default handler;

// Configure for Vercel serverless
export const config = {
  api: {
    bodyParser: false,
  },
};
