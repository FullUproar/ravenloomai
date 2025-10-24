/**
 * MediumTermMemory - Tier 2 Memory System
 *
 * Manages tactical scratchpad of important facts, decisions, and insights.
 * Target: ~500 tokens, pruned by importance when at capacity
 */

import db from '../db.js';

class MediumTermMemory {
  constructor() {
    this.MAX_MEMORIES = 30;        // Maximum number of memories to keep
    this.MAX_TOKEN_ESTIMATE = 500; // Target token budget
  }

  /**
   * Get all active memories for a project
   */
  async getMemories(projectId) {
    const result = await db.query(
      `SELECT id, memory_type, key, value, importance, created_at, updated_at
       FROM project_memory
       WHERE project_id = $1
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       ORDER BY importance DESC, created_at DESC`,
      [projectId]
    );

    return result.rows;
  }

  /**
   * Get memories by type
   */
  async getMemoriesByType(projectId, memoryType) {
    const result = await db.query(
      `SELECT id, key, value, importance, created_at
       FROM project_memory
       WHERE project_id = $1
         AND memory_type = $2
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       ORDER BY importance DESC, created_at DESC`,
      [projectId, memoryType]
    );

    return result.rows;
  }

  /**
   * Add or update a memory
   */
  async setMemory(projectId, memoryType, key, value, importance = 5, expiresAt = null) {
    // Validate memory type
    const validTypes = ['fact', 'decision', 'blocker', 'preference', 'insight'];
    if (!validTypes.includes(memoryType)) {
      throw new Error(`Invalid memory type: ${memoryType}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate importance (1-10)
    if (importance < 1 || importance > 10) {
      throw new Error('Importance must be between 1 and 10');
    }

    // Insert or update memory
    const result = await db.query(
      `INSERT INTO project_memory (project_id, memory_type, key, value, importance, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, key)
       DO UPDATE SET
         value = EXCLUDED.value,
         importance = EXCLUDED.importance,
         memory_type = EXCLUDED.memory_type,
         expires_at = EXCLUDED.expires_at,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [projectId, memoryType, key, value, importance, expiresAt]
    );

    // Check if we need to prune
    await this.pruneIfNeeded(projectId);

    return result.rows[0];
  }

  /**
   * Remove a specific memory
   */
  async removeMemory(projectId, key) {
    await db.query(
      'DELETE FROM project_memory WHERE project_id = $1 AND key = $2',
      [projectId, key]
    );
  }

  /**
   * Update memory importance
   */
  async updateImportance(projectId, key, newImportance) {
    if (newImportance < 1 || newImportance > 10) {
      throw new Error('Importance must be between 1 and 10');
    }

    await db.query(
      `UPDATE project_memory
       SET importance = $1, updated_at = CURRENT_TIMESTAMP
       WHERE project_id = $2 AND key = $3`,
      [newImportance, projectId, key]
    );
  }

  /**
   * Prune memories when at capacity
   * Removes lowest importance memories first
   */
  async pruneIfNeeded(projectId) {
    const memories = await this.getMemories(projectId);

    // Check if we're over capacity
    if (memories.length > this.MAX_MEMORIES) {
      const toRemove = memories.length - this.MAX_MEMORIES;

      // Get IDs of lowest importance memories to remove
      const lowestImportance = memories
        .slice(-toRemove)
        .map(m => m.id);

      if (lowestImportance.length > 0) {
        await db.query(
          'DELETE FROM project_memory WHERE id = ANY($1)',
          [lowestImportance]
        );

        console.log(`Pruned ${lowestImportance.length} low-importance memories from project ${projectId}`);
      }
    }
  }

  /**
   * Format memories for LLM prompt
   */
  formatForPrompt(memories) {
    if (!memories || memories.length === 0) {
      return '';
    }

    let prompt = '## Project Memory (Important Facts & Decisions)\n\n';

    // Group by type
    const byType = {
      fact: [],
      decision: [],
      blocker: [],
      preference: [],
      insight: []
    };

    for (const memory of memories) {
      if (byType[memory.memory_type]) {
        byType[memory.memory_type].push(memory);
      }
    }

    // Format each type
    if (byType.fact.length > 0) {
      prompt += '**Facts:**\n';
      for (const m of byType.fact) {
        prompt += `- ${m.key}: ${m.value}\n`;
      }
      prompt += '\n';
    }

    if (byType.decision.length > 0) {
      prompt += '**Decisions Made:**\n';
      for (const m of byType.decision) {
        prompt += `- ${m.key}: ${m.value}\n`;
      }
      prompt += '\n';
    }

    if (byType.blocker.length > 0) {
      prompt += '**Current Blockers:**\n';
      for (const m of byType.blocker) {
        prompt += `- ${m.key}: ${m.value}\n`;
      }
      prompt += '\n';
    }

    if (byType.preference.length > 0) {
      prompt += '**User Preferences:**\n';
      for (const m of byType.preference) {
        prompt += `- ${m.key}: ${m.value}\n`;
      }
      prompt += '\n';
    }

    if (byType.insight.length > 0) {
      prompt += '**Key Insights:**\n';
      for (const m of byType.insight) {
        prompt += `- ${m.key}: ${m.value}\n`;
      }
      prompt += '\n';
    }

    return prompt;
  }

  /**
   * Estimate token count for memories
   * Rough estimate: 1 token ≈ 4 characters
   */
  estimateTokens(memories) {
    if (!memories || memories.length === 0) return 0;

    let charCount = 50; // Header overhead

    for (const memory of memories) {
      charCount += memory.key.length + memory.value.length + 10; // +10 for formatting
    }

    return Math.ceil(charCount / 4);
  }

  /**
   * Helper: Add a fact
   */
  async addFact(projectId, key, value, importance = 7) {
    return this.setMemory(projectId, 'fact', key, value, importance);
  }

  /**
   * Helper: Add a decision
   */
  async addDecision(projectId, key, value, importance = 8) {
    return this.setMemory(projectId, 'decision', key, value, importance);
  }

  /**
   * Helper: Add a blocker
   */
  async addBlocker(projectId, key, value, importance = 9) {
    return this.setMemory(projectId, 'blocker', key, value, importance);
  }

  /**
   * Helper: Add a preference
   */
  async addPreference(projectId, key, value, importance = 6) {
    return this.setMemory(projectId, 'preference', key, value, importance);
  }

  /**
   * Helper: Add an insight
   */
  async addInsight(projectId, key, value, importance = 7) {
    return this.setMemory(projectId, 'insight', key, value, importance);
  }

  /**
   * Remove a blocker (when resolved)
   */
  async resolveBlocker(projectId, key) {
    return this.removeMemory(projectId, key);
  }

  /**
   * Clean up expired memories
   */
  async cleanupExpired() {
    const result = await db.query(
      'DELETE FROM project_memory WHERE expires_at < CURRENT_TIMESTAMP'
    );

    return result.rowCount;
  }

  /**
   * Get memory statistics for a project
   */
  async getStats(projectId) {
    const result = await db.query(
      `SELECT
         COUNT(*) as total_memories,
         COUNT(*) FILTER (WHERE memory_type = 'fact') as facts,
         COUNT(*) FILTER (WHERE memory_type = 'decision') as decisions,
         COUNT(*) FILTER (WHERE memory_type = 'blocker') as blockers,
         COUNT(*) FILTER (WHERE memory_type = 'preference') as preferences,
         COUNT(*) FILTER (WHERE memory_type = 'insight') as insights,
         AVG(importance)::NUMERIC(10,2) as avg_importance
       FROM project_memory
       WHERE project_id = $1
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [projectId]
    );

    return result.rows[0];
  }
}

export default new MediumTermMemory();
