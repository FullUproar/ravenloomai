/**
 * Vercel Serverless Function: File upload
 */

import UploadService from '../backend/services/UploadService.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    }
  }
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  try {
    const { data, filename, mimeType, teamId } = req.body;

    if (!data || !filename || !mimeType) {
      return res.status(400).json({ error: 'Missing required fields: data, filename, mimeType' });
    }

    // Note: Files in serverless are ephemeral
    console.warn('Note: Uploaded files in serverless environments are ephemeral (/tmp is cleared on function restart)');

    const attachment = await UploadService.saveFile(userId, teamId, {
      data,
      originalName: filename,
      mimeType
    });

    res.json(attachment);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(400).json({ error: error.message });
  }
}
