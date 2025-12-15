/**
 * AIService - Handles @raven commands and AI responses
 *
 * Commands:
 * - @raven remember [X] - Save a fact
 * - @raven forget [X] - Remove/invalidate a fact
 * - @raven correct [old] to [new] - Update a fact
 * - @raven [question] - Query knowledge base
 * - @raven remind [when] [what] - Create an alert
 * - @raven task [description] - Create a task
 * - @raven tasks / @raven my tasks - List tasks
 * - @raven decide [what] because [why] - Record a decision
 * - @raven start learning - Enable auto-learning mode
 * - @raven stop learning - Disable auto-learning mode
 * - @raven what do you know - List stored knowledge
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

  // Forget/remove a fact
  if (lowerAfterRaven.startsWith('forget ') || lowerAfterRaven.startsWith('remove ') || lowerAfterRaven.startsWith('delete ')) {
    const forgetContent = afterRaven.substring(afterRaven.indexOf(' ') + 1).trim();
    return {
      type: 'forget',
      content: forgetContent
    };
  }

  // Correct/update a fact
  if (lowerAfterRaven.startsWith('correct ') || lowerAfterRaven.startsWith('update ') || lowerAfterRaven.startsWith('change ')) {
    const updateContent = afterRaven.substring(afterRaven.indexOf(' ') + 1).trim();
    return {
      type: 'correct',
      content: updateContent
    };
  }

  // Learning mode
  if (lowerAfterRaven.startsWith('start learning') || lowerAfterRaven === 'learn' || lowerAfterRaven === 'learning mode on') {
    return { type: 'start_learning' };
  }

  if (lowerAfterRaven.startsWith('stop learning') || lowerAfterRaven === 'learning mode off') {
    return { type: 'stop_learning' };
  }

  // List tasks
  if (lowerAfterRaven === 'tasks' || lowerAfterRaven === 'my tasks' || lowerAfterRaven.startsWith('list tasks') || lowerAfterRaven.startsWith('show tasks')) {
    return { type: 'list_tasks' };
  }

  // List knowledge
  if (lowerAfterRaven.startsWith('what do you know') || lowerAfterRaven === 'facts' || lowerAfterRaven.startsWith('list facts') || lowerAfterRaven.startsWith('show facts')) {
    return { type: 'list_knowledge' };
  }

  // List reminders
  if (lowerAfterRaven === 'reminders' || lowerAfterRaven.startsWith('list reminders') || lowerAfterRaven.startsWith('show reminders') || lowerAfterRaven === 'alerts') {
    return { type: 'list_reminders' };
  }

  // Discuss command - start a facilitated discussion
  if (lowerAfterRaven.startsWith('discuss ') || lowerAfterRaven.startsWith('let\'s discuss ') || lowerAfterRaven.startsWith('lets discuss ')) {
    const topic = afterRaven.replace(/^(discuss|let's discuss|lets discuss)\s+/i, '').trim();
    return {
      type: 'discuss',
      topic: topic
    };
  }

  // End discussion
  if (lowerAfterRaven === 'end discussion' || lowerAfterRaven === 'stop discussion' || lowerAfterRaven === 'conclude discussion' || lowerAfterRaven === 'wrap up') {
    return { type: 'end_discussion' };
  }

  // Continue discussion (next question)
  if (lowerAfterRaven === 'next question' || lowerAfterRaven === 'another question' || lowerAfterRaven === 'more' || lowerAfterRaven === 'continue') {
    return { type: 'continue_discussion' };
  }

  // Confirmation commands for pending actions
  if (lowerAfterRaven === 'yes, update' || lowerAfterRaven === 'yes update' || lowerAfterRaven.startsWith('yes,') || lowerAfterRaven === 'yes') {
    return { type: 'confirm_update' };
  }

  if (lowerAfterRaven === 'save anyway' || lowerAfterRaven === 'save both' || lowerAfterRaven === 'keep both') {
    return { type: 'save_anyway' };
  }

  if (lowerAfterRaven === 'nevermind' || lowerAfterRaven === 'cancel' || lowerAfterRaven === 'no' || lowerAfterRaven === 'nope') {
    return { type: 'cancel_action' };
  }

  // Calendar commands
  if (lowerAfterRaven === 'calendar' || lowerAfterRaven === 'schedule' || lowerAfterRaven.startsWith('what\'s on my calendar') ||
      lowerAfterRaven.startsWith('whats on my calendar') || lowerAfterRaven.startsWith('show calendar') ||
      lowerAfterRaven.startsWith('my calendar') || lowerAfterRaven.startsWith('upcoming events') ||
      lowerAfterRaven.startsWith('what\'s coming up') || lowerAfterRaven.startsWith('whats coming up')) {
    return { type: 'calendar_query', content: afterRaven };
  }

  // Add event to calendar
  if (lowerAfterRaven.startsWith('add event ') || lowerAfterRaven.startsWith('schedule ') ||
      lowerAfterRaven.startsWith('add to calendar ') || lowerAfterRaven.startsWith('create event ') ||
      lowerAfterRaven.startsWith('put on calendar ') || lowerAfterRaven.startsWith('book ')) {
    const eventContent = afterRaven.replace(/^(add event|schedule|add to calendar|create event|put on calendar|book)\s+/i, '').trim();
    return { type: 'add_event', content: eventContent };
  }

  // Task due dates query
  if (lowerAfterRaven.startsWith('what\'s due') || lowerAfterRaven.startsWith('whats due') ||
      lowerAfterRaven.startsWith('due dates') || lowerAfterRaven.startsWith('upcoming due') ||
      lowerAfterRaven === 'due' || lowerAfterRaven.startsWith('deadlines')) {
    return { type: 'due_dates_query', content: afterRaven };
  }

  // Deep research command
  if (lowerAfterRaven.startsWith('research ') || lowerAfterRaven.startsWith('deep research ') ||
      lowerAfterRaven.startsWith('investigate ') || lowerAfterRaven.startsWith('analyze ')) {
    const researchContent = afterRaven.replace(/^(research|deep research|investigate|analyze)\s+/i, '').trim();
    return { type: 'deep_research', content: researchContent };
  }

  // ============================================================================
  // WORK CONTEXT COMMANDS (AI-first productivity)
  // ============================================================================

  // Status command - show goal/project/team status with health
  if (lowerAfterRaven.startsWith('status ') || lowerAfterRaven === 'status') {
    const target = afterRaven.replace(/^status\s*/i, '').trim() || null;
    return { type: 'work_status', content: target };
  }

  // Prioritize command - suggest task ordering based on goals
  if (lowerAfterRaven === 'prioritize' || lowerAfterRaven.startsWith('prioritize ') ||
      lowerAfterRaven === 'what should i work on' || lowerAfterRaven.startsWith('what should i do')) {
    return { type: 'prioritize' };
  }

  // Priority queue command
  if (lowerAfterRaven === 'priority queue' || lowerAfterRaven === 'queue' ||
      lowerAfterRaven.startsWith('what\'s next') || lowerAfterRaven.startsWith('whats next')) {
    return { type: 'priority_queue' };
  }

  // What's blocking command - show blockers for a goal/project
  if (lowerAfterRaven.startsWith('what\'s blocking') || lowerAfterRaven.startsWith('whats blocking') ||
      lowerAfterRaven.startsWith('blockers for') || lowerAfterRaven.startsWith('show blockers')) {
    const target = afterRaven.replace(/^(what's blocking|whats blocking|blockers for|show blockers)\s*/i, '').trim();
    return { type: 'show_blockers', content: target };
  }

  // Link knowledge to work
  if (lowerAfterRaven.startsWith('link ') && (lowerAfterRaven.includes(' to task') || lowerAfterRaven.includes(' to goal'))) {
    return { type: 'link_knowledge', content: afterRaven.substring(5).trim() };
  }

  // Research for a specific task/goal
  if (lowerAfterRaven.startsWith('research for ')) {
    const target = afterRaven.substring(13).trim();
    return { type: 'research_for', content: target };
  }

  // Goal health
  if (lowerAfterRaven.startsWith('health of ') || lowerAfterRaven.startsWith('goal health')) {
    const target = afterRaven.replace(/^(health of|goal health)\s*/i, '').trim();
    return { type: 'goal_health', content: target };
  }

  // Priority conflicts
  if (lowerAfterRaven.startsWith('priority conflicts') || lowerAfterRaven === 'conflicts') {
    return { type: 'priority_conflicts' };
  }

  // ============================================================================
  // UX PREFERENCES COMMANDS (AI-controlled personalization)
  // ============================================================================

  // Hide nav item: @raven hide calendar
  if (lowerAfterRaven.startsWith('hide ')) {
    const item = afterRaven.substring(5).trim();
    return { type: 'ux_hide', content: item };
  }

  // Show nav item: @raven show calendar
  if (lowerAfterRaven.startsWith('show ') && !lowerAfterRaven.startsWith('show tasks') &&
      !lowerAfterRaven.startsWith('show facts') && !lowerAfterRaven.startsWith('show reminders') &&
      !lowerAfterRaven.startsWith('show blockers') && !lowerAfterRaven.startsWith('show calendar')) {
    const item = afterRaven.substring(5).trim();
    return { type: 'ux_show', content: item };
  }

  // Move nav item: @raven put tasks before goals / @raven put tasks at the top
  if (lowerAfterRaven.startsWith('put ') || lowerAfterRaven.startsWith('move ')) {
    const content = afterRaven.substring(4).trim();
    return { type: 'ux_move', content };
  }

  // Density: @raven compact view / @raven spacious view / @raven comfortable view
  if (lowerAfterRaven === 'compact view' || lowerAfterRaven === 'compact mode' || lowerAfterRaven === 'compact') {
    return { type: 'ux_density', content: 'compact' };
  }
  if (lowerAfterRaven === 'spacious view' || lowerAfterRaven === 'spacious mode' || lowerAfterRaven === 'spacious') {
    return { type: 'ux_density', content: 'spacious' };
  }
  if (lowerAfterRaven === 'comfortable view' || lowerAfterRaven === 'comfortable mode' || lowerAfterRaven === 'comfortable' || lowerAfterRaven === 'normal view') {
    return { type: 'ux_density', content: 'comfortable' };
  }

  // Toggle animations: @raven disable animations / @raven enable animations
  if (lowerAfterRaven === 'disable animations' || lowerAfterRaven === 'turn off animations' || lowerAfterRaven === 'no animations') {
    return { type: 'ux_animations', content: false };
  }
  if (lowerAfterRaven === 'enable animations' || lowerAfterRaven === 'turn on animations') {
    return { type: 'ux_animations', content: true };
  }

  // Toggle badges: @raven hide badges / @raven show badges
  if (lowerAfterRaven === 'hide badges' || lowerAfterRaven === 'disable badges' || lowerAfterRaven === 'no badges') {
    return { type: 'ux_badges', content: false };
  }
  if (lowerAfterRaven === 'show badges' || lowerAfterRaven === 'enable badges') {
    return { type: 'ux_badges', content: true };
  }

  // Toggle AI summaries: @raven hide ai summaries / @raven show ai summaries
  if (lowerAfterRaven === 'hide ai summaries' || lowerAfterRaven === 'disable ai summaries' || lowerAfterRaven === 'no ai summaries') {
    return { type: 'ux_ai_summaries', content: false };
  }
  if (lowerAfterRaven === 'show ai summaries' || lowerAfterRaven === 'enable ai summaries') {
    return { type: 'ux_ai_summaries', content: true };
  }

  // Simplify view: @raven simplify my view / @raven simplify
  if (lowerAfterRaven === 'simplify my view' || lowerAfterRaven === 'simplify view' ||
      lowerAfterRaven === 'simplify' || lowerAfterRaven === 'minimal view') {
    return { type: 'ux_simplify' };
  }

  // Reset preferences: @raven reset my preferences
  if (lowerAfterRaven === 'reset my preferences' || lowerAfterRaven === 'reset preferences' ||
      lowerAfterRaven === 'reset my view' || lowerAfterRaven === 'default view') {
    return { type: 'ux_reset' };
  }

  // What's hidden: @raven what have i hidden / @raven hidden items
  if (lowerAfterRaven === 'what have i hidden' || lowerAfterRaven === 'whats hidden' ||
      lowerAfterRaven === 'hidden items' || lowerAfterRaven === 'my hidden items') {
    return { type: 'ux_list_hidden' };
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
 * Extract URLs from text
 */
function extractUrls(text) {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)]; // Remove duplicates
}

/**
 * Extract dates from text (returns array of ISO strings)
 */
function extractDates(text) {
  const dates = [];
  const now = new Date();

  // Common date patterns
  const patterns = [
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/g,                    // 12/25/2025
    /(\d{4}-\d{2}-\d{2})/g,                             // 2025-12-25
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}?/gi,  // March 22nd, 2025
    /(Q[1-4])\s*(\d{4})?/gi,                           // Q1 2025
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      try {
        const parsed = new Date(match);
        if (!isNaN(parsed.getTime())) {
          dates.push(parsed.toISOString().split('T')[0]);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  return [...new Set(dates)];
}

/**
 * Extract a fact from user's "remember" command with rich metadata
 */
export async function extractFact(content) {
  // Extract metadata from raw content first
  const urls = extractUrls(content);
  const dates = extractDates(content);

  const messages = [
    {
      role: 'system',
      content: `You extract facts from user statements. Return a JSON object with:
- fact: The core fact to remember (concise, clear statement)
- category: One of: product, manufacturing, marketing, sales, finance, people, general
- entities: Array of key entities mentioned (company names, product names, people)
- tags: Array of relevant tags for search

Example input: "The Dungeon Crawlers launch date is March 22nd"
Example output: {"fact": "Dungeon Crawlers launch date is March 22, 2025", "category": "product", "entities": ["Dungeon Crawlers"], "tags": ["launch", "date", "release"]}

Example input: "We're using Panda Manufacturing for the next order, their contact is jenny@panda.com"
Example output: {"fact": "Using Panda Manufacturing for next order, contact: jenny@panda.com", "category": "manufacturing", "entities": ["Panda Manufacturing"], "tags": ["vendor", "manufacturing", "contact"]}

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
      max_tokens: 300,
      temperature: 0
    });

    const result = JSON.parse(response.choices[0].message.content);

    // Build rich metadata object
    const metadata = {
      urls: urls.length > 0 ? urls : undefined,
      dates: dates.length > 0 ? dates : undefined,
      entities: result.entities?.length > 0 ? result.entities : undefined,
      tags: result.tags?.length > 0 ? result.tags : undefined
    };

    // Remove undefined keys
    Object.keys(metadata).forEach(key => metadata[key] === undefined && delete metadata[key]);

    return {
      content: result.fact,
      category: result.category || 'general',
      metadata: Object.keys(metadata).length > 0 ? metadata : null
    };
  } catch (error) {
    console.error('Fact extraction error:', error);
    // Fallback: use the content as-is
    return {
      content,
      category: 'general',
      metadata: urls.length > 0 ? { urls } : null
    };
  }
}

/**
 * Detect if a message contains personal user facts (e.g., "call me Shawn", "I'm the marketing lead")
 * Returns null if no user fact detected, otherwise returns the extracted fact
 */
export async function extractUserFact(content) {
  // Quick check for common patterns before hitting the API
  const lowerContent = content.toLowerCase();
  const hasUserFactPattern =
    lowerContent.includes('call me ') ||
    lowerContent.includes('my name is ') ||
    lowerContent.includes("i'm ") ||
    lowerContent.includes('i am ') ||
    lowerContent.includes('i go by ') ||
    lowerContent.includes('prefer to be called ') ||
    lowerContent.includes('my role is ') ||
    lowerContent.includes('i work as ') ||
    lowerContent.includes('my title is ') ||
    lowerContent.includes('i handle ') ||
    lowerContent.includes('i manage ') ||
    lowerContent.includes('my email is ') ||
    lowerContent.includes('my timezone is ') ||
    lowerContent.includes('my phone is ');

  if (!hasUserFactPattern) {
    return null;
  }

  const messages = [
    {
      role: 'system',
      content: `You detect personal facts about a user from their message.

Return JSON with:
- isUserFact: boolean - true if this is a fact about the speaker themselves
- factType: 'nickname' | 'role' | 'preference' | 'contact' | 'note'
- key: the specific attribute (e.g., 'preferred_name', 'job_title', 'timezone')
- value: the value to store

Examples:
"call me Shawn" -> {"isUserFact": true, "factType": "nickname", "key": "preferred_name", "value": "Shawn"}
"I'm the marketing lead" -> {"isUserFact": true, "factType": "role", "key": "job_title", "value": "Marketing Lead"}
"my timezone is EST" -> {"isUserFact": true, "factType": "preference", "key": "timezone", "value": "EST"}
"the launch is next week" -> {"isUserFact": false}

Return ONLY valid JSON.`
    },
    {
      role: 'user',
      content
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 150,
      temperature: 0
    });

    let resultText = response.choices[0].message.content;

    // Strip markdown code blocks if present
    const codeBlockMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      resultText = codeBlockMatch[1].trim();
    }

    const result = JSON.parse(resultText);

    if (!result.isUserFact) {
      return null;
    }

    return {
      factType: result.factType,
      key: result.key,
      value: result.value
    };
  } catch (error) {
    console.error('User fact extraction error:', error);
    return null;
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

/**
 * Find fact to forget/invalidate based on user description
 */
export async function findFactToForget(content, existingFacts) {
  if (existingFacts.length === 0) {
    return null;
  }

  const messages = [
    {
      role: 'system',
      content: `You help find which stored fact the user wants to forget/remove.

Given a list of facts and the user's request, identify which fact ID they're referring to.

FACTS:
${existingFacts.map(f => `- ID: ${f.id} | "${f.content}" [${f.category}]`).join('\n')}

Return a JSON object with:
- factId: The ID of the fact to remove (or null if no match)
- confidence: "high", "medium", or "low"
- reason: Brief explanation

Return ONLY valid JSON.`
    },
    {
      role: 'user',
      content: `User wants to forget: "${content}"`
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
    console.error('Find fact error:', error);
    return null;
  }
}

/**
 * Extract correction details from user's message
 */
export async function extractCorrection(content, existingFacts) {
  const messages = [
    {
      role: 'system',
      content: `You help correct/update stored facts.

Given a correction request and existing facts, identify:
1. Which fact to update (by ID)
2. What the new content should be

EXISTING FACTS:
${existingFacts.map(f => `- ID: ${f.id} | "${f.content}" [${f.category}]`).join('\n')}

Examples:
"the launch date is actually March 25th not March 22nd" -> Find the launch date fact and update it
"Panda Manufacturing to Dragon Manufacturing" -> Find the manufacturer fact and update it

Return JSON:
- factId: ID of fact to update (null if creating new)
- newContent: The corrected content
- category: Category for the fact

Return ONLY valid JSON.`
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
    console.error('Correction extraction error:', error);
    return { factId: null, newContent: content, category: 'general' };
  }
}

/**
 * Check if a new fact conflicts with or duplicates existing facts
 * Returns: { action: 'save' | 'update' | 'ask_confirmation', ... }
 */
export async function checkFactConflict(newFact, existingFacts) {
  if (existingFacts.length === 0) {
    return { action: 'save', reason: 'No existing facts to compare' };
  }

  const messages = [
    {
      role: 'system',
      content: `You detect CONFLICTS between a new fact and existing facts. Be STRICT about contradictions.

EXISTING FACTS:
${existingFacts.map(f => `- ID: ${f.id} | "${f.content}" [${f.category}]`).join('\n')}

NEW FACT TO SAVE: "${newFact.content}" [${newFact.category}]

Return JSON:
{
  "action": "save" | "update" | "ask_confirmation",
  "reason": "brief explanation",
  "relatedFactId": "ID of related fact if any, null otherwise",
  "relatedFactContent": "content of the related fact if any",
  "conflictType": "duplicate" | "contradiction" | "update" | "none"
}

CONTRADICTION EXAMPLES (use ask_confirmation):
- "There are 7 dwarfs" vs "There are 6 dwarfs" → CONTRADICTION (different numbers)
- "Fugly is a cat" vs "Fugly is a dog" → CONTRADICTION (same entity, different type)
- "Launch date is March 25" vs "Launch date is April 1" → CONTRADICTION (different dates)
- "CEO is John" vs "CEO is Mary" → CONTRADICTION (different values for same role)
- "We use Slack" vs "We use Teams" → Could be both true, so SAVE

Decision rules:
1. ask_confirmation: Same subject with DIFFERENT values (numbers, dates, types, names)
   - This is the MOST IMPORTANT check. When in doubt, ask_confirmation.

2. save: Genuinely different topics, OR additive information

3. update: ONLY if user explicitly says "update", "change", "actually", "correction"

Return ONLY valid JSON.`
    },
    {
      role: 'user',
      content: `Analyze for conflicts`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 300,
      temperature: 0
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log(`Conflict check: "${newFact.content}" vs ${existingFacts.length} facts → ${result.action} (${result.reason})`);
    return result;
  } catch (error) {
    console.error('Fact conflict check error:', error);
    // Default to saving if we can't check
    return { action: 'save', reason: 'Could not check conflicts' };
  }
}

/**
 * Extract facts from a regular message (for learning mode)
 */
export async function extractFactsFromMessage(content) {
  const messages = [
    {
      role: 'system',
      content: `Analyze this message and extract any facts worth remembering for a business.

Extract things like:
- Decisions made
- Important dates/deadlines
- Vendor/partner information
- Product information
- Process/workflow information
- Contact information

Return a JSON array of facts. Each fact:
- content: The fact to remember
- category: product, manufacturing, marketing, sales, general
- confidence: 0.0-1.0 (how confident this is important to remember)

If no extractable facts, return empty array [].
Only extract facts with confidence >= 0.6.

Return ONLY valid JSON array.`
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
      max_tokens: 500,
      temperature: 0
    });

    const facts = JSON.parse(response.choices[0].message.content);
    return facts.filter(f => f.confidence >= 0.6);
  } catch (error) {
    console.error('Message fact extraction error:', error);
    return [];
  }
}

/**
 * Call OpenAI with messages (generic helper)
 */
export async function callOpenAI(messages, { maxTokens = 500, temperature = 0.7 } = {}) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: maxTokens,
      temperature
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI call error:', error);
    throw error;
  }
}

/**
 * Generate an answer for "Ask the Company" feature
 * Uses knowledge base to answer questions about the company
 */
export async function generateCompanyAnswer(question, facts, decisions, kbDocuments = [], graphContext = null) {
  // Build knowledge context
  let knowledgeContext = '';

  // GraphRAG context (most relevant - from knowledge graph traversal)
  if (graphContext && graphContext.chunks && graphContext.chunks.length > 0) {
    knowledgeContext += 'KNOWLEDGE GRAPH CONTEXT:\n';

    // Show relevant entities found
    if (graphContext.entryNodes && graphContext.entryNodes.length > 0) {
      const entitySummary = graphContext.entryNodes
        .map(n => `${n.name} (${n.type})`)
        .join(', ');
      knowledgeContext += `Relevant entities: ${entitySummary}\n`;

      // Show connected entities
      if (graphContext.relatedNodes && graphContext.relatedNodes.length > 0) {
        const relatedSummary = graphContext.relatedNodes
          .map(n => `${n.name} (${n.type}) via ${n.relationship}`)
          .slice(0, 5)
          .join(', ');
        knowledgeContext += `Connected to: ${relatedSummary}\n`;
      }
      knowledgeContext += '\n';
    }

    // Add graph chunks (these are the most contextually relevant)
    knowledgeContext += 'Relevant excerpts from knowledge base:\n';
    graphContext.chunks.forEach((chunk, i) => {
      knowledgeContext += `\n[${i + 1}] `;
      if (chunk.source_title) knowledgeContext += `From "${chunk.source_title}": `;
      knowledgeContext += chunk.content + '\n';
    });
    knowledgeContext += '\n';
  }

  // Traditional facts
  if (facts.length > 0) {
    knowledgeContext += 'COMPANY KNOWLEDGE (Facts):\n';
    facts.forEach((fact, i) => {
      knowledgeContext += `${i + 1}. ${fact.content}`;
      if (fact.category) knowledgeContext += ` [${fact.category}]`;
      if (fact.entityType && fact.entityName) {
        knowledgeContext += ` (${fact.entityType}: ${fact.entityName})`;
      }
      knowledgeContext += '\n';
    });
    knowledgeContext += '\n';
  }

  // Decisions
  if (decisions.length > 0) {
    knowledgeContext += 'COMPANY DECISIONS:\n';
    decisions.forEach((decision, i) => {
      knowledgeContext += `${i + 1}. ${decision.what}`;
      if (decision.why) knowledgeContext += ` - Reason: ${decision.why}`;
      knowledgeContext += '\n';
    });
    knowledgeContext += '\n';
  }

  // Add Knowledge Base documents as fallback (when no graph chunks)
  if (kbDocuments.length > 0 && (!graphContext || !graphContext.chunks || graphContext.chunks.length === 0)) {
    knowledgeContext += 'DOCUMENTS FROM KNOWLEDGE BASE:\n';
    kbDocuments.forEach((doc, i) => {
      knowledgeContext += `\n--- Document ${i + 1}: ${doc.title} ---\n`;
      if (doc.content) {
        // Truncate content if too long (keep first 2000 chars per doc)
        const truncatedContent = doc.content.length > 2000
          ? doc.content.substring(0, 2000) + '...[truncated]'
          : doc.content;
        knowledgeContext += truncatedContent + '\n';
      }
      if (doc.external_url) {
        knowledgeContext += `Source: ${doc.external_url}\n`;
      }
    });
    knowledgeContext += '\n';
  }

  const systemPrompt = `You are a company knowledge assistant. Answer questions using ONLY the company knowledge provided below. If you don't have enough information to answer, say so clearly.

${knowledgeContext || 'No specific knowledge available yet.'}

Guidelines:
- Be direct and concise
- Reference specific facts and documents when answering
- When citing documents from the Knowledge Base, mention the document title
- If information is incomplete, state what you do know and what's missing
- Suggest related questions the user might ask
- Rate your confidence in the answer (0.0 to 1.0)

Return JSON with:
- answer: Your answer to the question
- confidence: 0.0-1.0 how confident you are based on available knowledge
- followups: Array of 2-3 related questions the user might want to ask`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 600,
      temperature: 0.5
    });

    try {
      let content = response.choices[0].message.content;

      // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        content = codeBlockMatch[1].trim();
      }

      const parsed = JSON.parse(content);
      return {
        answer: parsed.answer || content,
        confidence: parsed.confidence || 0.5,
        followups: parsed.followups || []
      };
    } catch (parseError) {
      // If not valid JSON, return as plain answer
      return {
        answer: response.choices[0].message.content,
        confidence: 0.5,
        followups: []
      };
    }
  } catch (error) {
    console.error('Company answer generation error:', error);
    return {
      answer: "I encountered an error trying to answer your question. Please try again.",
      confidence: 0,
      followups: []
    };
  }
}

/**
 * Extract atomic facts from a longer piece of text (answer, document, etc.)
 * Each atomic fact is a single, self-contained statement that can stand alone
 */
export async function extractAtomicFacts(text, context = {}) {
  const messages = [
    {
      role: 'system',
      content: `You extract atomic facts from text. Each atomic fact should be:
1. A single, complete statement that can stand alone
2. Self-contained (includes necessary context like company name, not just "they" or "it")
3. Factual and objective (not opinions unless clearly attributed)
4. Concise but complete

Examples of good atomic facts:
- "Full Uproar Games, Inc. is a tabletop games company"
- "Full Uproar Games specializes in humor-driven party games"
- "Hack Your Deck is a game mod for card-based games"
- "Dumbest Ways To Win is used to break ties in games"

Examples of BAD atomic facts (too vague or incomplete):
- "They make games" (who is "they"?)
- "It's fun" (what is "it"?)
- "The company" (which company?)

Return a JSON object with:
{
  "facts": [
    {
      "statement": "The atomic fact statement",
      "category": "product|company|process|people|decision|general",
      "entities": ["Entity1", "Entity2"],
      "confidence": 0.0-1.0
    }
  ],
  "sourceQuestion": "The original question if this is a Q&A" (optional)
}

Extract ALL distinct facts from the text. Aim for 3-10 facts depending on content richness.
Return ONLY valid JSON.`
    },
    {
      role: 'user',
      content: context.question
        ? `Question: ${context.question}\n\nAnswer to extract facts from:\n${text}`
        : `Text to extract facts from:\n${text}`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 1000,
      temperature: 0
    });

    let content = response.choices[0].message.content;

    // Strip markdown code blocks if present
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1].trim();
    }

    const result = JSON.parse(content);

    // Filter to high-confidence facts and ensure they have required fields
    return result.facts
      .filter(f => f.confidence >= 0.6)
      .map(f => ({
        statement: f.statement,
        category: f.category || 'general',
        entities: f.entities || [],
        confidence: f.confidence || 0.7
      }));
  } catch (error) {
    console.error('Atomic fact extraction error:', error);
    // Fallback: return the whole text as one fact
    return [{
      statement: text.substring(0, 500),
      category: 'general',
      entities: [],
      confidence: 0.5
    }];
  }
}

/**
 * Generate an embedding vector for text using OpenAI's embedding model
 */
export async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation error:', error);
    return null;
  }
}

/**
 * Search for similar facts using vector similarity
 * Returns the most semantically similar facts to the query
 */
export async function semanticSearch(query, facts, topK = 5) {
  if (!facts || facts.length === 0) return [];

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return facts.slice(0, topK);

    // Calculate cosine similarity for each fact that has an embedding
    const scored = facts
      .filter(f => f.embedding)
      .map(fact => {
        const similarity = cosineSimilarity(queryEmbedding, fact.embedding);
        return { ...fact, similarity };
      })
      .sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, topK);
  } catch (error) {
    console.error('Semantic search error:', error);
    return facts.slice(0, topK);
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// ============================================================================
// Learning Objectives - Question Generation
// ============================================================================

/**
 * Generate questions for a learning objective
 */
export async function generateLearningQuestions(title, description, existingQA = [], { count = 3, isInitial = false } = {}) {
  const existingContext = existingQA.length > 0
    ? `\n\nAlready asked and answered:\n${existingQA.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}`
    : '';

  const messages = [
    {
      role: 'system',
      content: `You are helping a company build practical knowledge about a topic. Generate ${count} focused questions.

LEARNING OBJECTIVE: ${title}
${description ? `DESCRIPTION: ${description}` : ''}
${existingContext}

CRITICAL: Ask PRACTICAL, BROAD questions that can be answered in 1-3 sentences.
- BAD: "What are the key external factors, such as marketing and distribution partnerships, that need to be arranged?"
- BAD: "What's the underlying methodology for your approach?"
- GOOD: "Who is your distribution partner for this launch?"
- GOOD: "What's the target launch date?"
- GOOD: "How many units are planned for the initial print run?"
- GOOD: "What's the budget for this project?"

Guidelines:
- Focus on BREADTH across the topic, not depth in any one area
- Each question should target ONE specific fact or detail
- Answers should fit in a short paragraph, not require a page of writing
- ${isInitial ? 'Cover the fundamentals: who, what, when, where, how many, how much' : 'Explore areas not yet covered rather than drilling deeper into existing answers'}
- Prioritize practical, operational questions (people, dates, budgets, processes)
- Avoid academic, theoretical, or overly technical questions
- Avoid compound questions with "and" or multiple parts
- Avoid questions already asked

Think like a new employee trying to understand the basics, not a consultant doing deep analysis.

Return a JSON array of question strings:
["Question 1?", "Question 2?", "Question 3?"]

Return ONLY valid JSON.`
    },
    {
      role: 'user',
      content: `Generate ${count} questions for this learning objective`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 500,
      temperature: 0.7
    });

    let content = response.choices[0].message.content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1].trim();
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('Learning question generation error:', error);
    return [`What are the key aspects of ${title}?`];
  }
}

/**
 * Decide next step after a question is answered in a learning objective
 */
export async function decideLearningNextStep(title, description, existingQA, latestQA) {
  const messages = [
    {
      role: 'system',
      content: `You are managing a learning objective for a company. Decide what to do next.

LEARNING OBJECTIVE: ${title}
${description ? `DESCRIPTION: ${description}` : ''}

Questions & Answers so far:
${existingQA.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}

LATEST Q&A:
Q: ${latestQA.question}
A: ${latestQA.answer}

Decide the next action:
1. "followup" - Ask a follow-up question to dig deeper into the latest answer
2. "new_question" - Ask a new question about a different aspect
3. "complete" - The objective has been sufficiently addressed

Return JSON:
{
  "action": "followup" | "new_question" | "complete",
  "question": "The question to ask (if action is followup or new_question)",
  "reason": "Brief explanation of your decision"
}

Guidelines:
- Use "followup" when the answer reveals something worth exploring deeper
- Use "new_question" when this topic is covered but others remain
- Use "complete" when we have comprehensive understanding of the objective
- Aim for depth over breadth - follow up on interesting threads

Return ONLY valid JSON.`
    },
    {
      role: 'user',
      content: `Decide next step`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 300,
      temperature: 0.3
    });

    let content = response.choices[0].message.content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1].trim();
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('Learning decision error:', error);
    return { action: 'complete', reason: 'Error in decision making' };
  }
}

/**
 * Generate a single follow-up question for an answered question
 */
export async function generateFollowUpQuestion(originalQuestion, answer, context = null) {
  const messages = [
    {
      role: 'system',
      content: `Generate a PRACTICAL follow-up question to expand knowledge breadth (not depth).
${context ? `\nCONTEXT: Learning about "${context.title}"${context.description ? ` - ${context.description}` : ''}` : ''}

ORIGINAL QUESTION: ${originalQuestion}
ANSWER: ${answer}

Generate ONE question that:
- Explores a DIFFERENT aspect of the topic (don't dive deeper into the same subtopic)
- Is practical and relevant to day-to-day business operations
- Can be answered in 1-3 sentences with concrete facts
- Covers gaps in knowledge (what, who, when, where) rather than drilling into details

PRIORITIZE questions about:
1. Key people/roles involved
2. Important dates/timelines
3. Related processes or workflows
4. Business impact or outcomes
5. Connections to other parts of the business

AVOID:
- Going deeper into implementation details already mentioned
- Academic or theoretical questions
- Overly narrow technical specifics
- Anything that feels like interrogation

Examples of GOOD questions (breadth):
- "Who else needs to be involved in this process?"
- "What's the timeline for this?"
- "How does this connect to [related topic]?"

Examples of BAD questions (too deep):
- "What's the specific methodology used for X?"
- "Can you elaborate on that detail?"
- "What are the underlying reasons for that approach?"

Return ONLY the question text, nothing else.`
    },
    {
      role: 'user',
      content: `Generate follow-up question`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 150,
      temperature: 0.5
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Follow-up question generation error:', error);
    return null;
  }
}

/**
 * Start a facilitated discussion on a topic
 * Returns an opening message with the first discussion question
 */
export async function startDiscussion(topic, knowledgeContext = null) {
  let contextInfo = '';
  if (knowledgeContext && knowledgeContext.facts?.length > 0) {
    contextInfo = '\n\nRELEVANT KNOWLEDGE:\n' + knowledgeContext.facts.map(f => `- ${f.content}`).join('\n');
  }

  const messages = [
    {
      role: 'system',
      content: `You are Raven, facilitating a team discussion on a topic.

Your role is to:
1. Welcome the topic and briefly frame why it's worth discussing
2. Ask ONE thought-provoking opening question to get the discussion started
3. The question should be open-ended but focused, encouraging diverse perspectives

Keep your response concise:
- Brief intro (1-2 sentences max)
- One clear opening question

${contextInfo ? `Use this context if relevant:${contextInfo}` : ''}

Be warm and engaging, but get to the question quickly.
End with the question, don't add extra commentary.`
    },
    {
      role: 'user',
      content: `Start a discussion about: ${topic}`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 300,
      temperature: 0.7
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Discussion start error:', error);
    throw new Error('Failed to start discussion');
  }
}

/**
 * Continue a discussion with a follow-up question based on responses
 */
export async function continueDiscussion(topic, conversationHistory, knowledgeContext = null) {
  // Build conversation context
  const historyText = conversationHistory.map(msg => {
    const speaker = msg.isAi ? 'Raven' : (msg.user?.displayName || 'Team member');
    return `${speaker}: ${msg.content}`;
  }).join('\n\n');

  let contextInfo = '';
  if (knowledgeContext && knowledgeContext.facts?.length > 0) {
    contextInfo = '\n\nRELEVANT KNOWLEDGE:\n' + knowledgeContext.facts.map(f => `- ${f.content}`).join('\n');
  }

  const messages = [
    {
      role: 'system',
      content: `You are Raven, facilitating a team discussion on: "${topic}"

Your role:
1. Briefly acknowledge the latest response(s) from team members
2. Build on what was said with a natural follow-up question
3. The question should deepen the discussion or explore a new angle

Keep your response concise:
- Very brief acknowledgment (1 sentence)
- One focused follow-up question

Don't repeat points already made. Push the discussion forward.
${contextInfo ? `\nContext if relevant:${contextInfo}` : ''}`
    },
    {
      role: 'user',
      content: `Discussion so far:\n\n${historyText}\n\nContinue the discussion with a follow-up question.`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 250,
      temperature: 0.7
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Discussion continue error:', error);
    throw new Error('Failed to continue discussion');
  }
}

/**
 * Summarize and conclude a discussion
 */
export async function concludeDiscussion(topic, conversationHistory) {
  const historyText = conversationHistory.map(msg => {
    const speaker = msg.isAi ? 'Raven' : (msg.user?.displayName || 'Team member');
    return `${speaker}: ${msg.content}`;
  }).join('\n\n');

  const messages = [
    {
      role: 'system',
      content: `You are Raven, wrapping up a team discussion on: "${topic}"

Provide a brief summary that:
1. Thanks the team for the discussion
2. Highlights 2-3 key points or insights that emerged
3. Notes any decisions made or action items mentioned
4. Asks if there's anything that should be remembered for the knowledge base

Keep it concise but comprehensive. Use bullet points for key takeaways.`
    },
    {
      role: 'user',
      content: `Discussion to summarize:\n\n${historyText}`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 400,
      temperature: 0.5
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Discussion conclude error:', error);
    throw new Error('Failed to conclude discussion');
  }
}

/**
 * Generate a replacement question when a question is rejected
 * Avoids the rejected direction and explores different angles
 */
export async function generateReplacementQuestion(rejectedQuestion, reason, previouslyRejected = [], context = null) {
  const rejectedList = previouslyRejected.length > 0
    ? `\n\nPREVIOUSLY REJECTED QUESTIONS (AVOID SIMILAR PATTERNS):\n${previouslyRejected.map(q => `- ${q}`).join('\n')}`
    : '';

  const messages = [
    {
      role: 'system',
      content: `Generate a REPLACEMENT question after the previous one was rejected.
${context ? `\nCONTEXT: Learning about "${context.title}"${context.description ? ` - ${context.description}` : ''}` : ''}

REJECTED QUESTION: ${rejectedQuestion}
${reason ? `REASON FOR REJECTION: ${reason}` : 'The user found this question too deep, off-topic, or irrelevant.'}
${rejectedList}

Generate a NEW question that:
1. Explores a DIFFERENT angle or aspect of the topic
2. Stays at a more practical, high-level focus (avoid going too deep)
3. Is relevant to day-to-day business operations
4. Does NOT repeat or closely resemble any rejected questions
5. Can be answered in 1-3 sentences

AVOID:
- Diving deeper into the same subtopic
- Asking about granular implementation details
- Questions that feel like academic research
- Tangents that stray from the main topic

Return ONLY the question text, nothing else.`
    },
    {
      role: 'user',
      content: `Generate a replacement question`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 150,
      temperature: 0.7
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Replacement question generation error:', error);
    return null;
  }
}

/**
 * Evaluate if Raven should proactively respond during an active discussion
 * Returns decision about whether to respond and what to say
 */
export async function evaluateDiscussionResponse(topic, conversationHistory, knowledgeContext = null) {
  // Safety check: Don't respond if Raven was the last speaker
  if (conversationHistory.length > 0) {
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    if (lastMessage.isAi) {
      return {
        shouldRespond: false,
        reason: 'Raven was the last speaker - waiting for human input'
      };
    }
  }

  // If conversation is too short, don't interrupt
  if (conversationHistory.length < 2) {
    return {
      shouldRespond: false,
      reason: 'Conversation too short'
    };
  }

  // Build conversation context
  const historyText = conversationHistory.slice(-10).map(msg => {
    const speaker = msg.isAi ? 'Raven' : (msg.user?.displayName || 'Team member');
    return `[${msg.id?.substring(0, 8) || 'msg'}] ${speaker}: ${msg.content}`;
  }).join('\n\n');

  let contextInfo = '';
  if (knowledgeContext && knowledgeContext.facts?.length > 0) {
    contextInfo = '\n\nRELEVANT KNOWLEDGE:\n' + knowledgeContext.facts.map(f => `- ${f.content}`).join('\n');
  }

  const messages = [
    {
      role: 'system',
      content: `You are Raven, facilitating a team discussion on: "${topic}"

Your role is to help guide the discussion, but NOT to dominate it. Evaluate if you should speak now.

CONVERSATION SO FAR:
${historyText}
${contextInfo}

DECIDE if you should respond NOW. Return JSON:
{
  "shouldRespond": true/false,
  "reason": "Brief explanation",
  "responseType": "critical" | "clarify" | "redirect" | "summarize" | "silent",
  "replyToMessageId": "message ID to reply to (if specific message triggered this)",
  "response": "Your response if shouldRespond is true"
}

WHEN TO RESPOND (responseType):
- "critical": Someone said something factually wrong that needs gentle correction
- "clarify": A point needs clarification to keep discussion productive
- "redirect": Discussion went off-topic, gently bring it back
- "summarize": Multiple good points made, worth synthesizing
- "silent": Let humans continue their productive exchange

WHEN TO STAY SILENT:
- Humans are having productive back-and-forth
- Recent messages are building on each other naturally
- No factual errors or misunderstandings
- Discussion is flowing well on topic
- You just spoke recently (let others contribute)

BE CONSERVATIVE - lean toward silence. Only speak when you add real value.
If shouldRespond is false, response field can be empty.

Return ONLY valid JSON.`
    },
    {
      role: 'user',
      content: 'Evaluate if you should respond now.'
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 500,
      temperature: 0.3
    });

    let content = response.choices[0].message.content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1].trim();
    }

    const result = JSON.parse(content);
    console.log(`Discussion eval for "${topic}": ${result.shouldRespond ? result.responseType : 'silent'} - ${result.reason}`);
    return result;
  } catch (error) {
    console.error('Discussion response evaluation error:', error);
    return {
      shouldRespond: false,
      reason: 'Error in evaluation'
    };
  }
}

/**
 * Extract calendar event details from user's command
 */
export async function extractCalendarEvent(content) {
  const now = new Date();
  const messages = [
    {
      role: 'system',
      content: `You extract calendar event details from user statements. Current date/time: ${now.toISOString()}

Return a JSON object with:
- title: Event title (concise, clear)
- description: Optional longer description
- startAt: ISO datetime string for start time (interpret relative dates like "tomorrow", "next Monday")
- endAt: ISO datetime string for end time (default to 1 hour after start if not specified)
- isAllDay: boolean, true if it's an all-day event
- location: Optional location string

Examples:
"meeting with John tomorrow at 2pm" ->
{"title": "Meeting with John", "startAt": "[tomorrow 2pm]", "endAt": "[tomorrow 3pm]", "isAllDay": false}

"product launch on March 15" ->
{"title": "Product launch", "startAt": "2025-03-15T09:00:00Z", "endAt": "2025-03-15T17:00:00Z", "isAllDay": true}

"team lunch Friday noon at Olive Garden" ->
{"title": "Team lunch", "startAt": "[friday 12pm]", "endAt": "[friday 1pm]", "isAllDay": false, "location": "Olive Garden"}

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
      max_tokens: 300,
      temperature: 0
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Calendar event extraction error:', error);
    throw new Error('Could not understand the event. Try: "@raven add event [title] on [date] at [time]"');
  }
}

/**
 * Format calendar events for Raven's response
 */
export function formatCalendarResponse(events, tasksDue, query = '') {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  let response = '';

  // Group events by day
  const eventsByDay = {};
  events.forEach(event => {
    const eventDate = new Date(event.startAt);
    const dateKey = eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!eventsByDay[dateKey]) eventsByDay[dateKey] = [];
    eventsByDay[dateKey].push(event);
  });

  // Today's events
  const todayEvents = events.filter(e => {
    const d = new Date(e.startAt);
    return d >= today && d < tomorrow;
  });

  if (todayEvents.length > 0) {
    response += '**Today:**\n';
    todayEvents.forEach(e => {
      const time = e.isAllDay ? 'All day' : new Date(e.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      response += `• ${time} - ${e.title}${e.location ? ` (${e.location})` : ''}\n`;
    });
    response += '\n';
  }

  // Upcoming events (next 7 days, excluding today)
  const upcomingEvents = events.filter(e => {
    const d = new Date(e.startAt);
    return d >= tomorrow && d < nextWeek;
  });

  if (upcomingEvents.length > 0) {
    response += '**Coming up:**\n';
    upcomingEvents.forEach(e => {
      const d = new Date(e.startAt);
      const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const time = e.isAllDay ? '' : ` at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      response += `• ${day}${time} - ${e.title}\n`;
    });
    response += '\n';
  }

  // Task due dates
  const upcomingTasks = tasksDue.filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt);
    return d >= today && d < nextWeek;
  });

  if (upcomingTasks.length > 0) {
    response += '**Tasks due:**\n';
    upcomingTasks.forEach(t => {
      const d = new Date(t.dueAt);
      const isToday = d >= today && d < tomorrow;
      const day = isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const status = t.status === 'done' ? '✓' : '○';
      response += `${status} ${day} - ${t.title}${t.project?.name ? ` [${t.project.name}]` : ''}\n`;
    });
    response += '\n';
  }

  if (!response) {
    response = 'No events or tasks scheduled for the next week.';
  }

  return response.trim();
}

/**
 * Format task due dates for Raven's response
 */
export function formatDueDatesResponse(tasks) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Filter tasks with due dates and sort by date
  const tasksWithDue = tasks
    .filter(t => t.dueAt && t.status !== 'done')
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  if (tasksWithDue.length === 0) {
    return 'No pending tasks with due dates.';
  }

  let response = '**Upcoming deadlines:**\n';

  // Overdue
  const overdue = tasksWithDue.filter(t => new Date(t.dueAt) < today);
  if (overdue.length > 0) {
    response += '\n🔴 **Overdue:**\n';
    overdue.forEach(t => {
      const d = new Date(t.dueAt);
      response += `• ${t.title} (was due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})${t.project?.name ? ` [${t.project.name}]` : ''}\n`;
    });
  }

  // Due today
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueToday = tasksWithDue.filter(t => {
    const d = new Date(t.dueAt);
    return d >= today && d < tomorrow;
  });
  if (dueToday.length > 0) {
    response += '\n🟡 **Due today:**\n';
    dueToday.forEach(t => {
      response += `• ${t.title}${t.project?.name ? ` [${t.project.name}]` : ''}\n`;
    });
  }

  // Due this week
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const dueThisWeek = tasksWithDue.filter(t => {
    const d = new Date(t.dueAt);
    return d >= tomorrow && d < nextWeek;
  });
  if (dueThisWeek.length > 0) {
    response += '\n🟢 **Due this week:**\n';
    dueThisWeek.forEach(t => {
      const d = new Date(t.dueAt);
      response += `• ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - ${t.title}${t.project?.name ? ` [${t.project.name}]` : ''}\n`;
    });
  }

  // Due later
  const dueLater = tasksWithDue.filter(t => new Date(t.dueAt) >= nextWeek).slice(0, 5);
  if (dueLater.length > 0) {
    response += '\n📅 **Coming up:**\n';
    dueLater.forEach(t => {
      const d = new Date(t.dueAt);
      response += `• ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${t.title}\n`;
    });
  }

  return response.trim();
}

export default {
  parseRavenCommand,
  generateResponse,
  extractFact,
  extractUserFact,
  extractAlert,
  extractTask,
  extractDecision,
  findFactToForget,
  extractCorrection,
  checkFactConflict,
  extractFactsFromMessage,
  callOpenAI,
  generateCompanyAnswer,
  extractAtomicFacts,
  generateEmbedding,
  semanticSearch,
  generateLearningQuestions,
  decideLearningNextStep,
  generateFollowUpQuestion,
  generateReplacementQuestion,
  startDiscussion,
  continueDiscussion,
  concludeDiscussion,
  evaluateDiscussionResponse,
  extractCalendarEvent,
  formatCalendarResponse,
  formatDueDatesResponse
};
