// sw.js — Chat Bubble Service Worker
// Listens to Supabase Realtime for new messages and fires push notifications
// even when the tab is closed.

importScripts('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');

const SUPABASE_URL  = 'https://wkgjqpcjoctfoovdtbxf.supabase.co';
const SUPABASE_ANON = 'sb_publishable_GEMM0Aw5hDIH7QNV_Uq_hQ_iSE5LeO7';
const APP_URL       = 'https://partials-gh.github.io/chatbubble/';

let sb = null;
let channel = null;
let currentUserId = null;

/* ── Init Supabase inside SW ── */
function initSupabase() {
  if (sb) return;
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: { persistSession: true, storage: self }  // use SW storage
  });
}

/* ── Subscribe to new messages for this user ── */
async function subscribeToMessages(userId) {
  if (!userId || currentUserId === userId) return;
  currentUserId = userId;
  initSupabase();

  // Unsubscribe from any previous channel
  if (channel) { await sb.removeChannel(channel); channel = null; }

  // Listen for any new message where the user is the recipient
  // We watch the messages table and filter by chats the user is in
  channel = sb.channel('sw-messages')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
    }, async (payload) => {
      const msg = payload.new;
      if (!msg || msg.user_id === userId) return; // ignore own messages

      // Check if this message is in a chat the user belongs to
      const { data: chat } = await sb
        .from('chats')
        .select('owner_id, partner_id, owner_username, partner_username')
        .eq('id', msg.chat_id)
        .or(`owner_id.eq.${userId},partner_id.eq.${userId}`)
        .single();

      if (!chat) return; // not our chat

      const senderName = msg.user_id === chat.owner_id
        ? chat.owner_username
        : chat.partner_username;

      const body = msg.content.length > 100
        ? msg.content.slice(0, 100) + '…'
        : msg.content;

      // Fire the notification
      self.registration.showNotification(`💬 ${senderName}`, {
        body,
        icon: APP_URL + 'images/icon.png',
        badge: APP_URL + 'images/icon.png',
        tag: `msg-${msg.chat_id}`,       // groups per chat so they don't stack
        renotify: true,
        data: { url: APP_URL }
      });
    })
    .subscribe();
}

/* ══════════════════════════════════════════════════════
   SERVICE WORKER LIFECYCLE
══════════════════════════════════════════════════════ */
self.addEventListener('install', () => {
  self.skipWaiting(); // activate immediately
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim()); // take control of all tabs
});

/* ── Message from main page ── */
// The main page sends the user ID after login so we know who to watch for
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SET_USER' && e.data.userId) {
    subscribeToMessages(e.data.userId);
  }
  if (e.data?.type === 'SIGN_OUT') {
    if (channel) { sb?.removeChannel(channel); channel = null; }
    currentUserId = null;
  }
});

/* ── Notification click → open/focus the app ── */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app tab is already open, focus it
      for (const client of clientList) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(APP_URL);
      }
    })
  );
});
