/**
 * ConversationImportService
 * Handles importing conversations from ChatGPT and Claude into the knowledge graph
 */

import db from '../db.js';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Import a conversation into the knowledge graph
 */
export async function importConversation(teamId, userId, input) {
  const { format, content, title, sourceUrl } = input;
  try {
    // Parse the conversation based on format
    let conversation;
    try {
      conversation = JSON.parse(content);
    } catch {
      // If not JSON, treat as plain text
      conversation = {
        platform: 'unknown',
        title: title || 'Imported Conversation',
        messages: [{ role: 'user', content }]
      };
    }

    // Validate conversation structure
    if (!conversation.messages || !Array.isArray(conversation.messages)) {
      throw new Error('Invalid conversation format: missing messages array');
    }

    if (conversation.messages.length === 0) {
      throw new Error('Conversation has no messages');
    }

    // Start transaction
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Create container node for the conversation
      const conversationTitle = conversation.title || title || 'Imported Conversation';
      const platformName = conversation.platform || (format ? format.replace('_json', '').replace('_markdown', '') : 'chat');

      const containerNode = await createConversationNode(client, teamId, userId, {
        title: conversationTitle,
        platform: platformName,
        sourceUrl,
        messageCount: conversation.messages.length,
        importedAt: new Date().toISOString()
      });

      // Extract knowledge from the conversation
      const knowledge = await extractKnowledge(conversation.messages, conversationTitle);

      // Create nodes and facts for extracted knowledge
      let nodesCreated = 1; // Container already counted
      let factsCreated = 0;

      // Create topic nodes for extracted topics
      for (const topic of knowledge.topics || []) {
        const topicNode = await createTopicNode(client, teamId, userId, containerNode.id, topic);
        nodesCreated++;

        // Create facts for this topic
        for (const fact of topic.facts || []) {
          await createFact(client, teamId, userId, topicNode.id, fact);
          factsCreated++;
        }
      }

      // Create standalone facts if no topics extracted
      if ((knowledge.topics || []).length === 0 && knowledge.facts) {
        for (const fact of knowledge.facts) {
          await createFact(client, teamId, userId, containerNode.id, fact);
          factsCreated++;
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        nodesCreated,
        factsCreated,
        rootNodeId: containerNode.id,
        message: 'Successfully imported "' + conversationTitle + '"'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Import error:', error);
    return {
      success: false,
      nodesCreated: 0,
      factsCreated: 0,
      rootNodeId: null,
      message: 'Import failed: ' + error.message
    };
  }
}

/**
 * Create a container node for the conversation
 */
async function createConversationNode(client, teamId, userId, opts) {
  const { title, platform, sourceUrl, messageCount, importedAt } = opts;
  const result = await client.query(
    `INSERT INTO kg_nodes (
      team_id, name, type, description, scale_level, metadata, created_by, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
    RETURNING *`,
    [
      teamId,
      title,
      'conversation',
      'Imported from ' + platform + ' conversation',
      2,
      JSON.stringify({ platform, sourceUrl, messageCount, importedAt }),
      userId
    ]
  );
  return result.rows[0];
}

/**
 * Create a topic node under the conversation
 */
async function createTopicNode(client, teamId, userId, parentId, topic) {
  const parentResult = await client.query(
    'SELECT path FROM kg_nodes WHERE id = $1',
    [parentId]
  );
  const parentPath = parentResult.rows[0]?.path || [];

  const result = await client.query(
    `INSERT INTO kg_nodes (
      team_id, name, type, description, summary, scale_level, parent_node_id, path, created_by, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
    RETURNING *`,
    [
      teamId,
      topic.name,
      topic.type || 'topic',
      topic.description || '',
      topic.summary || '',
      1,
      parentId,
      [...parentPath, parentId],
      userId
    ]
  );

  await client.query(
    'UPDATE kg_nodes SET child_count = child_count + 1 WHERE id = $1',
    [parentId]
  );

  return result.rows[0];
}

/**
 * Create a fact linked to a node
 */
async function createFact(client, teamId, userId, nodeId, fact) {
  const result = await client.query(
    `INSERT INTO facts (
      team_id, content, category, confidence, source, kg_node_id, created_by, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
    RETURNING *`,
    [
      teamId,
      fact.content,
      fact.category || 'extracted',
      fact.confidence || 0.7,
      fact.source || 'conversation_import',
      nodeId,
      userId
    ]
  );
  return result.rows[0];
}

/**
 * Extract knowledge (topics and facts) from conversation messages
 */
async function extractKnowledge(messages, conversationTitle) {
  const conversationText = messages
    .map(m => (m.role === 'user' ? 'Human' : 'Assistant') + ': ' + m.content)
    .join('\n\n');

  const truncated = conversationText.substring(0, 15000);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a knowledge extraction assistant. Extract structured knowledge from conversations and return valid JSON only.'
        },
        {
          role: 'user',
          content: `Analyze this conversation and extract structured knowledge.

Conversation Title: ${conversationTitle}

${truncated}

Extract the key topics discussed and facts learned. Return JSON in this exact format:
{
  "topics": [
    {
      "name": "Topic Name",
      "type": "decision|plan|fact|process|concept",
      "description": "Brief description",
      "summary": "One sentence summary",
      "facts": [
        {
          "content": "Specific fact or piece of information",
          "category": "decision|deadline|requirement|insight|reference",
          "confidence": 0.8
        }
      ]
    }
  ],
  "facts": [
    {
      "content": "Standalone fact not belonging to a specific topic",
      "category": "general",
      "confidence": 0.7
    }
  ]
}

Focus on: decisions made, action items, deadlines, requirements, key insights, references.
Return ONLY valid JSON, no other text.`
        }
      ]
    });

    const text = response.choices[0].message.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      topics: [],
      facts: [{
        content: 'Discussion about: ' + conversationTitle,
        category: 'general',
        confidence: 0.5
      }]
    };
  } catch (error) {
    console.error('Knowledge extraction error:', error);
    const facts = messages
      .filter(m => m.role === 'user' && m.content.length > 20)
      .slice(0, 5)
      .map(m => ({
        content: m.content.substring(0, 500),
        category: 'user_query',
        confidence: 0.5
      }));
    return { topics: [], facts };
  }
}

/**
 * Parse ChatGPT JSON export format
 */
export function parseChatGPTExport(content) {
  const data = JSON.parse(content);
  if (data.mapping) {
    const messages = [];
    const nodes = Object.values(data.mapping).sort((a, b) => {
      return (a.message?.create_time || 0) - (b.message?.create_time || 0);
    });
    for (const node of nodes) {
      if (node.message && node.message.content?.parts) {
        const role = node.message.author?.role;
        if (role === 'user' || role === 'assistant') {
          messages.push({
            role,
            content: node.message.content.parts.join('\n'),
            timestamp: node.message.create_time
          });
        }
      }
    }
    return { platform: 'chatgpt', title: data.title || 'ChatGPT Conversation', messages };
  }
  return data;
}

/**
 * Parse Claude markdown export
 */
export function parseClaudeExport(content) {
  const messages = [];
  let currentRole = null;
  let currentContent = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('**Human:**') || line.startsWith('Human:')) {
      if (currentRole && currentContent.length) {
        messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
      }
      currentRole = 'user';
      currentContent = [line.replace(/^\*?\*?Human:\*?\*?\s*/, '')];
    } else if (line.startsWith('**Assistant:**') || line.startsWith('Assistant:')) {
      if (currentRole && currentContent.length) {
        messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
      }
      currentRole = 'assistant';
      currentContent = [line.replace(/^\*?\*?Assistant:\*?\*?\s*/, '')];
    } else if (currentRole) {
      currentContent.push(line);
    }
  }

  if (currentRole && currentContent.length) {
    messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
  }

  return { platform: 'claude', title: 'Claude Conversation', messages };
}
