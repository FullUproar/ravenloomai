/**
 * MemoryService
 *
 * Implements episodic and semantic memory for conversations.
 * - Episodic Memory: Summarizes conversation episodes
 * - Semantic Memory: Extracts and stores knowledge facts with vector embeddings
 * - Retrieval: Finds relevant memories using vector similarity search
 */

import db from '../db.js';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class MemoryService {
  /**
   * Check if episode summarization should be triggered
   * @param {number} conversationId - Conversation ID
   * @returns {Promise<boolean>} - Should trigger
   */
  async shouldTriggerEpisodeSummarization(conversationId) {
    try {
      // Get config (with defaults)
      const config = await this._getMemoryConfig(conversationId);

      // Count messages since last episode
      const lastEpisodeQuery = `
        SELECT end_message_id FROM conversation_episodes
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const lastEpisodeResult = await db.query(lastEpisodeQuery, [conversationId]);

      const afterMessageId = lastEpisodeResult.rows[0]?.end_message_id || 0;

      const countQuery = `
        SELECT COUNT(*) as count FROM conversation_messages
        WHERE conversation_id = $1 AND id > $2
      `;
      const countResult = await db.query(countQuery, [conversationId, afterMessageId]);
      const messageCount = parseInt(countResult.rows[0].count);

      return messageCount >= config.episode_message_threshold;
    } catch (error) {
      console.error('[MemoryService] Error checking episode trigger:', error);
      return false; // Don't trigger if there's an error
    }
  }

  /**
   * Create episode summary for recent conversation
   * @param {number} conversationId - Conversation ID
   * @returns {Promise<Object>} - Created episode
   */
  async createEpisodeSummary(conversationId) {
    // Get conversation info
    const convQuery = `
      SELECT c.*, p.id as project_id, p.user_id
      FROM conversations c
      JOIN projects p ON p.id = c.project_id
      WHERE c.id = $1
    `;
    const convResult = await db.query(convQuery, [conversationId]);

    if (convResult.rows.length === 0) {
      throw new Error('Conversation not found');
    }

    const conversation = convResult.rows[0];

    // Get messages since last episode
    const lastEpisodeQuery = `
      SELECT end_message_id FROM conversation_episodes
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const lastEpisodeResult = await db.query(lastEpisodeQuery, [conversationId]);
    const afterMessageId = lastEpisodeResult.rows[0]?.end_message_id || 0;

    const messagesQuery = `
      SELECT * FROM conversation_messages
      WHERE conversation_id = $1 AND id > $2
      ORDER BY created_at ASC
    `;
    const messagesResult = await db.query(messagesQuery, [conversationId, afterMessageId]);
    const messages = messagesResult.rows;

    if (messages.length === 0) {
      console.log('[MemoryService] No new messages to summarize');
      return null;
    }

    // Generate summary using GPT
    const summary = await this._generateEpisodeSummary(messages);

    // Store episode (without embedding for now - pgvector not installed)
    const insertQuery = `
      INSERT INTO conversation_episodes (
        conversation_id, project_id, user_id,
        start_message_id, end_message_id, message_count,
        topic, summary, key_points, decisions_made,
        emotions_detected, user_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const values = [
      conversationId,
      conversation.project_id,
      conversation.user_id,
      messages[0].id,
      messages[messages.length - 1].id,
      messages.length,
      summary.topic,
      summary.summary,
      JSON.stringify(summary.keyPoints),
      JSON.stringify(summary.decisions),
      summary.emotions,
      summary.userState
    ];

    const result = await db.query(insertQuery, values);
    console.log(`[MemoryService] Created episode summary for conversation ${conversationId}`);

    return this._mapEpisodeFromDb(result.rows[0]);
  }

  /**
   * Extract knowledge facts from episode
   * @param {number} conversationId - Conversation ID
   * @param {number} episodeId - Episode ID
   * @returns {Promise<Array>} - Created knowledge nodes
   */
  async extractKnowledgeFacts(conversationId, episodeId) {
    // Get episode
    const episodeQuery = `SELECT * FROM conversation_episodes WHERE id = $1`;
    const episodeResult = await db.query(episodeQuery, [episodeId]);

    if (episodeResult.rows.length === 0) {
      throw new Error('Episode not found');
    }

    const episode = episodeResult.rows[0];

    // Get messages for this episode
    const messagesQuery = `
      SELECT * FROM conversation_messages
      WHERE conversation_id = $1
        AND id >= $2 AND id <= $3
      ORDER BY created_at ASC
    `;
    const messagesResult = await db.query(messagesQuery, [
      conversationId,
      episode.start_message_id,
      episode.end_message_id
    ]);
    const messages = messagesResult.rows;

    // Extract facts using GPT
    const extractedFacts = await this._extractFactsFromMessages(messages, episode);

    // Store each fact (without embedding - pgvector not installed)
    const knowledgeNodes = [];

    for (const fact of extractedFacts) {
      // Check if similar fact already exists (text-based match)
      const existingNodeQuery = `
        SELECT * FROM knowledge_nodes
        WHERE user_id = $1
          AND (project_id = $2 OR project_id IS NULL)
          AND node_type = $3
          AND LOWER(label) = LOWER($4)
          AND is_active = true
        LIMIT 1
      `;
      const existingResult = await db.query(existingNodeQuery, [
        episode.user_id,
        episode.project_id,
        fact.nodeType,
        fact.label
      ]);

      if (existingResult.rows.length > 0) {
        // Reinforce existing fact
        const existingNode = this._mapKnowledgeNodeFromDb(existingResult.rows[0]);
        await this._reinforceKnowledgeNode(existingNode.id);
        knowledgeNodes.push(existingNode);
        console.log(`[MemoryService] Reinforced existing fact: ${fact.label}`);
      } else {
        // Create new fact (without embedding)
        const insertQuery = `
          INSERT INTO knowledge_nodes (
            user_id, project_id, node_type, label, properties,
            source_episode_id, confidence
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;

        const values = [
          episode.user_id,
          episode.project_id,
          fact.nodeType,
          fact.label,
          JSON.stringify(fact.properties || {}),
          episodeId,
          fact.confidence || 0.8
        ];

        const result = await db.query(insertQuery, values);
        const node = this._mapKnowledgeNodeFromDb(result.rows[0]);
        knowledgeNodes.push(node);
        console.log(`[MemoryService] Created new fact: ${fact.label}`);
      }
    }

    return knowledgeNodes;
  }

  /**
   * Get relevant memory context for conversation
   * @param {string} userId - User ID
   * @param {number} projectId - Project ID
   * @param {string} currentContext - Current message/context for similarity search
   * @returns {Promise<Object>} - Memory context
   */
  async getMemoryContext(userId, projectId, currentContext = null) {
    // Get recent episodes (last 3)
    const recentEpisodesQuery = `
      SELECT * FROM conversation_episodes
      WHERE user_id = $1 AND project_id = $2
      ORDER BY created_at DESC
      LIMIT 3
    `;
    const recentEpisodesResult = await db.query(recentEpisodesQuery, [userId, projectId]);
    const recentEpisodes = recentEpisodesResult.rows.map(row => this._mapEpisodeFromDb(row));

    // Get relevant facts (without vector search - pgvector not installed)
    // Retrieve top facts by confidence and recency
    const topFactsQuery = `
      SELECT * FROM knowledge_nodes
      WHERE user_id = $1
        AND (project_id = $2 OR project_id IS NULL)
        AND is_active = true
      ORDER BY confidence DESC, last_reinforced_at DESC
      LIMIT 10
    `;
    const topFactsResult = await db.query(topFactsQuery, [userId, projectId]);
    const relevantFacts = topFactsResult.rows.map(row => this._mapKnowledgeNodeFromDb(row));

    // Filter by type
    const blockers = relevantFacts.filter(f => f.nodeType === 'blocker' || f.nodeType === 'struggle');
    const strengths = relevantFacts.filter(f => f.nodeType === 'strength' || f.nodeType === 'success_pattern');

    return {
      recentEpisodes,
      relevantFacts,
      blockers,
      strengths
    };
  }

  /**
   * Format memory context for prompt injection
   * @param {Object} memoryContext - Memory context from getMemoryContext
   * @returns {string} - Formatted text for system prompt
   */
  formatMemoryContextForPrompt(memoryContext) {
    let prompt = '\n\n=== MEMORY CONTEXT ===\n\n';

    // Recent episodes
    if (memoryContext.recentEpisodes.length > 0) {
      prompt += 'Recent Conversation History:\n';
      memoryContext.recentEpisodes.forEach((episode, idx) => {
        const daysAgo = Math.floor((Date.now() - new Date(episode.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        prompt += `\n${idx + 1}. ${daysAgo === 0 ? 'Earlier today' : `${daysAgo} days ago`}: ${episode.topic}\n`;
        prompt += `   ${episode.summary}\n`;
        if (episode.keyPoints.length > 0) {
          prompt += `   Key points: ${episode.keyPoints.join(', ')}\n`;
        }
      });
      prompt += '\n';
    }

    // Known blockers
    if (memoryContext.blockers.length > 0) {
      prompt += 'Known Challenges/Blockers:\n';
      memoryContext.blockers.forEach(blocker => {
        prompt += `- ${blocker.label} (confidence: ${(blocker.confidence * 100).toFixed(0)}%, mentioned ${blocker.timesMentioned}x)\n`;
      });
      prompt += '\n';
    }

    // Known strengths
    if (memoryContext.strengths.length > 0) {
      prompt += 'Known Strengths/Success Patterns:\n';
      memoryContext.strengths.forEach(strength => {
        prompt += `- ${strength.label} (confidence: ${(strength.confidence * 100).toFixed(0)}%, mentioned ${strength.timesMentioned}x)\n`;
      });
      prompt += '\n';
    }

    // Other relevant facts
    const otherFacts = memoryContext.relevantFacts.filter(
      f => f.nodeType !== 'blocker' && f.nodeType !== 'struggle' &&
           f.nodeType !== 'strength' && f.nodeType !== 'success_pattern'
    );
    if (otherFacts.length > 0) {
      prompt += 'Other Relevant Facts:\n';
      otherFacts.forEach(fact => {
        prompt += `- ${fact.label} (${fact.nodeType})\n`;
      });
      prompt += '\n';
    }

    prompt += '=== END MEMORY CONTEXT ===\n\n';

    return prompt;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  async _getMemoryConfig(conversationId) {
    const query = `
      SELECT mc.* FROM memory_config mc
      JOIN conversations c ON c.user_id = mc.user_id AND c.project_id = mc.project_id
      WHERE c.id = $1
    `;
    const result = await db.query(query, [conversationId]);

    return result.rows[0] || {
      episode_message_threshold: 15,
      episode_inactivity_minutes: 30,
      fact_extraction_enabled: true,
      fact_confidence_threshold: 0.7,
      max_episodes_retrieved: 3,
      max_facts_retrieved: 10
    };
  }

  async _generateEpisodeSummary(messages) {
    const conversation = messages.map(m =>
      `${m.sender_name}: ${m.content}`
    ).join('\n\n');

    const prompt = `You are analyzing a conversation between a user and their AI productivity coach.
Summarize this conversation episode into a structured format.

Conversation:
${conversation}

Provide a JSON response with:
{
  "topic": "Brief topic (max 50 chars)",
  "summary": "2-3 sentence narrative summary",
  "keyPoints": ["point1", "point2", "point3"],
  "decisions": [{"decision": "what was decided", "reasoning": "why"}],
  "emotions": "detected emotions (comma separated)",
  "userState": "blocked|progressing|celebrating|planning|stuck"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    return JSON.parse(response.choices[0].message.content);
  }

  async _extractFactsFromMessages(messages, episode) {
    const conversation = messages.map(m =>
      `${m.sender_name}: ${m.content}`
    ).join('\n\n');

    const prompt = `You are extracting factual knowledge from a conversation between a user and their AI productivity coach.

Extract facts that should be remembered long-term. Focus on:
- User preferences and work patterns
- Challenges and blockers
- Strengths and success patterns
- Goals and motivations
- Beliefs about themselves

Conversation:
${conversation}

Provide a JSON array of facts:
[
  {
    "nodeType": "preference|work_pattern|blocker|strength|goal|belief|success_pattern",
    "label": "Clear, concise fact statement",
    "properties": {"context": "additional context if needed"},
    "confidence": 0.8
  }
]

Only extract facts that are clearly stated or strongly implied. Be selective - quality over quantity.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return parsed.facts || parsed.nodes || [];
  }

  // NOTE: Vector embedding methods commented out - pgvector extension not installed
  // Uncomment these if pgvector becomes available in the future

  // async _generateEmbedding(text) {
  //   const response = await openai.embeddings.create({
  //     model: 'text-embedding-ada-002',
  //     input: text
  //   });
  //
  //   return response.data[0].embedding;
  // }

  // async _findSimilarKnowledgeNode(userId, projectId, embedding, nodeType) {
  //   const query = `
  //     SELECT *, 1 - (embedding <=> $1::vector) as similarity
  //     FROM knowledge_nodes
  //     WHERE user_id = $2
  //       AND (project_id = $3 OR project_id IS NULL)
  //       AND node_type = $4
  //       AND is_active = true
  //       AND 1 - (embedding <=> $1::vector) >= 0.9
  //     ORDER BY embedding <=> $1::vector
  //     LIMIT 1
  //   `;
  //
  //   const result = await db.query(query, [
  //     `[${embedding.join(',')}]`,
  //     userId,
  //     projectId,
  //     nodeType
  //   ]);
  //
  //   return result.rows[0] ? this._mapKnowledgeNodeFromDb(result.rows[0]) : null;
  // }

  async _reinforceKnowledgeNode(nodeId) {
    const query = `
      UPDATE knowledge_nodes
      SET times_mentioned = times_mentioned + 1,
          last_reinforced_at = CURRENT_TIMESTAMP,
          confidence = LEAST(confidence + 0.05, 1.0)
      WHERE id = $1
    `;
    await db.query(query, [nodeId]);
  }

  _mapEpisodeFromDb(row) {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      projectId: row.project_id,
      userId: row.user_id,
      startMessageId: row.start_message_id,
      endMessageId: row.end_message_id,
      messageCount: row.message_count,
      topic: row.topic,
      summary: row.summary,
      keyPoints: typeof row.key_points === 'string' ? JSON.parse(row.key_points) : row.key_points,
      decisionsMade: row.decisions_made,
      emotionsDetected: row.emotions_detected,
      userState: row.user_state,
      createdAt: row.created_at
    };
  }

  _mapKnowledgeNodeFromDb(row) {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      nodeType: row.node_type,
      label: row.label,
      properties: row.properties,
      sourceEpisodeId: row.source_episode_id,
      sourceMessageId: row.source_message_id,
      confidence: parseFloat(row.confidence),
      lastReinforcedAt: row.last_reinforced_at,
      timesMentioned: row.times_mentioned,
      contradictedBy: row.contradicted_by,
      isActive: row.is_active,
      createdAt: row.created_at
    };
  }
}

export default new MemoryService();
