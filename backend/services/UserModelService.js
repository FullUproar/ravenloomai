/**
 * UserModelService - Mental model KG for each user
 *
 * Uses the same triple engine to model how each user thinks:
 * - Communication preferences (concise vs detailed, technical vs casual)
 * - Expertise areas (what topics they know well)
 * - Confirmation patterns (what they tend to accept/reject/edit)
 *
 * Triples are stored in a private 'user_model' scope per user.
 * Extraction happens passively from interaction patterns.
 */

import db from '../db.js';
import { callOpenAI } from './AIService.js';
import * as TripleService from './TripleService.js';

// ============================================================================
// SCOPE MANAGEMENT
// ============================================================================

/**
 * Get or lazily create a user_model scope for a user.
 */
export async function getOrCreateUserModelScope(teamId, userId) {
  // Check for existing user_model scope
  const existing = await db.query(
    `SELECT id FROM scopes WHERE team_id = $1 AND owner_id = $2 AND type = 'user_model' LIMIT 1`,
    [teamId, userId]
  );

  if (existing.rows[0]) return existing.rows[0].id;

  // Create new user_model scope
  const result = await db.query(
    `INSERT INTO scopes (id, team_id, type, name, owner_id, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'user_model', 'User Model', $2, $2, NOW(), NOW())
     RETURNING id`,
    [teamId, userId]
  );

  return result.rows[0].id;
}

// ============================================================================
// TRAIT EXTRACTION (passive, fire-and-forget)
// ============================================================================

/**
 * Extract user traits from an interaction event.
 * Called after ask/confirm actions. Never blocks — fire and forget.
 *
 * @param {string} teamId
 * @param {string} userId
 * @param {Object} interaction
 * @param {string} interaction.type - 'ask' | 'confirm' | 'reject' | 'edit'
 * @param {string} interaction.content - question text or confirmed content
 * @param {number} interaction.responseTimeMs - time from preview to action
 * @param {string[]} interaction.topics - topic names involved
 */
export async function extractUserTraits(teamId, userId, interaction) {
  try {
    const scopeId = await getOrCreateUserModelScope(teamId, userId);
    const existingModel = await getUserModel(teamId, userId);

    const existingTraits = existingModel.map(t => `- ${t.displayText}`).join('\n') || 'none yet';

    const response = await callOpenAI([
      {
        role: 'system',
        content: `You are analyzing a user's interaction with a knowledge management system to understand their preferences and expertise.

EXISTING USER MODEL:
${existingTraits}

Based on this interaction, extract NEW traits (if any) about the user. Only extract traits that are:
1. Not already captured in the existing model
2. Clearly supported by the interaction (don't guess)
3. Actionable for tailoring future responses

Trait categories:
- communication_preference: how they like to receive info (concise/detailed, technical/casual)
- expertise_area: topics they demonstrate knowledge in
- confirmation_pattern: what they tend to accept/reject/edit
- interaction_style: how they phrase questions, what follow-ups they ask

Return JSON: { "traits": [
  { "subject": "this_user", "relationship": "prefers", "object": "concise answers", "confidence": 0.8 }
] }
Return empty traits array if no new insights: { "traits": [] }`
      },
      {
        role: 'user',
        content: `Interaction type: ${interaction.type}
Content: ${interaction.content || ''}
Response time: ${interaction.responseTimeMs ? `${interaction.responseTimeMs}ms` : 'unknown'}
Topics involved: ${interaction.topics?.join(', ') || 'general'}
${interaction.editedContent ? `Edited to: ${interaction.editedContent}` : ''}`
      }
    ], { model: 'gpt-4o-mini', maxTokens: 300, temperature: 0.3, teamId, userId, operation: 'user_model' });

    const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
    const traits = parsed.traits || [];

    if (traits.length === 0) return { updated: 0 };

    let updated = 0;
    for (const trait of traits) {
      // Check if this trait already exists (avoid duplicates)
      const existing = await db.query(
        `SELECT t.id FROM triples t
         JOIN concepts s ON t.subject_id = s.id
         JOIN concepts o ON t.object_id = o.id
         WHERE t.scope_id = $1 AND t.status = 'active'
           AND s.canonical_name = $2 AND t.relationship = $3 AND o.canonical_name = $4
         LIMIT 1`,
        [scopeId, 'this_user', trait.relationship, trait.object.toLowerCase().trim()]
      );

      if (existing.rows[0]) continue; // Skip duplicate

      // Create the trait as a triple
      const subjectConcept = await TripleService.upsertConcept(teamId, {
        name: 'this_user',
        type: 'user',
        scopeId,
      });

      const objectConcept = await TripleService.upsertConcept(teamId, {
        name: trait.object,
        type: 'preference',
        scopeId,
      });

      await TripleService.createTriple(teamId, scopeId, {
        subjectId: subjectConcept.id,
        relationship: trait.relationship,
        objectId: objectConcept.id,
        sourceText: `Extracted from ${interaction.type} interaction`,
        sourceType: 'user_model',
        createdBy: userId,
        confidence: trait.confidence || 0.7,
        trustTier: 'tribal',
      });

      updated++;
    }

    return { updated };
  } catch (err) {
    console.error('[UserModel] Extraction error:', err.message);
    return { updated: 0 };
  }
}

// ============================================================================
// QUERY: Get user model
// ============================================================================

/**
 * Get all active user model triples for a user.
 */
export async function getUserModel(teamId, userId) {
  const scopeResult = await db.query(
    `SELECT id FROM scopes WHERE team_id = $1 AND owner_id = $2 AND type = 'user_model' LIMIT 1`,
    [teamId, userId]
  );

  if (!scopeResult.rows[0]) return [];

  const scopeId = scopeResult.rows[0].id;
  const result = await db.query(`
    SELECT t.id, t.display_text, t.relationship, t.confidence,
           s.name as subject_name, o.name as object_name
    FROM triples t
    JOIN concepts s ON t.subject_id = s.id
    JOIN concepts o ON t.object_id = o.id
    WHERE t.scope_id = $1 AND t.status = 'active'
    ORDER BY t.confidence DESC, t.created_at DESC
  `, [scopeId]);

  return result.rows.map(r => ({
    id: r.id,
    displayText: r.display_text,
    relationship: r.relationship,
    subjectName: r.subject_name,
    objectName: r.object_name,
    confidence: r.confidence,
  }));
}

// ============================================================================
// APPLY: Modify system prompt based on user model
// ============================================================================

/**
 * Generate system prompt additions based on user model.
 * Returns a string to append to the system prompt.
 */
export function applyUserModel(userModel) {
  if (!userModel || userModel.length === 0) return '';

  const preferences = userModel
    .filter(t => ['prefers', 'communication_style', 'interaction_style'].includes(t.relationship))
    .map(t => t.objectName);

  const expertise = userModel
    .filter(t => ['expertise_area', 'expertise_in', 'expert_in', 'understands'].includes(t.relationship))
    .map(t => t.objectName);

  const parts = [];

  if (preferences.length > 0) {
    parts.push(`User communication preferences: ${preferences.join(', ')}.`);
  }

  if (expertise.length > 0) {
    parts.push(`User has expertise in: ${expertise.join(', ')}. You can use technical language for these topics.`);
  }

  if (parts.length === 0) return '';

  return `\n\nUSER CONTEXT:\n${parts.join('\n')}`;
}

export default {
  getOrCreateUserModelScope,
  extractUserTraits,
  getUserModel,
  applyUserModel,
};
