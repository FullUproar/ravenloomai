/**
 * TeamService - Manages teams, members, and invites
 */

import db from '../db.js';
import crypto from 'crypto';

/**
 * Create a new team
 */
export async function createTeam(name, ownerId) {
  // Generate slug from name
  const baseSlug = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Ensure unique slug
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const existing = await db.query('SELECT id FROM teams WHERE slug = $1', [slug]);
    if (existing.rows.length === 0) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  // Create team
  const teamResult = await db.query(
    `INSERT INTO teams (name, slug) VALUES ($1, $2) RETURNING *`,
    [name, slug]
  );
  const team = teamResult.rows[0];

  // Add owner as team member
  await db.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [team.id, ownerId]
  );

  // Create default #general channel
  await db.query(
    `INSERT INTO channels (team_id, name, description, is_default, created_by)
     VALUES ($1, 'general', 'General discussion', true, $2)`,
    [team.id, ownerId]
  );

  // Note: Calendar chat is now created on-demand per user (like Raven DM)
  // instead of a shared #calendar channel

  return mapTeam(team);
}

/**
 * Get team by ID
 */
export async function getTeamById(teamId) {
  const result = await db.query('SELECT * FROM teams WHERE id = $1', [teamId]);
  return result.rows[0] ? mapTeam(result.rows[0]) : null;
}

/**
 * Get team by slug
 */
export async function getTeamBySlug(slug) {
  const result = await db.query('SELECT * FROM teams WHERE slug = $1', [slug]);
  return result.rows[0] ? mapTeam(result.rows[0]) : null;
}

/**
 * Get teams for a user
 */
export async function getTeamsForUser(userId) {
  const result = await db.query(
    `SELECT t.* FROM teams t
     JOIN team_members tm ON t.id = tm.team_id
     WHERE tm.user_id = $1
     ORDER BY t.created_at DESC`,
    [userId]
  );
  return result.rows.map(mapTeam);
}

/**
 * Update team
 */
export async function updateTeam(teamId, name) {
  const result = await db.query(
    `UPDATE teams SET name = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [teamId, name]
  );
  return result.rows[0] ? mapTeam(result.rows[0]) : null;
}

/**
 * Delete team
 */
export async function deleteTeam(teamId) {
  const result = await db.query('DELETE FROM teams WHERE id = $1 RETURNING id', [teamId]);
  return result.rows.length > 0;
}

/**
 * Get team members
 */
export async function getTeamMembers(teamId) {
  const result = await db.query(
    `SELECT tm.*, u.email, u.display_name, u.avatar_url
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     WHERE tm.team_id = $1
     ORDER BY tm.role = 'owner' DESC, tm.created_at ASC`,
    [teamId]
  );
  return result.rows.map(mapTeamMember);
}

/**
 * Check if user is member of team
 */
export async function isTeamMember(teamId, userId) {
  const result = await db.query(
    'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Get member role
 */
export async function getMemberRole(teamId, userId) {
  const result = await db.query(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  return result.rows[0]?.role || null;
}

/**
 * Update member role
 */
export async function updateMemberRole(teamId, userId, role) {
  const result = await db.query(
    `UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2 RETURNING *`,
    [teamId, userId, role]
  );

  if (result.rows.length === 0) {
    throw new Error('Member not found');
  }

  // Fetch full member info
  const memberResult = await db.query(
    `SELECT tm.*, u.email, u.display_name, u.avatar_url
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     WHERE tm.id = $1`,
    [result.rows[0].id]
  );

  return mapTeamMember(memberResult.rows[0]);
}

/**
 * Remove member from team
 */
export async function removeMember(teamId, userId) {
  // Can't remove the owner
  const role = await getMemberRole(teamId, userId);
  if (role === 'owner') {
    throw new Error('Cannot remove team owner');
  }

  const result = await db.query(
    'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING id',
    [teamId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Create team invite
 */
export async function createInvite(teamId, email, role, invitedBy) {
  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');

  // Expires in 7 days
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const result = await db.query(
    `INSERT INTO team_invites (team_id, email, role, invited_by, token, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [teamId, email.toLowerCase(), role || 'member', invitedBy, token, expiresAt]
  );

  return mapInvite(result.rows[0]);
}

/**
 * Get team invites
 */
export async function getTeamInvites(teamId) {
  const result = await db.query(
    `SELECT * FROM team_invites
     WHERE team_id = $1 AND accepted_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [teamId]
  );
  return result.rows.map(mapInvite);
}

/**
 * Validate invite token
 */
export async function validateInviteToken(token) {
  const result = await db.query(
    `SELECT * FROM team_invites
     WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
    [token]
  );
  return result.rows[0] ? mapInvite(result.rows[0]) : null;
}

/**
 * Accept invite
 */
export async function acceptInvite(token, userId) {
  // Get and validate invite
  const inviteResult = await db.query(
    `SELECT * FROM team_invites
     WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
    [token]
  );

  if (inviteResult.rows.length === 0) {
    throw new Error('Invalid or expired invite');
  }

  const invite = inviteResult.rows[0];

  // Check if already a member
  const existing = await db.query(
    'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
    [invite.team_id, userId]
  );

  if (existing.rows.length > 0) {
    throw new Error('Already a member of this team');
  }

  // Add as team member
  const memberResult = await db.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [invite.team_id, userId, invite.role]
  );

  // Mark invite as accepted
  await db.query(
    'UPDATE team_invites SET accepted_at = NOW() WHERE id = $1',
    [invite.id]
  );

  // Fetch full member info
  const fullMemberResult = await db.query(
    `SELECT tm.*, u.email, u.display_name, u.avatar_url
     FROM team_members tm
     JOIN users u ON tm.user_id = u.id
     WHERE tm.id = $1`,
    [memberResult.rows[0].id]
  );

  return mapTeamMember(fullMemberResult.rows[0]);
}

// ============================================================================
// Helper functions
// ============================================================================

function mapTeam(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTeamMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url
    },
    createdAt: row.created_at
  };
}

function mapInvite(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    email: row.email,
    role: row.role,
    token: row.token,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at
  };
}

export default {
  createTeam,
  getTeamById,
  getTeamBySlug,
  getTeamsForUser,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  isTeamMember,
  getMemberRole,
  updateMemberRole,
  removeMember,
  createInvite,
  getTeamInvites,
  validateInviteToken,
  acceptInvite
};
