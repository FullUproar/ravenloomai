import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

import typeDefs from './graphql/schema.js';
import resolvers from './graphql/resolvers/index.js';
import pool from './db.js';

dotenv.config();

// Check for OpenAI API key
if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY not set - AI features will not work');
} else {
  console.log('✅ OpenAI API key configured');
}

const app = express();

// Global middleware - Allow CORS from web, PWA, and native apps
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://10.0.2.2:5173', // Emulator accessing dev server
    'https://localhost', // Capacitor native apps
    'capacitor://localhost', // Capacitor alternative protocol
    'https://ravenloom-ai-site.vercel.app', // Production web
    /\.vercel\.app$/ // All Vercel preview deployments
  ],
  credentials: true
}));
app.use(bodyParser.json());

const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError: (error) => {
    console.error('GraphQL Error:', error);
    return error;
  }
});

await server.start();

app.use(
  '/graphql',
  expressMiddleware(server, {
    context: async ({ req }) => {
      // Extract user ID from Authorization header (Firebase token)
      // For now, accept userId directly in header for development
      const userId = req.headers['x-user-id'] || null;
      return { userId };
    }
  })
);

// TODO: Add push notification endpoints back when needed
// For now, alerts will be delivered through the chat interface

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 RavenLoom server ready at http://localhost:${PORT}/graphql`);
  console.log(`🏥 Health check at http://localhost:${PORT}/health`);
  console.log(`📱 Emulator can access at http://10.0.2.2:${PORT}/graphql`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
