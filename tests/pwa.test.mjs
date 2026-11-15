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
    keys: async () => ['agrosystem-shell-v1', 'agromax-shell-v2', 'agromax-shell-v3', 'agromax-shell-v4', 'another-app-cache'],
    delete: async key => { removed.push(key); },
  };
  runInNewContext(readFileSync(publicFile('/sw.js'), 'utf8'), { self, caches });
  let pending;
  listeners.install({ waitUntil: promise => { pending = promise; } }); await pending;
  for (const file of installFiles) assert.ok(file === '/' || file === '/index.html' || existsSync(publicFile(file)), file);
  listeners.activate({ waitUntil: promise => { pending = promise; } }); await pending;
  assert.deepEqual(removed.sort(), ['agromax-shell-v2', 'agromax-shell-v3', 'agrosystem-shell-v1']);
});
