/**
 * Native Ravens - Push Notification Integration for Capacitor
 * Handles both web and native push notifications seamlessly
 */

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

/**
 * Initialize Ravens (push notifications)
 * Call this when user enables notifications
 */
export async function initializeRavens(userId, apiUrl) {
  console.log('🪶 [initializeRavens] Starting...', { userId, apiUrl, isNative });

  if (!isNative) {
    // Web push notifications (existing service worker approach)
    console.log('🌐 [initializeRavens] Using web push');
    return initializeWebRavens(userId, apiUrl);
  }

  // Native push notifications (Firebase)
  console.log('📱 [initializeRavens] Using native push');
  return initializeNativeRavens(userId, apiUrl);
}

/**
 * Native push notification setup (Android/iOS via Firebase)
 */
async function initializeNativeRavens(userId, apiUrl) {
  try {
    console.log('📱 [initializeNativeRavens] Checking permissions...');

    // Request permission
    let permStatus = await PushNotifications.checkPermissions();
    console.log('📱 [initializeNativeRavens] Current permission status:', permStatus);

    if (permStatus.receive === 'prompt') {
      console.log('📱 [initializeNativeRavens] Requesting permissions...');
      permStatus = await PushNotifications.requestPermissions();
      console.log('📱 [initializeNativeRavens] Permission request result:', permStatus);
    }

    if (permStatus.receive !== 'granted') {
      throw new Error('User denied push notification permissions');
    }

    console.log('📱 [initializeNativeRavens] Registering with FCM/APNS...');

    // Register with FCM/APNS
    await PushNotifications.register();

    console.log('📱 [initializeNativeRavens] Registration call completed, waiting for token...');

    // Set up listeners
    setupNativeRavenListeners(userId, apiUrl);

    return { success: true, platform: 'native' };
  } catch (error) {
    console.error('❌ [initializeNativeRavens] Failed:', error);
    throw error;
  }
}

/**
 * Set up event listeners for native push notifications
 */
function setupNativeRavenListeners(userId, apiUrl) {
  console.log('📱 [setupNativeRavenListeners] Setting up listeners for userId:', userId, 'apiUrl:', apiUrl);

  // Successfully registered with FCM/APNS
  PushNotifications.addListener('registration', async (token) => {
    console.log('🎉 [registration] Received FCM Token:', token.value);

    // Send FCM token to backend
    try {
      console.log('📤 [registration] Sending token to backend:', `${apiUrl}/api/raven-subscribe`);

      const response = await fetch(`${apiUrl}/api/raven-subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          platform: 'native',
          fcmToken: token.value
        })
      });

      console.log('📥 [registration] Backend response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [registration] Backend error:', errorText);
        throw new Error('Failed to subscribe to Ravens');
      }

      const result = await response.json();
      console.log('✅ [registration] Subscribed to Ravens!', result);
    } catch (error) {
      console.error('❌ [registration] Failed to send FCM token to backend:', error);
    }
  });

  // Registration failed
  PushNotifications.addListener('registrationError', (error) => {
    console.error('❌ [registrationError] Raven registration error:', error);
  });

  // Raven received while app is in foreground
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('🪶 Raven received (foreground):', notification);

    // Show in-app notification or update UI
    displayInAppRaven(notification);
  });

  // Raven tapped/opened
  PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
    console.log('🪶 Raven opened:', notification);

    const ravenData = notification.notification.data;
    const action = notification.actionId;

    // Handle inline actions
    if (action === 'quick-done' || action === 'quick-yes') {
      await handleRavenAction(ravenData.ravenId, 'completed', ravenData, apiUrl);
      showToast('✅ Nice work! Progress recorded.');
    } else if (action === 'skip' || action === 'quick-no') {
      await handleRavenAction(ravenData.ravenId, 'skipped', ravenData, apiUrl);
    } else if (action === 'snooze' || action === 'later') {
      await handleRavenAction(ravenData.ravenId, 'snoozed', ravenData, apiUrl);
      showToast('⏰ Raven will return in 1 hour');
    } else {
      // Default tap - open the app to the relevant project
      navigateToProject(ravenData.projectId);
    }
  });
}

/**
 * Handle Raven action (Done/Skip/Snooze) without opening app
 */
async function handleRavenAction(ravenId, action, metadata, apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/api/raven-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ravenId: ravenId,
        action: action,
        metadata: metadata
      })
    });

    if (!response.ok) {
      throw new Error('Failed to record Raven action');
    }

    console.log(`Raven action recorded: ${action}`);
  } catch (error) {
    console.error('Failed to handle Raven action:', error);
  }
}

/**
 * Display in-app notification when Raven arrives while app is open
 */
function displayInAppRaven(notification) {
  const { title, body } = notification;

  // Create a custom in-app toast/banner
  const banner = document.createElement('div');
  banner.className = 'raven-in-app-notification';
  banner.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #5D4B8C 0%, #7D6BAC 100%);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(93, 75, 140, 0.4);
      z-index: 10000;
      max-width: 90%;
      animation: slideDown 0.3s ease-out;
    ">
      <div style="font-weight: 600; margin-bottom: 0.25rem;">${title}</div>
      <div style="font-size: 0.9rem; opacity: 0.95;">${body}</div>
    </div>
  `;

  document.body.appendChild(banner);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    banner.style.animation = 'slideUp 0.3s ease-in';
    setTimeout(() => banner.remove(), 300);
  }, 4000);
}

/**
 * Show a toast message
 */
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: #2D2D40;
    color: #D9D9E3;
    padding: 0.75rem 1.5rem;
    border-radius: 24px;
    z-index: 10000;
    font-size: 0.9rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Navigate to a specific project
 */
function navigateToProject(projectId) {
  if (projectId) {
    window.location.href = `/?project=${projectId}`;
  }
}

/**
 * Web push notification setup (PWA version)
 */
async function initializeWebRavens(userId, apiUrl) {
  try {
    // Check if service worker is supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications not supported in this browser');
    }

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('User denied push notification permissions');
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key from backend
    const vapidResponse = await fetch(`${apiUrl}/api/vapid-public-key`);
    const { publicKey } = await vapidResponse.json();

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // Send subscription to backend
    await fetch(`${apiUrl}/api/raven-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        platform: 'web',
        subscription: subscription
      })
    });

    console.log('✅ Subscribed to web Ravens!');
    return { success: true, platform: 'web' };
  } catch (error) {
    console.error('Failed to initialize web Ravens:', error);
    throw error;
  }
}

/**
 * Unsubscribe from Ravens
 */
export async function unsubscribeFromRavens(userId, apiUrl) {
  try {
    if (isNative) {
      // For native, just tell backend to disable
      await fetch(`${apiUrl}/api/raven-unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      });

      // Optionally unregister from push
      await PushNotifications.removeAllListeners();
    } else {
      // For web, unsubscribe from push manager
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      await fetch(`${apiUrl}/api/raven-unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      });
    }

    console.log('✅ Unsubscribed from Ravens');
    return { success: true };
  } catch (error) {
    console.error('Failed to unsubscribe from Ravens:', error);
    throw error;
  }
}

/**
 * Check if Ravens are enabled
 */
export async function checkRavenPermissions() {
  if (isNative) {
    const status = await PushNotifications.checkPermissions();
    return status.receive === 'granted';
  } else {
    return Notification.permission === 'granted';
  }
}

/**
 * Utility: Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if running in native app
 */
export function isNativeApp() {
  return isNative;
}
