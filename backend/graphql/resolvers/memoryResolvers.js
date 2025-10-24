/**
 * Memory Resolvers
 *
 * GraphQL resolvers for the 3-tier memory system
 */

import MediumTermMemory from '../../services/MediumTermMemory.js';
import ShortTermMemory from '../../services/ShortTermMemory.js';
import db from '../../db.js';

export default {
  Query: {
    /**
     * Get all memories for a project
     */
    async getProjectMemories(_, { projectId }) {
      const memories = await MediumTermMemory.getMemories(parseInt(projectId));

      return memories.map(m => ({
        id: m.id,
        projectId: m.project_id,
        memoryType: m.memory_type,
        key: m.key,
        value: m.value,
        importance: m.importance,
        expiresAt: m.expires_at,
        createdAt: m.created_at,
        updatedAt: m.updated_at
      }));
    },

    /**
     * Get memories by type
     */
    async getMemoriesByType(_, { projectId, memoryType }) {
      const memories = await MediumTermMemory.getMemoriesByType(
        parseInt(projectId),
        memoryType
      );

      return memories.map(m => ({
        id: m.id,
        projectId: parseInt(projectId),
        memoryType,
        key: m.key,
        value: m.value,
        importance: m.importance,
        expiresAt: null,
        createdAt: m.created_at,
        updatedAt: m.created_at
      }));
    },

    /**
     * Get memory statistics for a project
     */
    async getMemoryStats(_, { projectId }) {
      const stats = await MediumTermMemory.getStats(parseInt(projectId));

      return {
        totalMemories: parseInt(stats.total_memories) || 0,
        facts: parseInt(stats.facts) || 0,
        decisions: parseInt(stats.decisions) || 0,
        blockers: parseInt(stats.blockers) || 0,
        preferences: parseInt(stats.preferences) || 0,
        insights: parseInt(stats.insights) || 0,
        avgImportance: parseFloat(stats.avg_importance) || 0
      };
    },

    /**
     * Get conversation summary
     */
    async getConversationSummary(_, { conversationId }) {
      const result = await db.query(
        `SELECT id, summary, last_summary_at, message_count_at_summary
         FROM conversations
         WHERE id = $1`,
        [parseInt(conversationId)]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        conversationId: row.id,
        summary: row.summary,
        lastSummaryAt: row.last_summary_at,
        messageCountAtSummary: row.message_count_at_summary
      };
    }
  },

  Mutation: {
    /**
     * Set or update a project memory
     */
    async setProjectMemory(_, { projectId, input }) {
      const { memoryType, key, value, importance = 5, expiresAt = null } = input;

      const result = await MediumTermMemory.setMemory(
        parseInt(projectId),
        memoryType,
        key,
        value,
        importance,
        expiresAt
      );

      // Fetch the full memory record
      const memories = await MediumTermMemory.getMemories(parseInt(projectId));
      const memory = memories.find(m => m.id === result.id);

      return {
        id: memory.id,
        projectId: memory.project_id,
        memoryType: memory.memory_type,
        key: memory.key,
        value: memory.value,
        importance: memory.importance,
        expiresAt: memory.expires_at,
        createdAt: memory.created_at,
        updatedAt: memory.updated_at
      };
    },

    /**
     * Remove a project memory
     */
    async removeProjectMemory(_, { projectId, key }) {
      await MediumTermMemory.removeMemory(parseInt(projectId), key);
      return true;
    },

    /**
     * Update memory importance
     */
    async updateMemoryImportance(_, { projectId, key, importance }) {
      await MediumTermMemory.updateImportance(parseInt(projectId), key, importance);

      // Fetch the updated memory
      const memories = await MediumTermMemory.getMemories(parseInt(projectId));
      const memory = memories.find(m => m.key === key);

      if (!memory) {
        throw new Error(`Memory with key "${key}" not found`);
      }

      return {
        id: memory.id,
        projectId: memory.project_id,
        memoryType: memory.memory_type,
        key: memory.key,
        value: memory.value,
        importance: memory.importance,
        expiresAt: memory.expires_at,
        createdAt: memory.created_at,
        updatedAt: memory.updated_at
      };
    },

    /**
     * Manually trigger conversation summary creation
     */
    async createConversationSummary(_, { conversationId }) {
      const summary = await ShortTermMemory.createSummary(parseInt(conversationId));

      const result = await db.query(
        `SELECT id, summary, last_summary_at, message_count_at_summary
         FROM conversations
         WHERE id = $1`,
        [parseInt(conversationId)]
      );

      const row = result.rows[0];
      return {
        conversationId: row.id,
        summary: row.summary,
        lastSummaryAt: row.last_summary_at,
        messageCountAtSummary: row.message_count_at_summary
      };
    }
  }
};
