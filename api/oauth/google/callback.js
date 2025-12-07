/**
 * Vercel Serverless Function: Google OAuth callback
 */

import GoogleDriveService from '../../../backend/services/GoogleDriveService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query;

  // Parse state to get origin (where to redirect back to)
  let stateData = {};
  try {
    stateData = JSON.parse(state || '{}');
  } catch (e) {
    stateData = {};
  }

  // Use origin from state, fallback to env var, then to default
  const frontendUrl = stateData.origin || process.env.FRONTEND_URL || 'https://ravenloom-ai-site.vercel.app';

  if (!code) {
    return res.redirect(`${frontendUrl}?error=no_code`);
  }

  const userId = stateData.userId;

  if (!userId) {
    return res.redirect(`${frontendUrl}?error=no_user`);
  }

  try {

    // Exchange code for tokens
    const tokens = await GoogleDriveService.exchangeCodeForTokens(code);

    // Get user info from Google
    const userInfo = await GoogleDriveService.getGoogleUserInfo(tokens.access_token);

    // Save integration
    await GoogleDriveService.saveIntegration(userId, tokens, userInfo);

    // Redirect back to app
    res.redirect(`${frontendUrl}?drive_connected=true`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${frontendUrl}?error=${encodeURIComponent(error.message)}`);
  }
}
