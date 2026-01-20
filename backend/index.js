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
app.use(bodyParser.json({ limit: '10mb' }));

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

// ============================================================================
// OAuth Routes for Integrations
// ============================================================================

import GoogleDriveService from './services/GoogleDriveService.js';

// Start Google OAuth flow (team-level integration)
app.get('/oauth/google/start', (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.userId;
  const teamId = req.headers['x-team-id'] || req.query.teamId;

  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }
  if (!teamId) {
    return res.status(400).json({ error: 'Team ID required' });
  }

  try {
    const authUrl = GoogleDriveService.getAuthUrl(userId, teamId);
    res.json({ authUrl });
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Google OAuth callback
app.get('/oauth/google/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations?error=no_code`);
  }

  try {
    const stateData = JSON.parse(state || '{}');
    const { userId, teamId } = stateData;

    if (!userId) {
      throw new Error('No user ID in state');
    }
    if (!teamId) {
      throw new Error('No team ID in state');
    }

    // Exchange code for tokens
    const tokens = await GoogleDriveService.exchangeCodeForTokens(code);

    // Get user info
    const userInfo = await GoogleDriveService.getGoogleUserInfo(tokens.access_token);

    // Save integration (team-level)
    await GoogleDriveService.saveIntegration(userId, teamId, tokens, userInfo);

    // Redirect back to frontend with team context
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations?success=google&teamId=${teamId}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations?error=${encodeURIComponent(error.message)}`);
  }
});

// ============================================================================
// File Upload Routes
// ============================================================================

import UploadService from './services/UploadService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine upload directory (same logic as UploadService)
const IS_SERVERLESS = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const UPLOAD_DIR = IS_SERVERLESS
  ? '/tmp/uploads'
  : path.join(__dirname, 'uploads');

// Increase body size limit for file uploads
app.use('/upload', express.json({ limit: '15mb' }));

// Upload endpoint (accepts base64 encoded file)
// Uses Vercel Blob in production (when BLOB_READ_WRITE_TOKEN is set), local storage otherwise
app.post('/upload', async (req, res) => {
  console.log('📤 Upload request received');
  console.log('   BLOB_READ_WRITE_TOKEN configured:', !!process.env.BLOB_READ_WRITE_TOKEN);

  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  try {
    const { data, filename, mimeType, teamId } = req.body;
    console.log('   File:', filename, 'Type:', mimeType, 'Size:', data?.length || 0, 'chars (base64)');

    if (!data || !filename || !mimeType) {
      return res.status(400).json({ error: 'Missing required fields: data, filename, mimeType' });
    }

    const attachment = await UploadService.saveFile(userId, teamId, {
      data,
      originalName: filename,
      mimeType
    });

    console.log('   ✅ Upload successful:', attachment.url);
    res.json(attachment);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Serve uploaded files (dynamically uses correct directory based on environment)
app.use('/uploads', express.static(UPLOAD_DIR));

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
