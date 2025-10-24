/**
 * Persona GraphQL Resolvers
 */

import PersonaService from '../../services/PersonaService.js';
import PersonaFactory from '../../services/PersonaFactory.js';

export default {
  Query: {
    /**
     * Get persona by ID
     */
    getPersona: async (_, { personaId }) => {
      return await PersonaService.getPersonaById(personaId);
    },

    /**
     * Get active persona for a project
     */
    getActivePersona: async (_, { projectId }) => {
      return await PersonaService.getActivePersona(projectId);
    },

    /**
     * Suggest persona based on user goal
     */
    suggestPersona: async (_, { userGoal }) => {
      return await PersonaFactory.suggestPersona(userGoal);
    }
  },

  Mutation: {
    /**
     * Create persona manually
     */
    createPersona: async (_, { projectId, userId, input }) => {
      const config = {
        projectId,
        userId,
        archetype: input.archetype,
        specialization: input.specialization,
        customInstructions: input.customInstructions || null,
        communicationPreferences: input.communicationPreferences || {}
      };

      return await PersonaService.createPersona(config);
    },

    /**
     * Create persona from user goal (AI-assisted)
     */
    createPersonaFromGoal: async (_, { projectId, userId, userGoal, preferences }) => {
      return await PersonaFactory.createFromUserGoal(
        userGoal,
        projectId,
        userId,
        preferences || {}
      );
    },

    /**
     * Update persona communication preferences
     */
    updatePersonaCommunication: async (_, { personaId, preferences }) => {
      return await PersonaService.updatePersona(personaId, {
        communication_preferences: preferences
      });
    },

    /**
     * Deactivate persona
     */
    deactivatePersona: async (_, { personaId }) => {
      await PersonaService.deactivatePersona(personaId);
      return true;
    }
  },

  Persona: {
    /**
     * Resolve communication preferences as nested object
     */
    communicationPreferences: (persona) => {
      return persona.communicationPreferences || null;
    }
  }
};
