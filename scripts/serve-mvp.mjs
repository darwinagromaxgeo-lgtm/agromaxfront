import { preview } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = new URL(process.env.MVP_BACKEND_URL || 'http://127.0.0.1:3088');
if (backend.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(backend.hostname)) throw new Error('El servidor MVP solo admite un backend local');
const server = await preview({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  preview: { host: '127.0.0.1', port: Number(process.env.MVP_FRONTEND_PORT || 5188), strictPort: true, proxy: { '/api': { target: backend.origin, changeOrigin: true } } },
});
server.printUrls();
