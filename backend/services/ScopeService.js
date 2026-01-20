/**
 * ScopeService - Manages knowledge scopes
 *
 * Scopes are hierarchical knowledge boundaries that replace channels.
 * - Team scope (root): Shared team knowledge
 * - Project scopes: Narrower contexts within team
 * - Private scopes: Personal knowledge, one per user per public scope
 */

import db from '../db.js';

// ============================================================================
// SCOPE CRUD
// ============================================================================

/**
 * Create a new scope
 */
export async function createScope(teamId, {
  parentScopeId = null,
  type = 'project',
  name,
  description = null,
  ownerId = null,
  coupledScopeId = null,
  createdBy
}) {
  const result = await db.query(
    `INSERT INTO scopes (team_id, parent_scope_id, type, name, description, owner_id, coupled_scope_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [teamId, parentScopeId, type, name, description, ownerId, coupledScopeId, createdBy]
  );

  const scope = mapScope(result.rows[0]);

  // Create conversation for this scope
  if (type === 'private') {
    // Private scope gets a conversation for the owner
    await db.query(
      `INSERT INTO scope_conversations (scope_id, user_id) VALUES ($1, $2)`,
      [scope.id, ownerId]
    );
  } else {
    // Team/project scopes get a shared conversation (user_id = NULL)
    await db.query(
      `INSERT INTO scope_conversations (scope_id, user_id) VALUES ($1, NULL)`,
      [scope.id]
    );
  }

  return scope;
}

/**
 * Get a scope by ID
 */
export async function getScopeById(scopeId) {
  const result = await db.query(
    `SELECT * FROM scopes WHERE id = $1`,
    [scopeId]
  );
  return result.rows[0] ? mapScope(result.rows[0]) : null;
}

/**
 * Get the team root scope
 */
export async function getTeamScope(teamId) {
  const result = await db.query(
    `SELECT * FROM scopes WHERE team_id = $1 AND type = 'team' LIMIT 1`,
    [teamId]
  );
  return result.rows[0] ? mapScope(result.rows[0]) : null;
}

/**
 * Get all scopes for a team (excluding private)
 */
export async function getTeamScopes(teamId) {
  const result = await db.query(
    `SELECT * FROM scopes
     WHERE team_id = $1 AND type != 'private'
     ORDER BY type DESC, name ASC`,
    [teamId]
  );
  return result.rows.map(mapScope);
}

/**
 * Get child scopes of a parent
 */
export async function getChildScopes(parentScopeId) {
  const result = await db.query(
    `SELECT * FROM scopes
     WHERE parent_scope_id = $1 AND type != 'private'
     ORDER BY name ASC`,
    [parentScopeId]
  );
  return result.rows.map(mapScope);
}

/**
 * Get user's private scope for a given public scope
 */
export async function getUserPrivateScope(teamId, userId, coupledScopeId) {
  const result = await db.query(
    `SELECT * FROM scopes
     WHERE team_id = $1 AND type = 'private' AND owner_id = $2 AND coupled_scope_id = $3
     LIMIT 1`,
    [teamId, userId, coupledScopeId]
  );

  if (result.rows[0]) {
    return mapScope(result.rows[0]);
  }

  // Create private scope if it doesn't exist
  return createScope(teamId, {
    type: 'private',
    name: 'Private',
    ownerId: userId,
    coupledScopeId,
    createdBy: userId
  });
}

/**
 * Get all private scopes for a user in a team
 */
export async function getUserPrivateScopes(teamId, userId) {
  const result = await db.query(
    `SELECT * FROM scopes
     WHERE team_id = $1 AND type = 'private' AND owner_id = $2
     ORDER BY created_at ASC`,
    [teamId, userId]
  );
  return result.rows.map(mapScope);
}

/**
 * Update a scope
 */
export async function updateScope(scopeId, updates) {
  const allowedFields = ['name', 'description', 'summary'];
  const setClauses = [];
  const params = [scopeId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    const dbKey = key === 'parentScopeId' ? 'parent_scope_id' : key;
    if (allowedFields.includes(dbKey) && value !== undefined) {
      setClauses.push(`${dbKey} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return getScopeById(scopeId);
  }

  const result = await db.query(
    `UPDATE scopes SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] ? mapScope(result.rows[0]) : null;
}

/**
 * Delete a scope (and all its children via CASCADE)
 */
export async function deleteScope(scopeId) {
  // Don't allow deleting team root scopes
  const scope = await getScopeById(scopeId);
  if (scope?.type === 'team') {
    throw new Error('Cannot delete team root scope');
  }

  const result = await db.query(
    `DELETE FROM scopes WHERE id = $1 RETURNING *`,
    [scopeId]
  );
  return result.rows[0] ? mapScope(result.rows[0]) : null;
}

// ============================================================================
// SCOPE HIERARCHY
// ============================================================================

/**
 * Get the full scope tree for a team
 */
export async function getScopeTree(teamId) {
  const result = await db.query(
    `SELECT * FROM scopes
     WHERE team_id = $1 AND type != 'private'
     ORDER BY type DESC, parent_scope_id NULLS FIRST, name ASC`,
    [teamId]
  );

  const scopes = result.rows.map(mapScope);

  // Build tree structure
  const scopeMap = new Map();
  const rootScopes = [];

  for (const scope of scopes) {
    scope.children = [];
    scopeMap.set(scope.id, scope);
  }

  for (const scope of scopes) {
    if (scope.parentScopeId && scopeMap.has(scope.parentScopeId)) {
      scopeMap.get(scope.parentScopeId).children.push(scope);
    } else if (!scope.parentScopeId || scope.type === 'team') {
      rootScopes.push(scope);
    }
  }

  return rootScopes;
}

/**
 * Get ancestor scopes (for knowledge inheritance)
 * Returns array from current scope up to team root
 */
export async function getScopeAncestors(scopeId) {
  const result = await db.query(
    `WITH RECURSIVE ancestors AS (
       SELECT * FROM scopes WHERE id = $1
       UNION ALL
       SELECT s.* FROM scopes s
       INNER JOIN ancestors a ON s.id = a.parent_scope_id
     )
     SELECT * FROM ancestors ORDER BY type DESC`,
    [scopeId]
  );
  return result.rows.map(mapScope);
}

/**
 * Get scope path (breadcrumb)
 */
export async function getScopePath(scopeId) {
  const ancestors = await getScopeAncestors(scopeId);
  return ancestors.reverse(); // Root to current
}

// ============================================================================
// SCOPE CONVERSATIONS
// ============================================================================

/**
 * Get or create conversation for a scope
 */
export async function getScopeConversation(scopeId, userId = null) {
  const scope = await getScopeById(scopeId);
  if (!scope) {
    throw new Error('Scope not found');
  }

  // For private scopes, conversation is user-specific
  // For team/project scopes, conversation is shared (userId = NULL)
  const queryUserId = scope.type === 'private' ? userId : null;

  let result = await db.query(
    `SELECT * FROM scope_conversations WHERE scope_id = $1 AND user_id IS NOT DISTINCT FROM $2`,
    [scopeId, queryUserId]
  );

  if (result.rows[0]) {
    return mapConversation(result.rows[0]);
  }

  // Create conversation if it doesn't exist
  result = await db.query(
    `INSERT INTO scope_conversations (scope_id, user_id) VALUES ($1, $2) RETURNING *`,
    [scopeId, queryUserId]
  );

  return mapConversation(result.rows[0]);
}

/**
 * Get messages in a scope conversation
 */
export async function getScopeMessages(scopeId, userId = null, { limit = 50, before = null } = {}) {
  const conversation = await getScopeConversation(scopeId, userId);

  let query = `
    SELECT sm.*, u.display_name, u.email, u.avatar_url
    FROM scope_messages sm
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE sm.conversation_id = $1
  `;
  const params = [conversation.id];
  let paramIndex = 2;

  if (before) {
    query += ` AND sm.created_at < $${paramIndex}`;
    params.push(before);
    paramIndex++;
  }

  query += ` ORDER BY sm.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await db.query(query, params);

  return result.rows.map(row => ({
    id: row.id,
    conversationId: row.conversation_id,
    scopeId: row.scope_id,
    userId: row.user_id,
    content: row.content,
    isAi: row.is_ai,
    referencedFacts: row.referenced_facts || [],
    replyToMessageId: row.reply_to_message_id,
    aiCommand: row.ai_command,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    user: row.user_id ? {
      id: row.user_id,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url
    } : null
  })).reverse(); // Return in chronological order
}

/**
 * Send a message in a scope conversation
 */
export async function sendScopeMessage(scopeId, userId, content, {
  isAi = false,
  referencedFacts = [],
  replyToMessageId = null,
  aiCommand = null,
  metadata = {}
} = {}) {
  const conversation = await getScopeConversation(scopeId, isAi ? null : userId);

  const result = await db.query(
    `INSERT INTO scope_messages
     (conversation_id, scope_id, user_id, content, is_ai, referenced_facts, reply_to_message_id, ai_command, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [conversation.id, scopeId, isAi ? null : userId, content, isAi, referencedFacts, replyToMessageId, aiCommand, metadata]
  );

  // Get user info for response
  let user = null;
  if (!isAi && userId) {
    const userResult = await db.query(
      `SELECT id, display_name, email, avatar_url FROM users WHERE id = $1`,
      [userId]
    );
    if (userResult.rows[0]) {
      user = {
        id: userResult.rows[0].id,
        displayName: userResult.rows[0].display_name,
        email: userResult.rows[0].email,
        avatarUrl: userResult.rows[0].avatar_url
      };
    }
  }

  const row = result.rows[0];
  return {
    id: row.id,
    conversationId: row.conversation_id,
    scopeId: row.scope_id,
    userId: row.user_id,
    content: row.content,
    isAi: row.is_ai,
    referencedFacts: row.referenced_facts || [],
    replyToMessageId: row.reply_to_message_id,
    aiCommand: row.ai_command,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    user
  };
}

// ============================================================================
// SCOPE-AWARE QUERIES
// ============================================================================

/**
 * Get scope IDs for knowledge search (current + ancestors + optional private)
 */
export async function getSearchScopeIds(scopeId, userId = null, includePrivate = false) {
  const scopeIds = [];

  // Get current scope and ancestors
  const ancestors = await getScopeAncestors(scopeId);
  for (const scope of ancestors) {
    scopeIds.push(scope.id);
  }

  // Include private scope if requested
  if (includePrivate && userId) {
    const scope = await getScopeById(scopeId);
    if (scope) {
      const privateScope = await getUserPrivateScope(scope.teamId, userId, scopeId);
      if (privateScope) {
        scopeIds.push(privateScope.id);
      }
    }
  }

  return scopeIds;
}

/**
 * Get child scope summaries (for parent scope awareness)
 */
export async function getChildScopeSummaries(scopeId) {
  const result = await db.query(
    `SELECT id, name, summary FROM scopes
     WHERE parent_scope_id = $1 AND type != 'private'
     ORDER BY name ASC`,
    [scopeId]
  );

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    summary: row.summary
  }));
}

// ============================================================================
// TEAM INITIALIZATION
// ============================================================================

/**
 * Initialize scopes for a new team
 */
export async function initializeTeamScopes(teamId, teamName, createdBy) {
  // Create team root scope
  const teamScope = await createScope(teamId, {
    type: 'team',
    name: teamName,
    description: 'Team-wide knowledge and conversations',
    createdBy
  });

  return teamScope;
}

/**
 * Initialize private scope for a new team member
 */
export async function initializeUserPrivateScope(teamId, userId) {
  const teamScope = await getTeamScope(teamId);
  if (!teamScope) {
    throw new Error('Team scope not found');
  }

  return getUserPrivateScope(teamId, userId, teamScope.id);
}

// ============================================================================
// HELPERS
// ============================================================================

function mapScope(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    parentScopeId: row.parent_scope_id,
    type: row.type,
    name: row.name,
    description: row.description,
    summary: row.summary,
    ownerId: row.owner_id,
    coupledScopeId: row.coupled_scope_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    scopeId: row.scope_id,
    userId: row.user_id,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at
  };
}

export default {
  // CRUD
  createScope,
  getScopeById,
  getTeamScope,
  getTeamScopes,
  getChildScopes,
  getUserPrivateScope,
  getUserPrivateScopes,
  updateScope,
  deleteScope,

  // Hierarchy
  getScopeTree,
  getScopeAncestors,
  getScopePath,

  // Conversations
  getScopeConversation,
  getScopeMessages,
  sendScopeMessage,

  // Search
  getSearchScopeIds,
  getChildScopeSummaries,

  // Initialization
  initializeTeamScopes,
  initializeUserPrivateScope
};
