// sw.js — Chat Bubble Service Worker
// Handles Web Push notifications when the tab is closed.

const APP_URL = 'https://partials-gh.github.io/chatbubble/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Receive push from server (Edge Function)
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let title = 'Chat Bubble';
  let body  = 'You have a new message.';

  try {
    const data = e.data.json();
    title = data.title || title;
    body  = data.body  || body;
  } catch(_) {
    // Plain text fallback
    const parts = e.data.text().split('\n');
    title = parts[0] || title;
    body  = parts[1] || body;
  }

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:     APP_URL + 'images/icon.png',
      badge:    APP_URL + 'images/icon.png',
      tag:      'chat-message',
      renotify: true,
      data:     { url: APP_URL }
    })
  );
});

// Notification click — open or focus the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(APP_URL) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow?.(APP_URL);
    })
  );
});
