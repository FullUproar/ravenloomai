/**
 * UserService - Manages user profiles
 */

import db from '../db.js';
import crypto from 'crypto';

/**
 * Check if a user exists
 */
export async function userExists(userId) {
  const result = await db.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0;
}

/**
 * Check if this is the first user (will be made admin)
 */
async function isFirstUser() {
  const result = await db.query('SELECT COUNT(*) as count FROM users');
  return parseInt(result.rows[0].count) === 0;
}

/**
 * Check if email has a valid (pending, non-expired) site invite
 */
export async function hasValidSiteInvite(email) {
  const result = await db.query(
    `SELECT * FROM site_invites
     WHERE email = $1
       AND status = 'pending'
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [email.toLowerCase()]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Accept a site invite (mark as used)
 */
export async function acceptSiteInvite(email) {
  await db.query(
    `UPDATE site_invites
     SET status = 'accepted', accepted_at = NOW()
     WHERE email = $1 AND status = 'pending'`,
    [email.toLowerCase()]
  );
}

/**
 * Create or update a user (called on login)
 * Now requires a valid site invite for new users (except first user)
 */
export async function createOrUpdateUser(userId, email, displayName = null, avatarUrl = null) {
  const normalizedEmail = email.toLowerCase();

  // Check if user already exists
  const existingUser = await userExists(userId);

  if (!existingUser) {
    // New user - check if they have a valid invite (or are the first user)
    const firstUser = await isFirstUser();

    if (!firstUser) {
      const invite = await hasValidSiteInvite(normalizedEmail);
      if (!invite) {
        throw new Error('INVITE_REQUIRED: You need a site invite to create an account. Please contact an admin.');
      }
      // Mark invite as accepted
      await acceptSiteInvite(normalizedEmail);
    }
  }

  // Determine if this should be an admin (first user)
  const makeAdmin = !existingUser && await isFirstUser();

  const result = await db.query(
    `INSERT INTO users (id, email, display_name, avatar_url, is_site_admin)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
       updated_at = NOW()
     RETURNING *`,
    [userId, normalizedEmail, displayName, avatarUrl, makeAdmin]
  );
  return mapUser(result.rows[0]);
}

/**
 * Get user by ID
 */
export async function getUserById(userId) {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email) {
  const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

/**
 * Update user profile
 */
export async function updateUser(userId, { displayName, avatarUrl }) {
  const updates = [];
  const params = [userId];
  let paramIndex = 2;

  if (displayName !== undefined) {
    updates.push(`display_name = $${paramIndex}`);
    params.push(displayName);
    paramIndex++;
  }

  if (avatarUrl !== undefined) {
    updates.push(`avatar_url = $${paramIndex}`);
    params.push(avatarUrl);
    paramIndex++;
  }

  if (updates.length === 0) {
    return getUserById(userId);
  }

  updates.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

/**
 * Update user preferences (digest, timezone, etc.)
 */
export async function updatePreferences(userId, { digestTime, timezone, digestEnabled, preferences }) {
  const updates = [];
  const params = [userId];
  let paramIndex = 2;

  if (digestTime !== undefined) {
    updates.push(`digest_time = $${paramIndex}`);
    params.push(digestTime);
    paramIndex++;
  }

  if (timezone !== undefined) {
    updates.push(`timezone = $${paramIndex}`);
    params.push(timezone);
    paramIndex++;
  }

  if (digestEnabled !== undefined) {
    updates.push(`digest_enabled = $${paramIndex}`);
    params.push(digestEnabled);
    paramIndex++;
  }

  if (preferences !== undefined) {
    updates.push(`preferences = $${paramIndex}`);
    params.push(JSON.stringify(preferences));
    paramIndex++;
  }

  if (updates.length === 0) {
    return getUserById(userId);
  }

  updates.push('updated_at = NOW()');

  const result = await db.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

// ============================================================================
// Site Invite Management
// ============================================================================

/**
 * Generate a unique invite code
 */
function generateInviteCode() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a site invite (admin only)
 */
export async function createSiteInvite(invitedBy, email) {
  const inviteCode = generateInviteCode();
  const result = await db.query(
    `INSERT INTO site_invites (email, invited_by, invite_code, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (email, status)
     WHERE status = 'pending'
     DO UPDATE SET
       invited_by = EXCLUDED.invited_by,
       invite_code = EXCLUDED.invite_code,
       expires_at = NOW() + INTERVAL '7 days',
       created_at = NOW()
     RETURNING *`,
    [email.toLowerCase(), invitedBy, inviteCode]
  );
  return mapSiteInvite(result.rows[0]);
}

/**
 * Get all site invites (for admin dashboard)
 */
export async function getSiteInvites() {
  const result = await db.query(
    `SELECT si.*, u.display_name as invited_by_name, u.email as invited_by_email
     FROM site_invites si
     LEFT JOIN users u ON si.invited_by = u.id
     ORDER BY si.created_at DESC`
  );
  return result.rows.map(mapSiteInvite);
}

/**
 * Revoke a site invite
 */
export async function revokeSiteInvite(inviteId) {
  const result = await db.query(
    `UPDATE site_invites SET status = 'revoked' WHERE id = $1 RETURNING *`,
    [inviteId]
  );
  return result.rows[0] ? mapSiteInvite(result.rows[0]) : null;
}

/**
 * Check if user is a site admin
 */
export async function isSiteAdmin(userId) {
  const result = await db.query(
    'SELECT is_site_admin FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.is_site_admin === true;
}

/**
 * Make a user a site admin
 */
export async function makeSiteAdmin(userId, isAdmin = true) {
  const result = await db.query(
    'UPDATE users SET is_site_admin = $2 WHERE id = $1 RETURNING *',
    [userId, isAdmin]
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

// ============================================================================
// Helper functions
// ============================================================================

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    digestTime: row.digest_time,
    timezone: row.timezone,
    digestEnabled: row.digest_enabled,
    preferences: row.preferences,
    isSiteAdmin: row.is_site_admin || false,
    createdAt: row.created_at
  };
}

function mapSiteInvite(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    invitedBy: row.invited_by,
    invitedByName: row.invited_by_name || null,
    invitedByEmail: row.invited_by_email || null,
    inviteCode: row.invite_code,
    status: row.status,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at
  };
}

export default {
  createOrUpdateUser,
  getUserById,
  getUserByEmail,
  updateUser,
  updatePreferences,
  userExists,
  hasValidSiteInvite,
  acceptSiteInvite,
  createSiteInvite,
  getSiteInvites,
  revokeSiteInvite,
  isSiteAdmin,
  makeSiteAdmin
};
