/**
 * AIService - Handles @raven commands and AI responses
 *
 * Commands:
 * - @raven remember [X] - Save a fact
 * - @raven [question] - Query knowledge base
 * - @raven remind [when] [what] - Create an alert
 * - @raven task [description] - Create a task
 * - @raven decide [what] because [why] - Record a decision
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// System prompt for Raven AI
const SYSTEM_PROMPT = `You are Raven, an AI assistant for a tabletop games company. You help the team remember important information, answer questions based on what you know, and stay organized.

Your core capabilities:
1. REMEMBER - Store facts and information the team tells you
2. RECALL - Answer questions using stored knowledge
3. REMIND - Set up alerts for future dates
4. TASKS - Help create and track tasks
5. DECISIONS - Record important decisions with rationale

Communication style:
- Be concise and direct
- No fluff or motivational language
- Confirm what you've done clearly
- Ask for clarification when needed
- Reference specific stored facts when answering

When users say "@raven remember [X]", extract the key fact and confirm you've saved it.
When users ask questions, search your knowledge and provide direct answers.
If you don't know something, say so clearly.

Context about the business:
- Tabletop games company
- Manufacturing in China
- D2C sales + retail partners (Amazon)
- Social media marketing`;

/**
 * Parse a message to detect @raven commands
 */
export function parseRavenCommand(content) {
  const lowerContent = content.toLowerCase();

  // Check if message mentions @raven
  if (!lowerContent.includes('@raven')) {
    return null;
  }

  // Extract the part after @raven
  const ravenMatch = content.match(/@raven\s+(.+)/i);
  if (!ravenMatch) {
    return { type: 'query', query: '' };
  }

  const afterRaven = ravenMatch[1].trim();
  const lowerAfterRaven = afterRaven.toLowerCase();

  // Check for specific commands
  if (lowerAfterRaven.startsWith('remember ')) {
    return {
      type: 'remember',
      content: afterRaven.substring(9).trim()
    };
  }

  if (lowerAfterRaven.startsWith('remind ') || lowerAfterRaven.startsWith('reminder ')) {
    const reminderContent = lowerAfterRaven.startsWith('remind ')
      ? afterRaven.substring(7).trim()
      : afterRaven.substring(9).trim();
    return {
      type: 'remind',
      content: reminderContent
    };
  }

  if (lowerAfterRaven.startsWith('task ') || lowerAfterRaven.startsWith('todo ')) {
    const taskContent = lowerAfterRaven.startsWith('task ')
      ? afterRaven.substring(5).trim()
      : afterRaven.substring(5).trim();
    return {
      type: 'task',
      content: taskContent
    };
  }

  if (lowerAfterRaven.startsWith('decide ') || lowerAfterRaven.startsWith('decision ')) {
    const decisionContent = lowerAfterRaven.startsWith('decide ')
      ? afterRaven.substring(7).trim()
      : afterRaven.substring(9).trim();
    return {
      type: 'decision',
      content: decisionContent
    };
  }

  // Default: treat as a query
  return {
    type: 'query',
    query: afterRaven
  };
}

/**
 * Generate AI response for a query, using knowledge context
 */
export async function generateResponse(query, knowledgeContext, conversationHistory = []) {
  const contextMessages = [];

  // Add knowledge context if available
  if (knowledgeContext && (knowledgeContext.facts?.length > 0 || knowledgeContext.decisions?.length > 0)) {
    let contextText = 'Here is what I know that may be relevant:\n\n';

    if (knowledgeContext.facts?.length > 0) {
      contextText += 'FACTS:\n';
      knowledgeContext.facts.forEach((fact, i) => {
        contextText += `${i + 1}. ${fact.content}`;
        if (fact.category) contextText += ` [${fact.category}]`;
        contextText += '\n';
      });
      contextText += '\n';
    }

    if (knowledgeContext.decisions?.length > 0) {
      contextText += 'DECISIONS:\n';
      knowledgeContext.decisions.forEach((decision, i) => {
        contextText += `${i + 1}. ${decision.what}`;
        if (decision.why) contextText += ` (Reason: ${decision.why})`;
        contextText += '\n';
      });
    }

    contextMessages.push({
      role: 'system',
      content: contextText
    });
  }

  // Build messages array
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...contextMessages,
    ...conversationHistory.slice(-10).map(msg => ({
      role: msg.isAi ? 'assistant' : 'user',
      content: msg.content
    })),
    { role: 'user', content: query }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 500,
      temperature: 0.7
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('AI generation error:', error);
    throw new Error('Failed to generate AI response');
  }
}

/**
 * Extract a fact from user's "remember" command
 */
export async function extractFact(content) {
  const messages = [
    {
      role: 'system',
      content: `You extract facts from user statements. Return a JSON object with:
- fact: The core fact to remember (concise, clear statement)
- category: One of: product, manufacturing, marketing, sales, general

Example input: "The Dungeon Crawlers launch date is March 22nd"
Example output: {"fact": "Dungeon Crawlers launch date is March 22, 2025", "category": "product"}

Example input: "We're using Panda Manufacturing for the next order"
Example output: {"fact": "Using Panda Manufacturing for next order", "category": "manufacturing"}

Return ONLY valid JSON, no other text.`
    },
    {
      role: 'user',
      content
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 200,
      temperature: 0
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      content: result.fact,
      category: result.category || 'general'
    };
  } catch (error) {
    console.error('Fact extraction error:', error);
    // Fallback: use the content as-is
    return {
      content,
      category: 'general'
    };
  }
}

/**
 * Extract alert details from user's "remind" command
 */
export async function extractAlert(content) {
  const now = new Date();
  const messages = [
    {
      role: 'system',
      content: `You extract reminder/alert details from user statements. Current date/time: ${now.toISOString()}

Return a JSON object with:
- message: What to remind about
- triggerAt: ISO datetime string for when to trigger (interpret relative dates)
- triggerType: "date" for one-time, "recurring" for repeating

Examples:
"Feb 20 about the shipment" -> {"message": "Check on shipment", "triggerAt": "2025-02-20T09:00:00Z", "triggerType": "date"}
"tomorrow morning to call the factory" -> {"message": "Call the factory", "triggerAt": "[tomorrow 9am]", "triggerType": "date"}
"every Monday about standup" -> {"message": "Standup reminder", "triggerType": "recurring", "recurrenceRule": "FREQ=WEEKLY;BYDAY=MO"}

Return ONLY valid JSON, no other text.`
    },
    {
      role: 'user',
      content
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 200,
      temperature: 0
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Alert extraction error:', error);
    throw new Error('Could not understand the reminder. Try: "@raven remind [date] about [what]"');
  }
}

/**
 * Extract task details from user's "task" command
 */
export async function extractTask(content) {
  const messages = [
    {
      role: 'system',
      content: `You extract task details from user statements.

Return a JSON object with:
- title: Task title (action-oriented, concise)
- description: Optional longer description
- priority: low, medium, high, or urgent
- dueAt: ISO datetime if mentioned, null otherwise

Examples:
"call the manufacturer about shipping" -> {"title": "Call manufacturer about shipping", "priority": "medium", "dueAt": null}
"urgent: fix the website checkout by Friday" -> {"title": "Fix website checkout", "priority": "urgent", "dueAt": "2025-02-07T17:00:00Z"}

Return ONLY valid JSON, no other text.`
    },
    {
      role: 'user',
      content
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 200,
      temperature: 0
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Task extraction error:', error);
    return {
      title: content,
      priority: 'medium',
      dueAt: null
    };
  }
}

/**
 * Extract decision details from user's "decide" command
 */
export async function extractDecision(content) {
  const messages = [
    {
      role: 'system',
      content: `You extract decision details from user statements.

Return a JSON object with:
- what: The decision that was made
- why: The rationale (if provided)
- alternatives: Array of alternatives considered (if mentioned)

Examples:
"to use Panda Manufacturing because they have the best price" ->
{"what": "Use Panda Manufacturing", "why": "Best price", "alternatives": []}

"go with the blue box design over red because it tested better, also considered green" ->
{"what": "Use blue box design", "why": "Tested better than alternatives", "alternatives": ["Red box design", "Green box design"]}

Return ONLY valid JSON, no other text.`
    },
    {
      role: 'user',
      content
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 200,
      temperature: 0
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Decision extraction error:', error);
    return {
      what: content,
      why: null,
      alternatives: []
    };
  }
}

export default {
  parseRavenCommand,
  generateResponse,
  extractFact,
  extractAlert,
  extractTask,
  extractDecision
};
