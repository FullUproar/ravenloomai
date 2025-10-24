/**
 * Conversation GraphQL Resolvers
 */

import ConversationService from '../../services/ConversationService.js';
import db from '../../db.js';

export default {
  Query: {
    /**
     * Get or create conversation for a project
     */
    getConversation: async (_, { projectId, userId }) => {
      const conversation = await ConversationService.getOrCreateConversation(projectId, userId);

      // Load messages
      const messages = await ConversationService.getConversationHistory(conversation.id);

      return {
        ...conversation,
        messages
      };
    },

    /**
     * Get conversation message history
     */
    getConversationHistory: async (_, { conversationId, limit }) => {
      return await ConversationService.getConversationHistory(conversationId, limit || 50);
    }
  },

  Mutation: {
    /**
     * Send message and get AI response
     */
    sendMessage: async (_, { projectId, userId, message }) => {
      const response = await ConversationService.generatePersonaResponse(
        projectId,
        userId,
        message
      );

      return response;
    },

    /**
     * Clear conversation history
     */
    clearConversation: async (_, { conversationId }) => {
      await ConversationService.clearConversation(conversationId);
      return true;
    }
  },

  Conversation: {
    /**
     * Resolve messages for a conversation
     */
    messages: async (conversation) => {
      // If messages are already loaded, return them
      if (conversation.messages) {
        return conversation.messages;
      }

      // Otherwise fetch them
      return await ConversationService.getConversationHistory(conversation.id);
    }
  }
};
