// sw.js — Lift Runner (v2) cache-first, aggiornata 2025-10-07
// Differenze: cache aggiornata, forza reload su update

const CACHE = 'lift-runner-v2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest'
];

// ===== Install =====
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ===== Activate =====
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ===== Fetch (cache-first) =====
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});

// ===== Auto-update check (opzionale) =====
// Questo forza l’aggiornamento del SW se trovi una nuova versione del file
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
