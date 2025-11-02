import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

import typeDefs from './graphql/schema.js';
import resolvers from './graphql/resolvers/index.js';
import { initializeLLM } from './utils/llm.js';

dotenv.config();

// Initialize LLM client
if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY not set - AI features will not work');
} else {
  initializeLLM(process.env.OPENAI_API_KEY);
  console.log('✅ OpenAI client initialized');
}

const app = express();

// Global middleware - Allow CORS from web, PWA, and native apps
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
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
    context: async ({ req }) => ({})
  })
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 RavenLoom server ready at http://localhost:${PORT}/graphql`);
  console.log(`🏥 Health check at http://localhost:${PORT}/health`);
});
