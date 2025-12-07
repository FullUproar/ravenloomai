/**
 * GoogleDriveService - Handles Google Drive OAuth and file operations
 */

import db from '../db.js';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/oauth/google/callback';

// OAuth scopes for Google Drive
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

/**
 * Get the OAuth authorization URL for Google
 */
export function getAuthUrl(userId, state = {}) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID in environment.');
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: JSON.stringify({ userId, ...state })
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
  }

  return response.json();
}

/**
 * Get user info from Google
 */
export async function getGoogleUserInfo(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json();
}

/**
 * Save or update integration tokens
 */
export async function saveIntegration(userId, tokens, userInfo) {
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

  const result = await db.query(
    `INSERT INTO user_integrations (user_id, provider, access_token, refresh_token, token_expires_at, scope, provider_user_id, provider_email)
     VALUES ($1, 'google', $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, user_integrations.refresh_token),
       token_expires_at = EXCLUDED.token_expires_at,
       scope = EXCLUDED.scope,
       provider_user_id = EXCLUDED.provider_user_id,
       provider_email = EXCLUDED.provider_email,
       is_active = TRUE,
       updated_at = NOW()
     RETURNING *`,
    [userId, tokens.access_token, tokens.refresh_token, expiresAt, tokens.scope, userInfo.id, userInfo.email]
  );

  return mapIntegration(result.rows[0]);
}

/**
 * Get user's Google integration
 */
export async function getIntegration(userId) {
  const result = await db.query(
    `SELECT * FROM user_integrations WHERE user_id = $1 AND provider = 'google' AND is_active = TRUE`,
    [userId]
  );
  return result.rows[0] ? mapIntegration(result.rows[0]) : null;
}

/**
 * Disconnect Google integration
 */
export async function disconnectIntegration(userId) {
  await db.query(
    `UPDATE user_integrations SET is_active = FALSE, access_token = NULL, updated_at = NOW()
     WHERE user_id = $1 AND provider = 'google'`,
    [userId]
  );
  return true;
}

/**
 * Get valid access token, refreshing if needed
 */
export async function getValidAccessToken(userId) {
  const integration = await getIntegration(userId);
  if (!integration) {
    throw new Error('Google Drive not connected');
  }

  // Check if token is expired or will expire soon
  const expiresAt = new Date(integration.tokenExpiresAt);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer

  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    return integration.accessToken;
  }

  // Refresh the token
  if (!integration.refreshToken) {
    throw new Error('No refresh token available, please reconnect Google Drive');
  }

  const tokens = await refreshAccessToken(integration.refreshToken);

  // Save updated tokens
  const expiresAtNew = new Date(Date.now() + (tokens.expires_in * 1000));
  await db.query(
    `UPDATE user_integrations SET access_token = $1, token_expires_at = $2, updated_at = NOW()
     WHERE user_id = $3 AND provider = 'google'`,
    [tokens.access_token, expiresAtNew, userId]
  );

  return tokens.access_token;
}

/**
 * List files from Google Drive
 */
export async function listFiles(userId, { folderId = 'root', pageSize = 20, pageToken = null } = {}) {
  const accessToken = await getValidAccessToken(userId);

  const params = new URLSearchParams({
    pageSize: pageSize.toString(),
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, parents, webViewLink, iconLink)',
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: 'modifiedTime desc'
  });

  if (pageToken) {
    params.append('pageToken', pageToken);
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to list files: ${error.error?.message || 'Unknown error'}`);
  }

  return response.json();
}

/**
 * Get file content (for docs, sheets, slides)
 */
export async function getFileContent(userId, fileId, mimeType) {
  const accessToken = await getValidAccessToken(userId);

  // Determine export format based on mime type
  let exportMimeType;
  if (mimeType === 'application/vnd.google-apps.document') {
    exportMimeType = 'text/plain';
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    exportMimeType = 'text/csv';
  } else if (mimeType === 'application/vnd.google-apps.presentation') {
    exportMimeType = 'text/plain';
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to get file content: ${error.error?.message || response.statusText}`);
  }

  return response.text();
}

/**
 * Get file metadata
 */
export async function getFileMetadata(userId, fileId) {
  const accessToken = await getValidAccessToken(userId);

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,size,webViewLink`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to get file metadata: ${error.error?.message || response.statusText}`);
  }

  return response.json();
}

// Helper function to map database row to object
function mapIntegration(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
    scope: row.scope,
    providerUserId: row.provider_user_id,
    providerEmail: row.provider_email,
    isActive: row.is_active,
    settings: row.settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getGoogleUserInfo,
  saveIntegration,
  getIntegration,
  disconnectIntegration,
  getValidAccessToken,
  listFiles,
  getFileContent,
  getFileMetadata
};
