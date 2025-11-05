/**
 * Onboarding Service
 *
 * Manages conversational onboarding flows with prerequisite tracking.
 * Handles adaptive questioning based on what information has been provided.
 */

import db from '../db.js';
import { getOnboardingFlow } from '../config/onboardingFlows.js';
import { generateChatCompletionWithFunctions } from '../utils/llm.js';

class OnboardingService {
  /**
   * Start a new onboarding flow
   *
   * @param {string} userId - User ID
   * @param {string} flowId - Flow type (project, goal, task)
   * @param {number} projectId - Optional project ID (required for goal/task flows)
   * @param {Object} initialData - Any data already provided by user
   * @returns {Promise<Object>} - Onboarding session
   */
  async startOnboarding(userId, flowId, projectId = null, initialData = {}) {
    const flow = getOnboardingFlow(flowId);
    if (!flow) {
      throw new Error(`Unknown onboarding flow: ${flowId}`);
    }

    // Check if parent is required
    if (flow.requiresParent && !projectId) {
      throw new Error(`${flowId} onboarding requires a project`);
    }

    // Extract any data from initialData that matches flow fields
    const collectedData = this._extractFieldsFromData(flow, initialData);

    // Create onboarding session
    const query = `
      INSERT INTO onboarding_sessions (
        user_id, project_id, flow_id, status, collected_data, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const result = await db.query(query, [
      userId,
      projectId,
      flowId,
      'in_progress',
      JSON.stringify(collectedData)
    ]);

    const session = result.rows[0];

    console.log(`🎯 [Onboarding] Started ${flowId} session ${session.id} for user ${userId}`);

    return {
      sessionId: session.id,
      flowId,
      collectedData,
      nextQuestion: await this._getNextQuestion(flow, collectedData, userId, projectId)
    };
  }

  /**
   * Process user response and advance onboarding
   *
   * @param {number} sessionId - Onboarding session ID
   * @param {string} userMessage - User's response
   * @param {Object} context - Additional context (persona, etc.)
   * @returns {Promise<Object>} - Next step in onboarding
   */
  async processResponse(sessionId, userMessage, context = {}) {
    // Get session
    const session = await this._getSession(sessionId);
    if (!session) {
      throw new Error('Onboarding session not found');
    }

    const flow = getOnboardingFlow(session.flow_id);
    const collectedData = JSON.parse(session.collected_data);

    // Use AI to extract information from user message
    const extractedData = await this._extractDataFromMessage(
      userMessage,
      flow,
      collectedData,
      context
    );

    // Merge extracted data
    const updatedData = { ...collectedData, ...extractedData };

    // Check if onboarding is complete
    const isComplete = this._isOnboardingComplete(flow, updatedData);

    if (isComplete) {
      return await this._completeOnboarding(session, flow, updatedData, context);
    }

    // Update session and get next question
    await this._updateSession(sessionId, updatedData);

    const nextQuestion = await this._getNextQuestion(
      flow,
      updatedData,
      session.user_id,
      session.project_id,
      context
    );

    return {
      sessionId,
      complete: false,
      collectedData: updatedData,
      nextQuestion,
      progress: this._calculateProgress(flow, updatedData)
    };
  }

  /**
   * Get next question to ask based on prerequisites
   *
   * @private
   */
  async _getNextQuestion(flow, collectedData, userId, projectId, context = {}) {
    // Find first field that:
    // 1. Is not yet collected
    // 2. Has all dependencies satisfied
    // 3. Meets showIf conditions

    for (const field of flow.fields) {
      // Skip if already collected
      if (collectedData[field.key] !== undefined) {
        continue;
      }

      // Skip if not required and no dependencies
      if (!field.required && !field.dependsOn) {
        continue;
      }

      // Check dependencies
      if (field.dependsOn) {
        const dependenciesMet = field.dependsOn.every(dep => collectedData[dep] !== undefined);
        if (!dependenciesMet) {
          continue;
        }
      }

      // Check showIf conditions
      if (field.showIf) {
        const conditionsMet = Object.entries(field.showIf).every(
          ([key, value]) => collectedData[key] === value
        );
        if (!conditionsMet) {
          continue;
        }
      }

      // This is the next field to ask about
      return await this._buildQuestion(field, flow, collectedData, context);
    }

    // No more questions - check if we have all required fields
    const missingRequired = flow.fields
      .filter(f => f.required && collectedData[f.key] === undefined)
      .map(f => f.key);

    if (missingRequired.length > 0) {
      // Still missing required fields that have unmet dependencies
      return {
        type: 'waiting',
        message: 'I need a bit more information to continue. Could you tell me more?',
        waitingFor: missingRequired
      };
    }

    // All required fields collected
    return null;
  }

  /**
   * Build a question for a specific field
   *
   * @private
   */
  async _buildQuestion(field, flow, collectedData, context = {}) {
    let prompt = field.prompt;

    // Apply persona adaptations
    if (context.persona && flow.personaAdaptations) {
      const archetype = context.persona.archetype;
      const adaptations = flow.personaAdaptations[archetype];

      if (adaptations && adaptations.promptModifiers && adaptations.promptModifiers[field.key]) {
        prompt = adaptations.promptModifiers[field.key];
      }
    }

    const question = {
      field: field.key,
      label: field.label,
      type: field.type,
      prompt,
      required: field.required
    };

    // Add options for enum fields
    if (field.type === 'enum' && field.options) {
      question.options = field.options;
    }

    // Add examples if available
    if (field.examples) {
      question.examples = field.examples;
    }

    // For reference fields, load existing items
    if (field.type === 'reference' && field.showExisting) {
      question.existingItems = await this._getExistingItems(field.referenceType, collectedData.projectId);
    }

    // Add context from collected data
    question.context = this._buildQuestionContext(collectedData, field);

    return question;
  }

  /**
   * Extract data from user message using AI
   *
   * @private
   */
  async _extractDataFromMessage(userMessage, flow, collectedData, context) {
    // Build prompt for AI to extract structured data
    const systemPrompt = `You are helping extract information from a user's message for onboarding.

Flow: ${flow.name}
Current data: ${JSON.stringify(collectedData, null, 2)}

Extract any relevant information that matches these fields:
${flow.fields.map(f => `- ${f.key} (${f.type}): ${f.label}`).join('\n')}

Return a JSON object with extracted fields. Only include fields that you can confidently extract from the message.
If a field can be inferred from context (e.g., "lose 10 pounds" -> targetValue: 10, unit: "pounds"), include it.

User message: "${userMessage}"`;

    try {
      const response = await generateChatCompletionWithFunctions(
        [{ role: 'system', content: systemPrompt }],
        [],
        { model: 'gpt-4', temperature: 0.3, response_format: { type: 'json_object' } }
      );

      const extracted = JSON.parse(response.content);
      console.log(`🎯 [Onboarding] Extracted data:`, extracted);

      return extracted;
    } catch (error) {
      console.error('Error extracting data from message:', error);
      return {};
    }
  }

  /**
   * Check if onboarding is complete
   *
   * @private
   */
  _isOnboardingComplete(flow, collectedData) {
    // Check if all required fields are collected
    const requiredFields = flow.fields.filter(f => f.required);

    for (const field of requiredFields) {
      // Skip if showIf condition not met
      if (field.showIf) {
        const conditionsMet = Object.entries(field.showIf).every(
          ([key, value]) => collectedData[key] === value
        );
        if (!conditionsMet) {
          continue;
        }
      }

      if (collectedData[field.key] === undefined) {
        return false;
      }
    }

    return true;
  }

  /**
   * Complete onboarding and execute completion actions
   *
   * @private
   */
  async _completeOnboarding(session, flow, collectedData, context) {
    console.log(`✅ [Onboarding] Completing ${flow.id} session ${session.id}`);

    // Execute completion actions
    const results = {};

    for (const action of flow.completionActions) {
      try {
        results[action] = await this._executeCompletionAction(
          action,
          collectedData,
          session,
          context
        );
      } catch (error) {
        console.error(`Error executing ${action}:`, error);
        results[action] = { error: error.message };
      }
    }

    // Mark session as complete
    await db.query(
      'UPDATE onboarding_sessions SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['completed', session.id]
    );

    return {
      sessionId: session.id,
      complete: true,
      flowId: flow.id,
      collectedData,
      results,
      message: this._buildCompletionMessage(flow, collectedData, results)
    };
  }

  /**
   * Execute a completion action
   *
   * @private
   */
  async _executeCompletionAction(action, data, session, context) {
    switch (action) {
      case 'createProject':
        return await this._createProject(data, session.user_id);

      case 'createPersona':
        return await this._createPersona(data, session.user_id, context);

      case 'createGoal':
        return await this._createGoal(data, session.project_id);

      case 'createTask':
        return await this._createTask(data, session.project_id);

      case 'suggestInitialGoals':
        return await this._suggestInitialGoals(data, context);

      case 'askAboutTasks':
        return { message: 'Want to break this down into tasks?' };

      case 'suggestMetrics':
        return await this._suggestMetrics(data);

      case 'suggestRelatedTasks':
        return await this._suggestRelatedTasks(data);

      default:
        console.warn(`Unknown completion action: ${action}`);
        return null;
    }
  }

  /**
   * Create project from onboarding data
   *
   * @private
   */
  async _createProject(data, userId) {
    const query = `
      INSERT INTO projects (
        user_id, title, description, outcome, completion_type, status
      ) VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING *
    `;

    const result = await db.query(query, [
      userId,
      data.title,
      data.description || null,
      data.outcome,
      data.completionType || 'milestone'
    ]);

    console.log(`✅ Created project: ${data.title}`);
    return result.rows[0];
  }

  /**
   * Create persona for project
   *
   * @private
   */
  async _createPersona(data, userId, context) {
    // This would integrate with PersonaService
    // For now, return placeholder
    return {
      archetype: data.personaArchetype,
      specialization: data.personaSpecialization
    };
  }

  /**
   * Create goal from onboarding data
   *
   * @private
   */
  async _createGoal(data, projectId) {
    const query = `
      INSERT INTO goals (
        project_id, title, description, target_value, current_value, unit, priority, status, target_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
      RETURNING *
    `;

    const result = await db.query(query, [
      projectId,
      data.title,
      data.description || null,
      data.targetValue || null,
      data.currentValue || 0,
      data.unit || null,
      data.priority || 2,
      data.targetDate || null
    ]);

    console.log(`✅ Created goal: ${data.title}`);
    return result.rows[0];
  }

  /**
   * Create task from onboarding data
   *
   * @private
   */
  async _createTask(data, projectId) {
    const query = `
      INSERT INTO tasks (
        project_id, goal_id, title, description, type, status, priority,
        due_datetime, gtd_type, context, energy_level, time_estimate, assigned_to
      ) VALUES ($1, $2, $3, $4, 'manual', 'not_started', $5, $6, 'next_action', $7, $8, $9, 'user')
      RETURNING *
    `;

    const result = await db.query(query, [
      projectId,
      data.goalId || null,
      data.title,
      data.description || null,
      data.priority || 2,
      data.dueDate || null,
      data.context || '@anywhere',
      data.energyLevel || 'medium',
      data.timeEstimate || null
    ]);

    console.log(`✅ Created task: ${data.title}`);
    return result.rows[0];
  }

  /**
   * Helper methods
   */

  _extractFieldsFromData(flow, data) {
    const extracted = {};
    const fieldKeys = flow.fields.map(f => f.key);

    for (const [key, value] of Object.entries(data)) {
      if (fieldKeys.includes(key)) {
        extracted[key] = value;
      }
    }

    return extracted;
  }

  async _getSession(sessionId) {
    const result = await db.query('SELECT * FROM onboarding_sessions WHERE id = $1', [sessionId]);
    return result.rows[0];
  }

  async _updateSession(sessionId, collectedData) {
    await db.query(
      'UPDATE onboarding_sessions SET collected_data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(collectedData), sessionId]
    );
  }

  _calculateProgress(flow, collectedData) {
    const requiredFields = flow.fields.filter(f => f.required).length;
    const collectedRequired = flow.fields.filter(
      f => f.required && collectedData[f.key] !== undefined
    ).length;

    return {
      current: collectedRequired,
      total: requiredFields,
      percentage: Math.round((collectedRequired / requiredFields) * 100)
    };
  }

  _buildQuestionContext(collectedData, field) {
    // Build contextual information to help answer the question
    const relevant = {};

    if (field.dependsOn) {
      field.dependsOn.forEach(dep => {
        if (collectedData[dep]) {
          relevant[dep] = collectedData[dep];
        }
      });
    }

    return relevant;
  }

  async _getExistingItems(type, projectId) {
    if (type === 'goal') {
      const result = await db.query(
        'SELECT id, title FROM goals WHERE project_id = $1 ORDER BY priority DESC',
        [projectId]
      );
      return result.rows;
    }
    return [];
  }

  async _suggestInitialGoals(data, context) {
    // Use AI to suggest initial goals based on project
    return { suggestions: [] };
  }

  async _suggestMetrics(data) {
    // Suggest metrics to track for a goal
    return { suggestions: [] };
  }

  async _suggestRelatedTasks(data) {
    // Suggest related tasks
    return { suggestions: [] };
  }

  _buildCompletionMessage(flow, data, results) {
    switch (flow.id) {
      case 'project':
        return `Perfect! I've set up your project "${data.title}". Let's start working toward your goal!`;
      case 'goal':
        return `Great! I've added "${data.title}" as a goal. Ready to break it down into tasks?`;
      case 'task':
        return `Got it! I've added "${data.title}" to your task list.`;
      default:
        return 'All set!';
    }
  }
}

export default new OnboardingService();
