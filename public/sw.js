const CACHE_NAME = 'agromax-shell-v4';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.ico', '/brand/agromax-icon-16.png', '/brand/agromax-icon-32.png', '/brand/agromax-icon-120.png', '/brand/agromax-icon-152.png', '/brand/agromax-icon-167.png', '/brand/agromax-icon-180.png', '/brand/agromax-icon-192.png', '/brand/agromax-icon-512.png', '/brand/agromax-maskable-512.png', '/brand/agromax-compacto.png', '/brand/agromax-horizontal.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && (key.startsWith('agromax-shell-') || key.startsWith('agrosystem-shell-'))).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
