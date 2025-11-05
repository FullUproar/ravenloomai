/**
 * Raven Scheduler - Manages scheduled notifications and proactive check-ins
 *
 * This service runs in the background and:
 * 1. Processes due task notifications
 * 2. Sends proactive check-ins (with LLM reasoning)
 * 3. Celebrates achievements
 * 4. Tracks habit streaks
 */

import cron from 'node-cron';
import pool from './db.js';
import { sendRaven } from './raven-service.js';

// Track which Ravens we've already sent to avoid duplicates
const sentRavens = new Set();

/**
 * Process due task notifications
 */
async function processDueTaskNotifications() {
  try {
    console.log('🪶 Checking for due tasks...');

    // Find tasks that are due now and haven't been notified yet
    const result = await pool.query(
      `SELECT t.*, p.user_id, p.id as project_id, p.title as project_title
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.due_datetime <= NOW()
         AND t.status != 'completed'
         AND t.id NOT IN (
           SELECT task_id FROM ravens
           WHERE task_id = t.id
           AND type = 'task_reminder'
           AND status IN ('sent', 'scheduled')
         )
       ORDER BY t.due_datetime ASC
       LIMIT 10`
    );

    if (result.rows.length === 0) {
      console.log('✅ No due tasks found');
      return;
    }

    console.log(`📋 Found ${result.rows.length} due task(s)`);

    for (const task of result.rows) {
      const ravenKey = `task_${task.id}`;

      // Skip if we've already processed this in current session
      if (sentRavens.has(ravenKey)) {
        continue;
      }

      // Check if user has Ravens enabled
      const userSettings = await pool.query(
        'SELECT ravens_enabled FROM user_settings WHERE user_id = $1',
        [task.user_id]
      );

      if (userSettings.rows.length === 0 || !userSettings.rows[0].ravens_enabled) {
        console.log(`⏭️  User ${task.user_id} doesn't have Ravens enabled`);
        continue;
      }

      // Create a Raven entry in the database
      await pool.query(
        `INSERT INTO ravens (user_id, task_id, project_id, type, scheduled_for, status, payload)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
        [
          task.user_id,
          task.id,
          task.project_id,
          'task_reminder',
          'sent',
          JSON.stringify({
            task_title: task.title,
            task_description: task.description,
            project_title: task.project_title,
            due_datetime: task.due_datetime
          })
        ]
      );

      // Send the push notification
      try {
        const ravenData = {
          template: 'task_reminder',
          type: 'action',
          personaName: 'RavenLoom', // TODO: Get actual persona name from project
          taskTitle: task.title,
          projectName: task.project_title,
          projectId: task.project_id,
          requireInteraction: true
        };

        const sendResult = await sendRaven(task.user_id, ravenData);

        if (sendResult.sent > 0) {
          console.log(`✅ Sent Raven for task "${task.title}" to user ${task.user_id}`);
          sentRavens.add(ravenKey);
        } else {
          console.log(`⚠️  No active subscriptions for user ${task.user_id}`);
        }
      } catch (error) {
        console.error(`❌ Failed to send Raven for task ${task.id}:`, error);

        // Mark as failed
        await pool.query(
          `UPDATE ravens SET status = 'failed' WHERE task_id = $1 AND type = 'task_reminder'`,
          [task.id]
        );
      }
    }
  } catch (error) {
    console.error('❌ Error processing due tasks:', error);
  }
}

/**
 * Process proactive check-ins (runs less frequently)
 * This is where we can use LLM to decide:
 * - Should we check in on this project?
 * - What should the message be?
 * - Is the user making good progress?
 */
async function processProactiveCheckins() {
  try {
    console.log('🤔 Considering proactive check-ins...');

    // Find projects that:
    // 1. Haven't had activity in 24+ hours
    // 2. Have tasks that aren't completed
    // 3. Haven't received a check-in in the last 24 hours
    const result = await pool.query(
      `SELECT p.*, u.ravens_enabled
       FROM projects p
       LEFT JOIN user_settings u ON p.user_id = u.user_id
       WHERE p.status = 'active'
         AND p.last_activity_at < NOW() - INTERVAL '24 hours'
         AND EXISTS (
           SELECT 1 FROM tasks t
           WHERE t.project_id = p.id AND t.status != 'completed'
         )
         AND NOT EXISTS (
           SELECT 1 FROM ravens r
           WHERE r.project_id = p.id
           AND r.type = 'checkin'
           AND r.created_at > NOW() - INTERVAL '24 hours'
         )
         AND (u.ravens_enabled = true OR u.ravens_enabled IS NULL)
       LIMIT 5`
    );

    if (result.rows.length === 0) {
      console.log('✅ No projects need proactive check-ins');
      return;
    }

    console.log(`📊 Found ${result.rows.length} project(s) that might need check-ins`);

    // TODO: Use LLM to decide which projects actually need a check-in
    // For now, we'll just log them
    for (const project of result.rows) {
      console.log(`  → Project "${project.title}" (ID: ${project.id}) - last active: ${project.last_activity_at}`);
    }

    // Future implementation:
    // 1. Get project context (tasks, recent activity, persona)
    // 2. Ask LLM: "Should we check in on this user?"
    // 3. If yes, generate personalized message
    // 4. Send Raven with custom message
  } catch (error) {
    console.error('❌ Error processing proactive check-ins:', error);
  }
}

/**
 * Clean up old Ravens (keep database tidy)
 */
async function cleanupOldRavens() {
  try {
    // Delete sent Ravens older than 30 days
    const result = await pool.query(
      `DELETE FROM ravens_sent WHERE sent_at < NOW() - INTERVAL '30 days'`
    );

    if (result.rowCount > 0) {
      console.log(`🧹 Cleaned up ${result.rowCount} old Raven records`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up Ravens:', error);
  }
}

/**
 * Start the scheduler
 */
export function startScheduler() {
  console.log('🚀 Starting Raven Scheduler...');

  // Check for due task notifications every 30 seconds
  cron.schedule('*/30 * * * * *', () => {
    processDueTaskNotifications();
  });

  // Proactive check-ins every 6 hours (at :00 minutes)
  cron.schedule('0 */6 * * *', () => {
    processProactiveCheckins();
  });

  // Cleanup old Ravens daily at 3 AM
  cron.schedule('0 3 * * *', () => {
    cleanupOldRavens();
  });

  console.log('✅ Raven Scheduler started');
  console.log('  📋 Task notifications: Every 30 seconds');
  console.log('  💬 Proactive check-ins: Every 6 hours');
  console.log('  🧹 Cleanup: Daily at 3 AM');

  // Run an immediate check
  setTimeout(() => {
    processDueTaskNotifications();
  }, 5000); // Wait 5 seconds for database to be ready
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function stopScheduler() {
  console.log('🛑 Stopping Raven Scheduler...');
  cron.getTasks().forEach(task => task.stop());
}
