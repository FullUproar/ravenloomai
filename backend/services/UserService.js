/**
 * UserService - Manages user profiles
 */

import db from '../db.js';

/**
 * Create or update a user (called on login)
 */
export async function createOrUpdateUser(userId, email, displayName = null, avatarUrl = null) {
  const result = await db.query(
    `INSERT INTO users (id, email, display_name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
       updated_at = NOW()
     RETURNING *`,
    [userId, email.toLowerCase(), displayName, avatarUrl]
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
    createdAt: row.created_at
  };
}

export default {
  createOrUpdateUser,
  getUserById,
  getUserByEmail,
  updateUser
};
