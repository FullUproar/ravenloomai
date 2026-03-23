// RavenLoom Service Worker
// Handles offline caching and push notifications

const CACHE_NAME = 'ravenloom-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log('Cache installation failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  // Skip GraphQL API requests - let them go directly to the server
  if (event.request.url.includes('/graphql') || event.request.url.includes('/api/')) {
    return;
  }

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network-first strategy: always try network, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for offline use
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request);
      })
  );
});

// Push notification event - "You have a Raven from..."
self.addEventListener('push', (event) => {
  console.log('Raven received:', event);

  let ravenData = {};

  try {
    ravenData = event.data ? event.data.json() : {};
  } catch (e) {
    ravenData = {
      title: '🪶 Raven from your AI Coach',
      body: event.data ? event.data.text() : 'You have a new message',
    };
  }

  // Determine raven icon based on message type
  const ravenIcons = {
    checkin: '/icons/raven-purple.png',     // Accountability check-ins
    achievement: '/icons/raven-gold.png',    // Wins & celebrations
    strategy: '/icons/raven-blue.png',       // Strategic questions
    action: '/icons/raven-green.png',        // Quick actions
    urgent: '/icons/raven-red.png',          // Time-sensitive
    default: '/icons/raven-purple.png'       // Default purple
  };

  const ravenIcon = ravenIcons[ravenData.type] || ravenIcons.default;

  const options = {
    body: ravenData.body || 'Tap to read your message',
    icon: ravenIcon,
    badge: '/icons/raven-badge.png',
    vibrate: [200, 100, 200, 100, 200], // Raven wing flap pattern
    data: {
      ...ravenData.data,
      ravenId: ravenData.ravenId,
      projectId: ravenData.projectId,
      privacyLevel: ravenData.privacyLevel || 'balanced'
    },
    actions: ravenData.actions || [
      {
        action: 'open',
        title: '💬 Reply',
        icon: '/icons/action-reply.png'
      },
      {
        action: 'later',
        title: '⏰ Later',
        icon: '/icons/action-later.png'
      }
    ],
    tag: ravenData.tag || `raven-${ravenData.ravenId || Date.now()}`,
    requireInteraction: ravenData.requireInteraction || false,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(
      ravenData.title || '🪶 Raven from your AI Coach',
      options
    )
  );
});

// Raven notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Raven clicked:', event.action, event.notification.data);

  event.notification.close();

  const ravenData = event.notification.data;
  const action = event.action;

  // Handle inline actions
  if (action === 'quick-yes' || action === 'quick-done') {
    event.waitUntil(
      fetch('/api/raven-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ravenId: ravenData.ravenId,
          action: 'completed',
          projectId: ravenData.projectId
        })
      }).then(() => {
        // Show confirmation notification
        self.registration.showNotification('✅ Nice work!', {
          body: 'Your progress has been recorded',
          icon: '/icons/raven-gold.png',
          badge: '/icons/raven-badge.png',
          tag: 'raven-confirmation',
          requireInteraction: false
        });
      })
    );
    return;
  }

  if (action === 'quick-no' || action === 'skip') {
    event.waitUntil(
      fetch('/api/raven-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ravenId: ravenData.ravenId,
          action: 'skipped',
          projectId: ravenData.projectId
        })
      })
    );
    return;
  }

  if (action === 'later' || action === 'snooze') {
    event.waitUntil(
      fetch('/api/raven-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ravenId: ravenData.ravenId,
          action: 'snoozed',
          projectId: ravenData.projectId,
          snoozeMinutes: 60
        })
      })
    );
    return;
  }

  // Default action or 'open' - Open the app to the relevant project
  const projectUrl = ravenData.projectId ? `/?project=${ravenData.projectId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({
              type: 'RAVEN_CLICKED',
              ravenData: ravenData
            });
            return client.focus();
          }
        }

        // Open a new window if none exists
        if (clients.openWindow) {
          return clients.openWindow(projectUrl);
        }
      })
  );
});

// Background sync event (for offline actions)
self.addEventListener('sync', (event) => {
  console.log('Background sync:', event.tag);

  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // Placeholder for syncing offline messages
  console.log('Syncing messages...');
  // In the future, this would sync any messages sent while offline
}
