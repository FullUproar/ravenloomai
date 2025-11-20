/**
 * Proactive Accountability GraphQL Resolvers
 *
 * Manage proactive features, check-ins, and activity tracking
 */

import ActivityTrackingService from '../../services/ActivityTrackingService.js';
import ProactiveCheckInService from '../../services/ProactiveCheckInService.js';
import db from '../../db.js';

export default {
  Query: {
    /**
     * Check if proactive features are enabled for current user
     */
    getProactiveFeaturesEnabled: async (_, { userId }) => {
      const result = await db.query(
        'SELECT proactive_features_enabled FROM users WHERE firebase_uid = $1',
        [userId]
      );

      if (!result.rows.length) {
        return false;
      }

      return result.rows[0].proactive_features_enabled || false;
    },

    /**
     * Get check-in settings for a project
     */
    getProjectCheckInSettings: async (_, { projectId }) => {
      const result = await db.query(
        `SELECT
          check_ins_enabled,
          last_activity_at,
          last_check_in_at
         FROM projects
         WHERE id = $1`,
        [projectId]
      );

      if (!result.rows.length) {
        throw new Error('Project not found');
      }

      return {
        projectId,
        checkInsEnabled: result.rows[0].check_ins_enabled || true,
        lastActivityAt: result.rows[0].last_activity_at,
        lastCheckInAt: result.rows[0].last_check_in_at
      };
    },

    /**
     * Get activity patterns for a user/project
     */
    getActivityPatterns: async (_, { userId, projectId, patternType, limit = 20 }) => {
      let query = `
        SELECT * FROM activity_patterns
        WHERE user_id = $1
      `;
      const values = [userId];
      let paramCount = 2;

      if (projectId) {
        query += ` AND project_id = $${paramCount}`;
        values.push(projectId);
        paramCount++;
      }

      if (patternType) {
        query += ` AND pattern_type = $${paramCount}`;
        values.push(patternType);
        paramCount++;
      }

      query += ` ORDER BY detected_at DESC LIMIT $${paramCount}`;
      values.push(limit);

      const result = await db.query(query, values);
      return result.rows;
    },

    /**
     * Get token usage stats for proactive check-ins
     */
    getProactiveTokenUsageStats: async () => {
      return ProactiveCheckInService.getTokenUsageStats();
    }
  },

  Mutation: {
    /**
     * Enable or disable proactive features for a user (MASTER KILL SWITCH)
     */
    setProactiveFeaturesEnabled: async (_, { userId, enabled }) => {
      const success = await ActivityTrackingService.setProactiveFeaturesEnabled(userId, enabled);

      if (!success) {
        throw new Error('Failed to update proactive features setting');
      }

      console.log(`🔧 [ProactiveFeatures] ${enabled ? 'Enabled' : 'Disabled'} for user ${userId}`);

      return {
        success: true,
        enabled,
        message: enabled
          ? 'Proactive accountability features enabled. You will receive check-ins for inactive projects.'
          : 'Proactive accountability features disabled. No automatic check-ins will be sent.'
      };
    },

    /**
     * Enable or disable check-ins for a specific project
     */
    setProjectCheckInsEnabled: async (_, { projectId, enabled }) => {
      const success = await ActivityTrackingService.setProjectCheckInsEnabled(projectId, enabled);

      if (!success) {
        throw new Error('Failed to update project check-in setting');
      }

      console.log(`🔧 [ProactiveFeatures] Check-ins ${enabled ? 'enabled' : 'disabled'} for project ${projectId}`);

      return {
        success: true,
        projectId,
        enabled,
        message: enabled
          ? 'Check-ins enabled for this project'
          : 'Check-ins disabled for this project'
      };
    },

    /**
     * Manually trigger check-in for a project (for testing)
     */
    triggerCheckIn: async (_, { projectId, userId }) => {
      try {
        // Get project and persona
        const projectResult = await db.query(
          'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
          [projectId, userId]
        );

        if (!projectResult.rows.length) {
          throw new Error('Project not found');
        }

        const project = projectResult.rows[0];

        // Get active persona
        const personaResult = await db.query(
          `SELECT * FROM personas
           WHERE project_id = $1 AND is_active = true
           LIMIT 1`,
          [projectId]
        );

        if (!personaResult.rows.length) {
          throw new Error('No active persona for project');
        }

        const persona = personaResult.rows[0];

        // Generate check-in
        let message = await ProactiveCheckInService.generateCheckInMessage(project, persona);

        if (!message) {
          message = ProactiveCheckInService.generateFallbackCheckIn(project);
        }

        // Send check-in
        const sent = await ProactiveCheckInService.sendCheckInMessage(project.id, message, persona.id);

        if (!sent) {
          throw new Error('Failed to send check-in message');
        }

        return {
          success: true,
          message: 'Check-in sent successfully',
          checkInMessage: message
        };
      } catch (error) {
        console.error('[ProactiveFeatures] Error triggering check-in:', error);
        throw error;
      }
    }
  },

  // Field resolvers for activity patterns
  ActivityPattern: {
    userId: (parent) => parent.user_id,
    projectId: (parent) => parent.project_id,
    patternType: (parent) => parent.pattern_type,
    patternData: (parent) => parent.pattern_data,
    detectedAt: (parent) => parent.detected_at,
    confidenceScore: (parent) => parent.confidence_score
  }
};
