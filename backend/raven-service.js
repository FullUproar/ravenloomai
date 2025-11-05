import webpush from 'web-push';
import admin from 'firebase-admin';
import pool from './db.js';
import { readFileSync } from 'fs';

// VAPID keys for web push (these should be in environment variables)
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@ravenloom.ai';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

// Initialize Firebase Admin SDK for FCM (native push notifications)
let firebaseInitialized = false;
try {
  const serviceAccount = JSON.parse(
    readFileSync('./firebase-service-account.json', 'utf8')
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  firebaseInitialized = true;
  console.log('✅ Firebase Admin SDK initialized for FCM');
} catch (error) {
  console.warn('⚠️  Firebase Admin SDK not initialized (native push notifications will not work):', error.message);
}

/**
 * Privacy levels for Ravens
 * - sealed: Only show "You have a Raven from [Persona]"
 * - balanced: Show task titles but not sensitive details (default)
 * - open: Show full context including project names and outcomes
 */
export const PrivacyLevels = {
  SEALED: 'sealed',
  BALANCED: 'balanced',
  OPEN: 'open'
};

/**
 * Raven types with corresponding icons and colors
 */
export const RavenTypes = {
  CHECKIN: 'checkin',        // Purple - Accountability check-ins
  ACHIEVEMENT: 'achievement', // Gold - Wins & celebrations
  STRATEGY: 'strategy',       // Blue - Strategic questions
  ACTION: 'action',          // Green - Quick actions
  URGENT: 'urgent'           // Red - Time-sensitive (use sparingly!)
};

/**
 * Create Raven notification templates based on privacy level
 */
export function createRavenMessage(template, data, privacyLevel = PrivacyLevels.BALANCED) {
  const { personaName, taskTitle, projectName, customMessage } = data;

  // Sealed Ravens - minimal info
  if (privacyLevel === PrivacyLevels.SEALED) {
    return {
      title: `🪶 Sealed Raven from ${personaName}`,
      body: 'Tap to read your message',
      requireInteraction: false
    };
  }

  // Open Ravens - full context
  if (privacyLevel === PrivacyLevels.OPEN) {
    const templates = {
      morning_checkin: {
        title: `🪶 Raven from ${personaName}`,
        body: `Good morning! Ready to make progress on "${projectName}"?`,
        actions: [
          { action: 'open', title: '💬 Let\'s go', icon: '/icons/action-reply.png' },
          { action: 'snooze', title: '⏰ Later', icon: '/icons/action-later.png' }
        ]
      },
      task_reminder: {
        title: `🪶 Raven from ${personaName}`,
        body: `Did you finish: "${taskTitle}"?`,
        actions: [
          { action: 'quick-done', title: '✓ Done', icon: '/icons/action-check.png' },
          { action: 'skip', title: '✗ Skip', icon: '/icons/action-skip.png' },
          { action: 'open', title: '💬 Reply', icon: '/icons/action-reply.png' }
        ]
      },
      achievement: {
        title: `🪶 Raven from ${personaName}`,
        body: customMessage || 'Great progress! You\'re building real momentum.',
        actions: [
          { action: 'open', title: '🎉 Thanks!', icon: '/icons/action-celebrate.png' }
        ]
      },
      strategic_question: {
        title: `🪶 Raven from ${personaName}`,
        body: customMessage || 'I have a question about your approach...',
        actions: [
          { action: 'open', title: '💬 Reply', icon: '/icons/action-reply.png' },
          { action: 'later', title: '⏰ Later', icon: '/icons/action-later.png' }
        ]
      }
    };

    return templates[template] || templates.strategic_question;
  }

  // Balanced Ravens - default, show some context but keep it private
  const templates = {
    morning_checkin: {
      title: `🪶 Raven from ${personaName}`,
      body: 'Good morning! Ready to tackle today?',
      actions: [
        { action: 'open', title: '💬 Yes', icon: '/icons/action-reply.png' },
        { action: 'snooze', title: '⏰ Later', icon: '/icons/action-later.png' }
      ]
    },
    task_reminder: {
      title: `🪶 Raven from ${personaName}`,
      body: taskTitle ? `Did you finish: "${taskTitle}"?` : 'Quick check-in on your task',
      actions: [
        { action: 'quick-done', title: '✓ Done', icon: '/icons/action-check.png' },
        { action: 'skip', title: '✗ Skip', icon: '/icons/action-skip.png' },
        { action: 'open', title: '💬 Reply', icon: '/icons/action-reply.png' }
      ]
    },
    achievement: {
      title: `🪶 Raven from ${personaName}`,
      body: customMessage || 'Great work! Keep it up.',
      actions: [
        { action: 'open', title: '🎉 Thanks', icon: '/icons/action-celebrate.png' }
      ]
    },
    strategic_question: {
      title: `🪶 Raven from ${personaName}`,
      body: 'Quick question about your progress...',
      actions: [
        { action: 'open', title: '💬 Reply', icon: '/icons/action-reply.png' },
        { action: 'later', title: '⏰ Later', icon: '/icons/action-later.png' }
      ]
    }
  };

  return templates[template] || templates.strategic_question;
}

/**
 * Send a Raven (push notification) to a user
 */
export async function sendRaven(userId, ravenData) {
  try {
    // Get user's native push settings (FCM for Android/iOS)
    const nativeResult = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1 AND ravens_enabled = true AND fcm_token IS NOT NULL',
      [userId]
    );

    // Get user's web push subscriptions
    const webResult = await pool.query(
      'SELECT * FROM push_subscriptions WHERE user_id = $1 AND active = true',
      [userId]
    );

    if (nativeResult.rows.length === 0 && webResult.rows.length === 0) {
      console.log(`No active push subscriptions for user ${userId}`);
      return { sent: 0, failed: 0 };
    }

    const {
      template,
      type = RavenTypes.CHECKIN,
      personaName,
      taskTitle,
      projectName,
      projectId,
      customMessage,
      privacyLevel,
      requireInteraction = false
    } = ravenData;

    // Get user's privacy preference
    const userPrivacyLevel = privacyLevel ||
                            (nativeResult.rows[0]?.notification_privacy) ||
                            (webResult.rows[0]?.privacy_level) ||
                            PrivacyLevels.BALANCED;

    // Create the message based on privacy level
    const message = createRavenMessage(
      template,
      { personaName, taskTitle, projectName, customMessage },
      userPrivacyLevel
    );

    // Create unique raven ID
    const ravenId = `raven_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Log the raven
    await pool.query(
      `INSERT INTO ravens_sent (raven_id, user_id, project_id, type, template, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [ravenId, userId, projectId, type, template]
    );

    // Prepare push payload
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      type: type,
      ravenId: ravenId,
      projectId: projectId,
      privacyLevel: userPrivacyLevel,
      actions: message.actions,
      requireInteraction: requireInteraction,
      data: {
        url: projectId ? `/?project=${projectId}` : '/',
        timestamp: Date.now()
      }
    });

    // Send to all active subscriptions
    let sent = 0;
    let failed = 0;

    // Send to native apps (FCM)
    for (const nativeSub of nativeResult.rows) {
      try {
        if (!firebaseInitialized) {
          console.error('Firebase Admin SDK not initialized');
          failed++;
          continue;
        }

        const fcmMessage = {
          token: nativeSub.fcm_token,
          notification: {
            title: message.title,
            body: message.body
          },
          data: {
            type: type,
            ravenId: ravenId,
            projectId: projectId ? projectId.toString() : '',
            url: projectId ? `/?project=${projectId}` : '/',
            timestamp: Date.now().toString()
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'ravens',
              priority: 'high',
              defaultSound: true,
              defaultVibrateTimings: true
            }
          }
        };

        await admin.messaging().send(fcmMessage);
        console.log(`✅ Sent FCM notification to user ${userId}`);
        sent++;
      } catch (error) {
        console.error('Failed to send FCM notification:', error);
        failed++;
      }
    }

    // Send to web subscribers
    for (const sub of webResult.rows) {
      try {
        const subscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh_key,
            auth: sub.auth_key
          }
        };

        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (error) {
        console.error('Failed to send web push notification:', error);
        failed++;

        // If subscription is invalid, mark it as inactive
        if (error.statusCode === 410) {
          await pool.query(
            'UPDATE push_subscriptions SET active = false WHERE id = $1',
            [sub.id]
          );
        }
      }
    }

    console.log(`Raven sent: ${sent} succeeded, ${failed} failed`);
    return { sent, failed, ravenId };

  } catch (error) {
    console.error('Error sending raven:', error);
    throw error;
  }
}

/**
 * Handle Raven action responses (from service worker)
 */
export async function handleRavenAction(ravenId, action, metadata = {}) {
  try {
    // Log the action
    await pool.query(
      `UPDATE ravens_sent
       SET action_taken = $1, action_taken_at = NOW(), metadata = $2
       WHERE raven_id = $3`,
      [action, JSON.stringify(metadata), ravenId]
    );

    // Handle specific actions
    if (action === 'completed' && metadata.taskId) {
      // Mark task as completed
      await pool.query(
        'UPDATE tasks SET status = $1, completed_at = NOW() WHERE id = $2',
        ['completed', metadata.taskId]
      );
    }

    if (action === 'snoozed') {
      // Schedule a follow-up raven
      const snoozeMinutes = metadata.snoozeMinutes || 60;
      // This would trigger a scheduled job to resend the raven
      console.log(`Raven ${ravenId} snoozed for ${snoozeMinutes} minutes`);
    }

    return { success: true };
  } catch (error) {
    console.error('Error handling raven action:', error);
    throw error;
  }
}

/**
 * Get VAPID public key for frontend
 */
export function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}
