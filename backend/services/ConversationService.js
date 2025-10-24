/**
 * ConversationService
 *
 * Manages conversations and messages between users and personas.
 * Handles chat history, message persistence, and AI response generation.
 */

import db from '../db.js';
import PersonaService from './PersonaService.js';
import PersonaPromptBuilder from './PersonaPromptBuilder.js';
import { generateChatCompletion, buildMessageHistory } from '../utils/llm.js';
import ShortTermMemory from './ShortTermMemory.js';
import MediumTermMemory from './MediumTermMemory.js';

class ConversationService {
  constructor() {
    this.promptBuilder = new PersonaPromptBuilder();
  }

  /**
   * Get or create conversation for a project
   *
   * @param {number} projectId - Project ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Conversation object
   */
  async getOrCreateConversation(projectId, userId) {
    // Try to find existing active conversation
    const existing = await this._findActiveConversation(projectId, userId);
    if (existing) {
      return existing;
    }

    // Create new conversation
    return this._createConversation(projectId, userId);
  }

  /**
   * Add user message to conversation
   *
   * @param {number} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @param {string} content - Message content
   * @returns {Promise<Object>} - Created message
   */
  async addUserMessage(conversationId, userId, content) {
    const query = `
      INSERT INTO conversation_messages (
        conversation_id, sender_id, sender_type, sender_name, content
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [conversationId, userId, 'user', 'You', content];
    const result = await db.query(query, values);

    // Update conversation timestamp
    await db.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversationId]
    );

    return this._mapMessageFromDb(result.rows[0]);
  }

  /**
   * Add persona message to conversation
   *
   * @param {number} conversationId - Conversation ID
   * @param {string} personaId - Persona ID
   * @param {string} personaName - Persona display name
   * @param {string} content - Message content
   * @param {Object} metadata - Optional metadata (intent, confidence)
   * @returns {Promise<Object>} - Created message
   */
  async addPersonaMessage(conversationId, personaId, personaName, content, metadata = {}) {
    const { intent = null, confidence = null } = metadata;

    const query = `
      INSERT INTO conversation_messages (
        conversation_id, sender_id, sender_type, sender_name, content, intent, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      conversationId,
      personaId.toString(),
      'persona',
      personaName,
      content,
      intent,
      confidence
    ];

    const result = await db.query(query, values);

    // Update conversation timestamp
    await db.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversationId]
    );

    return this._mapMessageFromDb(result.rows[0]);
  }

  /**
   * Get conversation history
   *
   * @param {number} conversationId - Conversation ID
   * @param {number} limit - Max messages to retrieve
   * @returns {Promise<Array>} - Array of messages
   */
  async getConversationHistory(conversationId, limit = 50) {
    const query = `
      SELECT * FROM conversation_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await db.query(query, [conversationId, limit]);

    // Reverse to get chronological order
    return result.rows.reverse().map(row => this._mapMessageFromDb(row));
  }

  /**
   * Generate persona response to user message
   *
   * @param {number} projectId - Project ID
   * @param {string} userId - User ID
   * @param {string} userMessage - User's message content
   * @returns {Promise<Object>} - Response with message and optional suggestions
   */
  async generatePersonaResponse(projectId, userId, userMessage) {
    // Get persona for project
    const persona = await PersonaService.getActivePersona(projectId);
    if (!persona) {
      throw new Error('No active persona found for this project');
    }

    // Get project info
    const project = await this._getProject(projectId);

    // Get or create conversation
    const conversation = await this.getOrCreateConversation(projectId, userId);

    // Add user message
    await this.addUserMessage(conversation.id, userId, userMessage);

    // === MEMORY SYSTEM INTEGRATION ===

    // Tier 1: Get short-term memory (recent messages + summary)
    const shortTermContext = await ShortTermMemory.getContext(conversation.id);

    // Tier 2: Get medium-term memory (tactical scratchpad)
    const mediumTermMemories = await MediumTermMemory.getMemories(projectId);

    // Check if we need to update conversation summary
    await ShortTermMemory.updateSummaryIfNeeded(conversation.id);

    // Build prompt with memory context
    const messages = this.promptBuilder.buildChatMessagesWithMemory(
      persona,
      project,
      shortTermContext,
      mediumTermMemories,
      userMessage
    );

    try {
      // Generate AI response
      const aiResponse = await generateChatCompletion(messages, {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000
      });

      // Add persona response to conversation
      const personaMessage = await this.addPersonaMessage(
        conversation.id,
        persona.id,
        persona.displayName,
        aiResponse,
        { intent: 'response' }
      );

      return {
        message: personaMessage,
        conversation: conversation,
        persona: persona
      };
    } catch (error) {
      console.error('Error generating persona response:', error);

      // Fallback response
      const fallbackMessage = "I apologize, but I'm having trouble responding right now. Please try again.";

      const fallbackMsg = await this.addPersonaMessage(
        conversation.id,
        persona.id,
        persona.displayName,
        fallbackMessage,
        { intent: 'error' }
      );

      return {
        message: fallbackMsg,
        conversation: conversation,
        persona: persona,
        error: error.message
      };
    }
  }

  /**
   * Clear conversation history (for testing or user request)
   *
   * @param {number} conversationId - Conversation ID
   * @returns {Promise<boolean>}
   */
  async clearConversation(conversationId) {
    await db.query(
      'DELETE FROM conversation_messages WHERE conversation_id = $1',
      [conversationId]
    );
    return true;
  }

  /**
   * Find active conversation for project/user
   *
   * @private
   * @param {number} projectId - Project ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>}
   */
  async _findActiveConversation(projectId, userId) {
    const query = `
      SELECT * FROM conversations
      WHERE project_id = $1 AND user_id = $2 AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    const result = await db.query(query, [projectId, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this._mapConversationFromDb(result.rows[0]);
  }

  /**
   * Create new conversation
   *
   * @private
   * @param {number} projectId - Project ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async _createConversation(projectId, userId) {
    const query = `
      INSERT INTO conversations (project_id, user_id, status)
      VALUES ($1, $2, 'active')
      RETURNING *
    `;

    const result = await db.query(query, [projectId, userId]);
    return this._mapConversationFromDb(result.rows[0]);
  }

  /**
   * Get project by ID
   *
   * @private
   * @param {number} projectId - Project ID
   * @returns {Promise<Object>}
   */
  async _getProject(projectId) {
    const query = 'SELECT * FROM projects WHERE id = $1';
    const result = await db.query(query, [projectId]);

    if (result.rows.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      status: row.status,
      completionType: row.completion_type,
      outcome: row.outcome,
      healthScore: row.health_score,
      habitStreakCurrent: row.habit_streak_current,
      habitStreakLongest: row.habit_streak_longest,
      habitStreakTarget: row.habit_streak_target,
      recurringGoal: typeof row.recurring_goal === 'string'
        ? JSON.parse(row.recurring_goal)
        : row.recurring_goal,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map database row to conversation object
   *
   * @private
   * @param {Object} row - Database row
   * @returns {Object}
   */
  _mapConversationFromDb(row) {
    return {
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      topic: row.topic,
      decisionRequired: row.decision_required,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map database row to message object
   *
   * @private
   * @param {Object} row - Database row
   * @returns {Object}
   */
  _mapMessageFromDb(row) {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderType: row.sender_type,
      senderName: row.sender_name,
      senderAvatar: row.sender_avatar,
      content: row.content,
      addressedTo: typeof row.addressed_to === 'string'
        ? JSON.parse(row.addressed_to)
        : row.addressed_to,
      inReplyTo: row.in_reply_to,
      intent: row.intent,
      confidence: row.confidence,
      createdAt: row.created_at
    };
  }
}

export default new ConversationService();
