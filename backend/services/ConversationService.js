/**
 * ConversationService
 *
 * Manages conversations and messages between users and personas.
 * Handles chat history, message persistence, and AI response generation.
 */

import db from '../db.js';
import PersonaService from './PersonaService.js';
import PersonaPromptBuilder from './PersonaPromptBuilder.js';
import { generateChatCompletion, generateChatCompletionWithFunctions, buildMessageHistory } from '../utils/llm.js';
import ShortTermMemory from './ShortTermMemory.js';
import MediumTermMemory from './MediumTermMemory.js';
import MemoryService from './MemoryService.js';
import AI_FUNCTIONS from '../config/aiFunctions.js';
import AIFunctionExecutor from './AIFunctionExecutor.js';
// Temporarily disabled - missing files
// import UserStyleDetector from './UserStyleDetector.js';
// import AdaptivePlanningService from './AdaptivePlanningService.js';

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
    console.log('[ConversationService] generatePersonaResponse started', { projectId, userId });

    // Get persona for project
    const persona = await PersonaService.getActivePersona(projectId);
    if (!persona) {
      throw new Error('No active persona found for this project');
    }
    console.log('[ConversationService] Persona loaded:', persona.id);

    // Get project info
    const project = await this._getProject(projectId);
    console.log('[ConversationService] Project loaded:', project.id);

    // Get or create conversation
    const conversation = await this.getOrCreateConversation(projectId, userId);
    console.log('[ConversationService] Conversation ready:', conversation.id);

    // Add user message
    await this.addUserMessage(conversation.id, userId, userMessage);
    console.log('[ConversationService] User message added');

    // === ADAPTIVE PLANNING DETECTION ===
    // Temporarily disabled due to missing UserStyleDetector module
    /*
    // Check if we're in planning mode (new project with minimal activity)
    const conversationHistory = await this.getConversationHistory(conversation.id);
    const messageCount = conversationHistory.length;

    // Get task count for this project
    const taskCountResult = await db.query(
      'SELECT COUNT(*) as count FROM tasks WHERE project_id = $1',
      [projectId]
    );
    const taskCount = parseInt(taskCountResult.rows[0].count);

    // Get goal count for this project
    const goalCountResult = await db.query(
      'SELECT COUNT(*) as count FROM goals WHERE project_id = $1',
      [projectId]
    );
    const goalCount = parseInt(goalCountResult.rows[0].count);

    // Detect if this is a planning session (new project, user describing what they want)
    const isNewProject = messageCount <= 10 && taskCount <= 3 && goalCount <= 2;
    const isPlanningMessage = /\b(I want to|I'm thinking about|I need to|I'm planning|help me|how do I|where do I start)\b/i.test(userMessage);

    let detectedUserStyle = null;
    if (isNewProject && isPlanningMessage) {
      console.log('[ConversationService] PLANNING MODE DETECTED - Analyzing user style...');

      // Detect user's interaction style using psychology models
      detectedUserStyle = UserStyleDetector.analyzeFirstMessage(userMessage, {
        projectTitle: project.title,
        projectDescription: project.description
      });

      const suggestedPathway = UserStyleDetector.suggestPlanningPathway(detectedUserStyle);

      console.log('[ConversationService] Detected user style:', {
        guidancePreference: detectedUserStyle.guidancePreference,
        planningStyle: detectedUserStyle.planningStyle,
        detailLevel: detectedUserStyle.detailLevel,
        currentMode: detectedUserStyle.currentMode,
        motivationLevel: detectedUserStyle.motivationLevel,
        confidenceLevel: detectedUserStyle.confidenceLevel,
        suggestedPathway: suggestedPathway.pathway
      });

      // Store detected style in medium-term memory for persistence
      try {
        await MediumTermMemory.addPreference(
          projectId,
          'user_style',
          JSON.stringify({
            detectedAt: new Date().toISOString(),
            userMessage: userMessage,
            detectedStyle: detectedUserStyle,
            suggestedPathway: suggestedPathway.pathway,
            confidence: suggestedPathway.confidence
          }),
          7 // importance level
        );
        console.log('[ConversationService] User style saved to medium-term memory');
      } catch (err) {
        console.error('[ConversationService] Failed to save user style:', err);
      }
    }
    */

    // === MEMORY SYSTEM INTEGRATION ===

    // Tier 1: Get short-term memory (recent messages + summary)
    console.log('[ConversationService] Getting short-term memory...');
    const shortTermContext = await ShortTermMemory.getContext(conversation.id);
    console.log('[ConversationService] Short-term memory loaded');

    // Tier 2: Get medium-term memory (tactical scratchpad)
    console.log('[ConversationService] Getting medium-term memory...');
    const mediumTermMemories = await MediumTermMemory.getMemories(projectId);
    console.log('[ConversationService] Medium-term memory loaded:', mediumTermMemories.length);

    // Tier 3: Get episodic & semantic memory (long-term context)
    console.log('[ConversationService] Getting long-term memory...');
    const longTermMemoryContext = await MemoryService.getMemoryContext(userId, projectId, userMessage);
    const longTermMemoryText = MemoryService.formatMemoryContextForPrompt(longTermMemoryContext);
    console.log('[ConversationService] Long-term memory loaded');

    // Check if we need to update conversation summary
    console.log('[ConversationService] Updating summary if needed...');
    await ShortTermMemory.updateSummaryIfNeeded(conversation.id);
    console.log('[ConversationService] Summary check complete');

    // Check if we should create episode summary
    const shouldSummarize = await MemoryService.shouldTriggerEpisodeSummarization(conversation.id);
    if (shouldSummarize) {
      console.log('[ConversationService] Triggering episode summarization in background');

      // If debug mode, inject debug message
      if (project.debug_mode_enabled) {
        await this._addDebugMessage(
          conversation.id,
          '🧠 Memory System: Creating episode summary',
          {
            action: 'episode_summarization',
            messageCount: 'approximately 10 messages'
          }
        );
      }

      // Don't await - run in background
      this._triggerEpisodeSummarizationAsync(conversation.id, project.debug_mode_enabled).catch(err =>
        console.error('[ConversationService] Episode summarization failed:', err)
      );
    }

    // Build prompt with memory context
    const messages = this.promptBuilder.buildChatMessagesWithMemory(
      persona,
      project,
      shortTermContext,
      mediumTermMemories,
      userMessage,
      longTermMemoryText
    );

    try {
      // Generate AI response with function calling
      console.log('[ConversationService] Calling OpenAI with gpt-4o...');
      console.log('[ConversationService] Message count:', messages.length);
      console.log('[ConversationService] Function count:', AI_FUNCTIONS.length);

      const aiResponse = await generateChatCompletionWithFunctions(messages, AI_FUNCTIONS, {
        model: 'gpt-4o',  // Use gpt-4o for 128k context window
        temperature: 0.7,
        maxTokens: 800  // Reduced to prevent context length exceeded errors
      });

      console.log('[ConversationService] AI response received:', {
        hasContent: !!aiResponse.content,
        contentLength: aiResponse.content?.length || 0,
        hasToolCalls: !!aiResponse.toolCalls,
        toolCallCount: aiResponse.toolCalls?.length || 0
      });

      const functionsExecuted = [];
      let finalContent = aiResponse.content || '';

      // Execute any function calls
      if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
        console.log(`🤖 [AI] Calling ${aiResponse.toolCalls.length} function(s)`);

        for (const toolCall of aiResponse.toolCalls) {
          const { name, arguments: args } = toolCall.function;

          try {
            const result = await AIFunctionExecutor.execute(name, args, projectId);
            functionsExecuted.push({
              name,
              arguments: args,
              result
            });

            // Append confirmation to response
            if (result.message) {
              finalContent += `\n\n✓ ${result.message}`;
            }
          } catch (error) {
            console.error(`❌ [AI Function] Failed to execute ${name}:`, error);
            finalContent += `\n\n✗ Error: Could not ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
          }
        }
      }

      // If AI didn't provide text content, add a default message
      if (!finalContent || finalContent.trim() === '') {
        if (functionsExecuted.length > 0) {
          finalContent = "Done! I've updated that for you.";
        } else {
          finalContent = "I understand. How else can I help?";
        }
      }

      // Add persona response to conversation
      console.log('[ConversationService] Saving persona message to database...');
      const personaMessage = await this.addPersonaMessage(
        conversation.id,
        persona.id,
        persona.displayName,
        finalContent.trim(),
        {
          intent: 'response',
          functionsExecuted: functionsExecuted.length > 0 ? functionsExecuted : undefined
        }
      );

      console.log('[ConversationService] Message saved, returning response:', {
        messageId: personaMessage.id,
        contentLength: personaMessage.content.length
      });

      return {
        message: personaMessage,
        conversation: conversation,
        persona: persona,
        functionsExecuted
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
      debug_mode_enabled: row.debug_mode_enabled || false,
      debug_mode_activated_at: row.debug_mode_activated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Trigger episode summarization and fact extraction in background
   *
   * @private
   * @param {number} conversationId - Conversation ID
   * @param {boolean} debugMode - Whether to inject debug messages
   * @returns {Promise<void>}
   */
  async _triggerEpisodeSummarizationAsync(conversationId, debugMode = false) {
    try {
      const episode = await MemoryService.createEpisodeSummary(conversationId);

      if (episode) {
        console.log(`[ConversationService] Created episode ${episode.id}: ${episode.topic}`);

        if (debugMode) {
          // Create detailed message about what was saved
          const keyPointsList = episode.keyPoints && episode.keyPoints.length > 0
            ? '\n• ' + episode.keyPoints.join('\n• ')
            : '';

          await this._addDebugMessage(
            conversationId,
            `✅ Episode Memory Saved\n\nTopic: "${episode.topic}"\n\nSummary: ${episode.summary}${keyPointsList ? '\n\nKey Points:' + keyPointsList : ''}`,
            {
              what_was_saved: 'Conversation episode summary',
              episodeId: episode.id,
              topic: episode.topic,
              summary: episode.summary,
              keyPoints: episode.keyPoints,
              emotions: episode.emotionsDetected,
              userState: episode.userState,
              how_it_works: 'This conversation was summarized and stored as an episode. The AI can recall this information in future conversations.'
            }
          );
        }

        // Extract facts from the episode
        const facts = await MemoryService.extractKnowledgeFacts(conversationId, episode.id);
        console.log(`[ConversationService] Extracted ${facts.length} facts from episode`);

        if (debugMode && facts.length > 0) {
          const factsList = facts.map(f => `\n• [${f.nodeType}] ${f.label} (confidence: ${Math.round(f.confidence * 100)}%)`).join('');

          await this._addDebugMessage(
            conversationId,
            `💡 Knowledge Facts Extracted and Saved${factsList}`,
            {
              what_was_saved: 'Knowledge facts from conversation',
              count: facts.length,
              facts: facts.map(f => ({
                type: f.nodeType,
                fact: f.label,
                confidence: Math.round(f.confidence * 100) + '%',
                description: this._getFactTypeDescription(f.nodeType)
              })),
              how_it_works: 'These facts were extracted and saved to the knowledge graph. The AI will remember these facts and use them to personalize future conversations.'
            }
          );
        }
      }
    } catch (error) {
      console.error('[ConversationService] Episode summarization error:', error);
      if (debugMode) {
        await this._addDebugMessage(
          conversationId,
          `❌ Memory System Error: ${error.message}`,
          { error: error.message }
        );
      }
      // Don't throw - this is a background task
    }
  }

  /**
   * Add debug message to conversation
   *
   * @private
   * @param {number} conversationId - Conversation ID
   * @param {string} content - Debug message content
   * @param {Object} debugData - Additional debug data
   * @returns {Promise<void>}
   */
  async _addDebugMessage(conversationId, content, debugData = {}) {
    const query = `
      INSERT INTO conversation_messages (
        conversation_id, sender_id, sender_type, sender_name, content,
        is_debug_message, debug_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    const values = [
      conversationId,
      'system',
      'system',
      'Debug System',
      content,
      true,
      JSON.stringify(debugData)
    ];

    await db.query(query, values);
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
   * Get description for fact type
   *
   * @private
   * @param {string} nodeType - Type of knowledge node
   * @returns {string}
   */
  _getFactTypeDescription(nodeType) {
    const descriptions = {
      preference: 'User preferences and likes/dislikes',
      work_pattern: 'Work habits and patterns',
      blocker: 'Obstacles or challenges',
      strength: 'Skills and strengths',
      goal: 'Aspirations and objectives',
      belief: 'Values and beliefs',
      success_pattern: 'What works well for the user'
    };
    return descriptions[nodeType] || 'General knowledge';
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
      isDebugMessage: row.is_debug_message || false,
      debugData: row.debug_data,
      createdAt: row.created_at
    };
  }
}

export default new ConversationService();
