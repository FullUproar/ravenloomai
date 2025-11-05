import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';

import typeDefs from './graphql/schema.js';
import resolvers from './graphql/resolvers/index.js';
import { initializeLLM } from './utils/llm.js';
import { getVapidPublicKey, sendRaven, handleRavenAction } from './raven-service.js';
import pool from './db.js';
import { startScheduler, stopScheduler } from './raven-scheduler.js';

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
    context: async ({ req }) => ({})
  })
);

// Ravens (Push Notification) API endpoints
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

app.post('/api/raven-subscribe', async (req, res) => {
  try {
    console.log('🪶 [Ravens Subscribe] Received request:', {
      userId: req.body.userId,
      platform: req.body.platform,
      hasFcmToken: !!req.body.fcmToken,
      hasSubscription: !!req.body.subscription
    });

    const { userId, platform, fcmToken, subscription } = req.body;

    if (!userId) {
      console.error('❌ [Ravens Subscribe] Missing userId');
      return res.status(400).json({ error: 'userId is required' });
    }

    if (platform === 'native') {
      // Native app (Android/iOS) - store FCM token
      console.log(`📱 [Ravens Subscribe] Native platform - userId: ${userId}, fcmToken: ${fcmToken ? 'present' : 'missing'}`);

      const result = await pool.query(
        `INSERT INTO user_settings (user_id, fcm_token, ravens_enabled)
         VALUES ($1, $2, true)
         ON CONFLICT (user_id) DO UPDATE SET
         fcm_token = $2, ravens_enabled = true, updated_at = NOW()
         RETURNING *`,
        [userId, fcmToken]
      );

      console.log('✅ [Ravens Subscribe] Native subscription saved:', result.rows[0]);
    } else if (platform === 'web') {
      // Web app - store web push subscription
      console.log(`🌐 [Ravens Subscribe] Web platform - userId: ${userId}`);
      const { endpoint, keys } = subscription;

      const result = await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (endpoint) DO UPDATE SET
         active = true, updated_at = NOW()
         RETURNING *`,
        [userId, endpoint, keys.p256dh, keys.auth]
      );

      console.log('✅ [Ravens Subscribe] Web subscription saved:', result.rows[0]);
    } else {
      console.warn(`⚠️ [Ravens Subscribe] Unknown platform: ${platform}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ [Ravens Subscribe] Error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

app.post('/api/raven-unsubscribe', async (req, res) => {
  try {
    const { userId } = req.body;

    // Disable Ravens for user
    await pool.query(
      `UPDATE user_settings SET ravens_enabled = false WHERE user_id = $1`,
      [userId]
    );

    // Deactivate all push subscriptions
    await pool.query(
      `UPDATE push_subscriptions SET active = false WHERE user_id = $1`,
      [userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error unsubscribing from Ravens:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

app.post('/api/raven-action', async (req, res) => {
  try {
    const { ravenId, action, metadata } = req.body;
    await handleRavenAction(ravenId, action, metadata);
    res.json({ success: true });
  } catch (error) {
    console.error('Error handling Raven action:', error);
    res.status(500).json({ error: 'Failed to handle action' });
  }
});

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

  // Start the Raven scheduler
  startScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  stopScheduler();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  stopScheduler();
  process.exit(0);
});
