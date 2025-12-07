/**
 * Vercel Serverless Function: Google OAuth callback
 */

import GoogleDriveService from '../../../backend/services/GoogleDriveService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://ravenloom-ai-site.vercel.app';

  if (!code) {
    return res.redirect(`${frontendUrl}?error=no_code`);
  }

  try {
    const stateData = JSON.parse(state || '{}');
    const userId = stateData.userId;

    if (!userId) {
      return res.redirect(`${frontendUrl}?error=no_user`);
    }

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
