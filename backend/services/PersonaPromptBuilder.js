/**
 * PersonaPromptBuilder Service
 *
 * Builds persona-specific system prompts for LLM interactions.
 * Combines archetype templates with specialization knowledge and user customizations.
 */

import { getArchetype, getSpecialization } from '../config/archetypes.js';

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

STRUCTURED ELEMENTS:
When suggesting tasks, milestones, or showing progress, use these special markers:

TASKS: [TASK: title | description | context:@home | energy:low | time:15]
- Use contexts: @home, @office, @computer, @errands, @phone, @anywhere
- Energy levels: low, medium, high
- Time in minutes

MILESTONES: [MILESTONE: title | description | date:2024-12-31]

METRICS: [METRIC: name | value | unit | change]

PROGRESS: [PROGRESS: title | current | target | unit]

These markers will be rendered as interactive cards in the UI. Use them to make suggestions actionable while keeping your conversation natural.`;
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
   * Build messages array with 3-tier memory system
   *
   * @param {Object} persona - Persona object
   * @param {Object} project - Project object
   * @param {Object} shortTermContext - Tier 1 memory (recent messages + summary)
   * @param {Array} mediumTermMemories - Tier 2 memory (tactical scratchpad)
   * @param {string} userMessage - Current user message
   * @returns {Array} - Messages array for OpenAI API
   */
  buildChatMessagesWithMemory(persona, project, shortTermContext, mediumTermMemories, userMessage) {
    const messages = [];

    // System prompt
    const systemPrompt = this.buildPrompt(persona, project);
    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // Add memory context as a user message (so AI sees it as current context)
    let memoryContext = '';

    // Tier 2: Medium-term memory (facts, decisions, blockers, preferences)
    if (mediumTermMemories && mediumTermMemories.length > 0) {
      const MediumTermMemory = require('./MediumTermMemory.js').default;
      memoryContext += MediumTermMemory.formatForPrompt(mediumTermMemories);
    }

    // Tier 1: Short-term memory (conversation summary + recent messages)
    if (shortTermContext) {
      const ShortTermMemory = require('./ShortTermMemory.js').default;
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
