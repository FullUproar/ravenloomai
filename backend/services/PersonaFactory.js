/**
 * PersonaFactory Service
 *
 * Creates personas from user input using AI to suggest appropriate
 * archetype-specialization combinations and configurations.
 */

import { getAllArchetypes, getSpecializations, getArchetype, getSpecialization } from '../config/archetypes.js';
import { generateStructuredOutput } from '../utils/llm.js';
import PersonaService from './PersonaService.js';

class PersonaFactory {
  /**
   * Create persona from user's goal description
   *
   * @param {string} userGoal - Natural language goal (e.g., "I want to lose 20 pounds")
   * @param {number} projectId - Project ID
   * @param {string} userId - User ID
   * @param {Object} userPreferences - Optional user preferences
   * @returns {Promise<Object>} - Created persona
   */
  async createFromUserGoal(userGoal, projectId, userId, userPreferences = {}) {
    // Step 1: Suggest archetype and specialization
    const suggestion = await this.suggestPersona(userGoal);

    // Step 2: Build configuration
    const config = {
      projectId,
      userId,
      archetype: suggestion.archetype,
      specialization: suggestion.specialization,
      customInstructions: userPreferences.customInstructions || null,
      communicationPreferences: this._buildCommunicationPreferences(userPreferences)
    };

    // Step 3: Create persona
    return await PersonaService.createPersona(config);
  }

  /**
   * Suggest persona archetype and specialization based on user goal
   *
   * Uses AI to analyze the goal and recommend appropriate persona configuration.
   *
   * @param {string} userGoal - User's stated goal
   * @returns {Promise<Object>} - {archetype, specialization, rationale, alternates}
   */
  async suggestPersona(userGoal) {
    const availableArchetypes = getAllArchetypes();

    // Build list of all valid combinations
    const validCombinations = [];
    availableArchetypes.forEach(archetype => {
      const specializations = getSpecializations(archetype);
      specializations.forEach(spec => {
        const specConfig = getSpecialization(archetype, spec);
        validCombinations.push({
          archetype,
          specialization: spec,
          displayName: specConfig.displayName,
          focusArea: getArchetype(archetype).focusArea
        });
      });
    });

    const systemPrompt = `You are an expert at matching user goals to appropriate project management personas.

Available persona types:
${validCombinations.map(c => `- ${c.displayName} (${c.archetype}/${c.specialization}): Focus on ${c.focusArea}`).join('\n')}

Analyze the user's goal and recommend:
1. The BEST archetype-specialization combination
2. A brief rationale (1-2 sentences)
3. 1-2 alternate options if applicable

Respond with JSON only.`;

    const userPrompt = `User goal: "${userGoal}"

Which persona type is most appropriate for this goal?`;

    const schema = {
      archetype: "string (one of: coach, advisor, strategist, partner, manager, coordinator)",
      specialization: "string (must be valid for the archetype)",
      rationale: "string (brief explanation)",
      alternates: "array of {archetype, specialization, rationale} objects (optional)"
    };

    try {
      const response = await generateStructuredOutput(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        schema,
        { model: 'gpt-4', temperature: 0.7 }
      );

      // Validate the suggestion
      const specConfig = getSpecialization(response.archetype, response.specialization);
      if (!specConfig) {
        console.warn('AI suggested invalid combination, falling back to default');
        return this._getDefaultPersona(userGoal);
      }

      return {
        archetype: response.archetype,
        specialization: response.specialization,
        displayName: specConfig.displayName,
        rationale: response.rationale,
        alternates: response.alternates || []
      };

    } catch (error) {
      console.error('Error suggesting persona:', error);
      // Fallback to rule-based suggestion
      return this._getDefaultPersona(userGoal);
    }
  }

  /**
   * Get persona configuration options for user customization
   *
   * @param {string} archetype - Archetype name
   * @param {string} specialization - Specialization name
   * @returns {Object} - Available customization options
   */
  getCustomizationOptions(archetype, specialization) {
    const archetypeConfig = getArchetype(archetype);
    const specConfig = getSpecialization(archetype, specialization);

    return {
      displayName: specConfig.displayName,
      defaultTone: archetypeConfig.defaultTone,
      availableTones: ['formal', 'casual', 'direct', 'empathetic'],
      availableVerbosity: ['concise', 'detailed'],
      communicationOptions: {
        emoji: {
          description: 'Use emoji in responses',
          default: true
        },
        platitudes: {
          description: 'Use motivational phrases like "Great job!"',
          default: archetype === 'coach' // Coaches use platitudes by default
        }
      }
    };
  }

  /**
   * Build communication preferences object
   *
   * @private
   * @param {Object} userPreferences - User's stated preferences
   * @returns {Object} - Communication preferences
   */
  _buildCommunicationPreferences(userPreferences) {
    const defaults = {
      tone: 'empathetic',
      verbosity: 'concise',
      emoji: false, // Conservative default for MVP
      platitudes: true
    };

    return {
      tone: userPreferences.tone || defaults.tone,
      verbosity: userPreferences.verbosity || defaults.verbosity,
      emoji: userPreferences.emoji !== undefined ? userPreferences.emoji : defaults.emoji,
      platitudes: userPreferences.platitudes !== undefined ? userPreferences.platitudes : defaults.platitudes
    };
  }

  /**
   * Fallback: Rule-based persona suggestion
   *
   * @private
   * @param {string} userGoal - User goal
   * @returns {Object} - Persona suggestion
   */
  _getDefaultPersona(userGoal) {
    const goalLower = userGoal.toLowerCase();

    // Health & fitness keywords
    if (goalLower.match(/\b(lose weight|get fit|exercise|workout|health|diet|nutrition)\b/)) {
      return {
        archetype: 'coach',
        specialization: 'health',
        displayName: 'Health Coach',
        rationale: 'Detected health and fitness goal - Health Coach will support habit formation',
        alternates: [
          { archetype: 'coach', specialization: 'fitness', rationale: 'If focused on workouts specifically' }
        ]
      };
    }

    // Academic keywords
    if (goalLower.match(/\b(college|university|school|study|test|exam|sat|gpa|application)\b/)) {
      return {
        archetype: 'advisor',
        specialization: 'academic',
        displayName: 'Academic Advisor',
        rationale: 'Detected academic goal - Academic Advisor will help with strategic planning',
        alternates: []
      };
    }

    // Business/launch keywords
    if (goalLower.match(/\b(launch|startup|business|product|mvp|market)\b/)) {
      return {
        archetype: 'strategist',
        specialization: 'launch',
        displayName: 'Launch Strategist',
        rationale: 'Detected business launch goal - Launch Strategist will drive execution',
        alternates: []
      };
    }

    // Creative keywords
    if (goalLower.match(/\b(write|novel|book|creative|art|music|compose)\b/)) {
      return {
        archetype: 'partner',
        specialization: 'creative',
        displayName: 'Creative Partner',
        rationale: 'Detected creative project - Creative Partner will support your creative process',
        alternates: []
      };
    }

    // Software/development keywords
    if (goalLower.match(/\b(software|app|code|develop|agile|sprint|scrum)\b/)) {
      return {
        archetype: 'manager',
        specialization: 'scrum',
        displayName: 'Scrum Master',
        rationale: 'Detected software development - Scrum Master will coordinate agile workflow',
        alternates: []
      };
    }

    // Event keywords
    if (goalLower.match(/\b(event|wedding|party|conference|celebration)\b/)) {
      return {
        archetype: 'coordinator',
        specialization: 'event',
        displayName: 'Event Coordinator',
        rationale: 'Detected event planning - Event Coordinator will manage logistics',
        alternates: []
      };
    }

    // Default fallback: Coach with general specialization
    return {
      archetype: 'coach',
      specialization: 'skill',
      displayName: 'Skill Coach',
      rationale: 'General goal detected - Skill Coach will help build consistent habits',
      alternates: [
        { archetype: 'advisor', specialization: 'career', rationale: 'If this is career-related' },
        { archetype: 'partner', specialization: 'creative', rationale: 'If this is a creative project' }
      ]
    };
  }
}

export default new PersonaFactory();
