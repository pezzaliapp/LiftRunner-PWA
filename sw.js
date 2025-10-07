// sw.js — cache-first (v1)
const CACHE = 'lift-runner-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))))
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // cache-first solo per origine stessa
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
