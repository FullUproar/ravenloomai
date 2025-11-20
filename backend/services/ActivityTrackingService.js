/**
 * ActivityTrackingService
 *
 * Tracks user activity patterns to enable proactive interventions.
 * Powers the proactive accountability system with motivation science.
 */

import pool from '../config/database.js';

class ActivityTrackingService {
  /**
   * Update last activity timestamp for a project
   * Call this whenever user interacts with project (messages, tasks, sessions)
   *
   * @param {number} projectId - Project ID
   * @param {string} userId - User Firebase UID
   * @returns {Promise<boolean>} - Success status
   */
  async recordActivity(projectId, userId) {
    try {
      // Check if proactive features are enabled for this user
      const userCheck = await pool.query(
        'SELECT proactive_features_enabled FROM users WHERE firebase_uid = $1',
        [userId]
      );

      if (!userCheck.rows.length || !userCheck.rows[0].proactive_features_enabled) {
        // Proactive features disabled - skip tracking
        return true;
      }

      // Update last activity timestamp
      await pool.query(
        `UPDATE projects
         SET last_activity_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [projectId, userId]
      );

      return true;
    } catch (error) {
      console.error('[ActivityTracking] Error recording activity:', error);
      return false;
    }
  }

  /**
   * Detect and record activity patterns for motivation intelligence
   *
   * @param {string} userId - User Firebase UID
   * @param {number} projectId - Project ID
   * @param {string} patternType - 'best_work_time', 'skipped_task', 'blocker_signal'
   * @param {Object} patternData - Additional pattern metadata
   * @param {number} confidence - Confidence score 0.0-1.0
   * @returns {Promise<boolean>}
   */
  async recordPattern(userId, projectId, patternType, patternData, confidence = 0.5) {
    try {
      // Check if proactive features are enabled
      const userCheck = await pool.query(
        'SELECT proactive_features_enabled FROM users WHERE firebase_uid = $1',
        [userId]
      );

      if (!userCheck.rows.length || !userCheck.rows[0].proactive_features_enabled) {
        return true;
      }

      // Record pattern
      await pool.query(
        `INSERT INTO activity_patterns (user_id, project_id, pattern_type, pattern_data, confidence_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, projectId, patternType, JSON.stringify(patternData), confidence]
      );

      return true;
    } catch (error) {
      console.error('[ActivityTracking] Error recording pattern:', error);
      return false;
    }
  }

  /**
   * Detect best work times based on session completion patterns
   * Implementation Intention: "When X happens, I will do Y"
   *
   * @param {string} userId - User Firebase UID
   * @param {number} projectId - Project ID
   */
  async detectBestWorkTimes(userId, projectId) {
    try {
      // Get successful work sessions with completion data
      const sessions = await pool.query(
        `SELECT
          started_at,
          ended_at,
          notes,
          EXTRACT(HOUR FROM started_at) as hour_of_day,
          EXTRACT(DOW FROM started_at) as day_of_week
         FROM work_sessions
         WHERE project_id = $1
           AND ended_at IS NOT NULL
           AND started_at >= NOW() - INTERVAL '30 days'
         ORDER BY started_at DESC
         LIMIT 50`,
        [projectId]
      );

      if (sessions.rows.length < 5) {
        // Not enough data yet
        return;
      }

      // Analyze patterns by hour of day
      const hourCounts = {};
      sessions.rows.forEach(session => {
        const hour = session.hour_of_day;
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });

      // Find peak hours (hours with most sessions)
      const sortedHours = Object.entries(hourCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (sortedHours.length > 0) {
        const [bestHour, sessionCount] = sortedHours[0];
        const confidence = Math.min(sessionCount / sessions.rows.length, 1.0);

        // Only record if confidence is reasonable (at least 20% of sessions at this hour)
        if (confidence >= 0.2) {
          await this.recordPattern(
            userId,
            projectId,
            'best_work_time',
            {
              hour: parseInt(bestHour),
              sessionCount,
              totalSessions: sessions.rows.length,
              message: `You tend to have your most productive work sessions around ${bestHour}:00`
            },
            confidence
          );
        }
      }
    } catch (error) {
      console.error('[ActivityTracking] Error detecting work times:', error);
    }
  }

  /**
   * Detect when user repeatedly skips or reschedules tasks
   * Signals potential blocker or motivation issue
   *
   * @param {string} userId - User Firebase UID
   * @param {number} projectId - Project ID
   * @param {number} taskId - Task that was skipped/rescheduled
   */
  async detectSkippedTask(userId, projectId, taskId) {
    try {
      // Check task history to see if this is a pattern
      const task = await pool.query(
        `SELECT title, due_date, updated_at, status
         FROM tasks
         WHERE id = $1 AND project_id = $2`,
        [taskId, projectId]
      );

      if (!task.rows.length) return;

      // For now, just record the skip event
      // Future: Analyze frequency and trigger intervention
      await this.recordPattern(
        userId,
        projectId,
        'skipped_task',
        {
          taskId,
          taskTitle: task.rows[0].title,
          dueDate: task.rows[0].due_date,
          skippedAt: new Date().toISOString()
        },
        0.6
      );
    } catch (error) {
      console.error('[ActivityTracking] Error detecting skipped task:', error);
    }
  }

  /**
   * Detect blocker signals in conversation
   * Look for frustration, confusion, or stuck patterns in messages
   *
   * @param {string} userId - User Firebase UID
   * @param {number} projectId - Project ID
   * @param {string} messageContent - User's message
   * @returns {boolean} - True if blocker detected
   */
  detectBlockerSignal(messageContent) {
    // Blocker signal keywords
    const blockerKeywords = [
      'stuck', 'blocked', 'confused', 'don\'t know', 'not sure',
      'frustrated', 'overwhelmed', 'can\'t figure out', 'no idea',
      'unclear', 'unsure', 'lost', 'struggling', 'difficult'
    ];

    const lowerMessage = messageContent.toLowerCase();
    return blockerKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Get projects that need check-ins (inactive > threshold)
   *
   * @param {string} userId - User Firebase UID
   * @param {number} hoursInactive - Hours of inactivity threshold (default 24)
   * @returns {Promise<Array>} - Projects needing check-ins
   */
  async getProjectsNeedingCheckIn(userId, hoursInactive = 24) {
    try {
      // Check if proactive features are enabled for this user
      const userCheck = await pool.query(
        'SELECT proactive_features_enabled FROM users WHERE firebase_uid = $1',
        [userId]
      );

      if (!userCheck.rows.length || !userCheck.rows[0].proactive_features_enabled) {
        return [];
      }

      // Find projects that:
      // 1. Have check-ins enabled
      // 2. Last activity > threshold
      // 3. Last check-in was null or > 24 hours ago
      // 4. Project is active
      const projects = await pool.query(
        `SELECT
          p.id,
          p.title,
          p.last_activity_at,
          p.last_check_in_at,
          p.status
         FROM projects p
         WHERE p.user_id = $1
           AND p.check_ins_enabled = true
           AND p.status = 'active'
           AND (
             p.last_activity_at IS NULL
             OR p.last_activity_at < NOW() - INTERVAL '${hoursInactive} hours'
           )
           AND (
             p.last_check_in_at IS NULL
             OR p.last_check_in_at < NOW() - INTERVAL '24 hours'
           )
         ORDER BY p.last_activity_at ASC NULLS FIRST
         LIMIT 10`,
        [userId]
      );

      return projects.rows;
    } catch (error) {
      console.error('[ActivityTracking] Error getting projects for check-in:', error);
      return [];
    }
  }

  /**
   * Mark that a check-in was sent to avoid duplicate check-ins
   *
   * @param {number} projectId - Project ID
   */
  async markCheckInSent(projectId) {
    try {
      await pool.query(
        `UPDATE projects
         SET last_check_in_at = NOW()
         WHERE id = $1`,
        [projectId]
      );
      return true;
    } catch (error) {
      console.error('[ActivityTracking] Error marking check-in sent:', error);
      return false;
    }
  }

  /**
   * Enable proactive features for a user (admin function)
   *
   * @param {string} userId - User Firebase UID
   * @param {boolean} enabled - Enable or disable
   */
  async setProactiveFeaturesEnabled(userId, enabled) {
    try {
      await pool.query(
        `UPDATE users
         SET proactive_features_enabled = $1
         WHERE firebase_uid = $2`,
        [enabled, userId]
      );
      return true;
    } catch (error) {
      console.error('[ActivityTracking] Error setting proactive features:', error);
      return false;
    }
  }

  /**
   * Enable/disable check-ins for a specific project
   *
   * @param {number} projectId - Project ID
   * @param {boolean} enabled - Enable or disable
   */
  async setProjectCheckInsEnabled(projectId, enabled) {
    try {
      await pool.query(
        `UPDATE projects
         SET check_ins_enabled = $1
         WHERE id = $2`,
        [enabled, projectId]
      );
      return true;
    } catch (error) {
      console.error('[ActivityTracking] Error setting project check-ins:', error);
      return false;
    }
  }
}

export default new ActivityTrackingService();
