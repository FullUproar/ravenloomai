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
 * Validate an access code (for users without email invites)
 */
export async function validateAccessCode(code) {
  const result = await db.query(
    `SELECT * FROM access_codes
     WHERE code = $1
       AND is_active = TRUE
       AND (uses_remaining IS NULL OR uses_remaining > 0)
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [code.toUpperCase().trim()]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Use an access code (decrement uses, track usage)
 */
export async function useAccessCode(accessCodeId, userId, email) {
  // Decrement uses_remaining
  await db.query(
    `UPDATE access_codes
     SET uses_remaining = CASE
       WHEN uses_remaining IS NOT NULL THEN uses_remaining - 1
       ELSE uses_remaining
     END,
     updated_at = NOW()
     WHERE id = $1`,
    [accessCodeId]
  );

  // Track who used it
  await db.query(
    `INSERT INTO access_code_uses (access_code_id, user_id, email)
     VALUES ($1, $2, $3)`,
    [accessCodeId, userId, email]
  );
}

/**
 * Store pending access code for a session (before user creation)
 * This is stored in memory temporarily
 */
const pendingAccessCodes = new Map();

export function storePendingAccessCode(email, accessCode) {
  pendingAccessCodes.set(email.toLowerCase(), accessCode);
}

export function getPendingAccessCode(email) {
  return pendingAccessCodes.get(email.toLowerCase());
}

export function clearPendingAccessCode(email) {
  pendingAccessCodes.delete(email.toLowerCase());
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
 * Now requires a valid site invite OR access code for new users (except first user)
 */
export async function createOrUpdateUser(userId, email, displayName = null, avatarUrl = null) {
  const normalizedEmail = email.toLowerCase();

  // Check if user already exists
  const existingUser = await userExists(userId);
  let accessCodeUsed = null;

  if (!existingUser) {
    // New user - check if they have a valid invite, access code, or are the first user
    const firstUser = await isFirstUser();

    if (!firstUser) {
      const invite = await hasValidSiteInvite(normalizedEmail);
      const pendingCode = getPendingAccessCode(normalizedEmail);

      if (!invite && !pendingCode) {
        throw new Error('INVITE_REQUIRED: You need a site invite or access code to create an account. Please contact an admin.');
      }

      if (invite) {
        // Mark invite as accepted
        await acceptSiteInvite(normalizedEmail);
      } else if (pendingCode) {
        // Will use access code after user is created
        accessCodeUsed = pendingCode;
      }
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

  // If user was created with an access code, mark it as used
  if (accessCodeUsed) {
    await useAccessCode(accessCodeUsed.id, userId, normalizedEmail);
    clearPendingAccessCode(normalizedEmail);
  }

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
 * Check if user is a site admin (super_admin role)
 */
export async function isSiteAdmin(userId) {
  const result = await db.query(
    'SELECT is_site_admin, site_role FROM users WHERE id = $1',
    [userId]
  );
  // Check both for backwards compatibility
  return result.rows[0]?.is_site_admin === true || result.rows[0]?.site_role === 'super_admin';
}

/**
 * Get user's site role
 */
export async function getUserSiteRole(userId) {
  const result = await db.query(
    'SELECT site_role FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.site_role || 'user';
}

/**
 * Check if user can create teams (team_creator or super_admin)
 */
export async function canCreateTeams(userId) {
  const role = await getUserSiteRole(userId);
  return role === 'team_creator' || role === 'super_admin';
}

/**
 * Update user's site role
 */
export async function updateSiteRole(userId, role) {
  const validRoles = ['user', 'team_creator', 'super_admin'];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`);
  }

  // Also update is_site_admin for backwards compatibility
  const isSuperAdmin = role === 'super_admin';

  const result = await db.query(
    'UPDATE users SET site_role = $2, is_site_admin = $3 WHERE id = $1 RETURNING *',
    [userId, role, isSuperAdmin]
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

/**
 * Make a user a site admin (backwards compatibility wrapper)
 */
export async function makeSiteAdmin(userId, isAdmin = true) {
  const role = isAdmin ? 'super_admin' : 'user';
  return updateSiteRole(userId, role);
}

/**
 * Get all users (for admin dashboard)
 */
export async function getAllUsers() {
  const result = await db.query(
    `SELECT * FROM users ORDER BY created_at DESC`
  );
  return result.rows.map(mapUser);
}

// ============================================================================
// Access Code Management (Admin Only)
// ============================================================================

/**
 * Generate a random access code
 */
function generateAccessCode() {
  // Generate a 6-character uppercase alphanumeric code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0,O,1,I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create an access code (admin only)
 */
export async function createAccessCode(createdBy, { description, maxUses = 1, teamId = null, expiresAt = null }) {
  const code = generateAccessCode();
  const result = await db.query(
    `INSERT INTO access_codes (code, description, created_by, max_uses, uses_remaining, team_id, expires_at)
     VALUES ($1, $2, $3, $4, $4, $5, $6)
     RETURNING *`,
    [code, description, createdBy, maxUses, teamId, expiresAt]
  );
  return mapAccessCode(result.rows[0]);
}

/**
 * Get all access codes (for admin dashboard)
 */
export async function getAccessCodes() {
  const result = await db.query(
    `SELECT ac.*, u.display_name as created_by_name, u.email as created_by_email, t.name as team_name
     FROM access_codes ac
     LEFT JOIN users u ON ac.created_by = u.id
     LEFT JOIN teams t ON ac.team_id = t.id
     ORDER BY ac.created_at DESC`
  );
  return result.rows.map(mapAccessCode);
}

/**
 * Get access code usage history
 */
export async function getAccessCodeUses(accessCodeId) {
  const result = await db.query(
    `SELECT acu.*, u.display_name, u.email
     FROM access_code_uses acu
     LEFT JOIN users u ON acu.user_id = u.id
     WHERE acu.access_code_id = $1
     ORDER BY acu.used_at DESC`,
    [accessCodeId]
  );
  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    usedAt: row.used_at
  }));
}

/**
 * Deactivate an access code
 */
export async function deactivateAccessCode(codeId) {
  const result = await db.query(
    `UPDATE access_codes SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [codeId]
  );
  return result.rows[0] ? mapAccessCode(result.rows[0]) : null;
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
    siteRole: row.site_role || 'user',
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

function mapAccessCode(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    createdByEmail: row.created_by_email || null,
    maxUses: row.max_uses,
    usesRemaining: row.uses_remaining,
    teamId: row.team_id,
    teamName: row.team_name || null,
    isActive: row.is_active,
    expiresAt: row.expires_at,
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
  makeSiteAdmin,
  // Role management
  getUserSiteRole,
  canCreateTeams,
  updateSiteRole,
  getAllUsers,
  // Access code functions
  validateAccessCode,
  useAccessCode,
  storePendingAccessCode,
  getPendingAccessCode,
  clearPendingAccessCode,
  createAccessCode,
  getAccessCodes,
  getAccessCodeUses,
  deactivateAccessCode
};
