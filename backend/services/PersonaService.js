/**
 * PersonaService
 *
 * Handles CRUD operations for personas.
 * Single source of truth for persona data management.
 */

import db from '../db.js';
import { getArchetype, getSpecialization, isValidCombination } from '../config/archetypes.js';

class PersonaService {
  /**
   * Create a new persona
   *
   * @param {Object} config - Persona configuration
   * @returns {Promise<Object>} - Created persona
   */
  async createPersona(config) {
    const {
      projectId,
      userId,
      archetype,
      specialization,
      customInstructions = null,
      communicationPreferences = {}
    } = config;

    // Validate archetype + specialization combo
    if (!isValidCombination(archetype, specialization)) {
      throw new Error(`Invalid archetype-specialization combination: ${archetype}-${specialization}`);
    }

    // Get archetype and specialization configs
    const archetypeConfig = getArchetype(archetype);
    const specializationConfig = getSpecialization(archetype, specialization);

    // Build persona object
    const personaData = {
      project_id: projectId,
      user_id: userId,
      archetype,
      specialization,
      display_name: specializationConfig.displayName,
      voice: archetypeConfig.voice,
      intervention_style: archetypeConfig.interventionStyle,
      focus_area: archetypeConfig.focusArea,
      domain_knowledge: JSON.stringify(specializationConfig.domainKnowledge),
      domain_metrics: JSON.stringify(specializationConfig.domainMetrics),
      custom_instructions: customInstructions,
      communication_preferences: JSON.stringify(communicationPreferences),
      context: JSON.stringify({}),
      active: true
    };

    // Insert into database
    const query = `
      INSERT INTO personas (
        project_id, user_id, archetype, specialization, display_name,
        voice, intervention_style, focus_area,
        domain_knowledge, domain_metrics,
        custom_instructions, communication_preferences, context, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      personaData.project_id,
      personaData.user_id,
      personaData.archetype,
      personaData.specialization,
      personaData.display_name,
      personaData.voice,
      personaData.intervention_style,
      personaData.focus_area,
      personaData.domain_knowledge,
      personaData.domain_metrics,
      personaData.custom_instructions,
      personaData.communication_preferences,
      personaData.context,
      personaData.active
    ];

    const result = await db.query(query, values);
    return this._mapPersonaFromDb(result.rows[0]);
  }

  /**
   * Get persona by ID
   *
   * @param {number} personaId - Persona ID
   * @returns {Promise<Object|null>} - Persona or null if not found
   */
  async getPersonaById(personaId) {
    const query = 'SELECT * FROM personas WHERE id = $1';
    const result = await db.query(query, [personaId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this._mapPersonaFromDb(result.rows[0]);
  }

  /**
   * Get active persona for a project
   *
   * @param {number} projectId - Project ID
   * @returns {Promise<Object|null>} - Active persona or null
   */
  async getActivePersona(projectId) {
    const query = 'SELECT * FROM personas WHERE project_id = $1 AND active = true LIMIT 1';
    const result = await db.query(query, [projectId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this._mapPersonaFromDb(result.rows[0]);
  }

  /**
   * Get all personas for a project (including inactive)
   *
   * @param {number} projectId - Project ID
   * @returns {Promise<Array>} - Array of personas
   */
  async getPersonasByProject(projectId) {
    const query = 'SELECT * FROM personas WHERE project_id = $1 ORDER BY created_at DESC';
    const result = await db.query(query, [projectId]);

    return result.rows.map(row => this._mapPersonaFromDb(row));
  }

  /**
   * Update persona
   *
   * @param {number} personaId - Persona ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated persona
   */
  async updatePersona(personaId, updates) {
    const allowedUpdates = [
      'custom_instructions',
      'communication_preferences',
      'context',
      'active'
    ];

    const updateParts = [];
    const values = [];
    let paramCounter = 1;

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        let value = updates[key];

        // Stringify objects for JSONB columns
        if (key === 'communication_preferences' || key === 'context') {
          value = JSON.stringify(value);
        }

        updateParts.push(`${key} = $${paramCounter}`);
        values.push(value);
        paramCounter++;
      }
    });

    if (updateParts.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add updated timestamp
    updateParts.push(`last_active_at = CURRENT_TIMESTAMP`);

    // Add persona ID as last parameter
    values.push(personaId);

    const query = `
      UPDATE personas
      SET ${updateParts.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error(`Persona ${personaId} not found`);
    }

    return this._mapPersonaFromDb(result.rows[0]);
  }

  /**
   * Deactivate persona
   *
   * @param {number} personaId - Persona ID
   * @returns {Promise<void>}
   */
  async deactivatePersona(personaId) {
    await this.updatePersona(personaId, { active: false });
  }

  /**
   * Delete persona permanently
   *
   * @param {number} personaId - Persona ID
   * @returns {Promise<boolean>} - True if deleted
   */
  async deletePersona(personaId) {
    const query = 'DELETE FROM personas WHERE id = $1';
    const result = await db.query(query, [personaId]);
    return result.rowCount > 0;
  }

  /**
   * Check if project has active persona
   *
   * @param {number} projectId - Project ID
   * @returns {Promise<boolean>}
   */
  async projectHasPersona(projectId) {
    const persona = await this.getActivePersona(projectId);
    return persona !== null;
  }

  /**
   * Map database row to persona object
   *
   * @private
   * @param {Object} row - Database row
   * @returns {Object} - Persona object
   */
  _mapPersonaFromDb(row) {
    return {
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      archetype: row.archetype,
      specialization: row.specialization,
      displayName: row.display_name,
      voice: row.voice,
      interventionStyle: row.intervention_style,
      focusArea: row.focus_area,
      domainKnowledge: typeof row.domain_knowledge === 'string'
        ? JSON.parse(row.domain_knowledge)
        : row.domain_knowledge,
      domainMetrics: typeof row.domain_metrics === 'string'
        ? JSON.parse(row.domain_metrics)
        : row.domain_metrics,
      customInstructions: row.custom_instructions,
      communicationPreferences: typeof row.communication_preferences === 'string'
        ? JSON.parse(row.communication_preferences)
        : row.communication_preferences,
      context: typeof row.context === 'string'
        ? JSON.parse(row.context)
        : row.context,
      active: row.active,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at
    };
  }
}

export default new PersonaService();
