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
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 1, // Serverless functions should use minimal connections
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

// Create context with database connection
const createContext = async (req) => {
  return {
    req,
    db: getPool(),
  };
};

// Create and export the handler for Vercel
const handler = startServerAndCreateNextHandler(server, {
  context: createContext,
});

export default handler;

// Configure for Vercel serverless
export const config = {
  api: {
    bodyParser: false,
  },
};
