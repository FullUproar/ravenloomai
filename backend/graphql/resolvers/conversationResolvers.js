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
  },

  Message: {
    conversationId: (parent) => parent.conversationId || parent.conversation_id,
    senderId: (parent) => parent.senderId || parent.sender_id,
    senderType: (parent) => parent.senderType || parent.sender_type,
    senderName: (parent) => parent.senderName || parent.sender_name,
    senderAvatar: (parent) => parent.senderAvatar || parent.sender_avatar,
    addressedTo: (parent) => parent.addressedTo || parent.addressed_to || [],
    inReplyTo: (parent) => parent.inReplyTo || parent.in_reply_to,
    isDebugMessage: (parent) => parent.isDebugMessage || parent.is_debug_message || false,
    debugData: (parent) => parent.debugData || parent.debug_data,
    createdAt: (parent) => parent.createdAt || parent.created_at
  }
};
