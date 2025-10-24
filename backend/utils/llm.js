/**
 * LLM Utility
 *
 * Wrapper for OpenAI API with helpers for common operations.
 */

import OpenAI from 'openai';

let openaiClient = null;

/**
 * Initialize OpenAI client
 */
export function initializeLLM(apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

/**
 * Get OpenAI client instance
 */
export function getLLMClient() {
  if (!openaiClient) {
    throw new Error('LLM client not initialized. Call initializeLLM() first.');
  }
  return openaiClient;
}

/**
 * Generate chat completion
 *
 * @param {Array} messages - Array of {role, content} objects
 * @param {Object} options - Additional options (model, temperature, etc.)
 * @returns {Promise<string>} - AI response content
 */
export async function generateChatCompletion(messages, options = {}) {
  const client = getLLMClient();

  const {
    model = 'gpt-4',
    temperature = 0.7,
    maxTokens = 1000,
    ...otherOptions
  } = options;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...otherOptions
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error(`Failed to generate completion: ${error.message}`);
  }
}

/**
 * Generate structured output using JSON mode
 *
 * @param {Array} messages - Array of {role, content} objects
 * @param {Object} schema - JSON schema for expected output
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Parsed JSON response
 */
export async function generateStructuredOutput(messages, schema, options = {}) {
  const client = getLLMClient();

  const {
    model = 'gpt-4',
    temperature = 0.7,
    maxTokens = 1000
  } = options;

  try {
    // Add instruction about JSON format to system message
    const enhancedMessages = [
      ...messages.slice(0, 1), // Keep system message
      {
        role: 'system',
        content: `You must respond with valid JSON matching this schema: ${JSON.stringify(schema)}`
      },
      ...messages.slice(1) // Rest of messages
    ];

    const completion = await client.chat.completions.create({
      model,
      messages: enhancedMessages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('OpenAI structured output error:', error);
    throw new Error(`Failed to generate structured output: ${error.message}`);
  }
}

/**
 * Generate simple response from a single prompt
 *
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - Optional system prompt
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - AI response
 */
export async function generateSimpleResponse(prompt, systemPrompt = '', options = {}) {
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({ role: 'user', content: prompt });

  return generateChatCompletion(messages, options);
}

/**
 * Build message history from conversation
 *
 * Helper to format conversation history for OpenAI API
 *
 * @param {Array} history - Array of message objects with {role, content}
 * @param {number} limit - Max messages to include (most recent)
 * @returns {Array} - Formatted messages for OpenAI
 */
export function buildMessageHistory(history, limit = 10) {
  if (!history || history.length === 0) {
    return [];
  }

  // Get most recent messages
  const recentHistory = history.slice(-limit);

  return recentHistory.map(msg => ({
    role: msg.role === 'persona' ? 'assistant' : msg.role,
    content: msg.content
  }));
}

/**
 * Count tokens in text (rough estimate)
 *
 * @param {string} text - Text to count
 * @returns {number} - Estimated token count
 */
export function estimateTokenCount(text) {
  if (!text) return 0;
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit token limit
 *
 * @param {string} text - Text to truncate
 * @param {number} maxTokens - Max tokens allowed
 * @returns {string} - Truncated text
 */
export function truncateToTokenLimit(text, maxTokens) {
  const estimatedTokens = estimateTokenCount(text);
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // Truncate to approximate character count
  const maxChars = maxTokens * 4;
  return text.substring(0, maxChars) + '...';
}

export default {
  initializeLLM,
  getLLMClient,
  generateChatCompletion,
  generateStructuredOutput,
  generateSimpleResponse,
  buildMessageHistory,
  estimateTokenCount,
  truncateToTokenLimit
};
