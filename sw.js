// Minimal service worker for PWA install support
// Network-first: always fetch fresh, no caching of app files
self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  // Clear ALL old caches
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});

// No fetch handler — let all requests go through normally
