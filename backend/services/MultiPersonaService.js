/**
 * Multi-Persona Service
 *
 * Manages multiple personas per project with intelligent switching,
 * role-based access, and context-aware activation.
 */

import db from '../db.js';
import PersonaService from './PersonaService.js';

class MultiPersonaService {
  /**
   * Get all personas for a project
   *
   * @param {number} projectId - Project ID
   * @param {boolean} includeInactive - Include deactivated personas
   * @returns {Promise<Array>} - List of personas
   */
  async getProjectPersonas(projectId, includeInactive = false) {
    let query = 'SELECT * FROM personas WHERE project_id = $1';
    const params = [projectId];

    if (!includeInactive) {
      query += ' AND active = true AND deactivated_at IS NULL';
    }

    query += ' ORDER BY CASE role WHEN \'primary\' THEN 1 WHEN \'specialist\' THEN 2 WHEN \'advisor\' THEN 3 WHEN \'mentor\' THEN 4 ELSE 5 END, created_at';

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get primary persona for a project
   *
   * @param {number} projectId - Project ID
   * @returns {Promise<Object|null>} - Primary persona
   */
  async getPrimaryPersona(projectId) {
    const result = await db.query(
      `SELECT * FROM personas
       WHERE project_id = $1 AND role = 'primary' AND active = true AND deactivated_at IS NULL
       ORDER BY last_active_at DESC NULLS LAST
       LIMIT 1`,
      [projectId]
    );

    return result.rows[0] || null;
  }

  /**
   * Switch active persona
   *
   * @param {number} projectId - Project ID
   * @param {number} toPersonaId - ID of persona to activate
   * @param {string} triggerType - Why switching ('manual', 'automatic', 'scheduled', 'context')
   * @param {string} triggerReason - Explanation of switch
   * @param {string} switchedBy - Who triggered ('user', 'system', 'ai')
   * @returns {Promise<Object>} - New active persona
   */
  async switchPersona(projectId, toPersonaId, triggerType = 'manual', triggerReason = null, switchedBy = 'user') {
    // Get current active persona
    const currentPersona = await PersonaService.getActivePersona(projectId);

    // Deactivate current persona
    if (currentPersona) {
      await db.query(
        'UPDATE personas SET active = false, last_active_at = CURRENT_TIMESTAMP WHERE id = $1',
        [currentPersona.id]
      );
    }

    // Activate new persona
    await db.query(
      'UPDATE personas SET active = true, last_active_at = CURRENT_TIMESTAMP WHERE id = $1',
      [toPersonaId]
    );

    // Log the switch
    await db.query(
      `INSERT INTO persona_switches (
        project_id, from_persona_id, to_persona_id, trigger_type, trigger_reason, switched_by
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, currentPersona?.id || null, toPersonaId, triggerType, triggerReason, switchedBy]
    );

    console.log(`🔄 [Persona] Switched from ${currentPersona?.display_name || 'none'} to persona ${toPersonaId} (${triggerType})`);

    // Get and return new active persona
    const result = await db.query('SELECT * FROM personas WHERE id = $1', [toPersonaId]);
    return result.rows[0];
  }

  /**
   * Check if persona should auto-switch based on context
   *
   * @param {number} projectId - Project ID
   * @param {Object} context - Current context (message, task type, time, etc.)
   * @returns {Promise<Object|null>} - Persona to switch to, or null
   */
  async checkAutoSwitch(projectId, context) {
    // Get all personas with switch triggers
    const result = await db.query(
      `SELECT * FROM personas
       WHERE project_id = $1
       AND active = false
       AND deactivated_at IS NULL
       AND switch_triggers IS NOT NULL
       AND jsonb_array_length(switch_triggers) > 0`,
      [projectId]
    );

    const personas = result.rows;

    // Check each persona's triggers
    for (const persona of personas) {
      const triggers = persona.switch_triggers;

      for (const trigger of triggers) {
        if (this._evaluateTrigger(trigger, context)) {
          console.log(`🎯 [Persona] Auto-switch triggered for ${persona.display_name}:`, trigger);
          return persona;
        }
      }
    }

    return null;
  }

  /**
   * Evaluate if a trigger condition is met
   *
   * @private
   */
  _evaluateTrigger(trigger, context) {
    switch (trigger.type) {
      case 'keyword':
        // Trigger if message contains keyword
        if (context.message) {
          const keywords = Array.isArray(trigger.keywords) ? trigger.keywords : [trigger.keywords];
          return keywords.some(kw =>
            context.message.toLowerCase().includes(kw.toLowerCase())
          );
        }
        return false;

      case 'task_type':
        // Trigger for specific task types
        if (context.taskType) {
          return trigger.taskTypes.includes(context.taskType);
        }
        return false;

      case 'goal_type':
        // Trigger for specific goal categories
        if (context.goalType) {
          return trigger.goalTypes.includes(context.goalType);
        }
        return false;

      case 'time_of_day':
        // Trigger at specific times
        const hour = new Date().getHours();
        return hour >= trigger.startHour && hour < trigger.endHour;

      case 'day_of_week':
        // Trigger on specific days
        const day = new Date().getDay();
        return trigger.days.includes(day);

      case 'conversation_topic':
        // Trigger based on conversation analysis
        if (context.conversationTopic) {
          return trigger.topics.includes(context.conversationTopic);
        }
        return false;

      default:
        console.warn(`Unknown trigger type: ${trigger.type}`);
        return false;
    }
  }

  /**
   * Create a new persona for a project
   *
   * @param {number} projectId - Project ID
   * @param {string} userId - User ID
   * @param {Object} personaData - Persona configuration
   * @param {string} role - Persona role ('primary', 'specialist', 'advisor', 'mentor')
   * @returns {Promise<Object>} - Created persona
   */
  async createPersona(projectId, userId, personaData, role = 'specialist') {
    const {
      archetype,
      specialization,
      displayName,
      voice,
      interventionStyle,
      focusArea,
      domainKnowledge,
      domainMetrics,
      customInstructions,
      communicationPreferences,
      switchTriggers,
      availabilitySchedule
    } = personaData;

    // If creating a primary persona, deactivate existing primary
    if (role === 'primary') {
      await db.query(
        'UPDATE personas SET role = \'advisor\' WHERE project_id = $1 AND role = \'primary\'',
        [projectId]
      );
    }

    const query = `
      INSERT INTO personas (
        project_id, user_id, archetype, specialization, display_name, voice,
        intervention_style, focus_area, domain_knowledge, domain_metrics,
        custom_instructions, communication_preferences, role, switch_triggers,
        availability_schedule, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const values = [
      projectId,
      userId,
      archetype,
      specialization,
      displayName,
      voice || 'professional',
      interventionStyle || 'balanced',
      focusArea || null,
      JSON.stringify(domainKnowledge || []),
      JSON.stringify(domainMetrics || []),
      customInstructions || null,
      JSON.stringify(communicationPreferences || {}),
      role,
      JSON.stringify(switchTriggers || []),
      JSON.stringify(availabilitySchedule || null),
      role === 'primary' // Primary persona starts active
    ];

    const result = await db.query(query, values);

    console.log(`✅ [Persona] Created ${role} persona: ${displayName}`);

    return result.rows[0];
  }

  /**
   * Deactivate a persona
   *
   * @param {number} personaId - Persona ID
   * @returns {Promise<boolean>}
   */
  async deactivatePersona(personaId) {
    const result = await db.query(
      'UPDATE personas SET active = false, deactivated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [personaId]
    );

    return result.rowCount > 0;
  }

  /**
   * Reactivate a persona
   *
   * @param {number} personaId - Persona ID
   * @returns {Promise<boolean>}
   */
  async reactivatePersona(personaId) {
    const result = await db.query(
      'UPDATE personas SET active = true, deactivated_at = NULL WHERE id = $1',
      [personaId]
    );

    return result.rowCount > 0;
  }

  /**
   * Get persona switch history
   *
   * @param {number} projectId - Project ID
   * @param {number} limit - Max switches to return
   * @returns {Promise<Array>} - Switch history
   */
  async getSwitchHistory(projectId, limit = 20) {
    const result = await db.query(
      `SELECT
        ps.*,
        p_from.display_name as from_persona_name,
        p_to.display_name as to_persona_name
       FROM persona_switches ps
       LEFT JOIN personas p_from ON ps.from_persona_id = p_from.id
       JOIN personas p_to ON ps.to_persona_id = p_to.id
       WHERE ps.project_id = $1
       ORDER BY ps.switched_at DESC
       LIMIT $2`,
      [projectId, limit]
    );

    return result.rows;
  }

  /**
   * Suggest persona based on context
   *
   * Uses AI to analyze context and recommend best persona
   *
   * @param {number} projectId - Project ID
   * @param {Object} context - Current context
   * @returns {Promise<Object>} - Suggested persona with reason
   */
  async suggestPersona(projectId, context) {
    // Get all available personas
    const personas = await this.getProjectPersonas(projectId);

    if (personas.length === 0) {
      return null;
    }

    if (personas.length === 1) {
      return {
        persona: personas[0],
        reason: 'Only available persona',
        confidence: 1.0
      };
    }

    // Check for auto-switch triggers first
    const autoSwitch = await this.checkAutoSwitch(projectId, context);
    if (autoSwitch) {
      return {
        persona: autoSwitch,
        reason: 'Auto-switch trigger matched',
        confidence: 0.9
      };
    }

    // Simple rule-based suggestion (could be enhanced with AI)
    // For now, suggest based on role and specialization match

    if (context.taskType === 'technical') {
      const technical = personas.find(p =>
        p.specialization?.toLowerCase().includes('tech') ||
        p.specialization?.toLowerCase().includes('developer')
      );
      if (technical) {
        return {
          persona: technical,
          reason: 'Technical task requires technical expertise',
          confidence: 0.8
        };
      }
    }

    if (context.needsMotivation) {
      const coach = personas.find(p => p.archetype === 'coach');
      if (coach) {
        return {
          persona: coach,
          reason: 'Motivational support needed',
          confidence: 0.75
        };
      }
    }

    // Default to primary
    const primary = personas.find(p => p.role === 'primary');
    return {
      persona: primary || personas[0],
      reason: 'Default primary persona',
      confidence: 0.5
    };
  }
}

export default new MultiPersonaService();
