// sw.js — Chat Bubble Service Worker
// Polls Supabase REST API for new messages and fires push notifications.

const SUPABASE_URL  = 'https://wkgjqpcjoctfoovdtbxf.supabase.co';
const SUPABASE_ANON = 'sb_publishable_GEMM0Aw5hDIH7QNV_Uq_hQ_iSE5LeO7';
const APP_URL       = 'https://partials-gh.github.io/chatbubble/';
const POLL_INTERVAL = 8000;

let userId    = null;
let userToken = null;
let pollTimer = null;
let lastCheck = null;
let enabled   = false;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', (e) => {
  const d = e.data || {};

  if (d.type === 'SET_USER' && d.userId && d.token) {
    userId    = d.userId;
    userToken = d.token;
    lastCheck = new Date().toISOString();
    enabled   = true;
    startPolling();
    return;
  }

  if (d.type === 'DISABLE') {
    enabled = false;
    stopPolling();
    return;
  }

  if (d.type === 'ENABLE' && userId && userToken) {
    enabled = true;
    startPolling();
    return;
  }

  if (d.type === 'SIGN_OUT') {
    enabled = false;
    userId = null;
    userToken = null;
    stopPolling();
    return;
  }
});

function startPolling() {
  stopPolling();
  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function poll() {
  if (!userId || !userToken || !enabled) return;
  try {
    const since = lastCheck;
    lastCheck = new Date().toISOString();

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/messages?select=id,content,chat_id,user_id,created_at` +
      `&user_id=neq.${userId}` +
      `&created_at=gt.${encodeURIComponent(since)}` +
      `&order=created_at.asc`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${userToken}` } }
    );

    if (!res.ok) return;
    const messages = await res.json();
    if (!messages?.length) return;

    for (const msg of messages) {
      const chatRes = await fetch(
        `${SUPABASE_URL}/rest/v1/chats?select=owner_id,partner_id,owner_username,partner_username` +
        `&id=eq.${msg.chat_id}` +
        `&or=(owner_id.eq.${userId},partner_id.eq.${userId})`,
        { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${userToken}` } }
      );
      if (!chatRes.ok) continue;
      const chats = await chatRes.json();
      if (!chats?.length) continue;

      const chat      = chats[0];
      const sender    = msg.user_id === chat.owner_id ? chat.owner_username : chat.partner_username;
      const body      = msg.content.length > 100 ? msg.content.slice(0, 100) + '…' : msg.content;

      // Skip if a focused app window is already open
      const clients   = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const focused   = clients.some(c => c.url.startsWith(APP_URL) && c.focused);
      if (focused) continue;

      self.registration.showNotification(`💬 ${sender}`, {
        body,
        icon:     APP_URL + 'images/icon.png',
        badge:    APP_URL + 'images/icon.png',
        tag:      `msg-${msg.chat_id}`,
        renotify: true,
        data:     { url: APP_URL }
      });
    }
  } catch(err) {
    console.error('[SW] poll error', err);
  }
}

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
