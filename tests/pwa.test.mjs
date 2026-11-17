import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const publicFile = path => fileURLToPath(new URL(`../public${path}`, import.meta.url));
test('PWA icons and shortcuts resolve to real PNGs with the declared sizes', () => {
  const manifest = JSON.parse(readFileSync(publicFile('/manifest.webmanifest'), 'utf8'));
  for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap(shortcut => shortcut.icons)]) {
    const bytes = readFileSync(publicFile(icon.src));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
});

test('worker installation references existing files and upgrading only removes its own old caches', async () => {
  const listeners = {}; const removed = [];
  let installFiles;
  const self = { addEventListener: (type, callback) => { listeners[type] = callback; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const caches = {
    open: async () => ({ addAll: async files => { installFiles = files; } }),
    keys: async () => ['agrosystem-shell-v1', 'agromax-shell-v2', 'agromax-shell-v3', 'agromax-shell-v4', 'agromax-shell-v5', 'another-app-cache'],
    delete: async key => { removed.push(key); },
  };
  runInNewContext(readFileSync(publicFile('/sw.js'), 'utf8'), { self, caches });
  let pending;
  listeners.install({ waitUntil: promise => { pending = promise; } }); await pending;
  for (const file of installFiles) assert.ok(file === '/' || file === '/index.html' || existsSync(publicFile(file)), file);
  listeners.activate({ waitUntil: promise => { pending = promise; } }); await pending;
  assert.deepEqual(removed.sort(), ['agromax-shell-v2', 'agromax-shell-v3', 'agromax-shell-v4', 'agrosystem-shell-v1']);
});

function loadWorker({ fetchImpl, initial = [], failRead = false, failWrite = false }) {
  const origin = 'https://agromaxgeo.netlify.app';
  const listeners = {};
  const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const entries = new Map(initial.map(([request, response]) => [key(request), response]));
  const caches = {
    match: async (request, options) => {
      assert.equal(options.cacheName, 'agromax-shell-v5');
      if (failRead) throw new Error('Cache storage is unavailable');
      return entries.get(key(request))?.clone();
    },
    open: async name => {
      assert.equal(name, 'agromax-shell-v5');
      return { put: async (request, response) => {
        if (failWrite) throw new Error('Cache quota exceeded');
        entries.set(key(request), response);
      } };
    },
  };
  runInNewContext(readFileSync(publicFile('/sw.js'), 'utf8'), {
    self: { location: { origin }, addEventListener: (type, callback) => { listeners[type] = callback; } },
    caches, fetch: fetchImpl, URL, Response,
  });
  return {
    entries,
    dispatch: async (path, overrides = {}) => {
      let pending;
      listeners.fetch({
        request: { url: new URL(path, origin).href, method: 'GET', mode: 'cors', ...overrides },
        respondWith: promise => { pending = promise; },
      });
      return pending;
    },
  };
}

const offline = async () => { throw new TypeError('Failed to fetch'); };

test('offline navigation returns the cached app shell', async () => {
  const worker = loadWorker({ fetchImpl: offline, initial: [['/index.html', new Response('<html>Agromax</html>')]] });
  const response = await worker.dispatch('/login', { mode: 'navigate' });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Agromax/);
});

test('offline navigation without an installed shell returns a Response instead of rejecting', async () => {
  const worker = loadWorker({ fetchImpl: offline });
  const response = await worker.dispatch('/login', { mode: 'navigate' });
  assert.ok(response instanceof Response);
  assert.equal(response.status, 503);
});

test('an uncached offline asset returns a Response instead of an unhandled fetch rejection', async () => {
  const worker = loadWorker({ fetchImpl: offline });
  const response = await worker.dispatch('/assets/index.css');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('a cache storage failure preserves a successful network response', async () => {
  const worker = loadWorker({ fetchImpl: async () => new Response('body { color: green }'), failRead: true, failWrite: true });
  const response = await worker.dispatch('/assets/index.css');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /green/);
});

test('a fresh navigation updates the HTML used by the next offline navigation', async () => {
  let online = true;
  const worker = loadWorker({ fetchImpl: async () => {
    if (!online) return offline();
    return new Response('<html>New build</html>', { headers: { 'Content-Type': 'text/html' } });
  } });
  await worker.dispatch('/login', { mode: 'navigate' });
  online = false;
  const response = await worker.dispatch('/login', { mode: 'navigate' });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /New build/);
});

test('Netlify authorization failures retain their status and never enter the app cache', async () => {
  const worker = loadWorker({ fetchImpl: async () => new Response('Unauthorized', { status: 401 }) });
  const response = await worker.dispatch('/assets/index.css');
  assert.equal(response.status, 401);
  assert.equal(worker.entries.size, 0);
});

test('API calls, writes and requests to other origins use the normal browser network path', async () => {
  const worker = loadWorker({ fetchImpl: async () => { throw new Error('Worker should not intercept'); } });
  assert.equal(await worker.dispatch('/api/auth/me'), undefined);
  assert.equal(await worker.dispatch('/auth/login', { method: 'POST' }), undefined);
  assert.equal(await worker.dispatch('https://agromaxback.onrender.com/api/auth/me'), undefined);
});
