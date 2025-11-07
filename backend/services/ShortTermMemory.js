/**
 * ShortTermMemory - Tier 1 Memory System
 *
 * Manages recent conversation context with automatic summarization.
 * Target: ~2000 tokens for LLM context
 */

import db from '../db.js';
import { generateChatCompletion } from '../utils/llm.js';

class ShortTermMemory {
  constructor() {
    this.MESSAGES_BEFORE_SUMMARY = 20; // Summarize every 20 messages
    this.RECENT_MESSAGE_COUNT = 10;    // Keep last 10 messages in full
  }

  /**
   * Get short-term context for LLM
   * Returns recent messages + summary of older messages
   */
  async getContext(conversationId) {
    const conversation = await db.query(
      'SELECT id, summary, last_summary_at, message_count_at_summary FROM conversations WHERE id = $1',
      [conversationId]
    );

    if (conversation.rows.length === 0) {
      return { recentMessages: [], summary: null };
    }

    const { summary } = conversation.rows[0];

    // Get recent messages (last 10)
    const messagesResult = await db.query(
      `SELECT id, content, sender_name, sender_type, created_at
       FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, this.RECENT_MESSAGE_COUNT]
    );

    const recentMessages = messagesResult.rows.reverse(); // Oldest first

    return {
      recentMessages,
      summary,
      tokenEstimate: this._estimateTokens(recentMessages, summary)
    };
  }

  /**
   * Format context for LLM prompt
   */
  formatForPrompt(context) {
    let prompt = '';

    // Add summary of older conversation if it exists
    if (context.summary) {
      prompt += `## Previous Conversation Summary\n${context.summary}\n\n`;
    }

    // Add recent messages
    if (context.recentMessages.length > 0) {
      prompt += `## Recent Messages\n`;
      for (const msg of context.recentMessages) {
        const timestamp = new Date(msg.created_at).toLocaleString();
        prompt += `[${timestamp}] ${msg.sender_name}: ${msg.content}\n`;
      }
    }

    return prompt;
  }

  /**
   * Check if conversation needs summarization and create summary if needed
   */
  async updateSummaryIfNeeded(conversationId) {
    const conversation = await db.query(
      'SELECT id, summary, message_count_at_summary FROM conversations WHERE id = $1',
      [conversationId]
    );

    if (conversation.rows.length === 0) return;

    const { message_count_at_summary } = conversation.rows[0];
    const lastSummaryCount = message_count_at_summary || 0;

    // Count total messages
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM conversation_messages WHERE conversation_id = $1',
      [conversationId]
    );

    const totalMessages = parseInt(countResult.rows[0].count);

    // Check if we need to create/update summary
    const messagesSinceSummary = totalMessages - lastSummaryCount;

    if (messagesSinceSummary >= this.MESSAGES_BEFORE_SUMMARY) {
      await this.createSummary(conversationId);
    }
  }

  /**
   * Create or update conversation summary using LLM
   */
  async createSummary(conversationId) {
    // Get all messages that aren't in the current summary
    const conversation = await db.query(
      'SELECT summary, message_count_at_summary FROM conversations WHERE id = $1',
      [conversationId]
    );

    if (conversation.rows.length === 0) {
      console.error('[ShortTermMemory] Conversation not found:', conversationId);
      return;
    }

    const { summary: existingSummary, message_count_at_summary } = conversation.rows[0];
    const lastSummaryCount = message_count_at_summary || 0;

    // Get messages to summarize (all except the most recent 10)
    const messagesToSummarize = await db.query(
      `SELECT content, sender_name, sender_type, created_at
       FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       OFFSET $2`,
      [conversationId, lastSummaryCount]
    );

    if (messagesToSummarize.rows.length === 0) return;

    // Keep the most recent messages out of the summary
    const totalMessages = await db.query(
      'SELECT COUNT(*) as count FROM conversation_messages WHERE conversation_id = $1',
      [conversationId]
    );

    const totalCount = parseInt(totalMessages.rows[0].count);
    const messagesToInclude = messagesToSummarize.rows.slice(0, -this.RECENT_MESSAGE_COUNT);

    if (messagesToInclude.length === 0) return;

    // Format messages for summarization
    let messageText = '';
    for (const msg of messagesToInclude) {
      messageText += `${msg.sender_name}: ${msg.content}\n`;
    }

    // Create summary using LLM
    const summaryPrompt = existingSummary
      ? `You are summarizing a conversation. Here is the existing summary:\n\n${existingSummary}\n\nHere are new messages to incorporate:\n\n${messageText}\n\nCreate an updated summary that captures key points, decisions, and context. Keep it concise (2-3 paragraphs max).`
      : `You are summarizing a conversation. Here are the messages:\n\n${messageText}\n\nCreate a concise summary that captures key points, decisions, and context (2-3 paragraphs max).`;

    const summaryResponse = await generateChatCompletion([
      { role: 'user', content: summaryPrompt }
    ], {
      temperature: 0.3,
      maxTokens: 500
    });

    if (!summaryResponse || !summaryResponse.choices || summaryResponse.choices.length === 0) {
      console.error('[ShortTermMemory] Invalid LLM response for summary');
      return;
    }

    const newSummary = summaryResponse.choices[0].message.content;

    // Update conversation with new summary
    await db.query(
      `UPDATE conversations
       SET summary = $1,
           last_summary_at = CURRENT_TIMESTAMP,
           message_count_at_summary = $2
       WHERE id = $3`,
      [newSummary, totalCount - this.RECENT_MESSAGE_COUNT, conversationId]
    );

    return newSummary;
  }

  /**
   * Estimate token count for context
   * Rough estimate: 1 token ≈ 4 characters
   */
  _estimateTokens(messages, summary) {
    let charCount = 0;

    if (summary) {
      charCount += summary.length;
    }

    for (const msg of messages) {
      charCount += msg.content.length + msg.sender_name.length + 20; // +20 for formatting
    }

    return Math.ceil(charCount / 4);
  }
}

export default new ShortTermMemory();
