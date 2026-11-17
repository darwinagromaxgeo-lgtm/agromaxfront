const CACHE_NAME = 'agromax-shell-v5';
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

async function cachedResponse(request) {
  try {
    return await caches.match(request, { cacheName: CACHE_NAME });
  } catch {
    return undefined;
  }
}

async function saveResponse(request, response) {
  if (!response.ok || response.redirected) return;
  try {
    const copy = response.clone();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, copy);
  } catch {
    // A storage failure must not replace a successful network response.
  }
}

async function networkResponse(request, navigation) {
  try {
    const response = await fetch(request);
    if (!navigation || response.headers.get('content-type')?.includes('text/html')) {
      await saveResponse(navigation ? '/index.html' : request, response);
    }
    return response;
  } catch {
    const cached = await cachedResponse(navigation ? '/index.html' : request);
    return cached || new Response('Sin conexión. Vuelve a intentarlo cuando tengas internet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkResponse(request, true));
    return;
  }

  event.respondWith(
    cachedResponse(request).then((cached) => cached || networkResponse(request, false)),
  );
});
