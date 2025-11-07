/**
 * PersonaPromptBuilder Service
 *
 * Builds persona-specific system prompts for LLM interactions.
 * Combines archetype templates with specialization knowledge and user customizations.
 */

import { getArchetype, getSpecialization } from '../config/archetypes.js';
import MediumTermMemory from './MediumTermMemory.js';
import ShortTermMemory from './ShortTermMemory.js';

class PersonaPromptBuilder {
  /**
   * Build complete system prompt for a persona
   *
   * @param {Object} persona - Persona object from database
   * @param {Object} project - Project object for context
   * @returns {string} - Complete system prompt
   */
  buildPrompt(persona, project) {
    const parts = [];

    // 1. Base introduction
    parts.push(this._buildBasePrompt());

    // 2. Archetype behavior template
    parts.push(this._buildArchetypePrompt(persona));

    // 3. Specialization domain knowledge
    parts.push(this._buildSpecializationPrompt(persona));

    // 4. Communication preferences
    parts.push(this._buildCommunicationPrompt(persona));

    // 5. Project context
    parts.push(this._buildProjectContext(project));

    // 6. Custom instructions
    if (persona.customInstructions) {
      parts.push(this._buildCustomInstructions(persona.customInstructions));
    }

    // 7. Closing reminder
    parts.push(this._buildClosingReminder(persona));

    return parts.filter(Boolean).join('\n\n');
  }

  /**
   * Build base system prompt
   */
  _buildBasePrompt() {
    return `You are RavenLoom AI, an active project management assistant.

TAKING ACTION:
You have the ability to directly create goals, tasks, and record metrics through function calls. Use these functions proactively when the user:
- Describes something they want to achieve → createGoal()
- Mentions something they need to do → createTask()
- Reports progress or shares numbers → recordMetric() or updateGoalProgress()
- Says a task is done/in progress/blocked → updateTaskStatus()

Be conversational and helpful. Create these items automatically rather than just suggesting them.
When you create something, confirm it naturally: "Got it! I've added that as a goal" or "Created a task for that."

WHEN TO USE FUNCTIONS:
- User says "I want to lose 10 pounds" → Call createGoal() automatically
- User says "I need to call the vendor tomorrow" → Call createTask() automatically
- User says "I weighed 185 today" → Call recordMetric() automatically
- User says "I finished that task" → Call updateTaskStatus() or use getTasks() to find which task

WHEN NOT TO USE FUNCTIONS:
- User is asking questions or having general conversation
- User is unsure or exploring options (wait for commitment)
- Information is ambiguous (ask clarifying questions first)

CRITICAL RULES ABOUT DUPLICATES:
- Before creating a new task, ALWAYS call getTasks() to check for existing similar tasks
- If a similar or duplicate task already exists, inform the user instead of creating a duplicate
- Only create a new task if it's genuinely different from existing tasks
- When in doubt about similarity, ASK the user if they want a new task or meant an existing one

CRITICAL RULES ABOUT HONESTY (EXTREMELY IMPORTANT):
- NEVER EVER say "Done!", "I've updated that", "Created", "Added", "I've set that up" unless you ACTUALLY called a function
- If you only provided information or advice, say "Here's what I found..." or "I'd recommend..." NOT "Done!"
- Be CRYSTAL CLEAR about what you actually did vs what you're suggesting

EXAMPLES OF WRONG RESPONSES:
❌ User: "What tasks are due today?" → AI: "Done! I've updated that for you."
❌ User: "What should I do first?" → AI: "Done! I've prioritized your tasks."
❌ User: "Can you organize my tasks?" → AI: "All set! Your tasks are organized."

EXAMPLES OF CORRECT RESPONSES:
✅ User: "What tasks are due today?" → AI: "Here are your tasks due today: [list]. Let me know if you'd like me to reschedule any of them."
✅ User: "What should I do first?" → AI: "Based on your priorities, I'd recommend starting with [task]. Would you like me to update the task priority?"
✅ User: "Can you organize my tasks?" → AI: "I can help organize your tasks. Would you like me to group them by due date, priority, or context?"

Only use action words like "Done!", "Created", "Updated" when you ACTUALLY called createTask(), updateTask(), or similar functions.

CURRENT LIMITATIONS (what you CANNOT do):
- You CANNOT create subtasks or child tasks - all tasks are top-level
- You CANNOT create task dependencies (start-start, finish-start, depends-on, etc.)
- You CANNOT set task prerequisites or blockers
- If users ask for these features, explain they're coming soon and suggest workarounds

Keep your tone conversational and supportive. Act like a smart assistant who gets things done.`;
  }

  /**
   * Build archetype-specific behavior prompt
   */
  _buildArchetypePrompt(persona) {
    const archetype = getArchetype(persona.archetype);
    if (!archetype) {
      throw new Error(`Unknown archetype: ${persona.archetype}`);
    }

    return archetype.systemPromptTemplate;
  }

  /**
   * Build specialization domain knowledge
   */
  _buildSpecializationPrompt(persona) {
    const specialization = getSpecialization(persona.archetype, persona.specialization);
    if (!specialization) {
      throw new Error(`Unknown specialization: ${persona.specialization} for archetype: ${persona.archetype}`);
    }

    const parts = [
      `SPECIALIZATION: ${persona.displayName}`,
      '',
      `Domain Knowledge: ${Array.isArray(persona.domainKnowledge) ? persona.domainKnowledge.join(', ') : 'General'}`,
      `Key Metrics: ${Array.isArray(persona.domainMetrics) ? persona.domainMetrics.join(', ') : 'Progress tracking'}`
    ];

    return parts.join('\n');
  }

  /**
   * Build communication preferences section
   */
  _buildCommunicationPrompt(persona) {
    const prefs = persona.communicationPreferences || {};

    const parts = ['COMMUNICATION STYLE:'];

    if (prefs.tone) {
      parts.push(`- Tone: ${prefs.tone}`);
    }

    if (prefs.verbosity) {
      parts.push(`- Verbosity: ${prefs.verbosity} (${prefs.verbosity === 'concise' ? 'keep responses brief and to-the-point' : 'provide detailed explanations'})`);
    }

    if (prefs.emoji !== undefined) {
      parts.push(`- Emoji: ${prefs.emoji ? 'Use sparingly for emphasis' : 'Do not use emoji'}`);
    }

    if (prefs.platitudes !== undefined) {
      if (!prefs.platitudes) {
        parts.push('- Platitudes: AVOID motivational platitudes like "You got this!" or "Great job!" - be direct and specific instead');
      } else {
        parts.push('- Platitudes: Allowed - you can use encouraging phrases when appropriate');
      }
    }

    return parts.length > 1 ? parts.join('\n') : '';
  }

  /**
   * Build project context
   */
  _buildProjectContext(project) {
    const parts = ['PROJECT CONTEXT:'];

    parts.push(`- Title: ${project.title}`);

    if (project.description) {
      parts.push(`- Description: ${project.description}`);
    }

    if (project.outcome) {
      parts.push(`- Goal: ${project.outcome}`);
    }

    parts.push(`- Status: ${project.status}`);

    if (project.completionType) {
      parts.push(`- Completion Type: ${project.completionType}`);
    }

    if (project.healthScore !== null && project.healthScore !== undefined) {
      parts.push(`- Health Score: ${project.healthScore}/100`);
    }

    // Habit formation context
    if (project.completionType === 'habit_formation' && project.habitStreakCurrent !== undefined) {
      parts.push(`- Current Streak: ${project.habitStreakCurrent} days (longest: ${project.habitStreakLongest || 0} days, target: ${project.habitStreakTarget || 30} days)`);
    }

    return parts.join('\n');
  }

  /**
   * Build custom instructions section
   */
  _buildCustomInstructions(instructions) {
    return `CUSTOM INSTRUCTIONS:\n${instructions}`;
  }

  /**
   * Build closing reminder
   */
  _buildClosingReminder(persona) {
    return `Remember: You are ${persona.displayName}. Stay in character and focus on your area of expertise. Be proactive but respect the user's autonomy.`;
  }

  /**
   * Build messages array for chat completion (legacy - without memory)
   *
   * @param {Object} persona - Persona object
   * @param {Object} project - Project object
   * @param {Array} conversationHistory - Previous messages
   * @param {string} userMessage - Current user message
   * @returns {Array} - Messages array for OpenAI API
   */
  buildChatMessages(persona, project, conversationHistory = [], userMessage) {
    const messages = [];

    // System prompt
    messages.push({
      role: 'system',
      content: this.buildPrompt(persona, project)
    });

    // Conversation history
    conversationHistory.forEach(msg => {
      messages.push({
        role: msg.senderType === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    });

    // Current user message
    if (userMessage) {
      messages.push({
        role: 'user',
        content: userMessage
      });
    }

    return messages;
  }

  /**
   * Build messages array with 4-tier memory system
   *
   * @param {Object} persona - Persona object
   * @param {Object} project - Project object
   * @param {Object} shortTermContext - Tier 1 memory (recent messages + summary)
   * @param {Array} mediumTermMemories - Tier 2 memory (tactical scratchpad)
   * @param {string} userMessage - Current user message
   * @param {string} longTermMemory - Tier 3 memory (episodic + semantic)
   * @returns {Array} - Messages array for OpenAI API
   */
  buildChatMessagesWithMemory(persona, project, shortTermContext, mediumTermMemories, userMessage, longTermMemory = null) {
    const messages = [];

    // System prompt
    const systemPrompt = this.buildPrompt(persona, project);
    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // Add memory context as a user message (so AI sees it as current context)
    let memoryContext = '';

    // Tier 3: Long-term memory (episodic summaries + semantic facts)
    if (longTermMemory) {
      memoryContext += longTermMemory;
    }

    // Tier 2: Medium-term memory (facts, decisions, blockers, preferences)
    if (mediumTermMemories && mediumTermMemories.length > 0) {
      memoryContext += MediumTermMemory.formatForPrompt(mediumTermMemories);
    }

    // Tier 1: Short-term memory (conversation summary + recent messages)
    if (shortTermContext) {
      memoryContext += ShortTermMemory.formatForPrompt(shortTermContext);
    }

    if (memoryContext) {
      messages.push({
        role: 'user',
        content: `[CONTEXT - This is background information to inform your responses]\n\n${memoryContext}`
      });

      messages.push({
        role: 'assistant',
        content: 'I understand the context. I\'m ready to continue our conversation.'
      });
    }

    // Current user message
    if (userMessage) {
      messages.push({
        role: 'user',
        content: userMessage
      });
    }

    return messages;
  }
}

export default PersonaPromptBuilder;
