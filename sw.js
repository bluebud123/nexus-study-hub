// ═══════════════════════════════════════════════════
//  Nexus — Service Worker (Offline PWA)
//  Stale-while-revalidate for static, network-first for API
// ═══════════════════════════════════════════════════
const CACHE_NAME = 'nexus-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/js/utils.js',
  '/js/store.js',
  '/js/app.js',
  '/js/views.js',
  '/js/vault-api.js',
  '/js/views/dashboard.js',
  '/js/views/today.js',
  '/js/views/capture.js',
  '/js/views/tasks.js',
  '/js/views/journal.js',
  '/js/views/vault.js',
  '/js/views/growth.js',
  '/js/views/strategy.js',
  '/js/views/goals.js',
  '/js/views/calendar.js',
  '/js/views/settings.js',
  '/js/views/shortcuts.js',
  '/js/views/search.js',
  '/js/views/focus.js',
  '/manifest.json',
  '/icon-192.svg',
];

// Install — pre-cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET requests (POST saves, etc.)
  if (e.request.method !== 'GET') return;

  // API calls: network-first, fall back to cached response
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets: stale-while-revalidate
  // Return cache immediately, update in background
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});
