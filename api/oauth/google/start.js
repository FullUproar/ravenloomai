/**
 * Vercel Serverless Function: Start Google OAuth flow
 */

import GoogleDriveService from '../../../backend/services/GoogleDriveService.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = req.query.userId;
  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  try {
    const authUrl = GoogleDriveService.getAuthUrl(userId);
    res.json({ authUrl });
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).json({ error: error.message });
  }
}
