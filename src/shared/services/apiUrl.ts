export function normalizeApiBaseUrl(value?: string): string {
  const base = (value?.trim() || 'http://localhost:3000/api').replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}
