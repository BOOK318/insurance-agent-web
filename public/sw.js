// Service worker for Dennis Web Push.
// Kept minimal on purpose — no caching/offline logic yet (that's Phase 6).
//
// Lifecycle:
//   install → skipWaiting() so new SWs replace old ones immediately
//   activate → clients.claim() so the page sees the new SW without reload
//   push    → show notification with title/body/url from server payload
//   notificationclick → focus or open the target URL

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Dennis', body: '', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // body wasn't JSON — leave defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      data: { url: data.url ?? '/' },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        // Focus an existing tab on the same origin if possible
        if ('focus' in w) { w.navigate(url).catch(() => {}); return w.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
