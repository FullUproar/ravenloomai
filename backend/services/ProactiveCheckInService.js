/**
 * ProactiveCheckInService
 *
 * Generates AI-powered check-in messages for inactive projects.
 * Respects token budgets and kill switches to prevent runaway costs.
 */

import db from '../db.js';
import openai from '../config/openai.js';
import ActivityTrackingService from './ActivityTrackingService.js';
import PersonaPromptBuilder from './PersonaPromptBuilder.js';

class ProactiveCheckInService {
  constructor() {
    // Token budget limits per day
    this.DAILY_TOKEN_BUDGET = parseInt(process.env.DAILY_CHECKIN_TOKEN_BUDGET || '10000');
    this.MAX_CHECKINS_PER_RUN = parseInt(process.env.MAX_CHECKINS_PER_RUN || '20');
    this.todayTokenUsage = 0;
    this.lastResetDate = new Date().toDateString();
  }

  /**
   * Reset token usage counter if it's a new day
   */
  _resetTokenBudgetIfNeeded() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      console.log('[ProactiveCheckIn] New day - resetting token budget');
      this.todayTokenUsage = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * Check if we have budget for more check-ins
   */
  _hasTokenBudget(estimatedTokens = 500) {
    this._resetTokenBudgetIfNeeded();
    return this.todayTokenUsage + estimatedTokens <= this.DAILY_TOKEN_BUDGET;
  }

  /**
   * Record token usage
   */
  _recordTokenUsage(tokens) {
    this.todayTokenUsage += tokens;
    console.log(`[ProactiveCheckIn] Token usage: ${this.todayTokenUsage}/${this.DAILY_TOKEN_BUDGET}`);
  }

  /**
   * Generate check-in message using AI
   *
   * @param {Object} project - Project object
   * @param {Object} persona - Persona object
   * @param {Array} recentActivity - Recent activity summary
   * @returns {Promise<string>} - Check-in message
   */
  async generateCheckInMessage(project, persona, recentActivity = []) {
    try {
      // Check token budget
      if (!this._hasTokenBudget(500)) {
        console.log('[ProactiveCheckIn] Token budget exhausted for today');
        return null;
      }

      // Calculate inactivity duration
      const lastActivity = project.last_activity_at
        ? new Date(project.last_activity_at)
        : new Date(project.created_at);
      const hoursSinceActivity = Math.floor((Date.now() - lastActivity) / (1000 * 60 * 60));
      const daysSinceActivity = Math.floor(hoursSinceActivity / 24);

      // Build context for AI
      const promptBuilder = new PersonaPromptBuilder();
      const systemPrompt = promptBuilder.buildPrompt(persona, project);

      // Create check-in generation prompt
      const userPrompt = `Generate a proactive check-in message for the user about their project.

PROJECT: ${project.title}
LAST ACTIVITY: ${daysSinceActivity} day${daysSinceActivity !== 1 ? 's' : ''} ago
PROJECT STATUS: ${project.status}

GUIDELINES FOR CHECK-IN:
1. Keep it brief and friendly (2-3 sentences max)
2. Acknowledge the time gap without judgment or shame
3. Ask an open-ended question about the project (not just "want to work on it?")
4. Show genuine curiosity about their situation
5. Make it easy for them to respond

TONE: Warm, supportive accountability partner (not pushy or guilt-tripping)

EXAMPLES OF GOOD CHECK-INS:
- "Hey! Haven't seen you working on ${project.title} in a couple days. Everything going okay with it?"
- "Just checking in on ${project.title}. Has anything shifted with your priorities, or are you still planning to move forward?"
- "It's been a few days since we worked on ${project.title}. What's on your mind about it?"

EXAMPLES OF BAD CHECK-INS (don't do this):
- "You should work on your project!" (too pushy)
- "It's been 3 days. Ready to start?" (guilt-tripping)
- "Want to work on it now?" (closed question, not curious)

Generate ONLY the check-in message, nothing else:`;

      // Call OpenAI API
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Use mini for cost efficiency
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 150
      });

      const message = response.choices[0].message.content.trim();

      // Record token usage
      this._recordTokenUsage(response.usage.total_tokens);

      console.log(`[ProactiveCheckIn] Generated check-in for project ${project.id}: "${message}"`);

      return message;
    } catch (error) {
      console.error('[ProactiveCheckIn] Error generating check-in message:', error);
      return null;
    }
  }

  /**
   * Create a check-in message in the conversation
   *
   * @param {number} projectId - Project ID
   * @param {string} message - Check-in message content
   * @param {number} personaId - Persona ID
   * @returns {Promise<boolean>}
   */
  async sendCheckInMessage(projectId, message, personaId) {
    try {
      // Insert check-in message as system message
      await db.query(
        `INSERT INTO messages (project_id, persona_id, content, sender_type, created_at)
         VALUES ($1, $2, $3, 'assistant', NOW())`,
        [projectId, personaId, message]
      );

      // Mark check-in sent
      await ActivityTrackingService.markCheckInSent(projectId);

      console.log(`[ProactiveCheckIn] Sent check-in to project ${projectId}`);
      return true;
    } catch (error) {
      console.error('[ProactiveCheckIn] Error sending check-in message:', error);
      return false;
    }
  }

  /**
   * Generate fallback check-in (no AI, just template)
   * Used when token budget is exhausted or AI fails
   *
   * @param {Object} project - Project object
   * @returns {string}
   */
  generateFallbackCheckIn(project) {
    const templates = [
      `Hey! Just checking in on ${project.title}. How's it going?`,
      `Haven't seen you working on ${project.title} lately. Everything okay?`,
      `Thinking about ${project.title}. What's your current status with it?`,
      `Just wanted to check in about ${project.title}. Still on your radar?`
    ];

    // Pick random template
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * Process check-ins for all users (called by cron job)
   *
   * @returns {Promise<Object>} - Summary of check-ins sent
   */
  async processCheckIns() {
    const startTime = Date.now();
    console.log('\n[ProactiveCheckIn] ========================================');
    console.log('[ProactiveCheckIn] Starting proactive check-in process');
    console.log('[ProactiveCheckIn] ========================================\n');

    try {
      // Reset token budget if needed
      this._resetTokenBudgetIfNeeded();

      // Get all users with proactive features enabled
      const usersResult = await db.query(
        `SELECT firebase_uid, email
         FROM users
         WHERE proactive_features_enabled = true`
      );

      const users = usersResult.rows;
      console.log(`[ProactiveCheckIn] Found ${users.length} users with proactive features enabled`);

      let totalCheckInsSent = 0;
      let totalTokensUsed = this.todayTokenUsage;
      const results = [];

      // Process each user
      for (const user of users) {
        if (totalCheckInsSent >= this.MAX_CHECKINS_PER_RUN) {
          console.log(`[ProactiveCheckIn] Reached max check-ins per run (${this.MAX_CHECKINS_PER_RUN})`);
          break;
        }

        console.log(`\n[ProactiveCheckIn] Processing user: ${user.email}`);

        // Get projects needing check-ins
        const projects = await ActivityTrackingService.getProjectsNeedingCheckIn(user.firebase_uid, 24);

        if (projects.length === 0) {
          console.log('[ProactiveCheckIn] No projects need check-ins');
          continue;
        }

        console.log(`[ProactiveCheckIn] Found ${projects.length} project(s) needing check-ins`);

        // Process each project
        for (const project of projects) {
          if (totalCheckInsSent >= this.MAX_CHECKINS_PER_RUN) {
            break;
          }

          // Get project's active persona
          const personaResult = await db.query(
            `SELECT p.*
             FROM personas p
             WHERE p.project_id = $1 AND p.is_active = true
             LIMIT 1`,
            [project.id]
          );

          if (!personaResult.rows.length) {
            console.log(`[ProactiveCheckIn] No active persona for project ${project.id}, skipping`);
            continue;
          }

          const persona = personaResult.rows[0];

          // Generate check-in message
          let message;
          if (this._hasTokenBudget(500)) {
            message = await this.generateCheckInMessage(project, persona);
          }

          // Fallback to template if AI fails or budget exhausted
          if (!message) {
            console.log('[ProactiveCheckIn] Using fallback template');
            message = this.generateFallbackCheckIn(project);
          }

          // Send check-in
          const sent = await this.sendCheckInMessage(project.id, message, persona.id);

          if (sent) {
            totalCheckInsSent++;
            results.push({
              projectId: project.id,
              projectTitle: project.title,
              message,
              userEmail: user.email
            });
          }
        }
      }

      const duration = Date.now() - startTime;
      const summary = {
        success: true,
        checkInsSent: totalCheckInsSent,
        tokensUsed: this.todayTokenUsage - totalTokensUsed,
        totalTokensToday: this.todayTokenUsage,
        tokenBudget: this.DAILY_TOKEN_BUDGET,
        durationMs: duration,
        results
      };

      console.log('\n[ProactiveCheckIn] ========================================');
      console.log('[ProactiveCheckIn] Check-in process complete');
      console.log(`[ProactiveCheckIn] Sent: ${totalCheckInsSent} check-ins`);
      console.log(`[ProactiveCheckIn] Tokens: ${this.todayTokenUsage}/${this.DAILY_TOKEN_BUDGET}`);
      console.log(`[ProactiveCheckIn] Duration: ${duration}ms`);
      console.log('[ProactiveCheckIn] ========================================\n');

      return summary;
    } catch (error) {
      console.error('[ProactiveCheckIn] Error processing check-ins:', error);
      return {
        success: false,
        error: error.message,
        checkInsSent: 0
      };
    }
  }

  /**
   * Get current token usage stats
   */
  getTokenUsageStats() {
    this._resetTokenBudgetIfNeeded();
    return {
      used: this.todayTokenUsage,
      budget: this.DAILY_TOKEN_BUDGET,
      remaining: this.DAILY_TOKEN_BUDGET - this.todayTokenUsage,
      percentage: Math.round((this.todayTokenUsage / this.DAILY_TOKEN_BUDGET) * 100),
      lastReset: this.lastResetDate
    };
  }
}

export default new ProactiveCheckInService();
